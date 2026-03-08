import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get("x-ak-admin-key");
  if (!adminKey || adminKey !== process.env.AK_ADMIN_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as any;
  const tenant_id = body?.tenant_id;
  const stripe_customer_id = body?.stripe_customer_id;
  const stripe_subscription_id = body?.stripe_subscription_id;

  if (!tenant_id || !stripe_customer_id || !stripe_subscription_id) {
    return NextResponse.json(
      { error: "Missing required fields: tenant_id, stripe_customer_id, stripe_subscription_id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("tenants")
    .update({
      stripe_customer_id,
      stripe_subscription_id,
    })
    .eq("id", tenant_id)
    .select("id, status, stripe_customer_id, stripe_subscription_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ supabase_error: error }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, tenant: data });
}
