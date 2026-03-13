import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ENFORCEMENT_DOMAINS = [
  { face: "billing",      label: "Billing Enforcement" },
  { face: "advertising",  label: "Advertising Enforcement" },
  { face: "dealership",   label: "Dealership Enforcement" },
] as const;

function latencyToScore(avgHours: number | null): number {
  if (avgHours === null) return 80;
  if (avgHours <=  0.25) return 100;
  if (avgHours <=  1)    return 95;
  if (avgHours <=  4)    return 88;
  if (avgHours <= 12)    return 72;
  if (avgHours <= 24)    return 52;
  if (avgHours <= 48)    return 32;
  return 15;
}

function speedMultiplier(avgHours: number | null): number {
  if (avgHours === null) return 1.0;
  if (avgHours <= 0.25)  return 1.05;
  if (avgHours <= 1)     return 1.00;
  if (avgHours <= 4)     return 0.95;
  if (avgHours <= 12)    return 0.90;
  return 0.80;
}

function agingPenalty(openObs: { created_at: string }[]): number {
  const now = Date.now();
  let penalty = 0;
  for (const o of openObs) {
    const ageHours = (now - new Date(o.created_at).getTime()) / (1000 * 3600);
    if      (ageHours > 24) penalty += 3;
    else if (ageHours > 6)  penalty += 1;
    else if (ageHours > 2)  penalty += 0.5;
  }
  return Math.min(30, Math.round(penalty));
}

