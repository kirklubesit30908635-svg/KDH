"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import type {
  MachineHealth,
  MachineObject,
  MachineReceipt,
  MachineState,
} from "@/lib/founder-console/types"
import { CLASS_RULES, type KernelClass } from "@/lib/kernel/rules"

type ActionMode = "acknowledge" | "obligation" | "resolve"

type BuilderCostsSummary = {
  active_subscriptions: number
  open_cost_obligations: number
  monthly_burn_cents: number | null
  monthly_burn_status: string
  vendor_proof_count: number
  founder_attested_count: number
  recent_subscriptions: Array<{
    id: string
    acknowledged_at: string
    subscription_name: string
    subscription_key: string | null
    vendor: string
    monthly_burn_cents: number | null
    proof_kind: string
    build_dependency: string | null
  }>
}

const kernelClasses = Object.keys(CLASS_RULES) as KernelClass[]
const terminalActions = ["closed", "terminated", "eliminated"] as const
const reasonCodes = [
  "action_completed",
  "customer_declined",
  "unqualified",
  "duplicate",
  "no_response",
  "pricing_rejected",
  "invalid_object",
  "external_loss",
  "client_routed_elsewhere",
] as const

const boardLinks = [
  { href: "/founder/builder-costs", label: "Builder Costs" },
  { href: "/command", label: "Command" },
  { href: "/integrity", label: "Integrity" },
  { href: "/receipts", label: "Receipts" },
]

const fieldClassName =
  "w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-amber-300/60"

function fmtDate(value: string | null | undefined) {
  if (!value) return "Unknown time"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function fmtAge(value: string | null | undefined) {
  if (!value) return "Unknown age"
  const deltaMs = Date.now() - new Date(value).getTime()
  const hours = Math.max(0, Math.floor(deltaMs / (1000 * 60 * 60)))
  if (hours < 1) return "Fresh"
  if (hours < 24) return `${hours}h old`
  const days = Math.floor(hours / 24)
  return `${days}d old`
}

function fmtUsd(cents: number | null | undefined) {
  if (typeof cents !== "number") return "Pending vendor amounts"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100)
}

function safeParseJson(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return JSON.parse(trimmed) as Record<string, unknown>
}

function boardScore(state: MachineState, health: MachineHealth) {
  let score = 100
  const failedChecks = Object.values(health.checks).filter((value) => !value).length
  score -= failedChecks * 12
  score -= Math.min(state.metrics.staleObligations * 4, 24)
  score -= Math.min(state.metrics.openObligations * 2, 18)
  score -= Math.max(0, state.metrics.openObligations - state.metrics.receipts)
  return Math.max(12, score)
}

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new Error(body.error || `Request failed with ${response.status}`)
  }
  return body as T
}

