"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type WashbayStatus =
  | "queued"
  | "scheduled"
  | "in_progress"
  | "blocked"
  | "ready_for_delivery"
  | "completed";

type WashbayJob = {
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

const STATUS_LABELS: Record<WashbayStatus, string> = {
  queued: "Queued",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  blocked: "Blocked",
  ready_for_delivery: "Ready",
  completed: "Completed",
};

const STATUS_COLORS: Record<WashbayStatus, string> = {
  queued: "text-zinc-400 bg-zinc-800",
  scheduled: "text-blue-300 bg-blue-900/40",
  in_progress: "text-amber-300 bg-amber-900/40",
  blocked: "text-red-300 bg-red-900/40",
  ready_for_delivery: "text-emerald-300 bg-emerald-900/40",
  completed: "text-zinc-500 bg-zinc-900",
};

const STATUS_ORDER: WashbayStatus[] = [
  "queued", "scheduled", "in_progress", "blocked", "ready_for_delivery", "completed"
];

export default function WashbayPage() {
  const [jobs, setJobs] = useState<WashbayJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    slot: "",
    boatCustomer: "",
    owner: "",
    nextAction: "",
    value: "",
  });

  async function loadJobs() {
    try {
      const res = await fetch("/api/washbay");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setJobs(data.jobs ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadJobs(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/washbay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot: form.slot,
          boatCustomer: form.boatCustomer,
          owner: form.owner,
          nextAction: form.nextAction || "Review and schedule",
          value: Number(form.value || 0),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setJobs((prev) => [data.job, ...prev]);
      setForm({ slot: "", boatCustomer: "", owner: "", nextAction: "", value: "" });
      setShowForm(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to create job");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id: string, status: WashbayStatus) {
    try {
      const res = await fetch(`/api/washbay/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setJobs((prev) => prev.map((j) => (j.id === id ? data.job : j)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  const active = jobs.filter((j) => j.status !== "completed");
  const completed = jobs.filter((j) => j.status === "completed");

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-700/10 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-[400px] w-[400px] rounded-full bg-purple-600/8 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-16">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <p className="text-[#caa84a] text-xs tracking-[0.24em]">WASHBAY OPS</p>
              <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition">
                ← Console
              </Link>
            </div>
            <h1 className="text-4xl font-semibold text-zinc-100">Washbay</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Slot scheduling · Status tracking · Delivery queue
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-[#caa84a] text-black px-4 py-2.5 text-sm font-semibold hover:bg-[#d7b65a] transition"
          >
            {showForm ? "Cancel" : "+ New Job"}
          </button>
        </div>

        {/* New Job Form */}
        {showForm && (
          <div className="rounded-2xl border border-[#caa84a]/30 bg-black/60 p-6 backdrop-blur mb-8">
            <p className="text-xs tracking-[0.18em] text-zinc-400 mb-4">NEW WASHBAY JOB</p>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">SLOT *</label>
                <input
                  required
                  value={form.slot}
                  onChange={(e) => setForm((f) => ({ ...f, slot: e.target.value }))}
                  placeholder="e.g. Bay 3 / Mon 9am"
                  className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#caa84a]/40 transition"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">CUSTOMER / BOAT *</label>
                <input
                  required
                  value={form.boatCustomer}
                  onChange={(e) => setForm((f) => ({ ...f, boatCustomer: e.target.value }))}
                  placeholder="e.g. John Smith — Sea Ray 280"
                  className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#caa84a]/40 transition"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">OWNER</label>
                <input
                  value={form.owner}
                  onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                  placeholder="Assigned tech"
                  className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#caa84a]/40 transition"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">VALUE ($)</label>
                <input
                  type="number"
                  min="0"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder="0"
                  className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#caa84a]/40 transition"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-zinc-500 mb-1">NEXT ACTION</label>
                <input
                  value={form.nextAction}
                  onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))}
                  placeholder="Review and schedule"
                  className="w-full rounded-xl bg-zinc-900 border border-white/10 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#caa84a]/40 transition"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#caa84a] text-black px-6 py-2.5 text-sm font-semibold hover:bg-[#d7b65a] transition disabled:opacity-50"
                >
                  {submitting ? "Creating…" : "Create Job →"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-900/10 px-6 py-4 mb-6 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-sm text-zinc-500 py-8 text-center">Loading jobs…</div>
        )}

        {/* Active Jobs */}
        {!loading && active.length > 0 && (
          <div className="mb-10">
            <p className="text-xs tracking-[0.18em] text-zinc-400 mb-4">
              ACTIVE — {active.length} JOB{active.length !== 1 ? "S" : ""}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {active.map((job) => (
                <JobCard key={job.id} job={job} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && jobs.length === 0 && !error && (
          <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center">
            <p className="text-zinc-400 text-sm">No washbay jobs yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 rounded-xl bg-[#caa84a] text-black px-4 py-2 text-sm font-semibold hover:bg-[#d7b65a] transition"
            >
              + Create First Job
            </button>
          </div>
        )}

        {/* Completed */}
        {!loading && completed.length > 0 && (
          <div>
            <p className="text-xs tracking-[0.18em] text-zinc-600 mb-4">
              COMPLETED — {completed.length}
            </p>
            <div className="grid gap-3 md:grid-cols-2 opacity-50">
              {completed.map((job) => (
                <JobCard key={job.id} job={job} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </div>
        )}

        <footer className="mt-12 text-xs tracking-wide text-zinc-600">
          Authority lives in the Core. UI is routing only.
        </footer>
      </div>
    </main>
  );
}

function JobCard({
  job,
  onStatusChange,
}: {
  job: WashbayJob;
  onStatusChange: (id: string, status: WashbayStatus) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">{job.boatCustomer}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{job.slot}</p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-semibold tracking-[0.12em] px-2 py-1 rounded-lg ${STATUS_COLORS[job.status]}`}
        >
          {STATUS_LABELS[job.status]}
        </span>
      </div>

      {job.nextAction && (
        <p className="text-xs text-zinc-400 mb-3">→ {job.nextAction}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-zinc-600">
          {job.owner && <span>👤 {job.owner}</span>}
          {job.value > 0 && (
            <span className="text-[#caa84a]">${job.value.toLocaleString()}</span>
          )}
        </div>

        <select
          value={job.status}
          onChange={(e) => onStatusChange(job.id, e.target.value as WashbayStatus)}
          className="text-xs bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 text-zinc-300 focus:outline-none focus:border-[#caa84a]/40 transition cursor-pointer"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
