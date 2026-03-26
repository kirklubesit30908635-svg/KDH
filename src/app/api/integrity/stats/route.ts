import { NextResponse } from "next/server";
import { requireOperatorRouteContext } from "@/lib/operator-access";
import { supportedStripeFirstWedgeObligationTypes } from "@/lib/stripe_first_wedge_contract";

const ENFORCEMENT_DOMAIN = {
  face: "billing",
  label: "Stripe Billing Wedge",
} as const;

function latencyToScore(avgHours: number | null): number {
  if (avgHours === null) return 80;
  if (avgHours <= 0.25) return 100;
  if (avgHours <= 1) return 95;
  if (avgHours <= 4) return 88;
  if (avgHours <= 12) return 72;
  if (avgHours <= 24) return 52;
  if (avgHours <= 48) return 32;
  return 15;
}

function speedMultiplier(avgHours: number | null): number {
  if (avgHours === null) return 1.0;
  if (avgHours <= 0.25) return 1.05;
  if (avgHours <= 1) return 1.0;
  if (avgHours <= 4) return 0.95;
  if (avgHours <= 12) return 0.9;
  return 0.8;
}

function agingPenalty(openObs: { created_at: string }[]): number {
  const now = Date.now();
  let penalty = 0;
  for (const o of openObs) {
    const ageHours = (now - new Date(o.created_at).getTime()) / (1000 * 3600);
    if (ageHours > 24) penalty += 3;
    else if (ageHours > 6) penalty += 1;
    else if (ageHours > 2) penalty += 0.5;
  }
  return Math.min(30, Math.round(penalty));
}

function domainScore(closureRate: number, breachRate: number): number {
  return Math.max(0, Math.min(100, Math.round(0.6 * closureRate + 0.4 * (100 - breachRate))));
}

