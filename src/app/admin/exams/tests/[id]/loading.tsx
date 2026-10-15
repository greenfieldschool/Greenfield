function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />;
}

export default function LoadingAdminExamTestDetail() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading test">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <Bone className="h-4 w-28" />
          <Bone className="h-3 w-16" />
          <Bone className="h-8 w-72 max-w-full" />
          <Bone className="h-4 w-96 max-w-full" />
        </div>
        <Bone className="h-10 w-28 rounded-xl" />
      </div>

      {/* Test details */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="space-y-2">
            <Bone className="h-5 w-32" />
            <Bone className="h-3 w-48" />
          </div>
          <Bone className="h-6 w-36 rounded-full" />
        </div>
        <div className="px-5 py-5 sm:px-6">
          <Bone className="h-4 w-52" />
        </div>
      </div>

      {/* Targets tracker */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <Bone className="h-5 w-40" />
          <Bone className="mt-2 h-3 w-72 max-w-full" />
        </div>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <Bone className="h-2.5 w-full rounded-full" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Bone className="h-16 rounded-xl" />
            <Bone className="h-16 rounded-xl" />
            <Bone className="h-16 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Add question */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <Bone className="h-5 w-32" />
        </div>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <Bone className="h-11 rounded-xl" />
          <Bone className="h-11 rounded-xl" />
          <Bone className="h-28 rounded-xl sm:col-span-2" />
        </div>
      </div>

      {/* Questions */}
      {[0, 1].map((i) => (
        <div key={i} className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <div className="flex gap-2 border-b border-slate-100 px-5 py-3.5 sm:px-6">
            <Bone className="h-7 w-9" />
            <Bone className="h-6 w-40 rounded-full" />
            <Bone className="h-6 w-16 rounded-full" />
          </div>
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-3 sm:px-6">
            <Bone className="h-24 rounded-xl sm:col-span-2" />
            <Bone className="h-11 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
