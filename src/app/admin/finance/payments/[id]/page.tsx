import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, History, Plus } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection, Field } from "@/components/ui/form-section";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { currencyPrefix } from "../../_components/finance-ui";
import { formatLagosDate, formatLagosDateTime } from "@/lib/lagos-dates";
import { LEARN } from "@/lib/learn-guides";
import {
  PAYMENT_LOG_ACTIONS,
  PAYMENT_LOG_COLUMNS,
  describePaymentLog,
  reverseReasonLabel,
  type PaymentLogRow
} from "@/lib/payment-corrections";
import { movePaymentAction, savePaymentDetailsAction } from "./actions";
import ReversePaymentForm from "./reverse-payment-form";

// One payment. Recorded payments are never edited or deleted (20261120_payment_corrections.sql): only the reference
// and notes can change; a mistake is reversed with a reason and the payment is entered again; moving it to another
// invoice needs a reason. Every step shows in the history at the bottom.

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
  created_at: string;
  void_reason?: string | null;
  void_note?: string | null;
  voided_at?: string | null;
  voided_by_name?: string | null;
  corrects_payment_id?: string | null;
};

type InvoiceOptionRow = { invoice_id: string; invoice_no: string | null; currency: string; balance: number; student_id: string | null };
type AllocationRow = { invoice_id: string; amount: number };

const BASE_COLUMNS = "id, direction, guardian_id, student_id, amount, currency, method, reference, notes, paid_at, status, provider, created_at";
const CORRECTION_COLUMNS = ", void_reason, void_note, voided_at, voided_by_name, corrects_payment_id";

const METHOD_LABELS: Record<string, string> = { cash: "Cash", transfer: "Bank transfer", pos: "POS", online: "Online" };
const SOURCE_LABELS: Record<string, string> = { bank: "Matched from the bank", moniepoint: "Paid online (Moniepoint)" };

