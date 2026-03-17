"use client"

export default function AutoKirkFounderConsoleRedesign() {
  const stats = [
    { label: "Integrity", value: "100", tone: "text-emerald-400", sub: "Healthy system" },
    { label: "Open Pressure", value: "0", tone: "text-amber-300", sub: "Nothing stalled" },
    { label: "Objects", value: "18", tone: "text-white", sub: "In jurisdiction" },
    { label: "Receipts", value: "13", tone: "text-sky-300", sub: "Proof emitted" },
  ]

  const obligations = [
    {
      id: "invoice #1087",
      type: "follow_up",
      opened: "4 min ago",
      owner: "Founder Console",
      priority: "Normal",
      status: "active",
    },
    {
      id: "work order #241",
      type: "customer_callback",
      opened: "18 min ago",
      owner: "Service Desk",
      priority: "Watch",
      status: "active",
    },
    {
      id: "quote #581",
      type: "estimate_review",
      opened: "42 min ago",
      owner: "Parts",
      priority: "Escalate soon",
      status: "stale",
    },
  ]

  const activity = [
    {
      time: "16:15",
      kind: "Receipt",
      title: "object_resolution_completed",
      detail: "invoice #1087 closed with proof emitted",
    },
    {
      time: "16:14",
      kind: "Event",
      title: "obligation_resolved",
      detail: "customer_declined captured by founder_console",
    },
    {
      time: "16:13",
      kind: "Obligation",
      title: "follow_up_opened",
      detail: "invoice #1087 entered active pressure",
    },
    {
      time: "16:11",
      kind: "Object",
      title: "object_acknowledged",
      detail: "lead / revenue_candidate admitted to jurisdiction",
    },
  ]

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.28em] text-neutral-400">
                AutoKirk Founder Console
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Operate revenue integrity with clarity.
              </h1>
              <p className="max-w-2xl text-sm text-neutral-400 sm:text-base">
                A high-trust operating surface designed for fast comprehension: system status
                first, active pressure centered, proof always visible.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/10 bg-neutral-900/80 p-4"
                >
                  <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                    {stat.label}
                  </div>
                  <div className={`mt-2 text-3xl font-semibold ${stat.tone}`}>{stat.value}</div>
                  <div className="mt-1 text-xs text-neutral-500">{stat.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <main className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-neutral-500">Input</div>
                <h2 className="mt-1 text-xl font-semibold">Object Intake</h2>
              </div>
              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                Jurisdiction Gate
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Kernel Class" value="lead" />
              <Field label="Economic Posture" value="revenue_candidate" />
              <Field label="Source Reference" value="invoice #1087 / lead ref / job id" />
              <Field label="Metadata" value='{ "channel": "founder_console" }' mono />
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-neutral-900/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                What this does
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                Admits an object into governed system reality. Once acknowledged, it cannot
                disappear without terminal resolution and proof.
              </p>
            </div>

            <button className="mt-5 w-full rounded-2xl bg-white px-4 py-3 text-sm font-medium text-neutral-950 transition hover:scale-[1.01]">
              Acknowledge Object
            </button>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-neutral-500">
                  Operations
                </div>
                <h2 className="mt-1 text-2xl font-semibold">Active Pressure</h2>
                <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                  The system centers the work that needs attention now. Operators understand
                  health, urgency, and next action without scanning multiple dashboards.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 self-start lg:self-auto">
                <MiniStat label="Open" value="2" />
                <MiniStat label="Resolved" value="80" />
                <MiniStat label="Stale" value="1" alert />
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {obligations.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-neutral-900/75 p-4 transition hover:-translate-y-0.5 hover:border-white/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-medium text-white">{item.id}</div>
                      <div className="mt-1 text-sm text-neutral-400">{item.type}</div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${
                        item.status === "stale"
                          ? "border border-red-500/20 bg-red-500/10 text-red-300"
                          : "border border-amber-500/20 bg-amber-500/10 text-amber-200"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-neutral-400">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                        Opened
                      </div>
                      <div className="mt-1 text-neutral-200">{item.opened}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                        Owner
                      </div>
                      <div className="mt-1 text-neutral-200">{item.owner}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                        Priority
                      </div>
                      <div className="mt-1 text-neutral-200">{item.priority}</div>
                    </div>
                  </div>

                  <div className="mt-5 flex gap-2">
                    <button className="flex-1 rounded-xl bg-white px-3 py-2 text-sm font-medium text-neutral-950 transition hover:scale-[1.01]">
                      Resolve
                    </button>
                    <button className="rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-200 transition hover:border-white/20 hover:bg-white/5">
                      Escalate
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-neutral-500">Action</div>
                <h2 className="mt-1 text-xl font-semibold">Resolve Obligation</h2>
              </div>
              <div className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-300">
                Close the loop
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Obligation" value="invoice #1087 / follow_up" />
              <Field label="Terminal Action" value="closed" />
              <Field label="Reason Code" value="customer_declined" />
              <Field label="Resolution Metadata" value='{ "surface": "founder_console" }' mono />
            </div>

            <button className="mt-5 w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-medium text-sky-950 transition hover:scale-[1.01]">
              Resolve Obligation
            </button>

            <div className="mt-5 rounded-2xl border border-white/10 bg-neutral-900/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Terminal states
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/10 px-3 py-1 text-neutral-300">
                  closed
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-neutral-300">
                  terminated
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-neutral-300">
                  eliminated
                </span>
              </div>
            </div>
          </section>
        </main>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-neutral-500">History</div>
              <h2 className="mt-1 text-2xl font-semibold">Truth Stream</h2>
            </div>
            <p className="max-w-2xl text-sm text-neutral-400">
              Clear activity history increases trust. Operators can verify what happened, when it
              happened, and what proof exists.
            </p>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/70">
            {activity.map((item, index) => (
              <div
                key={`${item.time}-${item.title}`}
                className={`grid gap-3 px-4 py-4 sm:grid-cols-[90px_120px_minmax(0,1fr)] ${
                  index !== activity.length - 1 ? "border-b border-white/10" : ""
                }`}
              >
                <div className="text-sm font-medium text-neutral-200">{item.time}</div>
                <div>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-300">
                    {item.kind}
                  </span>
                </div>
                <div>
                  <div className="font-medium text-white">{item.title}</div>
                  <div className="mt-1 text-sm text-neutral-400">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-neutral-500">
        {label}
      </label>
      <div
        className={`rounded-2xl border border-white/10 bg-neutral-900/80 px-4 py-3 text-sm text-neutral-100 ${
          mono ? "font-mono text-xs leading-6" : ""
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  alert = false,
}: {
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-900/80 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${alert ? "text-red-300" : "text-white"}`}>
        {value}
      </div>
    </div>
  )
}
