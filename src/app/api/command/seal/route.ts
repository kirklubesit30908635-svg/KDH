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

    const action = body.action ?? "seal"; // "seal" | "quote"
    const payload =
      action === "quote"
        ? { action: "mark_quote_sent", sealed_at: new Date().toISOString() }
        : { sealed: true };

    const { obligation, receipt } = await sealObligation(
      obligationId,
      user.email ?? user.id,
      payload
    );

    return NextResponse.json({
      ok: true,
      obligation_id: obligation.id,
      receipt_id: receipt.id,
      action,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
