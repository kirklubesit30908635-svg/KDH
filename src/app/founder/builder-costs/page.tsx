import Link from "next/link"
import { getFounderSupabase } from "@/lib/founder-console/server"
import { getFounderContext } from "@/lib/founder-console/context"

type BuilderObject = {
  id: string
  acknowledged_at: string
  metadata: Record<string, unknown> | null
}

type BuilderObligation = {
  id: string
  object_id: string
  obligation_type: string
  state: string
  opened_at: string
  terminal_action: string | null
  metadata: Record<string, unknown> | null
}

function fmtUsd(cents: number | null) {
  if (typeof cents !== "number") return "Pending"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function fmtDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

export default async function BuilderCostsPage() {
  const { workspaceId } = getFounderContext()
  const supabase = getFounderSupabase()

  const [objectsRes, obligationsRes] = await Promise.all([
    supabase
      .schema("core")
      .from("objects")
      .select("id, acknowledged_at, metadata")
      .eq("workspace_id", workspaceId)
      .contains("metadata", { face: "builder_operating_costs", object_kind: "subscription" })
      .order("acknowledged_at", { ascending: false }),
    supabase
      .schema("core")
      .from("obligations")
      .select("id, object_id, obligation_type, state, opened_at, terminal_action, metadata")
      .eq("workspace_id", workspaceId)
      .contains("metadata", { face: "builder_operating_costs" })
      .order("opened_at", { ascending: false }),
  ])

  if (objectsRes.error || obligationsRes.error) {
    throw new Error(objectsRes.error?.message || obligationsRes.error?.message || "Failed to load builder operating costs")
  }

  const subscriptions = (objectsRes.data ?? []) as BuilderObject[]
  const obligations = (obligationsRes.data ?? []) as BuilderObligation[]

  const knownBurn = subscriptions
    .map((row) => row.metadata?.monthly_burn_cents)
    .filter((value): value is number => typeof value === "number")
  const monthlyBurnCents =
    knownBurn.length === subscriptions.length && subscriptions.length > 0
      ? knownBurn.reduce((sum, value) => sum + value, 0)
      : null

  const unresolved = obligations.filter((row) => row.state !== "resolved")

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-zinc-500">Founder</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Builder Operating Costs</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Governed subscriptions required to build and operate AutoKirk. This view is downstream of committed kernel truth.
            </p>
          </div>
          <Link
            href="/founder"
            className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            Founder console
          </Link>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <StatCard label="Active subscriptions" value={String(subscriptions.length)} />
          <StatCard label="Open cost obligations" value={String(unresolved.length)} tone="amber" />
          <StatCard label="Monthly burn" value={fmtUsd(monthlyBurnCents)} tone="emerald" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
            <div className="mb-4">
              <div className="text-lg font-black">Governed subscriptions</div>
              <div className="mt-1 text-sm text-zinc-500">Objects under the `builder_operating_costs` face.</div>
            </div>
            <div className="grid gap-3">
              {subscriptions.length === 0 && (
                <EmptyState>No governed builder subscriptions yet.</EmptyState>
              )}
              {subscriptions.map((row) => {
                const metadata = row.metadata || {}
                const unresolvedObligation = unresolved.find(
                  (item) => item.metadata?.subscription_key === metadata.subscription_key
                )
                return (
                  <div key={row.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-base font-bold">
                          {String(metadata.subscription_name || metadata.subscription_key || row.id)}
                        </div>
                        <div className="mt-1 text-sm text-zinc-400">
                          {String(metadata.vendor || "Unknown vendor")}
                        </div>
                      </div>
                      <Badge tone={unresolvedObligation ? "amber" : "emerald"}>
                        {unresolvedObligation ? "Open obligation" : "Receipted"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-zinc-400">
                      <div>Monthly burn: {fmtUsd((metadata.monthly_burn_cents as number | null | undefined) ?? null)}</div>
                      <div>Proof: {String(metadata.proof_kind || "unknown")}</div>
                      <div>Dependency: {String(metadata.build_dependency || "Not documented")}</div>
                      {metadata.monthly_burn_inferred === true && (
                        <div>Monthly figure is inferred from a non-monthly charge.</div>
                      )}
                      <div>Acknowledged: {fmtDate(row.acknowledged_at)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
            <div className="mb-4">
              <div className="text-lg font-black">Cost obligations</div>
              <div className="mt-1 text-sm text-zinc-500">Follow-through that still requires founder attention.</div>
            </div>
            <div className="grid gap-3">
              {unresolved.length === 0 && (
                <EmptyState>No unresolved builder-cost obligations.</EmptyState>
              )}
              {unresolved.map((row) => (
                <div key={row.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold">{row.obligation_type}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {String(row.metadata?.vendor || row.metadata?.subscription_key || row.object_id)}
                      </div>
                    </div>
                    <Badge tone="amber">{row.state}</Badge>
                  </div>
                  <div className="mt-3 text-xs text-zinc-400">
                    Opened {fmtDate(row.opened_at)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "amber" | "emerald" }) {
  const color =
    tone === "amber" ? "text-amber-400" : tone === "emerald" ? "text-emerald-400" : "text-zinc-100"
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className={`mt-2 text-3xl font-black ${color}`}>{value}</div>
    </div>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "amber" | "emerald" }) {
  return (
    <div
      className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
        tone === "emerald" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
      }`}
    >
      {children}
    </div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-500">
      {children}
    </div>
  )
}
