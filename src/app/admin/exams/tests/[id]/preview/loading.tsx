function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />;
}

export default function LoadingAdminExamTestPreview() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading preview">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Bone className="h-4 w-32" />
          <Bone className="h-3 w-16" />
          <Bone className="h-8 w-80 max-w-full" />
          <Bone className="h-4 w-96 max-w-full" />
        </div>
        <Bone className="h-10 w-32 rounded-xl" />
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <Bone className="h-5 w-28" />
          <Bone className="mt-2 h-3 w-40" />
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-100 p-5">
              <Bone className="h-3 w-56" />
              <Bone className="mt-3 h-4 w-3/4" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Bone className="h-12 rounded-xl" />
                <Bone className="h-12 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
