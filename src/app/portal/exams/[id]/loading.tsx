export default function Loading() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">Exams</div>
      <div className="mt-2 h-6 w-56 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 h-4 w-80 animate-pulse rounded bg-slate-200" />
    </div>
  );
}
