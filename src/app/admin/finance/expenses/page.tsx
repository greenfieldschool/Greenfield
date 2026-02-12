import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ExpenseRow = {
  id: string;
  category_id: string | null;
  vendor_name: string | null;
  description: string | null;
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  spent_at: string;
};

export default async function AdminFinanceExpensesPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("finance_expenses")
    .select("id, category_id, vendor_name, description, amount, currency, method, reference, spent_at")
    .order("spent_at", { ascending: false })
    .limit(200);

  const expenses = (data ?? []) as ExpenseRow[];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Expenses</h1>
        <p className="mt-2 text-sm text-slate-600">Recent spending records.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance">
            Back to finance
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-3">Date</div>
          <div className="col-span-3">Vendor</div>
          <div className="col-span-4">Description</div>
          <div className="col-span-2 text-right">Amount</div>
        </div>
        <div>
          {expenses.length ? (
            expenses.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700"
              >
                <div className="col-span-3">{new Date(e.spent_at).toLocaleString()}</div>
                <div className="col-span-3 truncate" title={e.vendor_name ?? ""}>
                  {e.vendor_name ?? "—"}
                </div>
                <div className="col-span-4 truncate" title={e.description ?? ""}>
                  {e.description ?? "—"}
                </div>
                <div className="col-span-2 text-right">
                  {e.currency} {Number(e.amount ?? 0).toLocaleString()}
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No expenses yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
