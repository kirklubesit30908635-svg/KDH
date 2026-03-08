import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("stripe_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) return NextResponse.json({ supabase_error: error }, { status: 500 });
  return NextResponse.json({ rows: data });
}
