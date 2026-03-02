import Link from "next/link";

export default function PortalLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  const redirectTo = searchParams.redirectTo ?? "/portal";
  const qs = `?redirectTo=${encodeURIComponent(redirectTo)}`;

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Choose your portal.</p>

        <div className="mt-6 grid gap-3">
          <Link
            className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            href={`/portal/login/student${qs}`}
          >
            Student portal
          </Link>
          <Link
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            href={`/portal/login/guardian${qs}`}
          >
            Parent / Guardian portal
          </Link>
        </div>
      </div>
    </div>
  );
}
