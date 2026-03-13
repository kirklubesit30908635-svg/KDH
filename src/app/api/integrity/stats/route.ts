import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ENFORCEMENT_DOMAINS = [
  { face: "billing",      label: "Billing Enforcement" },
  { face: "advertising",  label: "Advertising Enforcement" },
  { face: "dealership",   label: "Dealership Enforcement" },
] as const;

// ─── Scoring helpers ───────────────────────────────────────────────────────────

function latencyToScore(avgHours: number | null): number {
  if (avgHours === null) return 80;
  if (avgHours <=  4)   return 100;
  if (avgHours <= 12)   return 88;
  if (avgHours <= 24)   return 72;
  if (avgHours <= 48)   return 52;
  if (avgHours <= 72)   return 32;
  return 15;
}

/** Speed multiplier: average closure time → 0.85–1.05 multiplier on closure rate */
function speedMultiplier(avgHours: number | null): number {
  if (avgHours === null) return 1.0;
  if (avgHours <   5)   return 1.05;
  if (avgHours <  30)   return 1.00;
  if (avgHours < 120)   return 0.95;
  return 0.85;
}

/** Aging penalty: penalise open obligations based on how long they've been open */
function agingPenalty(openObs: { created_at: string }[]): number {
  const now = Date.now();
  let penalty = 0;
  for (const o of openObs) {
    const ageHours = (now - new Date(o.created_at).getTime()) / (1000 * 3600);
    if      (ageHours > 24)  penalty += 3;
    else if (ageHours > 6)   penalty += 1;
    else if (ageHours > 2)   penalty += 0.5;
  }
  return Math.min(30, Math.round(penalty)); // cap at 30 pts
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
      totalRes,
      sealedCountRes,
      openRes,
      breachRes,
      stripeRes,
      coveredRes,
      latencyRowsRes,
      sealedIdsRes,
      receiptIdsRes,
      allObsRes,
      allBreachRes,
      openObsRes,        // ← NEW: open obligations with created_at for aging
    ] = await Promise.all([
      supabaseAdmin.schema("core").from("obligations")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin.schema("core").from("obligations")
        .select("id", { count: "exact", head: true }).eq("status", "sealed"),
      supabaseAdmin.schema("core").from("obligations")
        .select("id", { count: "exact", head: true }).eq("status", "open"),
      supabaseAdmin.schema("core").from("v_next_actions")
        .select("obligation_id", { count: "exact", head: true }).eq("is_breach", true),
      supabaseAdmin.schema("ingest").from("stripe_events")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin.schema("core").from("obligations")
        .select("id", { count: "exact", head: true }).not("source_event_id", "is", null),
      supabaseAdmin.schema("core").from("obligations")
        .select("created_at, sealed_at").eq("status", "sealed")
        .not("sealed_at", "is", null).limit(500),
      supabaseAdmin.schema("core").from("obligations")
        .select("id").eq("status", "sealed"),
      supabaseAdmin.schema("core").from("receipts")
        .select("obligation_id").not("obligation_id", "is", null),
      supabaseAdmin.schema("core").from("obligations")
        .select("face, status"),
      supabaseAdmin.schema("core").from("v_next_actions")
        .select("face, obligation_id").eq("is_breach", true),
      supabaseAdmin.schema("core").from("obligations")   // ← NEW
        .select("created_at").eq("status", "open").limit(500),
    ]);

    // ── Core counts ──────────────────────────────────────────────────────────
    const total   = totalRes.count       ?? 0;
    const sealed  = sealedCountRes.count ?? 0;
    const open    = openRes.count        ?? 0;
    const breach  = breachRes.count      ?? 0;

    // ── Closure Rate (base) ──────────────────────────────────────────────────
    const closure_rate_base = total > 0 ? (sealed / total) * 100 : 100;

    // ── Latency / Speed ──────────────────────────────────────────────────────
    const latencyRows = latencyRowsRes.data ?? [];
    const avg_closure_hours =
      latencyRows.length > 0
        ? latencyRows.reduce((sum, r) => {
            const ms = new Date(r.sealed_at as string).getTime() - new Date(r.created_at as string).getTime();
            return sum + ms / (1000 * 3600);
          }, 0) / latencyRows.length
        : null;

    const latency_score  = latencyToScore(avg_closure_hours);
    const speed_mult     = speedMultiplier(avg_closure_hours);

    // ── Closure Rate with speed multiplier ──────────────────────────────────
    const closure_rate_adj = Math.min(100, closure_rate_base * speed_mult);
    const closure_rate     = Math.round(closure_rate_base); // display as raw %

    // ── Aging Penalty ────────────────────────────────────────────────────────
    const openObs     = openObsRes.data ?? [];
    const aging_penalty = agingPenalty(openObs);

    // ── Breach Rate ──────────────────────────────────────────────────────────
    const breach_rate = open > 0 ? Math.round((breach / open) * 100) : 0;

    // ── Event Coverage ───────────────────────────────────────────────────────
    const stripe_total   = stripeRes.count  ?? 0;
    const covered_count  = coveredRes.count ?? 0;
    const event_coverage = stripe_total > 0 ? Math.round((covered_count / stripe_total) * 100) : 100;
    const events_awaiting = Math.max(0, stripe_total - covered_count);

    // ── Proof Lag ─────────────────────────────────────────────────────────────
    const sealedIds    = new Set((sealedIdsRes.data  ?? []).map((r) => r.id));
    const receiptedIds = new Set((receiptIdsRes.data ?? []).map((r) => r.obligation_id).filter(Boolean));
    const proof_lag    = [...sealedIds].filter((id) => !receiptedIds.has(id)).length;
    const proof_score  = sealed > 0 ? Math.max(0, Math.round((1 - proof_lag / sealed) * 100)) : 100;

    // ── Integrity Score (with speed multiplier + aging penalty) ─────────────
    const raw_score =
      0.30 * closure_rate_adj +
      0.25 * (100 - breach_rate) +
      0.20 * event_coverage +
      0.15 * latency_score +
      0.10 * proof_score
      - aging_penalty;

    const integrity_score = Math.max(0, Math.min(100, Math.round(raw_score)));

    // ── Component points ─────────────────────────────────────────────────────
    const pts_closure  = Math.round(0.30 * closure_rate_adj);
    const pts_breach   = Math.round(0.25 * (100 - breach_rate));
    const pts_coverage = Math.round(0.20 * event_coverage);
    const pts_latency  = Math.round(0.15 * latency_score);
    const pts_proof    = Math.round(0.10 * proof_score);

    // ── Confidence ───────────────────────────────────────────────────────────
    const confidence: "High" | "Medium" | "Low" =
      total >= 20 ? "High" : total >= 5 ? "Medium" : "Low";

    // ── Score Delta Log ──────────────────────────────────────────────────────
    const delta_log: { direction: "up" | "down" | "neutral"; label: string }[] = [];

    if (sealed > 0)          delta_log.push({ direction: "up",   label: `${sealed} obligations sealed` });
    if (breach > 0)          delta_log.push({ direction: "down", label: `${breach} breach${breach > 1 ? "es" : ""} in queue` });
    if (aging_penalty > 0)   delta_log.push({ direction: "down", label: `aging penalty −${aging_penalty} pts` });
    if (speed_mult > 1.0)    delta_log.push({ direction: "up",   label: `fast closures +${Math.round((speed_mult - 1) * closure_rate_base)} pts` });
    if (proof_lag > 0)       delta_log.push({ direction: "down", label: `${proof_lag} sealed without receipt` });
    if (events_awaiting > 0) delta_log.push({ direction: "down", label: `${events_awaiting} events uncovered` });
    if (delta_log.length === 0) delta_log.push({ direction: "neutral", label: "All signals stable" });

    // ── Domain Integrity ─────────────────────────────────────────────────────
    const allObs        = allObsRes.data      ?? [];
    const allBreachRows = allBreachRes.data   ?? [];

    const domains = ENFORCEMENT_DOMAINS.map(({ face, label }) => {
      const faceObs    = allObs.filter((o) => o.face === face);
      const faceSealed = faceObs.filter((o) => o.status === "sealed").length;
      const faceOpen   = faceObs.filter((o) => o.status === "open").length;
      const faceTotal  = faceObs.length;
      const faceBreach = allBreachRows.filter((b) => b.face === face).length;

      const d_closure_rate = faceTotal > 0 ? Math.round((faceSealed / faceTotal) * 100) : 100;
      const d_breach_rate  = faceOpen  > 0 ? Math.round((faceBreach / faceOpen)  * 100) : 0;

      return {
        face, label,
        total:           faceTotal,
        sealed:          faceSealed,
        open:            faceOpen,
        breach_count:    faceBreach,
        closure_rate:    d_closure_rate,
        breach_rate:     d_breach_rate,
        integrity_score: domainScore(d_closure_rate, d_breach_rate),
      };
    });

    return NextResponse.json({
      integrity_score,
      confidence,
      closure_rate,
      breach_rate,
      event_coverage,
      events_awaiting,
      avg_closure_hours: avg_closure_hours !== null ? Math.round(avg_closure_hours * 10) / 10 : null,
      latency_score,
      proof_lag,
      proof_score,
      pts_closure,
      pts_breach,
      pts_coverage,
      pts_latency,
      pts_proof,
      aging_penalty,
      speed_mult: Math.round(speed_mult * 100) / 100,
      delta_log,
      domains,
      open_obligations:   open,
      sealed_obligations: sealed,
      total_obligations:  total,
      breach_count:       breach,
      stripe_events:      stripe_total,
      covered_events:     covered_count,
      computed_at: new Date().toISOString(),
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
