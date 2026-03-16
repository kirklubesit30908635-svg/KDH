export default function AutoKirkHomepageDemo() {
  const steps = [
    {
      title: "1. Work happens",
      description:
        "A service job, install, washbay movement, or parts action starts inside the business.",
    },
    {
      title: "2. AutoKirk watches it",
      description:
        "The system records the movement and checks whether the work creates an obligation that should become revenue.",
    },
    {
      title: "3. Gaps get exposed",
      description:
        "If labor, parts, or follow-through are missing, the issue gets surfaced before money disappears.",
    },
    {
      title: "4. Revenue gets protected",
      description:
        "Managers can act on real proof instead of guesses, making sure work performed actually turns into dollars.",
    },
  ];

  const demoSignals = [
    {
      label: "Unclosed service jobs",
      value: "12",
      sub: "Potential missed billing paths",
    },
    {
      label: "Labor at risk",
      value: "$8,420",
      sub: "Detected in current period",
    },
    {
      label: "Parts not tied to closure",
      value: "17",
      sub: "Needs review",
    },
  ];

  const proofRows = [
    {
      item: "Rigging install",
      status: "Work done",
      outcome: "No closed revenue proof",
      action: "Review",
    },
    {
      item: "Washbay ticket",
      status: "Open movement",
      outcome: "Closure missing",
      action: "Follow up",
    },
    {
      item: "Warranty labor",
      status: "Completed",
      outcome: "Billing path incomplete",
      action: "Resolve",
    },
  ];

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div className="space-y-6">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-1 text-sm font-medium text-slate-700 shadow-sm">
              Live Demo Experience
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                If work happens, AutoKirk makes sure the revenue tied to it does
                not disappear.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                This homepage demo shows how AutoKirk observes operational
                movement, exposes leakage, and gives managers proof they can act
                on before money is lost.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5">
                See Revenue Risk
              </button>
              <button className="rounded-2xl border border-slate-300 px-6 py-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50">
                View How It Works
              </button>
            </div>
            <div className="grid gap-4 pt-4 sm:grid-cols-3">
              {demoSignals.map((signal) => (
                <div
                  key={signal.label}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="text-sm text-slate-500">{signal.label}</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight">
                    {signal.value}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{signal.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-slate-950 p-4 shadow-2xl">
            <div className="rounded-[1.5rem] bg-white p-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="text-sm font-medium text-slate-500">
                    AutoKirk Demo
                  </div>
                  <div className="text-xl font-semibold">
                    Revenue Integrity Watch
                  </div>
                </div>
                <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Risk detected
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {proofRows.map((row) => (
                  <div
                    key={row.item}
                    className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1.2fr_1fr_1.2fr_auto] md:items-center"
                  >
                    <div>
                      <div className="text-sm text-slate-500">Movement</div>
                      <div className="font-semibold">{row.item}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500">Status</div>
                      <div className="font-medium">{row.status}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500">Outcome</div>
                      <div className="font-medium text-amber-700">
                        {row.outcome}
                      </div>
                    </div>
                    <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50">
                      {row.action}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            How the demo works
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            A homepage section that sells the problem before the product.
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            The goal is not to explain architecture. The goal is to make owners
            feel the cost of unseen operational leakage and understand that
            AutoKirk turns hidden loss into visible proof.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.title}
              className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-20 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="space-y-4">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              What the buyer should feel
            </div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              &ldquo;How much money are we losing right now without knowing
              it?&rdquo;
            </h2>
            <p className="text-lg leading-8 text-slate-600">
              That is the homepage job. Not feature education. Not technical
              depth. The section should move the visitor from curiosity to
              revenue anxiety, then show that AutoKirk gives them proof.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-slate-500">Problem</div>
              <div className="mt-2 text-xl font-semibold">Work gets done</div>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Extra labor, installs, parts usage, and closeout gaps happen
                every week.
              </p>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-slate-500">Failure</div>
              <div className="mt-2 text-xl font-semibold">
                Revenue gets missed
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Most businesses do not see the gap until after the money is
                gone.
              </p>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-slate-500">AutoKirk</div>
              <div className="mt-2 text-xl font-semibold">
                Observes the movement
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                The system watches operational activity and maps it to
                accountable outcomes.
              </p>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm text-slate-500">Result</div>
              <div className="mt-2 text-xl font-semibold">
                Proof before loss compounds
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Managers can intervene with evidence before leakage becomes
                normalized.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
