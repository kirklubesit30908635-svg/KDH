import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  // Route-local auth — middleware never substitutes for this
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Projection surfaces — operator-facing reads
    const [obligationsRes, receiptsRes] = await Promise.all([
      supabaseAdmin
        .schema("core")
        .from("v_next_actions")
        .select("*")
        .eq("face", "advertising")
        .order("due_at", { ascending: true, nullsFirst: false }),

      supabaseAdmin
        .schema("core")
        .from("v_receipts")
        .select("*")
        .eq("face", "advertising")
        .order("sealed_at", { ascending: false })
        .limit(5),
    ]);

    return NextResponse.json({
      obligations: obligationsRes.data ?? [],
      receipts: receiptsRes.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
