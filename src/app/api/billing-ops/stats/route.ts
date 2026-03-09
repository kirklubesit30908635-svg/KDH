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
    const [openRes, sealedRes, receiptsRes, stripeRes] = await Promise.all([
      supabaseAdmin
        .schema("core")
        .from("obligations")
        .select("id", { count: "exact", head: true })
        .eq("face", "billing")
        .eq("status", "open"),

      supabaseAdmin
        .schema("core")
        .from("obligations")
        .select("id", { count: "exact", head: true })
        .eq("face", "billing")
        .eq("status", "sealed"),

      supabaseAdmin
        .schema("core")
        .from("v_receipts")
        .select("*")
        .eq("face", "billing")
        .order("sealed_at", { ascending: false })
        .limit(10),

      supabaseAdmin
        .schema("ingest")
        .from("stripe_events")
        .select("id", { count: "exact", head: true }),
    ]);

    return NextResponse.json({
      open_obligations: openRes.count ?? 0,
      sealed_obligations: sealedRes.count ?? 0,
      stripe_events_total: stripeRes.count ?? 0,
      recent_receipts: receiptsRes.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
