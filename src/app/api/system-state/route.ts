import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Public endpoint — no auth required (returns non-sensitive aggregated stats for homepage)
export async function GET() {
  try {
    const [
      totalRes,
      sealedCountRes,
      openRes,
      breachRes,
      latencyRowsRes,
      sealedIdsRes,
      receiptIdsRes,
      recentReceiptRes,
    ] = await Promise.all([
      // 1. Total obligations
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

      // 4. Breached
      supabaseAdmin.schema("core").from("v_next_actions")
        .select("obligation_id", { count: "exact", head: true })
        .eq("is_breach", true),

      // 5. Latency rows for avg calc
      supabaseAdmin.schema("core").from("obligations")
        .select("created_at, sealed_at")
        .eq("status", "sealed")
        .not("sealed_at", "is", null)
        .limit(200),

      // 6. Sealed IDs for proof lag
      supabaseAdmin.schema("core").from("obligations")
        .select("id")
        .eq("status", "sealed"),

      // 7. Receipt IDs for proof lag
      supabaseAdmin.schema("core").from("receipts")
        .select("obligation_id")
        .not("obligation_id", "is", null),

      // 8. Most recent sealed receipt
      supabaseAdmin.schema("core").from("receipts")
        .select("id, created_at, obligation_id, payload")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const total  = totalRes.count       ?? 0;
    const sealed = sealedCountRes.count ?? 0;
    const open   = openRes.count        ?? 0;
    const breach = breachRes.count      ?? 0;

    // Closure rate
    const closure_rate = total > 0 ? Math.round((sealed / total) * 100) : 100;

    // Breach rate
    const breach_rate = open > 0 ? Math.round((breach / open) * 100) : 0;

    // Proof lag
    const sealedIds    = new Set((sealedIdsRes.data  ?? []).map((r) => r.id));
    const receiptedIds = new Set(
      (receiptIdsRes.data ?? []).map((r) => r.obligation_id).filter(Boolean)
    );
    const proofLagCount = [...sealedIds].filter((id) => !receiptedIds.has(id)).length;

    // Avg closure hours
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

    // Integrity score (simplified 3-factor for public)
    const latencyScore =
      avg_closure_hours === null ? 80
      : avg_closure_hours <=  4 ? 100
      : avg_closure_hours <= 12 ? 88
      : avg_closure_hours <= 24 ? 72
      : avg_closure_hours <= 48 ? 52
      : 32;

    const proof_score = sealed > 0
      ? Math.max(0, Math.round((1 - proofLagCount / sealed) * 100))
      : 100;

    const raw =
      0.30 * closure_rate +
      0.25 * (100 - breach_rate) +
      0.20 * 100 + // event_coverage assumed 100 for public view
      0.15 * latencyScore +
      0.10 * proof_score;
    const integrity = Math.max(0, Math.min(100, Math.round(raw)));

    // Recent receipt
    const receipt = (recentReceiptRes.data ?? [])[0] ?? null;
    const recent_receipt = receipt
      ? {
          id:          receipt.id,
          timestamp:   new Date(receipt.created_at).toLocaleString(),
          operator:    (receipt.payload as any)?.operator ?? "system",
          event:       (receipt.payload as any)?.event_type ?? "kernel.event",
          requirement: (receipt.payload as any)?.requirement ?? "verify_closure",
          proof:       "Sealed by kernel after verified closure.",
        }
      : null;

    return NextResponse.json({
      integrity,
      closure_rate,
      breach_rate,
      proof_lag:   proofLagCount > 0 ? `${proofLagCount} pending` : "0 pending",
      open_actions: open,
      sealed_obligations: sealed,
      total_obligations:  total,
      recent_receipt,
      computed_at: new Date().toISOString(),
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Return graceful fallback so homepage still renders
    return NextResponse.json({
      integrity:    null,
      closure_rate: null,
      breach_rate:  null,
      proof_lag:    null,
      open_actions: null,
      recent_receipt: null,
      error:        message,
    });
  }
}
