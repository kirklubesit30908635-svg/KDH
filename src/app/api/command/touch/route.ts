import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { createReceipt } from "@/lib/obligation-store";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
      return NextResponse.json({ error: "obligation_id is required" }, { status: 400 });
    }

    // Fetch the obligation to confirm it exists and is open
    const { data: obl, error: fetchErr } = await supabaseAdmin
      .schema("core")
      .from("obligations")
      .select("id, face, economic_ref_type, economic_ref_id")
      .eq("id", obligationId)
      .eq("status", "open")
      .single();

    if (fetchErr || !obl) {
      return NextResponse.json({ error: "Obligation not found or already sealed" }, { status: 404 });
    }

    // Extend due_at by 24h from now (snooze)
    const nextDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin
      .schema("core")
      .from("obligations")
      .update({ due_at: nextDue })
      .eq("id", obligationId);

    // Create a receipt as proof of touch
    const receipt = await createReceipt({
      obligation_id: obligationId,
      sealed_by: user.email ?? user.id,
      face: (obl as any).face ?? null,
      economic_ref_type: (obl as any).economic_ref_type ?? null,
      economic_ref_id: (obl as any).economic_ref_id ?? null,
      payload: {
        action: "log_touch",
        next_due: nextDue,
        touched_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      obligation_id: obligationId,
      receipt_id: receipt.id,
      next_due: nextDue,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
