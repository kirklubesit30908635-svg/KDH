import { NextRequest, NextResponse } from "next/server";
import { updateWashbayJob } from "@/lib/washbay-store";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const job = await updateWashbayJob(id, body);
    return NextResponse.json({ job });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
