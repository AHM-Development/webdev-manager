export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-1 overflow-hidden bg-[#f7f9fc] text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_14%,rgba(11,125,227,0.18),transparent_32%),radial-gradient(circle_at_78%_12%,rgba(36,199,213,0.18),transparent_28%),linear-gradient(180deg,#f7f9fc_0%,#e8f6fc_52%,#f7f9fc_100%)]" />
      <div className="relative grid w-full lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between border-r border-slate-200 p-10 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-16 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <img
                src="/ahm-logo.png"
                alt="AHM"
                className="h-8 w-auto object-contain"
              />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">
                AHM Web Manager
              </p>
              <p className="text-xs text-slate-500">Website operations suite</p>
            </div>
          </div>

          <div className="max-w-2xl">
            <p className="inline-flex rounded-full border border-[#cfe9ff] bg-[#e8f5ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#082a78]">
              Agency command center
            </p>
            <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-tight">
              Control every client website from one secure operating layer.
            </h1>
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {[
                ["7", "Active clients"],
                ["24/7", "Health signals"],
                ["100%", "Audit trail focus"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-md border border-slate-200 bg-white/80 p-4 shadow-lg shadow-slate-200/60"
                >
                  <p className="text-2xl font-semibold">{value}</p>
                  <p className="mt-1 text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="max-w-md text-sm leading-6 text-slate-500">
            Production readiness should include rate-limited auth, encrypted
            credential storage, 2FA, least-privilege roles, and immutable logs.
          </p>
        </section>

        <main className="flex min-h-dvh items-center justify-center p-5 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
