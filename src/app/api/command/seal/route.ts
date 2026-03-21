import { NextRequest, NextResponse } from "next/server";
import { requireOperatorRouteContext } from "@/lib/operator-access";
import { sealObligation } from "@/lib/obligation-store";

export async function POST(request: NextRequest) {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    return access.response;
  }

  try {
    const { supabase, user, defaultWorkspaceId } = access.context;
    const body = await request.json();
    const obligationId = body.obligation_id;

    if (!obligationId || typeof obligationId !== "string") {
      return NextResponse.json(
        { error: "obligation_id is required" },
        { status: 400 }
      );
    }

    const action = body.action ?? "seal"; // "seal" | "quote"
    const result = await sealObligation(
      supabase,
      obligationId,
      user.email ?? user.id,
      {
        metadata:
          action === "quote"
            ? { surface: "command", action: "mark_quote_sent", workspace_id: defaultWorkspaceId }
            : { surface: "command", action: "seal", workspace_id: defaultWorkspaceId },
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
      action,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
