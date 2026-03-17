import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sealObligation } from "@/lib/obligation-store";

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const obligationId = body.obligation_id;

    if (!obligationId || typeof obligationId !== "string") {
      return NextResponse.json(
        { error: "obligation_id is required" },
        { status: 400 }
      );
    }

    const result = await sealObligation(
      supabase,
      obligationId,
      user.email ?? user.id,
      {
        metadata: {
          surface: "billing_ops",
          action: "seal",
        },
      }
    );

    return NextResponse.json({
      ok: true,
      obligation_id: result.obligation_id,
      ledger_event_id: result.ledger_event_id,
      receipt_id: result.receipt_id,
      event_seq: result.event_seq,
      event_hash: result.event_hash,
      receipt_seq: result.receipt_seq,
      receipt_hash: result.receipt_hash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