const money = (currency: string, n: number | string | null | undefined) =>
  `${currencyPrefix(currency)}${Number(n ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default async function AdminPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  // Read the correction columns when the migration has been run; fall back so the page still opens before it.
  let ready = true;
  let res = await supabase.from("finance_payment_transactions").select(BASE_COLUMNS + CORRECTION_COLUMNS).eq("id", id).maybeSingle();
  if (res.error) {
    ready = false;
    res = await supabase.from("finance_payment_transactions").select(BASE_COLUMNS).eq("id", id).maybeSingle();
  }
  const payment = (res.data ?? null) as PaymentRow | null;
  if (!payment) notFound();

  const isVoid = payment.status === "void";
  const [{ data: allocations }, { data: student }, { data: guardian }, logRes, correctionsRes, { data: invoices }] = await Promise.all([
    supabase.from("finance_payment_allocations").select("invoice_id, amount").eq("payment_transaction_id", id),
    payment.student_id
      ? supabase.from("students").select("id, first_name, last_name, admission_number").eq("id", payment.student_id).maybeSingle()
      : Promise.resolve({ data: null }),
    payment.guardian_id
      ? supabase.from("guardians").select("id, full_name").eq("id", payment.guardian_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ready
      ? supabase.from("finance_payment_log").select(PAYMENT_LOG_COLUMNS).eq("payment_id", id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as PaymentLogRow[] }),
    ready
      ? supabase.from("finance_payment_transactions").select("id, amount, currency, status, paid_at").eq("corrects_payment_id", id)
      : Promise.resolve({ data: [] as Array<{ id: string; amount: number; currency: string; status: string; paid_at: string }> }),
    // Invoices this payment could go towards: the same pupil's, not cancelled.
    payment.student_id
      ? supabase
          .from("finance_invoice_balances")
          .select("invoice_id, invoice_no, currency, balance, student_id")
          .eq("student_id", payment.student_id)
          .neq("status", "void")
          .order("issue_date", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as InvoiceOptionRow[] })
  ]);

  const allocationRows = (allocations ?? []) as AllocationRow[];
  const invoiceRows = (invoices ?? []) as InvoiceOptionRow[];
  const invoiceNo = new Map(invoiceRows.map((i) => [i.invoice_id, i.invoice_no]));
  const missingNos = allocationRows.map((a) => a.invoice_id).filter((x) => !invoiceNo.has(x));
  if (missingNos.length) {
    const { data } = await supabase.from("finance_invoices").select("id, invoice_no").in("id", missingNos);
    for (const r of data ?? []) invoiceNo.set(r.id as string, (r.invoice_no as string | null) ?? null);
  }
  const allocated = allocationRows.reduce((s, a) => s + Number(a.amount ?? 0), 0);
  const inAdvance = Math.max(0, Number(payment.amount) - allocated);
  const log = (logRes.data ?? []) as PaymentLogRow[];
  const corrections = (correctionsRes.data ?? []) as Array<{ id: string; amount: number; currency: string; status: string; paid_at: string }>;
  const amountLabel = money(payment.currency, payment.amount);
  const pupil = student
    ? `${student.last_name} ${student.first_name}${student.admission_number ? ` (${student.admission_number})` : ""}`
    : null;
  const canMove = ready && !isVoid && payment.direction === "inflow" && Boolean(payment.student_id);

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.editPayment}
        back={{ href: "/admin/finance/payments", label: "Back to payments" }}
        eyebrow="Finance"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            Payment
            {isVoid ? <Badge tone="red">Reversed</Badge> : <Badge tone="green">Recorded</Badge>}
          </span>
        }
        description={pupil ? `${pupil}, paid on ${formatLagosDate(payment.paid_at)}` : `Paid on ${formatLagosDate(payment.paid_at)}`}
        actions={
          <div className="text-right">
            <div className="text-xs font-medium text-slate-500">Amount</div>
            <div className={"text-xl font-bold tabular-nums " + (isVoid ? "text-slate-400 line-through" : "text-slate-900")}>
              {payment.direction === "outflow" ? "−" : ""}
              {amountLabel}
            </div>
          </div>
        }
      />

      {!ready ? (
        <Alert tone="warning" title="Corrections are not set up yet">
          Run docs/migrations/20261120_payment_corrections.sql in Supabase. Until then this payment can only be viewed here.
        </Alert>
      ) : null}

      {isVoid ? (
        <Alert tone="warning" title="This payment was reversed">
          <p>
            {payment.voided_at ? `Reversed on ${formatLagosDateTime(payment.voided_at)}` : "Reversed"}
            {payment.voided_by_name ? ` by ${payment.voided_by_name}` : ""}. It no longer counts towards any balance, and stays here
            so the records are complete.
          </p>
          <p className="mt-1 font-medium">Reason: {reverseReasonLabel(payment.void_reason, payment.void_note)}</p>
          {corrections.length ? (
            <ul className="mt-2 space-y-1">
              {corrections.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/finance/payments/${c.id}`} className="gf-link inline-flex items-center gap-1">
                    Corrected payment: {money(c.currency, c.amount)} on {formatLagosDate(c.paid_at)}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : payment.provider === "bank" ? (
            <p className="mt-2">
              Its bank line is back in the{" "}
              <Link href="/admin/finance/payments/import" className="gf-link">
                bank inbox
              </Link>{" "}
              to match to the right learner.
            </p>
          ) : payment.direction === "inflow" && payment.void_reason !== "duplicate" && payment.void_reason !== "not_received" && payment.void_reason !== "bank_reversed" ? (
            <div className="mt-3">
              <ButtonLink href={`/admin/finance/payments/new?corrects=${payment.id}`} size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Enter the correct payment
              </ButtonLink>
            </div>
          ) : null}
        </Alert>
      ) : null}

      {payment.corrects_payment_id ? (
        <Alert tone="info" title="This payment corrects an earlier one">
          It was entered after{" "}
          <Link href={`/admin/finance/payments/${payment.corrects_payment_id}`} className="gf-link">
            a payment that was reversed
          </Link>
          .
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="What was recorded" description="Fixed once recorded. To change any of these, reverse the payment and enter it again." />
          <CardBody>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-slate-500">Learner</dt>
              <dd className="font-medium text-slate-900">
                {student ? (
                  <Link href={`/admin/students/${student.id}`} className="gf-link">
                    {pupil}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-slate-500">Parent</dt>
              <dd className="text-slate-900">{guardian?.full_name ?? "—"}</dd>
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {payment.direction === "outflow" ? "Paid out " : ""}
                {amountLabel}
              </dd>
              <dt className="text-slate-500">Paid on</dt>
              <dd className="text-slate-900">{formatLagosDateTime(payment.paid_at)}</dd>
              <dt className="text-slate-500">Method</dt>
              <dd className="text-slate-900">{METHOD_LABELS[payment.method ?? ""] ?? payment.method ?? "—"}</dd>
              <dt className="text-slate-500">How it came in</dt>
              <dd className="text-slate-900">{SOURCE_LABELS[payment.provider ?? ""] ?? "Entered by hand"}</dd>
              <dt className="text-slate-500">Entered</dt>
              <dd className="text-slate-900">{formatLagosDateTime(payment.created_at)}</dd>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Where the money went" description="Which invoice this payment pays." />
          <CardBody className="space-y-4">
            {allocationRows.length ? (
              <ul className="space-y-2 text-sm">
                {allocationRows.map((a) => (
                  <li key={a.invoice_id} className="flex items-center justify-between gap-3">
                    <Link href={`/admin/finance/invoices/${a.invoice_id}`} className="gf-link">
                      {invoiceNo.get(a.invoice_id) ?? "Invoice"}
                    </Link>
                    <span className="font-medium tabular-nums">{money(payment.currency, a.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {inAdvance > 0 && payment.direction === "inflow" ? (
              <p className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-600">Paid in advance (not on an invoice)</span>
                <span className="font-medium tabular-nums">{money(payment.currency, inAdvance)}</span>
              </p>
            ) : null}
            {isVoid ? <p className="text-sm text-slate-500">Reversed, so none of this counts any more.</p> : null}

            {canMove ? (
              <form action={movePaymentAction} className="space-y-3 border-t border-slate-100 pt-4">
                <input type="hidden" name="payment_id" value={payment.id} />
                <p className="text-sm font-semibold text-slate-900">Move to another invoice</p>
                <Field label="Invoice" htmlFor="move-invoice">
                  <select id="move-invoice" name="invoice_id" className="gf-select" defaultValue={allocationRows[0]?.invoice_id ?? ""}>
                    <option value="">No invoice: keep as paid in advance</option>
                    {invoiceRows.map((i) => (
                      <option key={i.invoice_id} value={i.invoice_id}>
                        {i.invoice_no ?? "Invoice"} (still owes {money(i.currency, i.balance)})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Why move it?" htmlFor="move-reason" required hint="Kept in the history.">
                  <input id="move-reason" name="move_reason" className="gf-input" required minLength={3} maxLength={300} placeholder="e.g. Parent meant it for second term fees" />
                </Field>
                <SubmitButton variant="secondary" pendingText="Moving…">
                  Move payment
                </SubmitButton>
                <p className="gf-hint">The invoice is paid up to what it still owes. Anything over is kept as paid in advance. To put it on another learner, reverse it and enter it again.</p>
              </form>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {ready ? (
        <form action={savePaymentDetailsAction}>
          <input type="hidden" name="payment_id" value={payment.id} />
          <FormSection
            title="Reference and notes"
            description="These can be changed at any time. Each change is kept in the history."
            footer={
              <SubmitButton variant="secondary" pendingText="Saving…">
                Save reference and notes
              </SubmitButton>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reference" htmlFor="reference" hint="Teller number, bank reference or receipt number.">
                <input id="reference" className="gf-input" name="reference" defaultValue={payment.reference ?? ""} maxLength={200} />
              </Field>
              <Field label="Notes" htmlFor="notes">
                <input id="notes" className="gf-input" name="notes" defaultValue={payment.notes ?? ""} maxLength={500} />
              </Field>
            </div>
          </FormSection>
        </form>
      ) : null}

      {ready && !isVoid ? (
        <FormSection
          title="Reverse this payment"
          description="For a payment entered wrongly, recorded twice, or reversed by the bank. The payment stays on record, crossed out, with your name and the reason, and stops counting towards any balance. You can then enter the correct payment."
          className="border-red-200"
        >
          <ReversePaymentForm paymentId={payment.id} amountLabel={amountLabel} />
        </FormSection>
      ) : null}

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <History className="h-4 w-4 text-slate-400" aria-hidden="true" />
              History
            </span>
          }
          description="Every step taken on this payment, with who did it. Nobody can change this list."
        />
        <CardBody className="p-0">
          {log.length ? (
            <ol className="divide-y divide-slate-100">
              {log.map((row) => {
                const a = PAYMENT_LOG_ACTIONS[row.action] ?? { label: row.action, tone: "slate" as const };
                const lines = describePaymentLog(row);
                return (
                  <li key={row.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-6">
                    <div className="w-40 shrink-0 text-xs text-slate-500">{formatLagosDateTime(row.created_at)}</div>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={a.tone}>{a.label}</Badge>
                        <span className="text-slate-600">{row.done_by_name ?? "Someone"}</span>
                      </div>
                      {lines.map((l, i) => (
                        <p key={i} className="mt-1 text-slate-700">
                          {l}
                        </p>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="px-5 py-4 text-sm text-slate-500 sm:px-6">
              {ready ? "Nothing recorded yet. Payments entered before the history started show from their next change." : "The history starts once the database change is run."}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
