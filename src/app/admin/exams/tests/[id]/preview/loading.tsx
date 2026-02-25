export default function LoadingAdminExamTestPreview() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 h-4 w-56 animate-pulse rounded bg-slate-200" />
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 space-y-3">
          <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
