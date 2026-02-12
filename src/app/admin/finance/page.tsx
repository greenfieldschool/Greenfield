import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminFinancePage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const [{ count: invoiceCount }, { count: paymentCount }, { count: expenseCount }] = await Promise.all([
    supabase.from("finance_invoices").select("id", { count: "exact", head: true }),
    supabase.from("finance_payment_transactions").select("id", { count: "exact", head: true }),
    supabase.from("finance_expenses").select("id", { count: "exact", head: true })
  ]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">Finance</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Overview</h1>
      <p className="mt-2 text-sm text-slate-600">
        Track invoices, payments, expenses, budgets, and debtors. More dashboards will appear here as we build out the
        module.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold text-slate-500">Invoices</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{invoiceCount ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold text-slate-500">Payments</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{paymentCount ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold text-slate-500">Expenses</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{expenseCount ?? 0}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/invoices"
        >
          Invoices
          <div className="mt-1 text-xs font-normal text-slate-600">Create and manage bills per guardian/student.</div>
        </Link>
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/payments"
        >
          Payments
          <div className="mt-1 text-xs font-normal text-slate-600">Record payments and allocate across invoices.</div>
        </Link>
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/expenses"
        >
          Expenses
          <div className="mt-1 text-xs font-normal text-slate-600">Log spending and categorize expenses.</div>
        </Link>
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/debtors"
        >
          Debtors
          <div className="mt-1 text-xs font-normal text-slate-600">Find outstanding balances and follow up.</div>
        </Link>
        <Link
          className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          href="/admin/finance/fees"
        >
          Fee setup
          <div className="mt-1 text-xs font-normal text-slate-600">Configure classes, fee components, and schedules.</div>
        </Link>
      </div>
    </div>
  );
}
