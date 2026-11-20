import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { classLabel, loadStudentsByClass, studentLabel } from "@/lib/student-classes";
import StudentSelect from "../StudentSelect";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection, Field } from "@/components/ui/form-section";
import { ButtonLink } from "@/components/ui/button";
import { currencyPrefix } from "../../_components/finance-ui";
import { lagosLocalToDate, toLagosDateTimeInput } from "../../_components/finance-server";
import { Alert } from "@/components/ui/alert";
import Link from "next/link";
import { reverseReasonLabel } from "@/lib/payment-corrections";
import { LEARN } from "@/lib/learn-guides";

type GuardianRow = { id: string; full_name: string };

type InvoiceOptionRow = {
  invoice_id: string;
  invoice_no: string | null;
  bill_to_guardian_id: string;
  student_id: string | null;
  currency: string;
  balance: number;
};

export default async function AdminNewPaymentPage({
  searchParams
}: {
  searchParams: Promise<{ invoice_id?: string; student_id?: string; corrects?: string }>;
}) {
  const { invoice_id: invoiceIdParam, student_id: studentIdParam, corrects } = await searchParams;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  // "Enter the correct payment" after a reversal: start from the reversed payment's details and link back to it.
  type Original = { id: string; student_id: string | null; guardian_id: string | null; amount: number; method: string | null; reference: string | null; paid_at: string; status: string; void_reason: string | null; void_note: string | null };
  let original: Original | null = null;
  let originalInvoiceId: string | null = null;
  if (corrects) {
    const { data } = await supabase
      .from("finance_payment_transactions")
      .select("id, student_id, guardian_id, amount, method, reference, paid_at, status, void_reason, void_note")
      .eq("id", corrects)
      .maybeSingle();
    if (data && data.status === "void") {
      original = data as Original;
      const { data: alloc } = await supabase.from("finance_payment_allocations").select("invoice_id").eq("payment_transaction_id", corrects).limit(1);
      originalInvoiceId = (alloc?.[0]?.invoice_id as string | undefined) ?? null;
    }
  }
  const invoiceIdPrefill = invoiceIdParam ?? originalInvoiceId ?? undefined;
  const studentIdPrefill = studentIdParam ?? original?.student_id ?? undefined;

  const [{ data: guardians }, { data: invoices }, studentData] = await Promise.all([
    supabase.from("guardians").select("id, full_name").order("full_name", { ascending: true }),
    supabase
      .from("finance_invoice_balances")
      .select("invoice_id, invoice_no, bill_to_guardian_id, student_id, currency, balance")
      .order("issue_date", { ascending: false })
      .limit(300),
    loadStudentsByClass(supabase)
  ]);

  const guardianRows = (guardians ?? []) as GuardianRow[];
  const invoiceRows = (invoices ?? []) as InvoiceOptionRow[];
  const { groups, studentById, classById } = studentData;

  async function recordPayment(formData: FormData) {
    "use server";

    const guardianIdRaw = String(formData.get("guardian_id") ?? "").trim();
    const studentIdRaw = String(formData.get("student_id") ?? "").trim();
    const invoiceIdRaw = String(formData.get("invoice_id") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").replace(/,/g, "").trim() || "0");
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";
    const method = String(formData.get("method") ?? "cash").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const paidAtRaw = String(formData.get("paid_at") ?? "").trim();
    const correctsId = String(formData.get("corrects_payment_id") ?? "").trim() || null;

    if (!Number.isFinite(amount) || amount <= 0) {
      redirect(`/admin/finance/payments/new?toast=${encodeURIComponent("Enter a valid amount")}&toast_type=error`);
    }
    const paidAt = paidAtRaw.length ? lagosLocalToDate(paidAtRaw) : null;
    if (paidAtRaw.length && !paidAt) {
      redirect(`/admin/finance/payments/new?toast=${encodeURIComponent("Enter a valid payment date")}&toast_type=error`);
    }
    if (!studentIdRaw && !invoiceIdRaw) {
      redirect(
        `/admin/finance/payments/new?toast=${encodeURIComponent("Choose the student (or an invoice) this payment is for")}&toast_type=error`
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    // Fill in the student, guardian and term from the invoice when they were not picked.
    let studentId = studentIdRaw || null;
    let guardianId = guardianIdRaw || null;
    let academicYearId: string | null = null;
    let academicTermId: string | null = null;

    if (invoiceIdRaw) {
      const { data: inv } = await supabase
        .from("finance_invoices")
        .select("student_id, bill_to_guardian_id, academic_year_id, academic_term_id")
        .eq("id", invoiceIdRaw)
        .maybeSingle();
      studentId = studentId ?? (inv?.student_id as string | null) ?? null;
      guardianId = guardianId ?? (inv?.bill_to_guardian_id as string | null) ?? null;
      academicYearId = (inv?.academic_year_id as string | null) ?? null;
      academicTermId = (inv?.academic_term_id as string | null) ?? null;
    }

    if (studentId && !guardianId) {
      const { data: links } = await supabase
        .from("student_guardians")
        .select("guardian_id, is_primary")
        .eq("student_id", studentId)
        .order("is_primary", { ascending: false })
        .limit(1);
      guardianId = (links?.[0]?.guardian_id as string | undefined) ?? null;
    }

    const { data: txn, error: txnErr } = await supabase
      .from("finance_payment_transactions")
      .insert({
        direction: "inflow",
        guardian_id: guardianId,
        student_id: studentId,
        academic_year_id: academicYearId,
        academic_term_id: academicTermId,
        amount,
        currency,
        method,
        reference: reference.length ? reference : null,
        paid_at: paidAt ? paidAt.toISOString() : undefined,
        status: "posted",
        ...(correctsId ? { corrects_payment_id: correctsId } : {})
      })
      .select("id")
      .maybeSingle();

    if (txnErr || !txn?.id) {
      redirect(
        `/admin/finance/payments/new?toast=${encodeURIComponent(txnErr?.message ?? "Could not save the payment")}&toast_type=error`
      );
    }

    // Pay the invoice up to what it still owes; anything over is kept as paid in advance.
    let overpaid = 0;
    if (invoiceIdRaw.length) {
      const { data: bal } = await supabase.from("finance_invoice_balances").select("balance").eq("invoice_id", invoiceIdRaw).maybeSingle();
      const owed = Math.max(0, Number(bal?.balance ?? 0));
      const toInvoice = Math.min(amount, owed);
      overpaid = amount - toInvoice;
      if (toInvoice > 0) {
        await supabase.from("finance_payment_allocations").insert({
          payment_transaction_id: txn.id,
          invoice_id: invoiceIdRaw,
          amount: toInvoice
        });
      }

      revalidatePath(`/admin/finance/invoices/${invoiceIdRaw}`);
    }

    revalidatePath("/admin/finance/payments");
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/debtors");

    if (correctsId) revalidatePath(`/admin/finance/payments/${correctsId}`);
    const done =
      overpaid > 0
        ? `Payment recorded. ₦${overpaid.toLocaleString("en-NG")} more than the invoice owed is kept as paid in advance.`
        : "Payment recorded";
    redirect(`/admin/finance/payments/${txn.id}?toast=${encodeURIComponent(done)}&toast_type=success`);
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.recordingPayments}
        back={{ href: "/admin/finance/payments", label: "Back to payments" }}
        eyebrow="Finance"
        title={original ? "Enter the correct payment" : "Record payment"}
        description="Pick the student the payment is for (listed by class) and optionally allocate it to one of their invoices."
      />

      {original ? (
        <Alert tone="info" title="Correcting a reversed payment">
          The details below start from the{" "}
          <Link href={`/admin/finance/payments/${original.id}`} className="gf-link">
            payment that was reversed
          </Link>{" "}
          ({reverseReasonLabel(original.void_reason, original.void_note)}). Change what was wrong, then record it. The new payment
          will point back to the reversed one.
        </Alert>
      ) : null}

      <form action={recordPayment} className="space-y-6">
        {original ? <input type="hidden" name="corrects_payment_id" value={original.id} /> : null}
        <FormSection title="Who is paying" description="Choose a student, an invoice, or both.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Student (by class)"
              htmlFor="student_id"
              hint="Required unless you pick an invoice — the invoice's student is used."
            >
              <StudentSelect id="student_id" groups={groups} defaultValue={studentIdPrefill} className="gf-select" />
            </Field>

            <Field label="Invoice (optional)" htmlFor="invoice_id">
              <select id="invoice_id" className="gf-select" name="invoice_id" defaultValue={invoiceIdPrefill ?? ""}>
                <option value="">—</option>
                {invoiceRows.map((i) => {
                  const st = i.student_id ? studentById.get(i.student_id) : null;
                  const cls = st?.class_id ? classById.get(st.class_id) : null;
                  return (
                    <option key={i.invoice_id} value={i.invoice_id}>
                      {i.invoice_no ?? i.invoice_id}
                      {st ? ` — ${studentLabel(st)}, ${classLabel(cls)}` : ""} (bal {currencyPrefix(i.currency)}
                      {Number(i.balance ?? 0).toLocaleString("en-NG")})
                    </option>
                  );
                })}
              </select>
            </Field>

            <Field label="Guardian (optional)" htmlFor="guardian_id" className="sm:col-span-2">
              <select id="guardian_id" className="gf-select" name="guardian_id" defaultValue={original?.guardian_id ?? ""}>
                <option value="">— (use the student&apos;s guardian)</option>
                {guardianRows.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Payment"
          description="Amount, method and when it was received."
          footer={
            <>
              <ButtonLink href="/admin/finance/payments" variant="ghost">
                Cancel
              </ButtonLink>
              <SubmitButton variant="primary" pendingText="Saving…">
                Record payment
              </SubmitButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" htmlFor="amount" required>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">₦</span>
                <input
                  id="amount"
                  className="gf-input pl-8 tabular-nums"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  defaultValue={original ? String(original.amount) : undefined}
                  required
                />
              </div>
            </Field>

            <Field label="Currency" htmlFor="currency">
              <input id="currency" className="gf-input" name="currency" defaultValue="NGN" />
            </Field>

            <Field label="Method" htmlFor="method">
              <select id="method" className="gf-select" name="method" defaultValue={original?.method ?? "cash"}>
                <option value="cash">Cash</option>
                <option value="transfer">Transfer</option>
                <option value="pos">POS</option>
                <option value="online">Online</option>
              </select>
            </Field>

            <Field label="Reference (optional)" htmlFor="reference">
              <input id="reference" className="gf-input" name="reference" defaultValue={original?.reference ?? ""} />
            </Field>

            <Field label="Paid at (optional)" htmlFor="paid_at" hint="Lagos time. Leave blank to use now.">
              <input id="paid_at" className="gf-input" name="paid_at" type="datetime-local" defaultValue={original ? toLagosDateTimeInput(original.paid_at) : undefined} />
            </Field>
          </div>
        </FormSection>
      </form>
    </div>
  );
}
