export default function LoadingAdminExamTestDetail() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-8 w-1/2 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 h-4 w-40 animate-pulse rounded bg-slate-200" />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
            <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
          </div>
          <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 space-y-3">
          <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
