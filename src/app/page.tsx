import Link from "next/link";

const faces = [
  {
    code: "FACE 003",
    title: "Dealership Enforcement",
    desc: "Next Actions · Reassurance Search · Daily Check-In",
    href: "/tucker",
    status: "Operational",
    cta: "Enter Face",
  },
  {
    code: "FACE 001",
    title: "Billing Enforcement",
    desc: "Stripe intake → obligations → closure → receipts",
    href: "/billing-ops",
    status: "Execution Runner Paused",
    cta: "Enter Face",
    disabled: true,
  },
  {
    code: "FACE",
    title: "Advertising Enforcement",
    desc: "Spend → Lead → Follow-Up → Sale → Margin → Renewal Gate",
    href: "/advertising",
    status: "Operational",
    cta: "Enter Face",
  },
  {
    code: "OPERATOR ACCESS",
    title: "Authenticate",
    desc: "Supabase magic-link access",
    href: "/login",
    status: "Access Controlled",
    cta: "Authenticate",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-700/10 blur-3xl" />
        <div className="absolute top-40 left-10 h-[420px] w-[420px] rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-[520px] w-[520px] rounded-full bg-blue-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-16">
        <header className="text-[#caa84a] text-xs tracking-[0.24em]">
          AUTOKIRK OPERATOR CONSOLE
        </header>

        <section className="mt-8 max-w-3xl">
          <h1 className="text-5xl font-semibold leading-[1.05] text-[#caa84a]">
            Surface Simplicity.
            <br />
            Core Ruthlessness.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-zinc-400">
            This UI does not govern. It routes you into governed execution. If it
            isn’t written here, it didn’t happen.
          </p>
        </section>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          {faces.map((f) => (
            <Link key={f.title} href={f.href} className="block">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur hover:border-[#caa84a]/40 transition">
                <div className="flex items-center justify-between">
                  <div className="text-xs tracking-[0.18em] text-zinc-400">
                    {f.code}
                  </div>
                  <div className="text-[11px] tracking-[0.14em] text-zinc-500">
                    {f.status}
                  </div>
                </div>

                <div className="mt-4 text-xl font-semibold text-zinc-100">
                  {f.title}
                </div>
                <div className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {f.desc}
                </div>

                <div
                  className={[
                    "mt-6 inline-flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold",
                    f.disabled
                      ? "bg-zinc-800 text-zinc-500"
                      : "bg-[#caa84a] text-black hover:bg-[#d7b65a]",
                  ].join(" ")}
                >
                  <span>{f.cta}</span>
                  <span>→</span>
                </div>
              </div>
            </Link>
          ))}
        </section>

        <footer className="mt-12 text-xs tracking-wide text-zinc-500">
          Authority lives in the Core. UI is routing only.
        </footer>
      </div>
    </main>
  );
}
