import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type InvoiceBalanceRow = {
  invoice_id: string;
  invoice_no: string;
  bill_to_guardian_id: string;
  student_id: string | null;
  issue_date: string;
  due_date: string | null;
  status: string;
  currency: string;
  invoice_total: number;
  allocated_total: number;
  balance: number;
};

export default async function AdminFinanceInvoicesPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("finance_invoice_balances")
    .select(
      "invoice_id, invoice_no, bill_to_guardian_id, student_id, issue_date, due_date, status, currency, invoice_total, allocated_total, balance"
    )
    .order("issue_date", { ascending: false })
    .limit(200);

  const invoices = (data ?? []) as InvoiceBalanceRow[];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Invoices</h1>
        <p className="mt-2 text-sm text-slate-600">Most recent invoices and balances.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance">
            Back to finance
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            href="/admin/finance/invoices/new"
          >
            New invoice
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-3">Invoice</div>
          <div className="col-span-2">Issued</div>
          <div className="col-span-2">Due</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2 text-right">Total</div>
          <div className="col-span-2 text-right">Balance</div>
        </div>
        <div>
          {invoices.length ? (
            invoices.map((inv) => (
              <Link
                key={inv.invoice_id}
                href={`/admin/finance/invoices/${inv.invoice_id}`}
                className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                <div className="col-span-3 font-semibold text-slate-900">{inv.invoice_no}</div>
                <div className="col-span-2">{inv.issue_date}</div>
                <div className="col-span-2">{inv.due_date ?? "—"}</div>
                <div className="col-span-1">{inv.status}</div>
                <div className="col-span-2 text-right">
                  {inv.currency} {Number(inv.invoice_total ?? 0).toLocaleString()}
                </div>
                <div className="col-span-2 text-right">
                  {inv.currency} {Number(inv.balance ?? 0).toLocaleString()}
                </div>
              </Link>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No invoices yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
