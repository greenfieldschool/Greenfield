import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { classLabel, loadStudentsByClass, studentLabel } from "@/lib/student-classes";
import StudentSelect from "../StudentSelect";

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
  searchParams: Promise<{ invoice_id?: string; student_id?: string }>;
}) {
  const { invoice_id: invoiceIdPrefill, student_id: studentIdPrefill } = await searchParams;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

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

    if (!Number.isFinite(amount) || amount <= 0) {
      redirect(`/admin/finance/payments/new?toast=${encodeURIComponent("Enter a valid amount")}&toast_type=error`);
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
        paid_at: paidAtRaw.length ? new Date(paidAtRaw).toISOString() : undefined,
        status: "posted"
      })
      .select("id")
      .maybeSingle();

    if (txnErr || !txn?.id) {
      redirect(
        `/admin/finance/payments/new?toast=${encodeURIComponent(txnErr?.message ?? "Could not save the payment")}&toast_type=error`
      );
    }

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

    redirect(`/admin/finance/payments?toast=${encodeURIComponent("Payment recorded")}&toast_type=success`);
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green";

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Record payment</h1>
        <p className="mt-2 text-sm text-slate-600">
          Pick the student the payment is for (listed by class) and optionally allocate it to one of their invoices.
        </p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/payments">
            Back to payments
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <form action={recordPayment} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Student (by class)</label>
            <StudentSelect groups={groups} defaultValue={studentIdPrefill} className={inputClass} />
            <p className="mt-1 text-xs text-slate-500">Required unless you pick an invoice — the invoice&apos;s student is used.</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Invoice (optional)</label>
            <select className={inputClass} name="invoice_id" defaultValue={invoiceIdPrefill ?? ""}>
              <option value="">—</option>
              {invoiceRows.map((i) => {
                const st = i.student_id ? studentById.get(i.student_id) : null;
                const cls = st?.class_id ? classById.get(st.class_id) : null;
                return (
                  <option key={i.invoice_id} value={i.invoice_id}>
                    {i.invoice_no ?? i.invoice_id}
                    {st ? ` — ${studentLabel(st)}, ${classLabel(cls)}` : ""} (bal {i.currency}{" "}
                    {Number(i.balance ?? 0).toLocaleString()})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Guardian (optional)</label>
            <select className={inputClass} name="guardian_id" defaultValue="">
              <option value="">— (use the student&apos;s guardian)</option>
              {guardianRows.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Amount</label>
            <input
              className={inputClass}
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Currency</label>
            <input className={inputClass} name="currency" defaultValue="NGN" />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Method</label>
            <select className={inputClass} name="method" defaultValue="cash">
              <option value="cash">cash</option>
              <option value="transfer">transfer</option>
              <option value="pos">pos</option>
              <option value="online">online</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Reference (optional)</label>
            <input className={inputClass} name="reference" />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Paid at (optional)</label>
            <input className={inputClass} name="paid_at" type="datetime-local" />
          </div>

          <div className="sm:col-span-2">
            <SubmitButton
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              pendingText="Saving…"
            >
              Record payment
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
