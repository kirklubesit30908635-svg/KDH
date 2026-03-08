import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const adminKey = req.headers.get("x-ak-admin-key");
    if (!adminKey || adminKey !== process.env.AK_ADMIN_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "missing",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "missing",
      AK_ADMIN_KEY: process.env.AK_ADMIN_KEY ? "set" : "missing",
    };

    const { searchParams } = new URL(req.url);
    const tenant_id = searchParams.get("tenant_id");

    if (!tenant_id) {
      return NextResponse.json({ error: "Missing tenant_id", env }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, status")
      .eq("id", tenant_id)
      .maybeSingle();

    if (error) {
      console.error("[access/tenant] supabase error:", error);
      return NextResponse.json({ env, supabase_error: error }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Not found", env }, { status: 404 });
    }

    return NextResponse.json({
      tenant_id: data.id,
      status: data.status,
      entitled: data.status === "active",
      env,
    });
  } catch (err: any) {
    console.error("[access/tenant] unhandled:", err);
    return NextResponse.json(
      { err: String(err?.message ?? err), stack: err?.stack ?? null },
      { status: 500 }
    );
  }
}