export default function FounderConsole() {
  const [state, setState] = useState<MachineState | null>(null)
  const [health, setHealth] = useState<MachineHealth | null>(null)
  const [costs, setCosts] = useState<BuilderCostsSummary | null>(null)
  const [costError, setCostError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<ActionMode>("acknowledge")

  const [ackClass, setAckClass] = useState<KernelClass>("lead")
  const [ackPosture, setAckPosture] = useState<string>(CLASS_RULES.lead.allowedPostures[0])
  const [ackSourceRef, setAckSourceRef] = useState("")
  const [ackMetadata, setAckMetadata] = useState("")

  const [obligationObjectId, setObligationObjectId] = useState("")
  const [obligationType, setObligationType] = useState<string>(CLASS_RULES.lead.allowedObligations[0])
  const [obligationMetadata, setObligationMetadata] = useState("")

  const [resolveObligationId, setResolveObligationId] = useState("")
  const [terminalAction, setTerminalAction] = useState<(typeof terminalActions)[number]>("closed")
  const [reasonCode, setReasonCode] = useState<(typeof reasonCodes)[number]>("action_completed")
  const [resolveMetadata, setResolveMetadata] = useState("")

  useEffect(() => {
    void loadBoard()
  }, [])

  useEffect(() => {
    setAckPosture(CLASS_RULES[ackClass].allowedPostures[0])
  }, [ackClass])

  useEffect(() => {
    const selectedObject = state?.objects.find((item) => item.id === obligationObjectId)
    const selectedClass =
      selectedObject && selectedObject.kernel_class in CLASS_RULES
        ? (selectedObject.kernel_class as KernelClass)
        : ackClass
    const allowed = CLASS_RULES[selectedClass].allowedObligations as readonly string[]

    if (!allowed.includes(obligationType)) {
      setObligationType(allowed[0])
    }
  }, [ackClass, obligationObjectId, obligationType, state])

  async function loadBoard() {
    setLoading(true)
    setError(null)

    const [stateRes, healthRes, costsRes] = await Promise.allSettled([
      readJson<MachineState>("/api/founder/machine-state"),
      readJson<MachineHealth>("/api/founder/machine-health"),
      readJson<BuilderCostsSummary>("/api/founder/builder-costs-summary"),
    ])

    if (stateRes.status === "rejected" || healthRes.status === "rejected") {
      const message = (() => {
        if (stateRes.status === "rejected") {
          return stateRes.reason instanceof Error ? stateRes.reason.message : "Failed to load founder machine state"
        }

        if (healthRes.status === "rejected") {
          return healthRes.reason instanceof Error ? healthRes.reason.message : "Failed to load founder machine health"
        }

        return "Failed to load founder surface"
      })()

      setError(message)
      setState(null)
      setHealth(null)
    } else {
      setState(stateRes.value)
      setHealth(healthRes.value)
      setObligationObjectId((current) => current || stateRes.value.objects[0]?.id || "")
      setResolveObligationId((current) => current || stateRes.value.obligations[0]?.id || "")
    }

    if (costsRes.status === "fulfilled") {
      setCosts(costsRes.value)
      setCostError(null)
    } else {
      setCosts(null)
      setCostError(costsRes.reason instanceof Error ? costsRes.reason.message : "Builder cost summary unavailable")
    }

    setLoading(false)
  }

  async function handleAcknowledge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setNotice(null)

    try {
      const response = await readJson<{ objectId: string }>("/api/founder/acknowledge-object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kernelClass: ackClass,
          economicPosture: ackPosture,
          sourceRef: ackSourceRef || null,
          metadata: safeParseJson(ackMetadata),
        }),
      })

      setNotice(`Acknowledged object ${response.objectId}`)
      setObligationObjectId(response.objectId)
      setAckSourceRef("")
      setAckMetadata("")
      setMode("obligation")
      await loadBoard()
    } catch (requestError) {
      setNotice(requestError instanceof Error ? requestError.message : "Acknowledge request failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOpenObligation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setNotice(null)

    try {
      const response = await readJson<{ obligationId: string }>("/api/founder/open-obligation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectId: obligationObjectId,
          obligationType,
          metadata: safeParseJson(obligationMetadata),
        }),
      })

      setNotice(`Opened obligation ${response.obligationId}`)
      setResolveObligationId(response.obligationId)
      setObligationMetadata("")
      setMode("resolve")
      await loadBoard()
    } catch (requestError) {
      setNotice(requestError instanceof Error ? requestError.message : "Open obligation request failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResolve(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setNotice(null)

    try {
      await readJson<{ ok: boolean }>("/api/founder/resolve-obligation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obligationId: resolveObligationId,
          terminalAction,
          reasonCode,
          metadata: safeParseJson(resolveMetadata),
        }),
      })

      setNotice(`Resolved obligation ${resolveObligationId}`)
      setResolveMetadata("")
      await loadBoard()
    } catch (requestError) {
      setNotice(requestError instanceof Error ? requestError.message : "Resolve request failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !state && !health) {
    return <div className="min-h-screen bg-stone-950 px-6 py-10 text-stone-100">Loading founder surface...</div>
  }

  if (error || !state || !health) {
    return (
      <div className="min-h-screen bg-stone-950 px-6 py-10 text-stone-100">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-red-500/30 bg-red-950/30 p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-red-200/70">Founder Surface</p>
          <h1 className="mt-3 text-3xl font-semibold" style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif" }}>
            The operating board did not load cleanly.
          </h1>
          <p className="mt-4 text-sm text-red-100/80">{error || "Founder state unavailable."}</p>
          <button
            type="button"
            onClick={() => void loadBoard()}
            className="mt-6 rounded-full border border-red-300/30 bg-red-200/10 px-5 py-2 text-sm text-red-50"
          >
            Retry founder load
          </button>
        </div>
      </div>
    )
  }

  const score = boardScore(state, health)
  const actionQueue = [...state.obligations]
    .filter((item) => item.state !== "resolved")
    .sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime())
  const recentReceipts = state.receipts.slice(0, 6)
  const recentObjects = state.objects.slice(0, 6)
  const failedChecks = Object.entries(health.checks).filter(([, passed]) => !passed)
  const selectedObject = state.objects.find((item) => item.id === obligationObjectId)
  const selectedKernelClass =
    selectedObject && selectedObject.kernel_class in CLASS_RULES
      ? (selectedObject.kernel_class as KernelClass)
      : ackClass
  const obligationOptions = CLASS_RULES[selectedKernelClass].allowedObligations
  const resolveTarget = state.obligations.find((item) => item.id === resolveObligationId)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.12),_transparent_30%),linear-gradient(180deg,_#191511,_#0c0b09)] text-stone-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-[36px] border border-stone-800 bg-stone-950/75 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="border-b border-stone-800 px-8 py-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.4em] text-amber-300/70">AutoKirk Founder</p>
                <h1 className="mt-3 text-4xl font-semibold text-stone-50 sm:text-5xl" style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif" }}>
                  Govern the machine from proof, not intuition.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-300">
                  Kernel truth stays authoritative. This surface shows live pressure, recent proof, builder operating cost
                  posture, and an explicit governed action rail that only submits through founder endpoints.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {boardLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-full border border-stone-700 bg-stone-900 px-4 py-2 text-sm text-stone-200 transition hover:border-amber-300/40 hover:text-amber-50"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-8 py-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Kernel Score" value={`${score}`} tone={score >= 85 ? "good" : score >= 65 ? "warn" : "bad"} detail={`${failedChecks.length} failed constitutional checks`} />
                <MetricCard label="Open Pressure" value={`${state.metrics.openObligations}`} tone={state.metrics.staleObligations > 0 ? "warn" : "good"} detail={`${state.metrics.staleObligations} stale obligations`} />
                <MetricCard label="Receipts" value={`${state.metrics.receipts}`} tone="good" detail={`${state.metrics.events} events committed`} />
                <MetricCard
                  label="Builder Burn"
                  value={fmtUsd(costs?.monthly_burn_cents)}
                  tone={costError ? "bad" : costs?.monthly_burn_status === "measured" ? "good" : "warn"}
                  detail={costError ? "Projection unavailable" : `${costs?.active_subscriptions ?? 0} active subscriptions`}
                />
              </section>
              <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Panel title="Immediate Pressure" eyebrow="Open obligations that still require action">
                  {actionQueue.length === 0 ? (
                    <EmptyState text="No open obligations. The founder action rail is clear." />
                  ) : (
                    <div className="space-y-3">
                      {actionQueue.slice(0, 8).map((obligation) => (
                        <button
                          type="button"
                          key={obligation.id}
                          onClick={() => {
                            setResolveObligationId(obligation.id)
                            setMode("resolve")
                          }}
                          className="w-full rounded-3xl border border-stone-800 bg-stone-900/70 p-4 text-left transition hover:border-amber-300/40"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium text-stone-100">{obligation.obligation_type}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.28em] text-stone-500">{obligation.id}</p>
                            </div>
                            <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-amber-100">
                              {fmtAge(obligation.opened_at)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-stone-400">Object {obligation.object_id}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="Constitution Checks" eyebrow="Health gates that should never drift silently">
                  <div className="space-y-3">
                    {Object.entries(health.checks).map(([key, passed]) => (
                      <div key={key} className="flex items-center justify-between rounded-3xl border border-stone-800 bg-stone-900/70 px-4 py-3">
                        <span className="text-sm text-stone-300">{key}</span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.24em] ${
                            passed ? "bg-emerald-300/15 text-emerald-100" : "bg-red-300/15 text-red-100"
                          }`}
                        >
                          {passed ? "passing" : "failed"}
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <Panel title="Recent Receipts" eyebrow="Immutable proof emitted by the kernel">
                  {recentReceipts.length === 0 ? (
                    <EmptyState text="No recent receipts in scope." />
                  ) : (
                    <div className="space-y-3">
                      {recentReceipts.map((receipt) => (
                        <ReceiptRow key={receipt.id} receipt={receipt} />
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="Governed Objects" eyebrow="Recent substrate entering or moving through governance">
                  {recentObjects.length === 0 ? (
                    <EmptyState text="No governed objects returned for this workspace." />
                  ) : (
                    <div className="space-y-3">
                      {recentObjects.map((object) => (
                        <ObjectRow
                          key={object.id}
                          object={object}
                          onSelect={() => {
                            setObligationObjectId(object.id)
                            if (object.kernel_class in CLASS_RULES) {
                              setAckClass(object.kernel_class as KernelClass)
                            }
                            setMode("obligation")
                          }}
                        />
                      ))}
                    </div>
                  )}
                </Panel>
              </section>

              <Panel title="Builder Operating Costs" eyebrow="Projection-only summary from committed kernel truth">
                {costError ? (
                  <div className="rounded-3xl border border-red-400/20 bg-red-950/20 p-5">
                    <p className="text-sm text-red-100">Builder cost summary unavailable.</p>
                    <p className="mt-2 text-sm text-red-100/70">{costError}</p>
                    <button
                      type="button"
                      onClick={() => void loadBoard()}
                      className="mt-4 rounded-full border border-red-300/30 px-4 py-2 text-sm text-red-50"
                    >
                      Retry summary
                    </button>
                  </div>
                ) : !costs ? (
                  <EmptyState text="No builder cost projection available yet." />
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="rounded-[28px] border border-stone-800 bg-stone-900/70 p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Subscription Posture</p>
                      <div className="mt-4 space-y-3">
                        <SummaryLine label="Active" value={`${costs.active_subscriptions}`} />
                        <SummaryLine label="Open obligations" value={`${costs.open_cost_obligations}`} />
                        <SummaryLine label="Vendor proof" value={`${costs.vendor_proof_count}`} />
                        <SummaryLine label="Founder attested" value={`${costs.founder_attested_count}`} />
                      </div>
                    </div>
                    <div className="space-y-3">
                      {costs.recent_subscriptions.length === 0 ? (
                        <EmptyState text="No governed builder subscriptions found." />
                      ) : (
                        costs.recent_subscriptions.map((subscription) => (
                          <div key={subscription.id} className="rounded-3xl border border-stone-800 bg-stone-900/70 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-stone-100">{subscription.subscription_name}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.28em] text-stone-500">
                                  {subscription.vendor} {subscription.subscription_key ? `• ${subscription.subscription_key}` : ""}
                                </p>
                              </div>
                              <span className="rounded-full border border-stone-700 px-3 py-1 text-xs uppercase tracking-[0.24em] text-stone-300">
                                {subscription.proof_kind}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-4 text-sm text-stone-400">
                              <span>Burn {fmtUsd(subscription.monthly_burn_cents)}</span>
                              <span>Ack {fmtDate(subscription.acknowledged_at)}</span>
                              <span>{subscription.build_dependency || "Dependency status pending"}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            <aside className="xl:sticky xl:top-6 xl:self-start">
              <div className="rounded-[32px] border border-stone-800 bg-stone-950/90 p-6">
                <p className="text-xs uppercase tracking-[0.35em] text-amber-300/70">Governed Action Rail</p>
                <h2 className="mt-3 text-2xl font-semibold text-stone-50" style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif" }}>
                  Submit intent through the founder endpoints only.
                </h2>
                <div className="mt-5 flex gap-2">
                  <ModeButton label="Acknowledge" active={mode === "acknowledge"} onClick={() => setMode("acknowledge")} />
                  <ModeButton label="Open" active={mode === "obligation"} onClick={() => setMode("obligation")} />
                  <ModeButton label="Resolve" active={mode === "resolve"} onClick={() => setMode("resolve")} />
                </div>

                <div className="mt-6 rounded-3xl border border-stone-800 bg-stone-900/70 p-4 text-sm text-stone-300">
                  <p>Primary endpoints</p>
                  <ul className="mt-3 space-y-2 text-xs uppercase tracking-[0.24em] text-stone-500">
                    <li>/api/founder/acknowledge-object</li>
                    <li>/api/founder/open-obligation</li>
                    <li>/api/founder/resolve-obligation</li>
                  </ul>
                </div>

                {notice ? (
                  <div className="mt-4 rounded-3xl border border-emerald-400/20 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
                    {notice}
                  </div>
                ) : null}

                {mode === "acknowledge" ? (
                  <form className="mt-6 space-y-4" onSubmit={handleAcknowledge}>
                    <Field label="Kernel class">
                      <select value={ackClass} onChange={(event) => setAckClass(event.target.value as KernelClass)} className={fieldClassName}>
                        {kernelClasses.map((kernelClass) => (
                          <option key={kernelClass} value={kernelClass}>
                            {kernelClass}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Economic posture">
                      <select value={ackPosture} onChange={(event) => setAckPosture(event.target.value)} className={fieldClassName}>
                        {CLASS_RULES[ackClass].allowedPostures.map((posture) => (
                          <option key={posture} value={posture}>
                            {posture}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Source ref">
                      <input value={ackSourceRef} onChange={(event) => setAckSourceRef(event.target.value)} className={fieldClassName} placeholder="invoice_2026_03 or vendor_ref" />
                    </Field>
                    <Field label="Metadata JSON">
                      <textarea value={ackMetadata} onChange={(event) => setAckMetadata(event.target.value)} className={`${fieldClassName} min-h-28`} placeholder='{"surface":"founder_console"}' />
                    </Field>
                    <SubmitButton busy={submitting}>Acknowledge object</SubmitButton>
                  </form>
                ) : null}

                {mode === "obligation" ? (
                  <form className="mt-6 space-y-4" onSubmit={handleOpenObligation}>
                    <Field label="Object">
                      <select value={obligationObjectId} onChange={(event) => setObligationObjectId(event.target.value)} className={fieldClassName}>
                        {state.objects.map((object) => (
                          <option key={object.id} value={object.id}>
                            {object.kernel_class} • {object.id}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Obligation type">
                      <select value={obligationType} onChange={(event) => setObligationType(event.target.value)} className={fieldClassName}>
                        {obligationOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Metadata JSON">
                      <textarea value={obligationMetadata} onChange={(event) => setObligationMetadata(event.target.value)} className={`${fieldClassName} min-h-28`} placeholder='{"priority":"high"}' />
                    </Field>
                    <SubmitButton busy={submitting}>Open obligation</SubmitButton>
                  </form>
                ) : null}

                {mode === "resolve" ? (
                  <form className="mt-6 space-y-4" onSubmit={handleResolve}>
                    <Field label="Obligation">
                      <select value={resolveObligationId} onChange={(event) => setResolveObligationId(event.target.value)} className={fieldClassName}>
                        {state.obligations.map((obligation) => (
                          <option key={obligation.id} value={obligation.id}>
                            {obligation.obligation_type} • {obligation.id}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Terminal action">
                      <select value={terminalAction} onChange={(event) => setTerminalAction(event.target.value as (typeof terminalActions)[number])} className={fieldClassName}>
                        {terminalActions.map((action) => (
                          <option key={action} value={action}>
                            {action}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Reason code">
                      <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as (typeof reasonCodes)[number])} className={fieldClassName}>
                        {reasonCodes.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Metadata JSON">
                      <textarea value={resolveMetadata} onChange={(event) => setResolveMetadata(event.target.value)} className={`${fieldClassName} min-h-28`} placeholder='{"proof_note":"attached"}' />
                    </Field>
                    <SubmitButton busy={submitting}>Resolve obligation</SubmitButton>
                    {resolveTarget ? (
                      <p className="text-xs leading-5 text-stone-500">
                        Resolving <span className="text-stone-300">{resolveTarget.obligation_type}</span> on object{" "}
                        <span className="text-stone-300">{resolveTarget.object_id}</span>.
                      </p>
                    ) : null}
                  </form>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: "good" | "warn" | "bad"
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-400/20 bg-emerald-300/8"
      : tone === "warn"
        ? "border-amber-400/20 bg-amber-300/8"
        : "border-red-400/20 bg-red-300/8"

  return (
    <div className={`rounded-[28px] border p-5 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.28em] text-stone-500">{label}</p>
      <p className="mt-4 text-3xl font-semibold text-stone-50">{value}</p>
      <p className="mt-2 text-sm text-stone-400">{detail}</p>
    </div>
  )
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[32px] border border-stone-800 bg-stone-950/55 p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-stone-500">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold text-stone-50" style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif" }}>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function ReceiptRow({ receipt }: { receipt: MachineReceipt }) {
  return (
    <div className="rounded-3xl border border-stone-800 bg-stone-900/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-100">Receipt seq {receipt.seq}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.28em] text-stone-500">{receipt.id}</p>
        </div>
        <span className="rounded-full border border-stone-700 px-3 py-1 text-xs uppercase tracking-[0.22em] text-stone-300">
          type {receipt.receipt_type_id}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-stone-400">
        <span>Event {receipt.event_id}</span>
        <span>{fmtDate(receipt.created_at)}</span>
      </div>
    </div>
  )
}

function ObjectRow({ object, onSelect }: { object: MachineObject; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-3xl border border-stone-800 bg-stone-900/70 p-4 text-left transition hover:border-amber-300/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-stone-100">{object.kernel_class}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.28em] text-stone-500">{object.id}</p>
        </div>
        <span className="rounded-full border border-stone-700 px-3 py-1 text-xs uppercase tracking-[0.22em] text-stone-300">
          {object.economic_posture}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-stone-400">
        <span>Status {object.status}</span>
        <span>{fmtDate(object.acknowledged_at)}</span>
      </div>
    </button>
  )
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-stone-800 pb-2 text-sm text-stone-300 last:border-b-0 last:pb-0">
      <span>{label}</span>
      <span className="font-medium text-stone-50">{value}</span>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-stone-700 bg-stone-900/40 p-5 text-sm text-stone-400">{text}</div>
}

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active ? "bg-amber-200 text-stone-950" : "border border-stone-700 bg-stone-900 text-stone-200"
      }`}
    >
      {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-stone-500">{label}</span>
      {children}
    </label>
  )
}

function SubmitButton({ children, busy }: { children: React.ReactNode; busy: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-full bg-amber-200 px-4 py-3 text-sm font-medium text-stone-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? "Submitting..." : children}
    </button>
  )
}
