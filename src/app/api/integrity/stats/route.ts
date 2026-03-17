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
      summaryRes,
      breachRowsRes,
      receiptRowsRes,
      openActionRowsRes,
    ] = await Promise.all([
      supabaseAdmin
        .schema("signals")
        .from("v_integrity_summary")
        .select("*")
        .eq("workspace_id", process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? "")
        .maybeSingle(),
      supabaseAdmin.schema("core").from("v_operator_next_actions").select("obligation_id, face").eq("is_overdue", true),
      supabaseAdmin.schema("core").from("v_recent_receipts").select("obligation_id, face"),
      supabaseAdmin.schema("core").from("v_operator_next_actions").select("obligation_id, face, created_at, is_overdue"),
    ]);

    const summary = summaryRes.data;
    const total = summary?.total_obligations ?? 0;
    const sealed = summary?.sealed_obligations ?? 0;
    const open = summary?.open_obligations ?? 0;
    const breachRows = breachRowsRes.data ?? [];
    const breach = breachRows.length;
    const closure_rate = summary?.closure_rate ?? 100;
    const avg_closure_hours = summary?.avg_closure_hours ?? null;
    const latency_score = summary?.latency_score ?? latencyToScore(avg_closure_hours);
    const speed_mult = speedMultiplier(avg_closure_hours);
    const closure_quality = Math.min(100, Math.round(closure_rate * speed_mult));

    const openObs = (openActionRowsRes.data ?? []).map((row) => ({ created_at: row.created_at as string }));
    const aging_penalty = agingPenalty(openObs);
    const aging_count   = openObs.filter(o => {
      const h = (Date.now() - new Date(o.created_at).getTime()) / (1000 * 3600);
      return h > 2;
    }).length;

    const breach_rate    = open > 0 ? Math.round((breach / open) * 100) : 0;
    const receiptedIds = new Set<string>();
    const receiptRows = receiptRowsRes.data ?? [];
    for (const row of receiptRows) {
      if (typeof row.obligation_id === "string" && row.obligation_id.length > 0) {
        receiptedIds.add(row.obligation_id);
      }
    }
    const stripe_total = summary?.stripe_events ?? 0;
    const covered_count = summary?.covered_events ?? 0;
    const event_coverage = summary?.event_coverage ?? 100;
    const events_awaiting = summary?.events_awaiting ?? Math.max(0, stripe_total - covered_count);
    const proof_lag = summary?.proof_lag ?? Math.max(0, sealed - receiptedIds.size);
    const proof_score = summary?.proof_score ?? (sealed > 0 ? Math.max(0, Math.round((1 - proof_lag / sealed) * 100)) : 100);

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

    const openActionRows = openActionRowsRes.data ?? [];

    const domains = ENFORCEMENT_DOMAINS.map(({ face, label }) => {
      const faceOpen = openActionRows.filter((o) => o.face === face).length;
      const faceSealed = receiptRows.filter((r) => r.face === face).length;
      const faceTotal = faceOpen + faceSealed;
      const faceBreaches = breachRows.filter((b) => b.face === face).length;
      const cr = faceTotal > 0 ? (faceSealed / faceTotal) * 100 : 100;
      const br = faceOpen  > 0 ? (faceBreaches / faceOpen) * 100 : 0;
      return {
        face,
        label,
        total: faceTotal,
        sealed: faceSealed,
        open: faceOpen,
        breach_count: faceBreaches,
        closure_rate: Math.round(cr),
        breach_rate: Math.round(br),
        integrity_score: domainScore(cr, br),
      };
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
      sealed_obligations: sealed,
      open_obligations: open,
      breach_count: breach,
      proof_lag,
      events_awaiting,
      stripe_events: stripe_total,
      covered_events: covered_count,
      aging_penalty,
      speed_mult,
      pts_closure,
      pts_breach,
      pts_coverage,
      pts_latency,
      pts_proof,
      confidence: (summary?.confidence as "High" | "Medium" | "Low" | undefined) ?? confidence,
      computed_at: summary?.computed_at ?? new Date().toISOString(),
      delta_log,
      domains,
    });

  } catch (err) {
    console.error("integrity/stats error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