export async function GET() {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    return access.response;
  }

  try {
    const { supabase, defaultWorkspaceId } = access.context;

    const [summaryRes, breachRowsRes, receiptRowsRes, openActionRowsRes] = await Promise.all([
      supabase
        .schema("core")
        .from("v_stripe_first_wedge_integrity_summary")
        .select("*")
        .eq("workspace_id", defaultWorkspaceId)
        .maybeSingle(),
      supabase
        .schema("core")
        .from("v_operator_next_actions")
        .select("obligation_id, face")
        .eq("workspace_id", defaultWorkspaceId)
        .eq("face", ENFORCEMENT_DOMAIN.face)
        .in("kind", supportedStripeFirstWedgeObligationTypes)
        .eq("is_overdue", true),
      supabase
        .schema("core")
        .from("v_recent_receipts")
        .select("obligation_id, face, economic_ref_type")
        .eq("workspace_id", defaultWorkspaceId)
        .eq("face", ENFORCEMENT_DOMAIN.face)
        .in("economic_ref_type", ["invoice", "payment", "subscription"]),
      supabase
        .schema("core")
        .from("v_operator_next_actions")
        .select("obligation_id, face, created_at, is_overdue")
        .eq("workspace_id", defaultWorkspaceId)
        .eq("face", ENFORCEMENT_DOMAIN.face)
        .in("kind", supportedStripeFirstWedgeObligationTypes),
    ]);

    if (summaryRes.error) {
      return NextResponse.json({ error: summaryRes.error.message }, { status: 500 });
    }
    if (breachRowsRes.error) {
      return NextResponse.json({ error: breachRowsRes.error.message }, { status: 500 });
    }
    if (receiptRowsRes.error) {
      return NextResponse.json({ error: receiptRowsRes.error.message }, { status: 500 });
    }
    if (openActionRowsRes.error) {
      return NextResponse.json({ error: openActionRowsRes.error.message }, { status: 500 });
    }

    const summary = summaryRes.data;
    const openActionRows = openActionRowsRes.data ?? [];
    const receiptRows = receiptRowsRes.data ?? [];
    const breachRows = breachRowsRes.data ?? [];

    const open = openActionRows.length;
    const sealed = receiptRows.length;
    const total = open + sealed;
    const breach = breachRows.length;
    const closure_rate = total > 0 ? Math.round((sealed / total) * 100) : 100;
    const avg_closure_hours = summary?.avg_closure_hours ?? null;
    const latency_score = summary?.latency_score ?? latencyToScore(avg_closure_hours);
    const speed_mult = speedMultiplier(avg_closure_hours);
    const closure_quality = Math.min(100, Math.round(closure_rate * speed_mult));

    const openObs = openActionRows.map((row) => ({ created_at: row.created_at as string }));
    const aging_penalty = agingPenalty(openObs);
    const aging_count = openObs.filter((o) => {
      const ageHours = (Date.now() - new Date(o.created_at).getTime()) / (1000 * 3600);
      return ageHours > 2;
    }).length;

    const breach_rate = open > 0 ? Math.round((breach / open) * 100) : 0;
    const receiptedIds = new Set<string>();
    for (const row of receiptRows) {
      if (typeof row.obligation_id === "string" && row.obligation_id.length > 0) {
        receiptedIds.add(row.obligation_id);
      }
    }

    const stripe_total = summary?.stripe_events ?? total;
    const covered_count = summary?.covered_events ?? total;
    const event_coverage =
      summary?.event_coverage ??
      (stripe_total > 0 ? Math.max(0, Math.min(100, Math.round((covered_count / stripe_total) * 100))) : 100);
    const events_awaiting = summary?.events_awaiting ?? Math.max(0, stripe_total - covered_count);
    const proof_lag = summary?.proof_lag ?? Math.max(0, sealed - receiptedIds.size);
    const proof_score =
      summary?.proof_score ??
      (sealed > 0 ? Math.max(0, Math.round((1 - proof_lag / sealed) * 100)) : 100);

    const raw_score =
      0.3 * closure_quality +
      0.25 * (100 - breach_rate) +
      0.2 * event_coverage +
      0.15 * latency_score +
      0.1 * proof_score -
      aging_penalty;

    const integrity_score = Math.max(0, Math.min(100, Math.round(raw_score)));
    const pts_closure = Math.round(0.3 * closure_quality);
    const pts_breach = Math.round(0.25 * (100 - breach_rate));
    const pts_coverage = Math.round(0.2 * event_coverage);
    const pts_latency = Math.round(0.15 * latency_score);
    const pts_proof = Math.round(0.1 * proof_score);

    const confidence: "High" | "Medium" | "Low" =
      total >= 20 ? "High" : total >= 5 ? "Medium" : "Low";

    const delta_log: { direction: "up" | "down" | "neutral"; label: string }[] = [];
    if (sealed > 0) delta_log.push({ direction: "up", label: `${sealed} obligations sealed` });
    if (breach > 0) delta_log.push({ direction: "down", label: `${breach} breach${breach > 1 ? "es" : ""} in queue` });
    if (aging_count > 0) {
      delta_log.push({
        direction: "down",
        label: `${aging_count} aging open obligation${aging_count > 1 ? "s" : ""}`,
      });
    }
    if (speed_mult >= 1.0) {
      delta_log.push({
        direction: "up",
        label: avg_closure_hours !== null ? `avg closure ${avg_closure_hours.toFixed(1)}h` : "closure speed nominal",
      });
    }
    if (speed_mult < 1.0) {
      delta_log.push({
        direction: "down",
        label: avg_closure_hours !== null ? `slow avg closure ${avg_closure_hours.toFixed(1)}h` : "closure speed degraded",
      });
    }
    if (proof_lag > 0) {
      delta_log.push({ direction: "down", label: `${proof_lag} sealed without receipt` });
    }
    if (events_awaiting > 0) {
      delta_log.push({ direction: "down", label: `${events_awaiting} events uncovered` });
    }
    if (delta_log.length === 0) {
      delta_log.push({ direction: "neutral", label: "All signals stable" });
    }

    const cr = total > 0 ? (sealed / total) * 100 : 100;
    const br = open > 0 ? (breach / open) * 100 : 0;
    const domains = [
      {
        face: ENFORCEMENT_DOMAIN.face,
        label: ENFORCEMENT_DOMAIN.label,
        total,
        sealed,
        open,
        breach_count: breach,
        closure_rate: Math.round(cr),
        breach_rate: Math.round(br),
        integrity_score: domainScore(cr, br),
      },
    ];

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
