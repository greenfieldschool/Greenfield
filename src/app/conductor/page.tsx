import Link from "next/link";

export default async function ConductorHomePage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Conductor</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Session dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">View assigned sessions and unlock students when needed.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/conductor/sessions"
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:bg-slate-50"
        >
          <div className="text-sm font-semibold text-slate-900">My sessions</div>
          <div className="mt-2 text-sm text-slate-600">Open a session to monitor attempts.</div>
        </Link>
      </div>
    </div>
  );
}
