import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { loadStudentsByClass } from "@/lib/student-classes";
import StudentSelect from "../StudentSelect";

type PaymentRow = {
  id: string;
  direction: string;
  guardian_id: string | null;
  student_id: string | null;
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  paid_at: string;
  status: string;
  provider: string | null;
};

type GuardianRow = { id: string; full_name: string };

type InvoiceOptionRow = {
  invoice_id: string;
  invoice_no: string | null;
  currency: string;
  balance: number;
};

type AllocationRow = { invoice_id: string; amount: number };

// Mirrors how the "Record payment" form parses datetime-local values (server-local time).
function toInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const methods = ["cash", "transfer", "pos", "online"] as const;

// Kept at module level: inline server actions cannot reach helper functions declared inside the component.
function revalidateFinance(paymentId: string, invoiceIds: string[]) {
  revalidatePath("/admin/finance/payments");
  revalidatePath(`/admin/finance/payments/${paymentId}`);
  revalidatePath("/admin/finance/invoices");
  revalidatePath("/admin/finance/debtors");
  revalidatePath("/admin/finance");
  revalidatePath("/portal/billing");
  for (const invoiceId of invoiceIds) revalidatePath(`/admin/finance/invoices/${invoiceId}`);
}

export default async function AdminEditPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: paymentData } = await supabase
    .from("finance_payment_transactions")
    .select("id, direction, guardian_id, student_id, amount, currency, method, reference, notes, paid_at, status, provider")
    .eq("id", id)
    .maybeSingle();

  const payment = (paymentData ?? null) as PaymentRow | null;
  if (!payment) notFound();

  const [{ data: guardians }, { data: invoices }, { data: allocations }, studentData] = await Promise.all([
    supabase.from("guardians").select("id, full_name").order("full_name", { ascending: true }),
    supabase
      .from("finance_invoice_balances")
      .select("invoice_id, invoice_no, currency, balance")
      .order("issue_date", { ascending: false })
      .limit(200),
    supabase.from("finance_payment_allocations").select("invoice_id, amount").eq("payment_transaction_id", id),
    loadStudentsByClass(supabase)
  ]);

  const guardianRows = (guardians ?? []) as GuardianRow[];
  const invoiceRows = (invoices ?? []) as InvoiceOptionRow[];
  const allocationRows = (allocations ?? []) as AllocationRow[];
  const currentInvoiceId = allocationRows[0]?.invoice_id ?? "";
  const hasMultipleAllocations = allocationRows.length > 1;

  // Make sure the currently allocated invoice is selectable even if it is outside the latest 200.
  if (currentInvoiceId && !invoiceRows.some((i) => i.invoice_id === currentInvoiceId)) {
    invoiceRows.unshift({ invoice_id: currentInvoiceId, invoice_no: null, currency: payment.currency, balance: 0 });
  }

  async function updatePayment(formData: FormData) {
    "use server";

    const guardianIdRaw = String(formData.get("guardian_id") ?? "").trim();
    const studentIdRaw = String(formData.get("student_id") ?? "").trim();
    const invoiceIdRaw = String(formData.get("invoice_id") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").replace(/,/g, "").trim() || "0");
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";
    const method = String(formData.get("method") ?? "cash").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const paidAtRaw = String(formData.get("paid_at") ?? "").trim();
    const status = String(formData.get("status") ?? "posted").trim() === "void" ? "void" : "posted";
    const keepAllocations = String(formData.get("keep_allocations") ?? "") === "1";

    if (!Number.isFinite(amount) || amount <= 0) {
      redirect(`/admin/finance/payments/${id}?toast=${encodeURIComponent("Enter a valid amount")}&toast_type=error`);
    }

    const paidAt = paidAtRaw.length ? new Date(paidAtRaw) : null;
    if (paidAt && Number.isNaN(paidAt.getTime())) {
      redirect(`/admin/finance/payments/${id}?toast=${encodeURIComponent("Enter a valid payment date")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const { data: before } = await supabase
      .from("finance_payment_allocations")
      .select("invoice_id")
      .eq("payment_transaction_id", id);
    const touchedInvoiceIds = new Set((before ?? []).map((r) => r.invoice_id as string));

    const { error } = await supabase
      .from("finance_payment_transactions")
      .update({
        guardian_id: guardianIdRaw.length ? guardianIdRaw : null,
        student_id: studentIdRaw.length ? studentIdRaw : null,
        amount,
        currency,
        method,
        reference: reference.length ? reference : null,
        notes: notes.length ? notes : null,
        paid_at: paidAt ? paidAt.toISOString() : undefined,
        status
      })
      .eq("id", id);

    if (error) {
      redirect(`/admin/finance/payments/${id}?toast=${encodeURIComponent(error.message)}&toast_type=error`);
    }

    // A payment split across several invoices is left as-is; otherwise re-point the single allocation.
    if (!keepAllocations) {
      await supabase.from("finance_payment_allocations").delete().eq("payment_transaction_id", id);
      if (invoiceIdRaw.length) {
        const { error: allocationError } = await supabase.from("finance_payment_allocations").insert({
          payment_transaction_id: id,
          invoice_id: invoiceIdRaw,
          amount
        });
        touchedInvoiceIds.add(invoiceIdRaw);
        if (allocationError) {
          revalidateFinance(id, Array.from(touchedInvoiceIds));
          redirect(
            `/admin/finance/payments/${id}?toast=${encodeURIComponent(
              `Payment saved, but linking it to the invoice failed: ${allocationError.message}`
            )}&toast_type=error`
          );
        }
      }
    }

    revalidateFinance(id, Array.from(touchedInvoiceIds));
    redirect(`/admin/finance/payments?toast=${encodeURIComponent("Payment updated")}&toast_type=success`);
  }

  async function deletePayment() {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const { data: before } = await supabase
      .from("finance_payment_allocations")
      .select("invoice_id")
      .eq("payment_transaction_id", id);

    const { error } = await supabase.from("finance_payment_transactions").delete().eq("id", id);
    if (error) {
      redirect(`/admin/finance/payments/${id}?toast=${encodeURIComponent(error.message)}&toast_type=error`);
    }

    revalidateFinance(id, (before ?? []).map((r) => r.invoice_id as string));
    redirect(`/admin/finance/payments?toast=${encodeURIComponent("Payment deleted")}&toast_type=success`);
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green";

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Edit payment</h1>
        <p className="mt-2 text-sm text-slate-600">
          Correct a wrongly entered payment. Invoice balances update automatically after saving.
        </p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/payments">
            Back to payments
          </Link>
        </div>
        {payment.provider ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This payment was recorded automatically by {payment.provider}. Only change it if you are sure it is wrong.
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <form action={updatePayment} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Student (by class)</label>
            <StudentSelect
              groups={studentData.groups}
              defaultValue={payment.student_id ?? ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Guardian (optional)</label>
            <select className={inputClass} name="guardian_id" defaultValue={payment.guardian_id ?? ""}>
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
            {hasMultipleAllocations ? (
              <>
                <input type="hidden" name="keep_allocations" value="1" />
                <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Split across {allocationRows.length} invoices — allocations are kept unchanged.
                </div>
              </>
            ) : (
              <select className={inputClass} name="invoice_id" defaultValue={currentInvoiceId}>
                <option value="">—</option>
                {invoiceRows.map((i) => (
                  <option key={i.invoice_id} value={i.invoice_id}>
                    {i.invoice_no ?? i.invoice_id} (bal {i.currency} {Number(i.balance ?? 0).toLocaleString()})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Amount</label>
            <input
              className={inputClass}
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={String(payment.amount)}
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Currency</label>
            <input className={inputClass} name="currency" defaultValue={payment.currency} />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Method</label>
            <select className={inputClass} name="method" defaultValue={payment.method ?? "cash"}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              {payment.method && !(methods as readonly string[]).includes(payment.method) ? (
                <option value={payment.method}>{payment.method}</option>
              ) : null}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Reference (optional)</label>
            <input className={inputClass} name="reference" defaultValue={payment.reference ?? ""} />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Paid at</label>
            <input
              className={inputClass}
              name="paid_at"
              type="datetime-local"
              defaultValue={toInputValue(payment.paid_at)}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Status</label>
            <select className={inputClass} name="status" defaultValue={payment.status}>
              <option value="posted">posted</option>
              <option value="void">void (ignored in balances)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Notes (optional)</label>
            <input className={inputClass} name="notes" defaultValue={payment.notes ?? ""} />
          </div>

          <div className="sm:col-span-2">
            <SubmitButton
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              pendingText="Saving…"
            >
              Save changes
            </SubmitButton>
          </div>
        </form>
      </div>

      <div className="rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Delete payment</h2>
        <p className="mt-1 text-sm text-slate-600">
          Removes this payment and its invoice allocations completely. To keep a record, set the status to void instead.
        </p>
        <form action={deletePayment} className="mt-4">
          <ConfirmSubmitButton
            confirmMessage="Delete this payment permanently? This cannot be undone."
            className="inline-flex items-center justify-center rounded-xl border border-red-300 bg-white px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            Delete payment
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}
