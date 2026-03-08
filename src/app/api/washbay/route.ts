import { NextRequest, NextResponse } from "next/server";
import { createWashbayJob, listWashbayJobs } from "@/lib/washbay-store";

export async function GET() {
  const jobs = await listWashbayJobs();
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest) {
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
}
