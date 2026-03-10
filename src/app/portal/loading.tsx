export default function PortalLoading() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-20 rounded bg-slate-200" />
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="h-4 w-64 rounded bg-slate-200" />
      </div>
    </div>
  );
}
