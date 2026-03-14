"use client"

import { useEffect, useMemo, useState } from "react"
import type { MachineHealth, MachineState } from "@/lib/founder-console/types"

const kernelClasses = ["lead", "invoice", "job", "campaign", "inspection", "payment"]
const economicPostures = ["revenue_candidate", "direct_revenue", "cost_exposure", "revenue_recovery", "non_economic"]
const terminalActions = ["closed", "terminated", "eliminated"]
const reasonCodes = [
  "customer_declined",
  "unqualified",
  "duplicate",
  "no_response",
  "pricing_rejected",
  "invalid_object",
  "external_loss",
  "client_routed_elsewhere",
]

function fmtDate(value?: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function fmtAge(value?: string | null) {
  if (!value) return "—"
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function integrityScore(state: MachineState | null, health: MachineHealth | null) {
  if (!state || !health) return 0
  const passes = Object.values(health.checks).filter(Boolean).length
  const checkScore = passes * 18
  const pressurePenalty = Math.min(28, state.metrics.openObligations * 3)
  const stalePenalty = Math.min(20, state.metrics.staleObligations * 5)
  return Math.max(0, Math.min(100, 24 + checkScore - pressurePenalty - stalePenalty))
}

export default function FounderConsole() {
  const [state, setState] = useState<MachineState | null>(null)
  const [health, setHealth] = useState<MachineHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [kernelClass, setKernelClass] = useState("lead")
  const [economicPosture, setEconomicPosture] = useState("revenue_candidate")
  const [sourceRef, setSourceRef] = useState("")
  const [objectMetadata, setObjectMetadata] = useState('{\n  "channel": "founder_console"\n}')

  const [selectedObjectId, setSelectedObjectId] = useState("")
  const [obligationType, setObligationType] = useState("follow_up")
  const [obligationMetadata, setObligationMetadata] = useState('{\n  "priority": "normal"\n}')

  const [selectedObligationId, setSelectedObligationId] = useState("")
  const [terminalAction, setTerminalAction] = useState("closed")
  const [reasonCode, setReasonCode] = useState("customer_declined")
  const [resolutionMetadata, setResolutionMetadata] = useState('{\n  "surface": "founder_console"\n}')

  async function loadMachine() {
    setLoading(true)
    setError(null)

    const [stateRes, healthRes] = await Promise.all([
      fetch("/api/founder/machine-state", { cache: "no-store" }),
      fetch("/api/founder/machine-health", { cache: "no-store" }),
    ])

    const stateJson = await stateRes.json()
    const healthJson = await healthRes.json()

    if (!stateRes.ok) {
      setError(stateJson.error || "Failed to load machine state")
    } else {
      setState(stateJson)
    }

    if (!healthRes.ok) {
      setError(healthJson.error || "Failed to load machine health")
    } else {
      setHealth(healthJson)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadMachine()
  }, [])

  useEffect(() => {
    if (!selectedObjectId && state?.objects?.[0]?.id) {
      setSelectedObjectId(state.objects[0].id)
    }
    if (!selectedObligationId) {
      const firstOpen = state?.obligations?.find((row) => row.state !== "resolved")
      if (firstOpen?.id) setSelectedObligationId(firstOpen.id)
    }
  }, [state, selectedObjectId, selectedObligationId])

  const pressure = useMemo(() => {
    return [...(state?.obligations || [])]
      .filter((row) => row.state !== "resolved")
      .sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime())
  }, [state])

  async function mutate(path: string, body: unknown, key: string, okMessage: string) {
    setBusy(key)
    setError(null)
    setSuccess(null)

    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const json = await res.json()

    if (!res.ok) {
      setError(json.error || "Action failed")
    } else {
      setSuccess(okMessage)
      await loadMachine()
    }

    setBusy(null)
  }

  const integrity = integrityScore(state, health)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-[1600px] p-6 md:p-8">
        <div className="mb-6 grid gap-6 xl:grid-cols-[1.5fr_.8fr]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl shadow-black/30">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="mb-2 text-xs font-black uppercase tracking-[0.28em] text-zinc-500">AutoKirk founder control surface</div>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">Operate revenue integrity like infrastructure.</h1>
                <p className="mt-3 max-w-2xl text-sm text-zinc-400">
                  This is a founder console for a real operating system. It introduces objects, opens pressure, resolves obligations, and exposes truth and proof without inventing fake SaaS workflow state.
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-700 bg-zinc-950/90 px-5 py-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Integrity</div>
                <div className="mt-1 text-3xl font-black">{integrity}</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Objects" value={state?.metrics.objects ?? 0} tone="cyan" />
              <MetricCard label="Open pressure" value={state?.metrics.openObligations ?? 0} tone="amber" />
              <MetricCard label="Events" value={state?.metrics.events ?? 0} tone="violet" />
              <MetricCard label="Receipts" value={state?.metrics.receipts ?? 0} tone="emerald" />
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl shadow-black/30">
            <div className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">Authority surface</div>
            <div className="mt-4 grid gap-4">
              <InfoRow label="Mode" value={state?.mode || "founder_console"} />
              <InfoRow label="Workspace" value={state?.workspaceId || "not bound"} mono />
              <InfoRow label="Actor" value={state?.actorId || "not bound"} mono />
              <button
                onClick={loadMachine}
                disabled={loading}
                className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold transition hover:border-zinc-600 hover:text-white disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "Refresh machine"}
              </button>
            </div>
          </div>
        </div>

        {(error || success) && (
          <div className="mb-6 grid gap-3">
            {error && <Banner tone="red">{error}</Banner>}
            {success && <Banner tone="emerald">{success}</Banner>}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)_430px]">
          <div className="grid gap-6">
            <Panel title="Object intake" subtitle="Reality enters jurisdiction here.">
              <Field label="Kernel class">
                <select value={kernelClass} onChange={(e) => setKernelClass(e.target.value)} className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-50 outline-none">
                  {kernelClasses.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>

              <Field label="Economic posture">
                <select value={economicPosture} onChange={(e) => setEconomicPosture(e.target.value)} className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-50 outline-none">
                  {economicPostures.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>

              <Field label="Source reference">
                <input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="invoice #1087 / lead ref / job id" className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-50 outline-none" />
              </Field>

              <Field label="Metadata JSON">
                <textarea value={objectMetadata} onChange={(e) => setObjectMetadata(e.target.value)} className="min-h-[110px] w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-mono text-xs text-zinc-50 outline-none" />
              </Field>

              <button
                onClick={() => mutate(
                  "/api/founder/acknowledge-object",
                  {
                    kernelClass,
                    economicPosture,
                    sourceRef,
                    metadata: safeParseJson(objectMetadata),
                  },
                  "acknowledge-object",
                  "Object acknowledged."
                )}
                disabled={busy === "acknowledge-object"}
                className="rounded-full bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
              >
                {busy === "acknowledge-object" ? "Acknowledging…" : "Acknowledge object"}
              </button>
            </Panel>

            <Panel title="Open obligation" subtitle="Pressure is a first-class machine action.">
              <Field label="Object">
                <select value={selectedObjectId} onChange={(e) => setSelectedObjectId(e.target.value)} className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-50 outline-none">
                  <option value="">Select object</option>
                  {(state?.objects || []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.kernel_class} · {row.status} · {row.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Obligation type">
                <input value={obligationType} onChange={(e) => setObligationType(e.target.value)} className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-50 outline-none" />
              </Field>

              <Field label="Metadata JSON">
                <textarea value={obligationMetadata} onChange={(e) => setObligationMetadata(e.target.value)} className="min-h-[100px] w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-mono text-xs text-zinc-50 outline-none" />
              </Field>

              <button
                onClick={() => mutate(
                  "/api/founder/open-obligation",
                  {
                    objectId: selectedObjectId,
                    obligationType,
                    metadata: safeParseJson(obligationMetadata),
                  },
                  "open-obligation",
                  "Obligation opened."
                )}
                disabled={!selectedObjectId || busy === "open-obligation"}
                className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-bold transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
              >
                {busy === "open-obligation" ? "Opening…" : "Open obligation"}
              </button>
            </Panel>
          </div>

          <Panel title="Pressure board" subtitle="Operators work obligations. Pressure is the operating surface.">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <MiniMetric label="Open" value={state?.metrics.openObligations ?? 0} tone="cyan" />
              <MiniMetric label="Resolved" value={state?.metrics.resolvedObligations ?? 0} tone="emerald" />
              <MiniMetric label="Stale" value={state?.metrics.staleObligations ?? 0} tone="amber" />
            </div>

            <div className="grid gap-3">
              {pressure.length === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/80 px-4 py-12 text-center text-zinc-500">
                  No open obligations. The machine is calm.
                </div>
              )}

              {pressure.map((row) => {
                const object = state?.objects.find((o) => o.id === row.object_id)
                const stale = Date.now() - new Date(row.opened_at).getTime() > 1000 * 60 * 60 * 8
                return (
                  <div key={row.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/80">
                    <div className={`h-1 ${stale ? "bg-zinc-500" : "bg-zinc-700"}`} />
                    <div className="grid gap-4 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">{row.obligation_type}</div>
                          <div className="mt-1 text-sm text-zinc-400">
                            {object?.kernel_class || "object"} · {object?.economic_posture || "—"} · opened {fmtDate(row.opened_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Pill>{fmtAge(row.opened_at)}</Pill>
                          {stale && <Pill tone="amber">stale</Pill>}
                        </div>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-500">
                          Object {row.object_id.slice(0, 8)} · Obligation {row.id.slice(0, 8)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setSelectedObligationId(row.id)}
                            className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold transition hover:border-zinc-500"
                          >
                            Prepare resolve
                          </button>
                          <button
                            onClick={() => mutate(
                              "/api/founder/resolve-obligation",
                              {
                                obligationId: row.id,
                                terminalAction,
                                reasonCode,
                                metadata: safeParseJson(resolutionMetadata),
                              },
                              `resolve-${row.id}`,
                              "Obligation resolved."
                            )}
                            disabled={busy === `resolve-${row.id}`}
                            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
                          >
                            {busy === `resolve-${row.id}` ? "Resolving…" : "Resolve now"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          <div className="grid gap-6">
            <Panel title="Resolve obligation" subtitle="Terminal disposition should be explicit and receipted.">
              <Field label="Obligation">
                <select value={selectedObligationId} onChange={(e) => setSelectedObligationId(e.target.value)} className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-50 outline-none">
                  <option value="">Select obligation</option>
                  {pressure.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.obligation_type} · {row.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Terminal action">
                  <select value={terminalAction} onChange={(e) => setTerminalAction(e.target.value)} className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-50 outline-none">
                    {terminalActions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Reason code">
                  <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-zinc-50 outline-none">
                    {reasonCodes.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Resolution metadata JSON">
                <textarea value={resolutionMetadata} onChange={(e) => setResolutionMetadata(e.target.value)} className="min-h-[110px] w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 font-mono text-xs text-zinc-50 outline-none" />
              </Field>

              <button
                onClick={() => mutate(
                  "/api/founder/resolve-obligation",
                  {
                    obligationId: selectedObligationId,
                    terminalAction,
                    reasonCode,
                    metadata: safeParseJson(resolutionMetadata),
                  },
                  "resolve-selected",
                  "Obligation resolved."
                )}
                disabled={!selectedObligationId || busy === "resolve-selected"}
                className="rounded-full bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
              >
                {busy === "resolve-selected" ? "Resolving…" : "Resolve obligation"}
              </button>
            </Panel>

            <Panel title="Truth stream" subtitle="Visible events. Visible proof.">
              <div className="grid gap-4">
                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-zinc-500">Events</div>
                  <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
                    {(state?.events || []).map((row) => (
                      <div key={row.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{row.event_type}</div>
                          <div className="text-xs text-zinc-500">{fmtDate(row.occurred_at)}</div>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          actor {row.actor_class}:{row.actor_id} · object {row.object_id?.slice(0, 8) || "—"} · obligation {row.obligation_id?.slice(0, 8) || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-zinc-500">Receipts</div>
                  <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
                    {(state?.receipts || []).map((row) => (
                      <div key={row.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{row.receipt_type}</div>
                          <div className="text-xs text-zinc-500">{fmtDate(row.issued_at)}</div>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          actor {row.actor_class}:{row.actor_id} · reason {row.reason_code || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Machine health" subtitle="Backend checks. No fake reassurance.">
              <div className="grid gap-3">
                <HealthCheck label="Governed class/posture matrix present" ok={health?.checks.governedClassPostureMatrixPresent ?? false} />
                <HealthCheck label="Resolved obligations carry terminal action" ok={health?.checks.resolvedObligationsCarryTerminalData ?? false} />
                <HealthCheck label="No resolved obligation missing actor" ok={health?.checks.noResolvedObligationWithoutActor ?? false} />
                <HealthCheck label="No resolved obligation missing timestamp" ok={health?.checks.noResolvedObligationWithoutTimestamp ?? false} />
                <HealthCheck label="Receipts do not exceed events" ok={health?.checks.receiptsDoNotExceedEvents ?? false} />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl shadow-black/30">
      <div className="mb-4">
        <div className="text-xl font-black">{title}</div>
        <div className="mt-1 text-sm text-zinc-400">{subtitle}</div>
      </div>
      <div className="grid gap-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-zinc-300">{label}</span>
      {children}
    </label>
  )
}

function MetricCard({ label, value }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 px-4 py-3">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  )
}

function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "amber" }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone === "amber" ? "border border-zinc-600 bg-zinc-800 text-zinc-300" : "border border-zinc-700 bg-zinc-900 text-zinc-300"}`}>
      {children}
    </span>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 px-4 py-3">
      <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className={`mt-1 text-sm ${mono ? "break-all font-mono" : ""}`}>{value}</div>
    </div>
  )
}

function Banner({ tone, children }: { tone: "red" | "emerald"; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl px-4 py-3 text-sm ${tone === "red" ? "border border-zinc-700 bg-zinc-900 text-red-400" : "border border-zinc-700 bg-zinc-900 text-emerald-400"}`}>
      {children}
    </div>
  )
}

function HealthCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950/90 px-4 py-3">
      <div className="text-sm">{label}</div>
      <div className={`rounded-full border px-2 py-1 text-xs font-bold uppercase tracking-[0.16em] ${ok ? "border-zinc-700 text-zinc-300" : "border-zinc-700 text-zinc-500"}`}>
        {ok ? "Pass" : "Fail"}
      </div>
    </div>
  )
}
