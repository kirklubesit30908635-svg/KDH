import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type WashbayStatus =
  | "queued"
  | "scheduled"
  | "in_progress"
  | "blocked"
  | "ready_for_delivery"
  | "completed";

export type WashbayJob = {
  id: string;
  slot: string;
  boatCustomer: string;
  status: WashbayStatus;
  owner: string;
  nextAction: string;
  value: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

function toJob(row: Record<string, unknown>): WashbayJob {
  return {
    id:           row.id as string,
    slot:         row.slot as string,
    boatCustomer: row.boat_customer as string,
    status:       row.status as WashbayStatus,
    owner:        row.owner as string,
    nextAction:   row.next_action as string,
    value:        row.value as number,
    createdAt:    row.created_at as string,
    updatedAt:    row.updated_at as string,
    completedAt:  row.completed_at as string | null,
  };
}

export async function listWashbayJobs(): Promise<WashbayJob[]> {
  const { data, error } = await supabaseAdmin
    .schema("core")
    .from("washbay_jobs")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(toJob);
}

export async function createWashbayJob(input: {
  slot: string;
  boatCustomer: string;
  owner?: string;
  nextAction?: string;
  value?: number;
}): Promise<WashbayJob> {
  const { data, error } = await supabaseAdmin
    .schema("core")
    .from("washbay_jobs")
    .insert({
      slot:         input.slot.trim(),
      boat_customer: input.boatCustomer.trim(),
      owner:        (input.owner ?? "").trim(),
      next_action:  (input.nextAction ?? "Review and schedule").trim(),
      value:        Number(input.value ?? 0),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return toJob(data as Record<string, unknown>);
}

export async function updateWashbayJob(
  id: string,
  patch: Partial<Pick<WashbayJob, "slot" | "boatCustomer" | "status" | "owner" | "nextAction" | "value">>
): Promise<WashbayJob> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.slot         !== undefined) dbPatch.slot          = patch.slot;
  if (patch.boatCustomer !== undefined) dbPatch.boat_customer = patch.boatCustomer;
  if (patch.status       !== undefined) dbPatch.status        = patch.status;
  if (patch.owner        !== undefined) dbPatch.owner         = patch.owner;
  if (patch.nextAction   !== undefined) dbPatch.next_action   = patch.nextAction;
  if (patch.value        !== undefined) dbPatch.value         = Number(patch.value);
  if (patch.status === "completed")     dbPatch.completed_at  = new Date().toISOString();
  else if (patch.status !== undefined)  dbPatch.completed_at  = null;

  const { data, error } = await supabaseAdmin
    .schema("core")
    .from("washbay_jobs")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return toJob(data as Record<string, unknown>);
}
