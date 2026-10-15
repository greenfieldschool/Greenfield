import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { toastUrl } from "../../_components/finance-server";
import { firstOrNull } from "@/lib/relations";
import { Banknote, FileText, Link2, ListPlus, Plus, Scale, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import {
  FinanceStatusBadge,
  SummaryRow,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  statusLabel
} from "../../_components/finance-ui";

type InvoiceBalanceRow = {
  invoice_id: string;
  invoice_no: string | null;
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

type InvoiceItemRow = {
  id: string;
  description: string;
  quantity: number;
  unit_amount: number;
};

type FeeScheduleRow = {
  id: string;
  name: string;
  academic_term_id: string | null;
};

type InvoiceAdjustmentRow = {
  id: string;
  type: string;
  amount: number;
  notes: string | null;
};

type AllocationRow = {
  id: string;
  amount: number;
  finance_payment_transactions: Array<{
    id: string;
    paid_at: string;
    method: string | null;
    reference: string | null;
    provider: string | null;
    provider_txn_id: string | null;
  }>;
};

type PaymentIntentRow = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

export default async function AdminInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [
    { data: balanceRow },
    { data: items },
    { data: adjustments },
    { data: allocations },
    { data: intents },
    { data: invoiceHeader }
  ] = await Promise.all([
    supabase
      .from("finance_invoice_balances")
      .select(
        "invoice_id, invoice_no, bill_to_guardian_id, student_id, issue_date, due_date, status, currency, invoice_total, allocated_total, balance"
      )
      .eq("invoice_id", id)
      .maybeSingle(),
    supabase
      .from("finance_invoice_items")
      .select("id, description, quantity, unit_amount")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("finance_invoice_adjustments")
      .select("id, type, amount, notes")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("finance_payment_allocations")
      .select(
        "id, amount, finance_payment_transactions(id, paid_at, method, reference, provider, provider_txn_id)"
      )
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("finance_payment_intents")
      .select("id, reference, amount, currency, status, created_at")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false })
    ,
    supabase
      .from("finance_invoices")
      .select("id, student_id, academic_year_id, academic_term_id")
      .eq("id", id)
      .maybeSingle()
  ]);

  const invoice = balanceRow as InvoiceBalanceRow | null;
  if (!invoice) {
    redirect("/admin/finance/invoices");
  }

  const itemRows = (items ?? []) as InvoiceItemRow[];
  const adjustmentRows = (adjustments ?? []) as InvoiceAdjustmentRow[];
  const allocationRows = (allocations ?? []) as unknown as AllocationRow[];
  const intentRows = (intents ?? []) as PaymentIntentRow[];

  const header = (invoiceHeader ?? null) as {
    id: string;
    student_id: string | null;
    academic_year_id: string | null;
    academic_term_id: string | null;
  } | null;

  const studentId = header?.student_id ?? invoice.student_id;

  const { data: studentRow } = studentId
    ? await supabase.from("students").select("id, class_id").eq("id", studentId).maybeSingle()
    : await Promise.resolve({ data: null as { id: string; class_id: string | null } | null });

  const classId = (studentRow?.class_id ?? null) as string | null;

  const { data: schedules } = classId && header?.academic_year_id
    ? await supabase
        .from("fee_schedules")
        .select("id, name, academic_term_id")
        .eq("class_id", classId)
        .eq("academic_year_id", header.academic_year_id)
        .eq("active", true)
        .order("academic_term_id", { ascending: true })
        .order("name", { ascending: true })
    : await Promise.resolve({ data: [] as FeeScheduleRow[] });

  const scheduleRows = (schedules ?? []) as FeeScheduleRow[];
  const eligibleSchedules = header?.academic_term_id
    ? scheduleRows.filter((s) => s.academic_term_id === null || s.academic_term_id === header.academic_term_id)
    : scheduleRows;

  async function createMoniepointIntent(formData: FormData) {
    "use server";

    const back = `/admin/finance/invoices/${id}`;
    const amount = Number(String(formData.get("amount") ?? "0").replace(/,/g, "").trim() || "0");

    if (!Number.isFinite(amount) || amount <= 0) redirect(toastUrl(back, "Enter an amount greater than zero", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(back, "Database is not configured", "error"));

    const { data: freshInvoice, error: invoiceError } = await supabase
      .from("finance_invoice_balances")
      .select(
        "invoice_id, bill_to_guardian_id, student_id, academic_year_id, academic_term_id, currency, balance"
      )
      .eq("invoice_id", id)
      .maybeSingle();

    if (!freshInvoice) redirect(toastUrl(back, invoiceError?.message ?? "Invoice not found", "error"));

    const reference = globalThis.crypto?.randomUUID
      ? `MP-${globalThis.crypto.randomUUID()}`
      : `MP-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error } = await supabase.from("finance_payment_intents").insert({
      provider: "moniepoint",
      reference,
      invoice_id: freshInvoice.invoice_id,
      guardian_id: freshInvoice.bill_to_guardian_id,
      student_id: freshInvoice.student_id,
      academic_year_id: freshInvoice.academic_year_id,
      academic_term_id: freshInvoice.academic_term_id,
      amount,
      currency: freshInvoice.currency,
      status: "created"
    });

    if (error) redirect(toastUrl(back, error.message, "error"));

    revalidatePath(back);
    redirect(toastUrl(back, "Payment reference created"));
  }

  async function addItem(formData: FormData) {
    "use server";

    const back = `/admin/finance/invoices/${id}`;
    const description = String(formData.get("description") ?? "").trim();
    const quantity = Number(String(formData.get("quantity") ?? "1").replace(/,/g, "").trim() || "1");
    const unitAmount = Number(String(formData.get("unit_amount") ?? "0").replace(/,/g, "").trim() || "0");

    if (!description) redirect(toastUrl(back, "Enter a description for the item", "error"));
    if (!Number.isFinite(quantity) || quantity <= 0) redirect(toastUrl(back, "Quantity must be greater than zero", "error"));
    if (!Number.isFinite(unitAmount) || unitAmount < 0) redirect(toastUrl(back, "Enter a valid unit amount", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(back, "Database is not configured", "error"));

    const { error } = await supabase.from("finance_invoice_items").insert({
      invoice_id: id,
      description,
      quantity,
      unit_amount: unitAmount
    });

    if (error) redirect(toastUrl(back, error.message, "error"));

    revalidatePath(back);
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/debtors");
    redirect(toastUrl(back, "Item added"));
  }

  async function generateItemsFromSchedule(formData: FormData) {
    "use server";

    const back = `/admin/finance/invoices/${id}`;
    const feeScheduleId = String(formData.get("fee_schedule_id") ?? "").trim();
    if (!feeScheduleId) redirect(toastUrl(back, "Choose a fee schedule", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(back, "Database is not configured", "error"));

    const [{ data: existingItems }, { data: scheduleLines, error: linesError }] = await Promise.all([
      supabase.from("finance_invoice_items").select("id").eq("invoice_id", id).limit(1),
      supabase
        .from("fee_schedule_lines")
        .select("amount, fee_components(id, name, revenue_category_id)")
        .eq("fee_schedule_id", feeScheduleId)
        .order("created_at", { ascending: true })
    ]);

    if ((existingItems ?? []).length) {
      redirect(toastUrl(back, "This invoice already has items. Remove them before generating from a schedule.", "error"));
    }
    if (linesError) redirect(toastUrl(back, linesError.message, "error"));

    const lines = (scheduleLines ?? []) as unknown as Array<{
      amount: number;
      fee_components:
        | { id: string; name: string; revenue_category_id: string | null }
        | Array<{ id: string; name: string; revenue_category_id: string | null }>
        | null;
    }>;

    const payload = lines
      .map((l) => {
        const fc = firstOrNull(l.fee_components);
        return {
          invoice_id: id,
          revenue_category_id: fc?.revenue_category_id ?? null,
          description: fc?.name ?? "",
          quantity: 1,
          unit_amount: l.amount
        };
      })
      .filter((r) => r.description.length > 0);

    if (!payload.length) redirect(toastUrl(back, "That fee schedule has no lines yet", "error"));

    const { error } = await supabase.from("finance_invoice_items").insert(payload);
    if (error) redirect(toastUrl(back, error.message, "error"));

    revalidatePath(back);
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/debtors");
    redirect(toastUrl(back, `${payload.length} item${payload.length === 1 ? "" : "s"} added from the schedule`));
  }

  async function addAdjustment(formData: FormData) {
    "use server";

    const back = `/admin/finance/invoices/${id}`;
    const type = String(formData.get("type") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").replace(/,/g, "").trim() || "0");
    const notes = String(formData.get("notes") ?? "").trim();

    if (!type) redirect(toastUrl(back, "Choose an adjustment type", "error"));
    if (!Number.isFinite(amount) || amount <= 0) redirect(toastUrl(back, "Enter an amount greater than zero", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(back, "Database is not configured", "error"));

    const { error } = await supabase.from("finance_invoice_adjustments").insert({
      invoice_id: id,
      type,
      amount,
      notes: notes.length ? notes : null
    });

    if (error) redirect(toastUrl(back, error.message, "error"));

    revalidatePath(back);
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/debtors");
    redirect(toastUrl(back, "Adjustment added"));
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/invoices", label: "Back to invoices" }}
        eyebrow="Finance"
        title={`Invoice ${invoice.invoice_no ?? "—"}`}
        description="View details, items, adjustments, and allocations."
        actions={
          <ButtonLink href={`/admin/finance/payments/new?invoice_id=${encodeURIComponent(id)}`}>
            <Wallet className="h-4 w-4" aria-hidden="true" />
            Record payment
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total"
          value={<span className="tabular-nums">{fmtMoney(invoice.invoice_total, invoice.currency)}</span>}
          icon={FileText}
          tone="blue"
        />
        <StatCard
          label="Paid"
          value={<span className="tabular-nums">{fmtMoney(invoice.allocated_total, invoice.currency)}</span>}
          icon={Banknote}
          tone="green"
        />
        <StatCard
          label="Balance"
          value={<span className="tabular-nums">{fmtMoney(invoice.balance, invoice.currency)}</span>}
          icon={Scale}
          tone={Number(invoice.balance ?? 0) > 0 ? "rose" : "slate"}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        {/* The invoice, laid out like a document */}
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <div className="flex flex-col gap-6 border-b border-slate-100 px-5 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-8">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Invoice</div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className="text-xl font-bold tracking-tight text-slate-900">{invoice.invoice_no ?? "—"}</span>
                  <FinanceStatusBadge status={invoice.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-500">Issued</dt>
                    <dd className="font-medium text-slate-900">{fmtDate(invoice.issue_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Due</dt>
                    <dd className="font-medium text-slate-900">{invoice.due_date ? fmtDate(invoice.due_date) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Currency</dt>
                    <dd className="font-medium text-slate-900">{invoice.currency}</dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-2xl bg-slate-50 px-5 py-4 sm:min-w-[200px] sm:text-right">
                <div className="text-xs font-medium text-slate-500">Balance due</div>
                <div
                  className={
                    "mt-1 text-2xl font-bold tabular-nums " +
                    (Number(invoice.balance ?? 0) > 0 ? "text-slate-900" : "text-brand-green-700")
                  }
                >
                  {fmtMoney(invoice.balance, invoice.currency)}
                </div>
              </div>
            </div>

            {/* Line items */}
            {itemRows.length ? (
              <div className="gf-table-wrap">
                <table className="gf-table min-w-[560px]">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Unit amount</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemRows.map((it) => (
                      <tr key={it.id}>
                        <td className="font-medium text-slate-900">{it.description}</td>
                        <td className="text-right tabular-nums">{Number(it.quantity).toLocaleString("en-NG")}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{fmtMoney(it.unit_amount, invoice.currency)}</td>
                        <td className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                          {fmtMoney(Number(it.quantity) * Number(it.unit_amount), invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={ListPlus}
                title="No items yet"
                description="Generate items from a fee schedule or add them one by one."
              />
            )}

            {/* Adjustments */}
            {adjustmentRows.length ? (
              <div className="border-t border-slate-100">
                <div className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-8">Adjustments</div>
                <ul className="divide-y divide-slate-100">
                  {adjustmentRows.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm sm:px-8">
                      <div className="min-w-0">
                        <Badge tone={a.type === "penalty" ? "red" : "slate"}>{statusLabel(a.type)}</Badge>
                        {a.notes ? <div className="mt-1 text-xs text-slate-500">{a.notes}</div> : null}
                      </div>
                      <div className="whitespace-nowrap font-medium tabular-nums text-slate-900">
                        {fmtMoney(a.amount, invoice.currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Totals */}
            <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-8">
              <dl className="w-full max-w-xs divide-y divide-slate-200/70">
                <SummaryRow label="Invoice total" value={fmtMoney(invoice.invoice_total, invoice.currency)} />
                <SummaryRow label="Paid" value={`− ${fmtMoney(invoice.allocated_total, invoice.currency)}`} />
                <SummaryRow
                  label="Balance due"
                  value={fmtMoney(invoice.balance, invoice.currency)}
                  emphasis
                  className="text-base"
                />
              </dl>
            </div>
          </Card>

          {/* Allocations */}
          <Card>
            <CardHeader title="Allocations" description="Payments allocated to this invoice." />
            {allocationRows.length ? (
              <div className="gf-table-wrap">
                <table className="gf-table min-w-[520px]">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationRows.map((al) => {
                      const txn = firstOrNull(al.finance_payment_transactions);
                      const ref = txn?.provider_txn_id || txn?.reference || txn?.id || "—";
                      return (
                        <tr key={al.id}>
                          <td className="whitespace-nowrap">{txn?.paid_at ? fmtDateTime(txn.paid_at) : "—"}</td>
                          <td className="max-w-[240px] truncate" title={ref}>
                            {txn?.id ? (
                              <Link href={`/admin/finance/payments/${txn.id}`} className="gf-link">
                                {ref}
                              </Link>
                            ) : (
                              ref
                            )}
                          </td>
                          <td className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                            {fmtMoney(al.amount, invoice.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Wallet} title="No allocations yet" description="Payments recorded against this invoice show up here." />
            )}
          </Card>
        </div>

        {/* Actions */}
        <div className="space-y-6">
          <form action={generateItemsFromSchedule}>
            <FormSection
              title="Generate from fee schedule"
              description="Create invoice items using the configured fee schedule for the student’s class."
              footer={
                <SubmitButton
                  variant="primary"
                  pendingText="Generating…"
                  disabled={!eligibleSchedules.length || itemRows.length > 0}
                >
                  Generate items
                </SubmitButton>
              }
            >
              <Field
                label="Fee schedule"
                htmlFor="fee_schedule_id"
                hint={!classId ? "No class is assigned to this student yet." : undefined}
              >
                <select
                  id="fee_schedule_id"
                  className="gf-select"
                  name="fee_schedule_id"
                  defaultValue=""
                  required
                  disabled={!eligibleSchedules.length || itemRows.length > 0}
                >
                  <option value="" disabled>
                    {itemRows.length > 0
                      ? "Items already exist (clear items to regenerate)"
                      : eligibleSchedules.length
                        ? "Select schedule"
                        : "No matching schedules"}
                  </option>
                  {eligibleSchedules.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.academic_term_id ? "Term" : "Annual"})
                    </option>
                  ))}
                </select>
              </Field>
            </FormSection>
          </form>

          <form action={addItem}>
            <FormSection
              title="Add item"
              footer={
                <SubmitButton variant="primary" pendingText="Adding…">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add item
                </SubmitButton>
              }
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Description" htmlFor="item-description" required className="sm:col-span-3">
                  <input id="item-description" className="gf-input" name="description" required />
                </Field>
                <Field label="Qty" htmlFor="item-quantity">
                  <input
                    id="item-quantity"
                    className="gf-input text-right tabular-nums"
                    name="quantity"
                    inputMode="decimal"
                    defaultValue="1"
                  />
                </Field>
                <Field label="Unit amount" htmlFor="item-unit-amount" className="sm:col-span-2">
                  <input
                    id="item-unit-amount"
                    className="gf-input text-right tabular-nums"
                    name="unit_amount"
                    inputMode="decimal"
                    defaultValue="0"
                  />
                </Field>
              </div>
            </FormSection>
          </form>

          <form action={addAdjustment}>
            <FormSection
              title="Add adjustment"
              description="Discounts, waivers, penalties and write-offs."
              footer={
                <SubmitButton variant="primary" pendingText="Adding…">
                  Add adjustment
                </SubmitButton>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type" htmlFor="adj-type">
                  <select id="adj-type" className="gf-select" name="type" defaultValue="discount">
                    <option value="discount">Discount</option>
                    <option value="waiver">Waiver</option>
                    <option value="penalty">Penalty</option>
                    <option value="writeoff">Write-off</option>
                  </select>
                </Field>
                <Field label="Amount" htmlFor="adj-amount">
                  <input
                    id="adj-amount"
                    className="gf-input text-right tabular-nums"
                    name="amount"
                    inputMode="decimal"
                    defaultValue="0"
                  />
                </Field>
                <Field label="Notes (optional)" htmlFor="adj-notes" className="sm:col-span-2">
                  <input id="adj-notes" className="gf-input" name="notes" />
                </Field>
              </div>
            </FormSection>
          </form>

          <Card>
            <CardHeader
              title="Online payment (Moniepoint)"
              description={
                <>
                  Create a payment reference for Moniepoint. Use the generated reference as the Moniepoint
                  <span className="font-semibold"> merchantReference</span>.
                </>
              }
            />
            <form action={createMoniepointIntent} className="flex items-end gap-3 px-5 py-5 sm:px-6">
              <Field label="Amount" htmlFor="intent-amount" className="flex-1">
                <input
                  id="intent-amount"
                  className="gf-input text-right tabular-nums"
                  name="amount"
                  inputMode="decimal"
                  defaultValue={String(invoice.balance ?? 0)}
                  required
                />
              </Field>
              <SubmitButton variant="secondary" pendingText="Creating…">
                <Link2 className="h-4 w-4" aria-hidden="true" />
                Create reference
              </SubmitButton>
            </form>
            {intentRows.length ? (
              <div className="gf-table-wrap border-t border-slate-100">
                <table className="gf-table">
                  <thead>
                    <tr>
                      <th>Reference (merchantReference)</th>
                      <th>Status</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intentRows.map((pi) => (
                      <tr key={pi.id}>
                        <td className="max-w-[200px] break-all font-mono text-xs text-slate-900">{pi.reference}</td>
                        <td>
                          <FinanceStatusBadge status={pi.status} />
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">{fmtMoney(pi.amount, pi.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border-t border-slate-100 px-5 py-4 text-sm text-slate-500 sm:px-6">
                No online payment references yet.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
