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
    const [summaryRes, receiptsRes] = await Promise.all([
      supabaseAdmin
        .schema("core")
        .from("v_integrity_summary")
        .select("open_obligations, sealed_obligations, stripe_events")
        .eq("workspace_id", process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? "")
        .maybeSingle(),

      supabaseAdmin
        .schema("core")
        .from("v_recent_receipts")
        .select("*")
        .eq("face", "billing")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return NextResponse.json({
      open_obligations: summaryRes.data?.open_obligations ?? 0,
      sealed_obligations: summaryRes.data?.sealed_obligations ?? 0,
      stripe_events_total: summaryRes.data?.stripe_events ?? 0,
      recent_receipts: receiptsRes.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
