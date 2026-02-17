import Link from "next/link";

export default function ConductorUnauthorizedPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Conductor</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Unauthorized</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account is signed in, but it is not linked to a conductor profile.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/conductor/login"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Back to login
          </Link>
          <form action="/conductor/logout" method="post">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
