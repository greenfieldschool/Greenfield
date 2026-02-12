import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type GuardianRow = { id: string; full_name: string };

type InvoiceOptionRow = {
  invoice_id: string;
  invoice_no: string | null;
  bill_to_guardian_id: string;
  currency: string;
  balance: number;
};

export default async function AdminNewPaymentPage({
  searchParams
}: {
  searchParams: Promise<{ invoice_id?: string }>;
}) {
  const { invoice_id: invoiceIdPrefill } = await searchParams;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: guardians }, { data: invoices }] = await Promise.all([
    supabase.from("guardians").select("id, full_name").order("full_name", { ascending: true }),
    supabase
      .from("finance_invoice_balances")
      .select("invoice_id, invoice_no, bill_to_guardian_id, currency, balance")
      .order("issue_date", { ascending: false })
      .limit(200)
  ]);

  const guardianRows = (guardians ?? []) as GuardianRow[];
  const invoiceRows = (invoices ?? []) as InvoiceOptionRow[];

  async function recordPayment(formData: FormData) {
    "use server";

    const guardianIdRaw = String(formData.get("guardian_id") ?? "").trim();
    const invoiceIdRaw = String(formData.get("invoice_id") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").trim() || "0");
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";
    const method = String(formData.get("method") ?? "cash").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const paidAtRaw = String(formData.get("paid_at") ?? "").trim();

    if (!Number.isFinite(amount) || amount <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const { data: txn, error: txnErr } = await supabase
      .from("finance_payment_transactions")
      .insert({
        direction: "inflow",
        guardian_id: guardianIdRaw.length ? guardianIdRaw : null,
        amount,
        currency,
        method,
        reference: reference.length ? reference : null,
        paid_at: paidAtRaw.length ? new Date(paidAtRaw).toISOString() : undefined,
        status: "posted"
      })
      .select("id")
      .maybeSingle();

    if (txnErr || !txn?.id) return;

    if (invoiceIdRaw.length) {
      await supabase.from("finance_payment_allocations").upsert(
        {
          payment_transaction_id: txn.id,
          invoice_id: invoiceIdRaw,
          amount
        },
        { onConflict: "payment_transaction_id,invoice_id" }
      );

      revalidatePath(`/admin/finance/invoices/${invoiceIdRaw}`);
    }

    revalidatePath("/admin/finance/payments");
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/debtors");

    redirect("/admin/finance/payments");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Record payment</h1>
        <p className="mt-2 text-sm text-slate-600">Add a manual payment and optionally allocate it to an invoice.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/payments">
            Back to payments
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <form action={recordPayment} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Guardian (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="guardian_id"
              defaultValue=""
            >
              <option value="">—</option>
              {guardianRows.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Invoice (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="invoice_id"
              defaultValue={invoiceIdPrefill ?? ""}
            >
              <option value="">—</option>
              {invoiceRows.map((i) => (
                <option key={i.invoice_id} value={i.invoice_id}>
                  {i.invoice_no ?? i.invoice_id} (bal {i.currency} {Number(i.balance ?? 0).toLocaleString()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Amount</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="amount"
              defaultValue="0"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Currency</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="currency"
              defaultValue="NGN"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Method</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="method"
              defaultValue="cash"
            >
              <option value="cash">cash</option>
              <option value="transfer">transfer</option>
              <option value="pos">pos</option>
              <option value="online">online</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Reference (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="reference"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Paid at (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="paid_at"
              type="datetime-local"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Record payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
