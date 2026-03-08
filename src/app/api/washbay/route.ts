import { NextRequest, NextResponse } from "next/server";
import { createWashbayJob, listWashbayJobs } from "@/lib/washbay-store";
import { supabaseServer } from "@/lib/supabase-server";

async function requireAuth() {
  const supabase = await supabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const jobs = await listWashbayJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    if (!body.slot || !body.boatCustomer) {
      return NextResponse.json(
        { error: "slot and boatCustomer are required" },
        { status: 400 }
      );
    }

    const job = await createWashbayJob({
      slot: body.slot,
      boatCustomer: body.boatCustomer,
      owner: body.owner ?? "",
      nextAction: body.nextAction ?? "Review and schedule",
      value: Number(body.value ?? 0),
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
