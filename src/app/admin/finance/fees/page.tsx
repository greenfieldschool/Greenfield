import Link from "next/link";

export default function AdminFinanceFeesHomePage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Fee setup</h1>
        <p className="mt-2 text-sm text-slate-600">
          Configure class names (Year 1… / JSS1… / SS3…), fee components (Tuition, Books, Transport…), and fee schedules
          per term or annual.
        </p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance">
            Back to finance
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/fees/classes"
        >
          Classes
          <div className="mt-1 text-xs font-normal text-slate-600">Manage Year/JSS/SS class names.</div>
        </Link>
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/fees/components"
        >
          Fee components
          <div className="mt-1 text-xs font-normal text-slate-600">Breakdowns like Tuition, Books, Transport…</div>
        </Link>
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/fees/schedules"
        >
          Fee schedules
          <div className="mt-1 text-xs font-normal text-slate-600">Define per-class fees per term or annual.</div>
        </Link>

        <Link
          className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/fees/revenue-categories"
        >
          Revenue categories
          <div className="mt-1 text-xs font-normal text-slate-600">Buckets used for fee component mapping & reporting.</div>
        </Link>

        <Link
          className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/fees/budget-sectors"
        >
          Budget sectors
          <div className="mt-1 text-xs font-normal text-slate-600">Expense categories for budgets and spending.</div>
        </Link>

        <Link
          className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/fees/academic-years"
        >
          Academic years
          <div className="mt-1 text-xs font-normal text-slate-600">Manage academic years and terms.</div>
        </Link>
      </div>

      <div>
        <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance">
          Back to finance
        </Link>
      </div>
    </div>
  );
}
