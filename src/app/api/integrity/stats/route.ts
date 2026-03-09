import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENFORCEMENT_DOMAINS = [
  { face: "billing",      label: "Billing Enforcement" },
  { face: "advertising",  label: "Advertising Enforcement" },
  { face: "dealership",   label: "Dealership Enforcement" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Latency in hours → 0–100 score */
function latencyToScore(avgHours: number | null): number {
  if (avgHours === null) return 80;
  if (avgHours <=  4)   return 100;
  if (avgHours <= 12)   return 88;
  if (avgHours <= 24)   return 72;
  if (avgHours <= 48)   return 52;
  if (avgHours <= 72)   return 32;
  return 15;
}

/** Simple 2-factor domain score (no latency/coverage data per-face) */
function domainScore(closureRate: number, breachRate: number): number {
  return Math.max(0, Math.min(100, Math.round(0.6 * closureRate + 0.4 * (100 - breachRate))));
}

export async function GET() {
  // Route-local auth — middleware never substitutes for this
  const supabase = await supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── All parallel queries ────────────────────────────────────────────────
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
      // Domain aggregation — all obligations with face+status (no payload)
      allObsRes,
      // Breaches by face — from projection view
      allBreachRes,
    ] = await Promise.all([
      // 1. Total obligations (all statuses)
      supabaseAdmin.schema("core").from("obligations")
        .select("id", { count: "exact", head: true }),

      // 2. Sealed
      supabaseAdmin.schema("core").from("obligations")
        .select("id", { count: "exact", head: true })
        .eq("status", "sealed"),

      // 3. Open
      supabaseAdmin.schema("core").from("obligations")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),

      // 4. Breached (open + past due)
      supabaseAdmin.schema("core").from("v_next_actions")
        .select("obligation_id", { count: "exact", head: true })
        .eq("is_breach", true),

      // 5. Total Stripe ingest events
      supabaseAdmin.schema("ingest").from("stripe_events")
        .select("id", { count: "exact", head: true }),

      // 6. Events that produced an obligation
      supabaseAdmin.schema("core").from("obligations")
        .select("id", { count: "exact", head: true })
        .not("source_event_id", "is", null),

      // 7. Latency: sealed obligations timestamps (capped)
      supabaseAdmin.schema("core").from("obligations")
        .select("created_at, sealed_at")
        .eq("status", "sealed")
        .not("sealed_at", "is", null)
        .limit(500),

      // 8. Proof lag: sealed obligation IDs
      supabaseAdmin.schema("core").from("obligations")
        .select("id")
        .eq("status", "sealed"),

      // 9. Proof lag: obligation IDs that have receipts
      supabaseAdmin.schema("core").from("receipts")
        .select("obligation_id")
        .not("obligation_id", "is", null),

      // 10. Domain data: all obligations with face + status
      supabaseAdmin.schema("core").from("obligations")
        .select("face, status"),

      // 11. Domain breach data: breached obligations with face
      supabaseAdmin.schema("core").from("v_next_actions")
        .select("face, obligation_id")
        .eq("is_breach", true),
    ]);

    // ── Core counts ─────────────────────────────────────────────────────────
    const total   = totalRes.count       ?? 0;
    const sealed  = sealedCountRes.count ?? 0;
    const open    = openRes.count        ?? 0;
    const breach  = breachRes.count      ?? 0;

    // ── Closure Rate ─────────────────────────────────────────────────────────
    const closure_rate = total > 0 ? Math.round((sealed / total) * 100) : 100;

    // ── Breach Rate ──────────────────────────────────────────────────────────
    const breach_rate = open > 0 ? Math.round((breach / open) * 100) : 0;

    // ── Event Coverage ───────────────────────────────────────────────────────
    const stripe_total  = stripeRes.count  ?? 0;
    const covered_count = coveredRes.count ?? 0;
    const event_coverage =
      stripe_total > 0 ? Math.round((covered_count / stripe_total) * 100) : 100;
    const events_awaiting = Math.max(0, stripe_total - covered_count);

    // ── Obligation Latency ───────────────────────────────────────────────────
    const latencyRows = latencyRowsRes.data ?? [];
    const avg_closure_hours =
      latencyRows.length > 0
        ? latencyRows.reduce((sum, r) => {
            const ms =
              new Date(r.sealed_at as string).getTime() -
              new Date(r.created_at as string).getTime();
            return sum + ms / (1000 * 3600);
          }, 0) / latencyRows.length
        : null;

    const latency_score = latencyToScore(avg_closure_hours);

    // ── Proof Lag ────────────────────────────────────────────────────────────
    const sealedIds    = new Set((sealedIdsRes.data  ?? []).map((r) => r.id));
    const receiptedIds = new Set(
      (receiptIdsRes.data ?? []).map((r) => r.obligation_id).filter(Boolean)
    );
    const proof_lag = [...sealedIds].filter((id) => !receiptedIds.has(id)).length;
    const proof_score =
      sealed > 0 ? Math.max(0, Math.round((1 - proof_lag / sealed) * 100)) : 100;

    // ── Integrity Score ──────────────────────────────────────────────────────
    //   30% closure · 25% no-breach · 20% coverage · 15% latency · 10% proof
    const raw_score =
      0.30 * closure_rate +
      0.25 * (100 - breach_rate) +
      0.20 * event_coverage +
      0.15 * latency_score +
      0.10 * proof_score;
    const integrity_score = Math.max(0, Math.min(100, Math.round(raw_score)));

    // ── Component points ─────────────────────────────────────────────────────
    const pts_closure  = Math.round(0.30 * closure_rate);
    const pts_breach   = Math.round(0.25 * (100 - breach_rate));
    const pts_coverage = Math.round(0.20 * event_coverage);
    const pts_latency  = Math.round(0.15 * latency_score);
    const pts_proof    = Math.round(0.10 * proof_score);

    // ── Confidence ───────────────────────────────────────────────────────────
    const confidence: "High" | "Medium" | "Low" =
      total >= 20 ? "High" : total >= 5 ? "Medium" : "Low";

    // ── Domain Integrity ─────────────────────────────────────────────────────
    const allObs = allObsRes.data ?? [];
    const allBreachRows = allBreachRes.data ?? [];

    const domains = ENFORCEMENT_DOMAINS.map(({ face, label }) => {
      const faceObs    = allObs.filter((o) => o.face === face);
      const faceSealed = faceObs.filter((o) => o.status === "sealed").length;
      const faceOpen   = faceObs.filter((o) => o.status === "open").length;
      const faceTotal  = faceObs.length;
      const faceBreach = allBreachRows.filter((b) => b.face === face).length;

      const d_closure_rate = faceTotal > 0 ? Math.round((faceSealed / faceTotal) * 100) : 100;
      const d_breach_rate  = faceOpen  > 0 ? Math.round((faceBreach / faceOpen)  * 100) : 0;
      const d_score        = domainScore(d_closure_rate, d_breach_rate);

      return {
        face,
        label,
        total:        faceTotal,
        sealed:       faceSealed,
        open:         faceOpen,
        breach_count: faceBreach,
        closure_rate: d_closure_rate,
        breach_rate:  d_breach_rate,
        integrity_score: d_score,
      };
    });

    return NextResponse.json({
      integrity_score,
      confidence,

      // Five metrics
      closure_rate,
      breach_rate,
      event_coverage,
      events_awaiting,
      avg_closure_hours:
        avg_closure_hours !== null ? Math.round(avg_closure_hours * 10) / 10 : null,
      latency_score,
      proof_lag,
      proof_score,

      // Component points (for breakdown)
      pts_closure,
      pts_breach,
      pts_coverage,
      pts_latency,
      pts_proof,

      // Domain integrity
      domains,

      // Supporting counts
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
