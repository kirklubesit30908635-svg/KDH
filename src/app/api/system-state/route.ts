import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Closing receipt type IDs — receipts that terminate an event's obligation cycle
// 2=nack  3=error  4=commit  7=job_completed  12=obligation_closed
const CLOSING_TYPES = [2, 3, 4, 7, 12];

type EventRef = {
  created_at: string | null;
  event_type_id?: number | string | null;
};

type ReceiptLagRow = {
  created_at: string;
  events: EventRef | EventRef[] | null;
};

type RecentReceiptRow = {
  id: string;
  created_at: string;
  event_id: string | null;
  receipt_type_id: number | null;
  chain_key: string | null;
  events: EventRef | EventRef[] | null;
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// Public endpoint — no auth required (aggregated kernel health stats)
export async function GET() {
  try {
    const [totalEventsRes, closedEventIdsRes, lagRes, recentReceiptRes] = await Promise.all([
      // 1. Total events in ledger
      supabaseAdmin.schema("ledger").from("events")
        .select("id", { count: "exact", head: true }),

      // 2. All event_ids that have at least one closing receipt
      supabaseAdmin.schema("ledger").from("receipts")
        .select("event_id")
        .in("receipt_type_id", CLOSING_TYPES),

      // 3. Sample of closing receipts with their source event timestamp (for proof_lag)
      supabaseAdmin.schema("ledger").from("receipts")
        .select("created_at, events(created_at)")
        .in("receipt_type_id", CLOSING_TYPES)
        .order("created_at", { ascending: false })
        .limit(300),

      // 4. Most recent receipt with source event
      supabaseAdmin.schema("ledger").from("receipts")
        .select("id, created_at, event_id, receipt_type_id, chain_key, events(created_at, event_type_id)")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    // ── open_actions ─────────────────────────────────────────────────────────
    const total_events  = totalEventsRes.count ?? 0;
    const closedIds     = new Set((closedEventIdsRes.data ?? []).map((r) => r.event_id));
    const closed_events = closedIds.size;
    const open_actions  = Math.max(0, total_events - closed_events);

    // ── closure_rate ─────────────────────────────────────────────────────────
    const closure_rate = total_events > 0
      ? Math.round((closed_events / total_events) * 100)
      : 100;

    // ── integrity_score (api.fn_integrity_score does not exist — derive from closure_rate) ───
    const integrity_score = Math.max(0, Math.min(100,
      closure_rate >= 95 ? 97 :
      closure_rate >= 80 ? Math.round(80 + (closure_rate - 80) * 0.85) :
      closure_rate >= 60 ? Math.round(60 + (closure_rate - 60) * 0.95) :
      Math.round(closure_rate * 0.9)
    ));

    // ── proof_lag ─────────────────────────────────────────────────────────────
    // avg minutes from event.created_at → receipt.created_at for closing receipts
    const lagRows = (lagRes.data ?? []) as ReceiptLagRow[];
    let proof_lag_minutes: number | null = null;
    if (lagRows.length > 0) {
      let total = 0;
      let count = 0;
      for (const r of lagRows) {
        const ev = unwrapRelation(r.events);
        if (!ev?.created_at) continue;
        const ms = new Date(r.created_at).getTime() - new Date(ev.created_at).getTime();
        if (ms >= 0) { total += ms / 60000; count++; }
      }
      proof_lag_minutes = count > 0 ? Math.round((total / count) * 10) / 10 : null;
    }

    // ── recent_receipt ───────────────────────────────────────────────────────
    const rec = ((recentReceiptRes.data ?? []) as RecentReceiptRow[])[0] ?? null;
    const recentEvent = rec ? unwrapRelation(rec.events) : null;
    const recent_receipt = rec
      ? {
          id:               rec.id,
          timestamp:        rec.created_at,
          event_id:         rec.event_id,
          chain_key:        rec.chain_key,
          receipt_type_id:  rec.receipt_type_id,
          event_created_at: recentEvent?.created_at ?? null,
          event_type_id:    recentEvent?.event_type_id ?? null,
        }
      : null;

    return NextResponse.json({
      integrity_score,
      closure_rate,
      open_actions,
      total_events,
      closed_events,
      proof_lag_minutes,
      recent_receipt,
      computed_at: new Date().toISOString(),
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      integrity_score:   null,
      closure_rate:      null,
      open_actions:      null,
      total_events:      null,
      closed_events:     null,
      proof_lag_minutes: null,
      recent_receipt:    null,
      error:             message,
    });
  }
}
