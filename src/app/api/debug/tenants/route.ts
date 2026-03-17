import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { debugRoutesEnabled } from "@/lib/debug-access";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!debugRoutesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const adminKey = req.headers.get("x-ak-admin-key");
  if (!adminKey || adminKey !== process.env.AK_ADMIN_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, status, stripe_customer_id, stripe_subscription_id")
      .limit(20);

    if (error) {
      console.error("[debug/tenants] supabase error:", error);
      return NextResponse.json({ supabase_error: error }, { status: 500 });
    }

    return NextResponse.json({ tenants: data });
  } catch (err) {
    console.error("[debug/tenants] unhandled:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { err: message },
      { status: 500 }
    );
  }
}
