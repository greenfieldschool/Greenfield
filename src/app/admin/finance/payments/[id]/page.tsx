import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { loadStudentsByClass } from "@/lib/student-classes";
import StudentSelect from "../StudentSelect";
import { Split, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection, Field } from "@/components/ui/form-section";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { FinanceStatusBadge, currencyPrefix } from "../../_components/finance-ui";
import { lagosLocalToDate, toLagosDateTimeInput } from "../../_components/finance-server";

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

    const paidAt = paidAtRaw.length ? lagosLocalToDate(paidAtRaw) : null;
    if (paidAtRaw.length && !paidAt) {
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

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/payments", label: "Back to payments" }}
        eyebrow="Finance"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            Edit payment
            <FinanceStatusBadge status={payment.status} />
          </span>
        }
        description="Correct a wrongly entered payment. Invoice balances update automatically after saving."
        actions={
          <div className="text-right">
            <div className="text-xs font-medium text-slate-500">Amount</div>
            <div
              className={
                "text-xl font-bold tabular-nums " +
                (payment.status === "void" ? "text-slate-400 line-through" : "text-slate-900")
              }
            >
              {payment.direction === "outflow" ? "−" : ""}
              {currencyPrefix(payment.currency)}
              {Number(payment.amount ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}
            </div>
          </div>
        }
      />

      {payment.provider ? (
        <Alert tone="warning" title="Recorded automatically">
          This payment was recorded automatically by {payment.provider}. Only change it if you are sure it is wrong.
        </Alert>
      ) : null}

      <form action={updatePayment} className="space-y-6">
        <FormSection title="Who paid" description="The student, guardian and invoice this payment belongs to.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Student (by class)" htmlFor="student_id" className="sm:col-span-2">
              <StudentSelect
                id="student_id"
                groups={studentData.groups}
                defaultValue={payment.student_id ?? ""}
                className="gf-select"
              />
            </Field>

            <Field label="Guardian (optional)" htmlFor="guardian_id">
              <select id="guardian_id" className="gf-select" name="guardian_id" defaultValue={payment.guardian_id ?? ""}>
                <option value="">—</option>
                {guardianRows.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Invoice (optional)" htmlFor={hasMultipleAllocations ? undefined : "invoice_id"}>
              {hasMultipleAllocations ? (
                <>
                  <input type="hidden" name="keep_allocations" value="1" />
                  <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
                    <Split className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    Split across {allocationRows.length} invoices — allocations are kept unchanged.
                  </div>
                </>
              ) : (
                <select id="invoice_id" className="gf-select" name="invoice_id" defaultValue={currentInvoiceId}>
                  <option value="">—</option>
                  {invoiceRows.map((i) => (
                    <option key={i.invoice_id} value={i.invoice_id}>
                      {i.invoice_no ?? i.invoice_id} (bal {currencyPrefix(i.currency)}
                      {Number(i.balance ?? 0).toLocaleString("en-NG")})
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Payment details"
          footer={
            <>
              <ButtonLink href="/admin/finance/payments" variant="ghost">
                Cancel
              </ButtonLink>
              <SubmitButton variant="primary" pendingText="Saving…">
                Save changes
              </SubmitButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" htmlFor="amount" required>
              <input
                id="amount"
                className="gf-input tabular-nums"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={String(payment.amount)}
                required
              />
            </Field>

            <Field label="Currency" htmlFor="currency">
              <input id="currency" className="gf-input" name="currency" defaultValue={payment.currency} />
            </Field>

            <Field label="Method" htmlFor="method">
              <select id="method" className="gf-select" name="method" defaultValue={payment.method ?? "cash"}>
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {m === "pos" ? "POS" : m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
                {payment.method && !(methods as readonly string[]).includes(payment.method) ? (
                  <option value={payment.method}>{payment.method}</option>
                ) : null}
              </select>
            </Field>

            <Field label="Reference (optional)" htmlFor="reference">
              <input id="reference" className="gf-input" name="reference" defaultValue={payment.reference ?? ""} />
            </Field>

            <Field label="Paid at" htmlFor="paid_at" hint="Lagos time.">
              <input
                id="paid_at"
                className="gf-input"
                name="paid_at"
                type="datetime-local"
                defaultValue={toLagosDateTimeInput(payment.paid_at)}
              />
            </Field>

            <Field label="Status" htmlFor="status" hint="Void payments are ignored in balances.">
              <select id="status" className="gf-select" name="status" defaultValue={payment.status}>
                <option value="posted">Posted</option>
                <option value="void">Void (ignored in balances)</option>
              </select>
            </Field>

            <Field label="Notes (optional)" htmlFor="notes" className="sm:col-span-2">
              <input id="notes" className="gf-input" name="notes" defaultValue={payment.notes ?? ""} />
            </Field>
          </div>
        </FormSection>
      </form>

      <form action={deletePayment}>
        <FormSection
          title="Danger zone"
          description="Removes this payment and its invoice allocations completely. To keep a record, set the status to void instead."
          className="border-red-200"
          footer={
            <ConfirmSubmitButton
              confirmMessage="Delete this payment permanently? This cannot be undone."
              className={buttonClasses({ variant: "danger" })}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete payment
            </ConfirmSubmitButton>
          }
        >
          <p className="text-sm text-slate-600">Deleting cannot be undone.</p>
        </FormSection>
      </form>
    </div>
  );
}
