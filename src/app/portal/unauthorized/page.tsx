import Link from "next/link";

export default function PortalUnauthorizedPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account is signed in, but it doesn’t have permission to access the portal.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            href="/"
          >
            Go to website
          </Link>
          <form action="/portal/logout" method="post">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