function domainScore(closureRate: number, breachRate: number): number {
  return Math.max(0, Math.min(100, Math.round(0.6 * closureRate + 0.4 * (100 - breachRate))));
}

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [
      totalRes, sealedCountRes, openRes, breachRes,
      stripeRes, coveredRes, latencyRowsRes,
      sealedIdsRes, receiptIdsRes, allObsRes, allBreachRes, openObsRes,
    ] = await Promise.all([
      supabaseAdmin.schema("core").from("obligations").select("id", { count: "exact", head: true }),
      supabaseAdmin.schema("core").from("obligations").select("id", { count: "exact", head: true }).eq("status", "sealed"),
      supabaseAdmin.schema("core").from("obligations").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.schema("core").from("v_next_actions").select("obligation_id", { count: "exact", head: true }).eq("is_breach", true),
      supabaseAdmin.schema("ingest").from("stripe_events").select("id", { count: "exact", head: true }),
      supabaseAdmin.schema("core").from("obligations").select("id", { count: "exact", head: true }).not("source_event_id", "is", null),
      supabaseAdmin.schema("core").from("obligations").select("created_at, sealed_at").eq("status", "sealed").not("sealed_at", "is", null).limit(500),
      supabaseAdmin.schema("core").from("obligations").select("id").eq("status", "sealed"),
      supabaseAdmin.schema("core").from("receipts").select("obligation_id").not("obligation_id", "is", null),
      supabaseAdmin.schema("core").from("obligations").select("face, status"),
      supabaseAdmin.schema("core").from("v_next_actions").select("face, obligation_id").eq("is_breach", true),
      supabaseAdmin.schema("core").from("obligations").select("created_at").eq("status", "open").limit(500),
    ]);

    const total  = totalRes.count       ?? 0;
    const sealed = sealedCountRes.count ?? 0;
    const open   = openRes.count        ?? 0;
    const breach = breachRes.count      ?? 0;

    const closure_rate_base = total > 0 ? (sealed / total) * 100 : 100;

    const latencyRows = latencyRowsRes.data ?? [];
    const avg_closure_hours =
      latencyRows.length > 0
        ? latencyRows.reduce((sum, r) => {
            const ms = new Date(r.sealed_at as string).getTime() - new Date(r.created_at as string).getTime();
            return sum + ms / (1000 * 3600);
          }, 0) / latencyRows.length
        : null;

    const latency_score = latencyToScore(avg_closure_hours);
    const speed_mult    = speedMultiplier(avg_closure_hours);

    // Closure Rate = raw completion %; Closure Quality = rate adjusted for speed
    const closure_rate    = Math.round(closure_rate_base);
    const closure_quality = Math.min(100, Math.round(closure_rate_base * speed_mult));

    const openObs       = openObsRes.data ?? [];
    const aging_penalty = agingPenalty(openObs);
    const aging_count   = openObs.filter(o => {
      const h = (Date.now() - new Date(o.created_at).getTime()) / (1000 * 3600);
      return h > 2;
    }).length;

    const breach_rate    = open > 0 ? Math.round((breach / open) * 100) : 0;
    const stripe_total   = stripeRes.count  ?? 0;
    const covered_count  = coveredRes.count ?? 0;
    const event_coverage = stripe_total > 0 ? Math.round((covered_count / stripe_total) * 100) : 100;
    const events_awaiting = Math.max(0, stripe_total - covered_count);

    const sealedIds    = new Set((sealedIdsRes.data  ?? []).map((r) => r.id));
    const receiptedIds = new Set((receiptIdsRes.data ?? []).map((r) => r.obligation_id).filter(Boolean));
    const proof_lag    = [...sealedIds].filter((id) => !receiptedIds.has(id)).length;
    const proof_score  = sealed > 0 ? Math.max(0, Math.round((1 - proof_lag / sealed) * 100)) : 100;

    const raw_score =
      0.30 * closure_quality +
      0.25 * (100 - breach_rate) +
      0.20 * event_coverage +
      0.15 * latency_score +
      0.10 * proof_score
      - aging_penalty;

    const integrity_score = Math.max(0, Math.min(100, Math.round(raw_score)));

    const pts_closure  = Math.round(0.30 * closure_quality);
    const pts_breach   = Math.round(0.25 * (100 - breach_rate));
    const pts_coverage = Math.round(0.20 * event_coverage);
    const pts_latency  = Math.round(0.15 * latency_score);
    const pts_proof    = Math.round(0.10 * proof_score);

    const confidence: "High" | "Medium" | "Low" =
      total >= 20 ? "High" : total >= 5 ? "Medium" : "Low";

    const delta_log: { direction: "up" | "down" | "neutral"; label: string }[] = [];
    if (sealed > 0)        delta_log.push({ direction: "up",      label: `${sealed} obligations sealed` });
    if (breach > 0)        delta_log.push({ direction: "down",    label: `${breach} breach${breach > 1 ? "es" : ""} in queue` });
    if (aging_count > 0)   delta_log.push({ direction: "down",    label: `${aging_count} aging open obligation${aging_count > 1 ? "s" : ""}` });
    if (speed_mult >= 1.0) delta_log.push({ direction: "up",      label: avg_closure_hours !== null ? `avg closure ${avg_closure_hours.toFixed(1)}h` : "closure speed nominal" });
    if (speed_mult < 1.0)  delta_log.push({ direction: "down",    label: avg_closure_hours !== null ? `slow avg closure ${avg_closure_hours.toFixed(1)}h` : "closure speed degraded" });
    if (proof_lag > 0)     delta_log.push({ direction: "down",    label: `${proof_lag} sealed without receipt` });
    if (events_awaiting > 0) delta_log.push({ direction: "down",  label: `${events_awaiting} events uncovered` });
    if (delta_log.length === 0) delta_log.push({ direction: "neutral", label: "All signals stable" });

    const allObs        = allObsRes.data    ?? [];
    const allBreachRows = allBreachRes.data ?? [];

    const domains = ENFORCEMENT_DOMAINS.map(({ face, label }) => {
      const faceObs     = allObs.filter((o) => o.face === face);
      const faceTotal   = faceObs.length;
      const faceSealed  = faceObs.filter((o) => o.status === "sealed").length;
      const faceBreaches = allBreachRows.filter((b) => b.face === face).length;
      const faceOpen    = faceObs.filter((o) => o.status === "open").length;
      const cr = faceTotal > 0 ? (faceSealed / faceTotal) * 100 : 100;
      const br = faceOpen  > 0 ? (faceBreaches / faceOpen) * 100 : 0;
      return { face, label, score: domainScore(cr, br), total: faceTotal, sealed: faceSealed, breaches: faceBreaches };
    });

    return NextResponse.json({
      integrity_score,
      closure_rate,
      closure_quality,
      breach_rate,
      event_coverage,
      latency_score,
      proof_score,
      avg_closure_hours,
      total_obligations: total,
      sealed_count: sealed,
      open_count: open,
      breach_count: breach,
      proof_lag,
      events_awaiting,
      aging_penalty,
      speed_mult,
      pts_closure,
      pts_breach,
      pts_coverage,
      pts_latency,
      pts_proof,
      confidence,
      delta_log,
      domains,
    });

  } catch (err) {
    console.error("integrity/stats error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
