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
  if (!value) return "\u2014"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function fmtAge(value?: string | null) {
  if (!value) return "\u2014"
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

function integrityColor(score: number) {
  if (score >= 80) return "text-emerald-400"
  if (score >= 50) return "text-amber-400"
  return "text-red-400"
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <div className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 md:px-8">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-zinc-500">AutoKirk</div>
            <div className="text-lg font-black">Founder Console</div>
          </div>
          <button
            onClick={loadMachine}
            disabled={loading}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
          >
            {loading ? "Refreshing\u2026" : "Refresh machine"}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] p-6 md:p-8">
        {/* Hero row: integrity + metrics + authority */}
        <div className="mb-8 grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-5">
              <div>
                <h1 className="text-2xl font-black tracking-tight md:text-3xl">Operate revenue integrity like infrastructure.</h1>
                <p className="mt-2 max-w-2xl text-sm text-zinc-400">
                  Introduce objects, open pressure, resolve obligations, expose truth and proof. No fake SaaS workflow state.
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-4 text-center">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Integrity</div>
                <div className={`mt-1 text-4xl font-black ${integrityColor(integrity)}`}>{integrity}</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Objects" value={state?.metrics.objects ?? 0} accent="text-zinc-100" />
              <MetricCard label="Open pressure" value={state?.metrics.openObligations ?? 0} accent="text-amber-400" />
              <MetricCard label="Events" value={state?.metrics.events ?? 0} accent="text-zinc-100" />
              <MetricCard label="Receipts" value={state?.metrics.receipts ?? 0} accent="text-emerald-400" />
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Authority surface</div>
            <div className="mt-4 grid gap-3">
              <InfoRow label="Mode" value={state?.mode || "founder_console"} />
              <InfoRow label="Workspace" value={state?.workspaceId || "not bound"} mono />
              <InfoRow label="Actor" value={state?.actorId || "not bound"} mono />
            </div>
          </div>
        </div>

        {/* Banners */}
        {(error || success) && (
          <div className="mb-6 grid gap-3">
            {error && <Banner tone="red">{error}</Banner>}
            {success && <Banner tone="emerald">{success}</Banner>}
          </div>
        )}

        {/* Main 3-column layout */}
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)_420px]">
          {/* Left: intake + open obligation */}
          <div className="grid gap-6 self-start">
            <Panel title="Object intake" subtitle="Reality enters jurisdiction here.">
              <Field label="Kernel class">
                <select value={kernelClass} onChange={(e) => setKernelClass(e.target.value)} className="input-field">
                  {kernelClasses.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>

              <Field label="Economic posture">
                <select value={economicPosture} onChange={(e) => setEconomicPosture(e.target.value)} className="input-field">
                  {economicPostures.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>

              <Field label="Source reference">
                <input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="invoice #1087 / lead ref / job id" className="input-field" />
              </Field>

              <Field label="Metadata JSON">
                <textarea value={objectMetadata} onChange={(e) => setObjectMetadata(e.target.value)} className="input-field min-h-[100px] font-mono text-xs" />
              </Field>

              <button
                onClick={() => mutate(
                  "/api/founder/acknowledge-object",
                  { kernelClass, economicPosture, sourceRef, metadata: safeParseJson(objectMetadata) },
                  "acknowledge-object",
                  "Object acknowledged."
                )}
                disabled={busy === "acknowledge-object"}
                className="btn-primary"
              >
                {busy === "acknowledge-object" ? "Acknowledging\u2026" : "Acknowledge object"}
              </button>
            </Panel>

            <Panel title="Open obligation" subtitle="Pressure is a first-class machine action.">
              <Field label="Object">
                <select value={selectedObjectId} onChange={(e) => setSelectedObjectId(e.target.value)} className="input-field">
                  <option value="">Select object</option>
                  {(state?.objects || []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.kernel_class} \u00b7 {row.status} \u00b7 {row.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Obligation type">
                <input value={obligationType} onChange={(e) => setObligationType(e.target.value)} className="input-field" />
              </Field>

              <Field label="Metadata JSON">
                <textarea value={obligationMetadata} onChange={(e) => setObligationMetadata(e.target.value)} className="input-field min-h-[90px] font-mono text-xs" />
              </Field>

              <button
                onClick={() => mutate(
                  "/api/founder/open-obligation",
                  { objectId: selectedObjectId, obligationType, metadata: safeParseJson(obligationMetadata) },
                  "open-obligation",
                  "Obligation opened."
                )}
                disabled={!selectedObjectId || busy === "open-obligation"}
                className="btn-secondary"
              >
                {busy === "open-obligation" ? "Opening\u2026" : "Open obligation"}
              </button>
            </Panel>
          </div>

          {/* Center: pressure board */}
          <Panel title="Pressure board" subtitle="Operators work obligations. Pressure is the operating surface.">
            <div className="mb-2 grid gap-3 md:grid-cols-3">
              <MiniMetric label="Open" value={state?.metrics.openObligations ?? 0} accent="text-amber-400" />
              <MiniMetric label="Resolved" value={state?.metrics.resolvedObligations ?? 0} accent="text-emerald-400" />
              <MiniMetric label="Stale" value={state?.metrics.staleObligations ?? 0} accent="text-red-400" />
            </div>

            <div className="grid gap-3">
              {pressure.length === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-14 text-center text-zinc-500">
                  No open obligations. The machine is calm.
                </div>
              )}

              {pressure.map((row) => {
                const object = state?.objects.find((o) => o.id === row.object_id)
                const stale = Date.now() - new Date(row.opened_at).getTime() > 1000 * 60 * 60 * 8
                return (
                  <div key={row.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                    <div className={`h-[3px] ${stale ? "bg-red-500/60" : "bg-amber-500/40"}`} />
                    <div className="grid gap-4 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-bold">{row.obligation_type}</div>
                          <div className="mt-1 text-sm text-zinc-400">
                            {object?.kernel_class || "object"} \u00b7 {object?.economic_posture || "\u2014"} \u00b7 opened {fmtDate(row.opened_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Pill>{fmtAge(row.opened_at)}</Pill>
                          {stale && <Pill tone="red">stale</Pill>}
                        </div>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                        <div className="rounded-xl bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500 font-mono">
                          obj {row.object_id.slice(0, 8)} \u00b7 obl {row.id.slice(0, 8)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setSelectedObligationId(row.id)}
                            className="btn-secondary text-xs px-3 py-2"
                          >
                            Prepare resolve
                          </button>
                          <button
                            onClick={() => mutate(
                              "/api/founder/resolve-obligation",
                              { obligationId: row.id, terminalAction, reasonCode, metadata: safeParseJson(resolutionMetadata) },
                              `resolve-${row.id}`,
                              "Obligation resolved."
                            )}
                            disabled={busy === `resolve-${row.id}`}
                            className="btn-primary text-xs px-3 py-2"
                          >
                            {busy === `resolve-${row.id}` ? "Resolving\u2026" : "Resolve now"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* Right: resolve + truth stream + health */}
          <div className="grid gap-6 self-start">
            <Panel title="Resolve obligation" subtitle="Terminal disposition should be explicit and receipted.">
              <Field label="Obligation">
                <select value={selectedObligationId} onChange={(e) => setSelectedObligationId(e.target.value)} className="input-field">
                  <option value="">Select obligation</option>
                  {pressure.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.obligation_type} \u00b7 {row.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Terminal action">
                  <select value={terminalAction} onChange={(e) => setTerminalAction(e.target.value)} className="input-field">
                    {terminalActions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
                <Field label="Reason code">
                  <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="input-field">
                    {reasonCodes.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Resolution metadata JSON">
                <textarea value={resolutionMetadata} onChange={(e) => setResolutionMetadata(e.target.value)} className="input-field min-h-[100px] font-mono text-xs" />
              </Field>

              <button
                onClick={() => mutate(
                  "/api/founder/resolve-obligation",
                  { obligationId: selectedObligationId, terminalAction, reasonCode, metadata: safeParseJson(resolutionMetadata) },
                  "resolve-selected",
                  "Obligation resolved."
                )}
                disabled={!selectedObligationId || busy === "resolve-selected"}
                className="btn-primary"
              >
                {busy === "resolve-selected" ? "Resolving\u2026" : "Resolve obligation"}
              </button>
            </Panel>

            <Panel title="Truth stream" subtitle="Visible events. Visible proof.">
              <div className="grid gap-4">
                <div>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Events</div>
                  <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
                    {(state?.events || []).length === 0 && <EmptySlot>No events yet</EmptySlot>}
                    {(state?.events || []).map((row) => (
                      <div key={row.id} className="rounded-xl border border-zinc-800/60 bg-zinc-950 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{row.chain_key} <span className="text-zinc-500">#{row.seq}</span></div>
                          <div className="text-[11px] text-zinc-500">{fmtDate(row.created_at)}</div>
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          type {row.event_type_id} \u00b7 {row.id.slice(0, 8)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Receipts</div>
                  <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
                    {(state?.receipts || []).length === 0 && <EmptySlot>No receipts yet</EmptySlot>}
                    {(state?.receipts || []).map((row) => (
                      <div key={row.id} className="rounded-xl border border-zinc-800/60 bg-zinc-950 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{row.chain_key} <span className="text-zinc-500">#{row.seq}</span></div>
                          <div className="text-[11px] text-zinc-500">{fmtDate(row.created_at)}</div>
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          type {row.receipt_type_id} \u00b7 event {row.event_id.slice(0, 8)} \u00b7 {row.id.slice(0, 8)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Machine health" subtitle="Backend checks. No fake reassurance.">
              <div className="grid gap-2">
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

      {/* Shared utility classes via inline style tag */}
      <style>{`
        .input-field {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(39 39 42);
          background: rgb(9 9 11);
          padding: 0.625rem 0.75rem;
          color: rgb(244 244 245);
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: rgb(113 113 122);
        }
        .input-field::placeholder {
          color: rgb(82 82 91);
        }
        .btn-primary {
          border-radius: 9999px;
          background: white;
          padding: 0.625rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 700;
          color: rgb(9 9 11);
          transition: background 0.15s;
        }
        .btn-primary:hover {
          background: rgb(228 228 231);
        }
        .btn-primary:disabled {
          opacity: 0.5;
        }
        .btn-secondary {
          border-radius: 9999px;
          border: 1px solid rgb(63 63 70);
          padding: 0.625rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: rgb(212 212 216);
          transition: border-color 0.15s, color 0.15s;
        }
        .btn-secondary:hover {
          border-color: rgb(113 113 122);
          color: white;
        }
        .btn-secondary:disabled {
          opacity: 0.5;
        }
      `}</style>
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-4">
        <div className="text-lg font-black">{title}</div>
        <div className="mt-0.5 text-sm text-zinc-500">{subtitle}</div>
      </div>
      <div className="grid gap-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      {children}
    </label>
  )
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className={`mt-1.5 text-3xl font-black ${accent}`}>{value}</div>
    </div>
  )
}

function MiniMetric({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-black ${accent}`}>{value}</div>
    </div>
  )
}

function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "red" }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
      tone === "red"
        ? "bg-red-500/15 text-red-400"
        : "border border-zinc-700 bg-zinc-900 text-zinc-400"
    }`}>
      {children}
    </span>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-sm text-zinc-300 ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</div>
    </div>
  )
}

function Banner({ tone, children }: { tone: "red" | "emerald"; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
      tone === "red"
        ? "border border-red-500/20 bg-red-500/10 text-red-400"
        : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    }`}>
      {children}
    </div>
  )
}

function HealthCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/60 bg-zinc-950 px-3 py-2.5">
      <div className="text-sm text-zinc-300">{label}</div>
      <div className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        ok
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-red-500/15 text-red-400"
      }`}>
        {ok ? "Pass" : "Fail"}
      </div>
    </div>
  )
}

function EmptySlot({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950 px-4 py-6 text-center text-sm text-zinc-600">
      {children}
    </div>
  )
}
