import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "missing",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "missing",
    };

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, status, stripe_customer_id, stripe_subscription_id")
      .limit(20);

    if (error) {
      console.error("[debug/tenants] supabase error:", error);
      return NextResponse.json({ env, supabase_error: error }, { status: 500 });
    }

    return NextResponse.json({ env, tenants: data });
  } catch (err) {
    console.error("[debug/tenants] unhandled:", err);
    return NextResponse.json(
      { err: String((err as any)?.message ?? err), stack: (err as any)?.stack ?? null },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';

