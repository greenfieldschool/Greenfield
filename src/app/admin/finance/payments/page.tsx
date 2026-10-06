import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import UrlToast from "@/components/url-toast";

type PaymentRow = {
  id: string;
  direction: string;
  guardian_id: string | null;
  student_id: string | null;
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  paid_at: string;
  status: string;
};

export default async function AdminFinancePaymentsPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("finance_payment_transactions")
    .select("id, direction, guardian_id, student_id, amount, currency, method, reference, paid_at, status")
    .order("paid_at", { ascending: false })
    .limit(200);

  const payments = (data ?? []) as PaymentRow[];

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Payments</h1>
        <p className="mt-2 text-sm text-slate-600">Recent payments and refunds. Click a payment to edit or delete it.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance">
            Back to finance
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            href="/admin/finance/payments/new"
          >
            Record payment
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-3">Date</div>
          <div className="col-span-2">Direction</div>
          <div className="col-span-2">Method</div>
          <div className="col-span-2">Reference</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-1 text-right">Action</div>
        </div>
        <div>
          {payments.length ? (
            payments.map((p) => (
              <Link
                key={p.id}
                href={`/admin/finance/payments/${p.id}`}
                className={`grid grid-cols-12 items-center gap-0 border-t border-slate-200 px-6 py-4 text-sm hover:bg-slate-50 ${
                  p.status === "void" ? "text-slate-400 line-through" : "text-slate-700"
                }`}
              >
                <div className="col-span-3">{new Date(p.paid_at).toLocaleString()}</div>
                <div className="col-span-2">{p.direction}</div>
                <div className="col-span-2">{p.method ?? "—"}</div>
                <div className="col-span-2 truncate" title={p.reference ?? ""}>
                  {p.reference ?? "—"}
                </div>
                <div className="col-span-2 whitespace-nowrap text-right">
                  {p.currency} {Number(p.amount ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                </div>
                <div className="col-span-1 text-right text-xs font-semibold text-brand-green no-underline">Edit</div>
              </Link>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No payments yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
