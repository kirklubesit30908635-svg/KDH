import { promises as fs } from "fs";
import path from "path";

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

const DATA_FILE = path.join(process.cwd(), "data", "washbay.json");

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, "[]", "utf8");
  }
}

export async function listWashbayJobs(): Promise<WashbayJob[]> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const jobs = JSON.parse(raw) as WashbayJob[];
  return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function writeWashbayJobs(jobs: WashbayJob[]) {
  await fs.writeFile(DATA_FILE, JSON.stringify(jobs, null, 2), "utf8");
}

export async function createWashbayJob(input: {
  slot: string;
  boatCustomer: string;
  owner?: string;
  nextAction?: string;
  value?: number;
}) {
  const now = new Date().toISOString();

  const job: WashbayJob = {
    id: crypto.randomUUID(),
    slot: input.slot.trim(),
    boatCustomer: input.boatCustomer.trim(),
    status: "queued",
    owner: (input.owner ?? "").trim(),
    nextAction: (input.nextAction ?? "Review and schedule").trim(),
    value: Number(input.value ?? 0),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  const jobs = await listWashbayJobs();
  jobs.push(job);
  await writeWashbayJobs(jobs);
  return job;
}

export async function updateWashbayJob(
  id: string,
  patch: Partial<Pick<WashbayJob, "slot" | "boatCustomer" | "status" | "owner" | "nextAction" | "value">>
) {
  const jobs = await listWashbayJobs();
  const index = jobs.findIndex((job) => job.id === id);

  if (index === -1) {
    throw new Error("Washbay job not found");
  }

  const current = jobs[index];
  const nextStatus = patch.status ?? current.status;

  const updated: WashbayJob = {
    ...current,
    ...patch,
    value: patch.value !== undefined ? Number(patch.value) : current.value,
    updatedAt: new Date().toISOString(),
    completedAt:
      nextStatus === "completed"
        ? current.completedAt ?? new Date().toISOString()
        : null,
  };

  jobs[index] = updated;
  await writeWashbayJobs(jobs);
  return updated;
}
