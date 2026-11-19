import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Pencil } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { SpendingReceipts, SpendingSlip } from "@/components/spending-receipts";
import { LEARN } from "@/lib/learn-guides";
import { formatLagosDate, formatLagosDateTime } from "@/lib/lagos-dates";
import { paystackConfigured } from "@/lib/paystack";
import {
  ACTION_LABEL,
  CANCEL_REASONS,
  DECLINE_REASONS,
  FLAG_LABEL,
  KIND_LABEL,
  PAY_METHODS,
  PAY_METHOD_LABEL,
  REMOVE_RECEIPT_REASONS,
  RETURN_REASONS,
  SEND_BACK_REASONS,
  STATUS_LABEL,
  STATUS_TONE,
  lagosToday,
  naira,
  reasonLabel,
  type Reason,
  type SpendingKind,
  type SpendingStatus
} from "@/lib/spending";
import { loadViewer, signedLinks } from "../_data";
import {
  addReceiptAction,
  cancelAction,
  checkAccountingAction,
  checkPaystackAction,
  decideAction,
  finalizeOtpAction,
  payPaystackAction,
  recordPayoutAction,
  removeReceiptAction,
  resendOtpAction,
  sendAccountingAction,
  stopPaystackAction
} from "../actions";

type Req = {
  id: string;
  request_no: string;
  kind: SpendingKind;
  status: SpendingStatus;
  requester_id: string;
  requester_name: string | null;
  purpose: string;
  amount: number;
  needed_by: string | null;
  payee_name: string;
  bank_name: string;
  bank_code: string | null;
  account_number: string;
  account_name: string | null;
  flags: string[];
  approvals_needed: number;
  pay_method: string | null;
  pay_reference: string | null;
  pay_slip_path: string | null;
  paid_at: string | null;
  paid_by_name: string | null;
  charge: number;
  due_by: string | null;
  paystack_status: string | null;
  paystack_message: string | null;
  change_returned: number | null;
  submitted_at: string;
  closed_at: string | null;
  expense_categories: { name: string } | null;
};
type Receipt = {
  id: string;
  stage: string;
  file_path: string | null;
  amount: number;
  vendor: string;
  spent_on: string;
  no_receipt_reason: string | null;
  seller_phone: string | null;
  note: string | null;
  added_by_name: string | null;
  removed_at: string | null;
};
type Event = { id: number; action: string; from_status: string | null; to_status: string | null; reason_code: string | null; note: string | null; done_by_name: string | null; done_at: string };

function ReasonFields({ reasons, label }: { reasons: Reason[]; label: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="gf-label">{label}</span>
        <select className="gf-select" name="reason" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {reasons.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="gf-label">Note (needed for Other)</span>
        <input className="gf-input" name="note" maxLength={300} />
      </label>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export default async function SpendingRequestPage({ params, searchParams }: { params: { id: string }; searchParams?: { toast?: string } }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const me = await loadViewer(supabase);
  if (!me) return null;
  const id = /^[0-9a-f-]{36}$/i.test(params.id) ? params.id : "";

  const [reqRes, apprRes, recRes, evRes, setRes] = await Promise.all([
    supabase.from("spending_requests").select("*, expense_categories(name)").eq("id", id).maybeSingle(),
    supabase.from("spending_approvals").select("approver_id, approver_name, approved_at, withdrawn_at").eq("request_id", id).order("approved_at"),
    supabase.from("spending_receipts").select("id, stage, file_path, amount, vendor, spent_on, no_receipt_reason, seller_phone, note, added_by_name, removed_at").eq("request_id", id).order("added_at"),
    supabase.from("spending_events").select("id, action, from_status, to_status, reason_code, note, done_by_name, done_at").eq("request_id", id).order("done_at"),
    supabase.from("spending_settings").select("approver_may_pay_up_to, no_receipt_max, second_approval_above").eq("id", 1).maybeSingle()
  ]);
  const r = reqRes.data as Req | null;
  if (!r) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: "/admin/spending", label: "Back to spending requests" }} title="Request not found" />
        <EmptyState title="This request doesn't exist, or you can't see it" description="Requests are seen by the person who asked, approvers, cashiers and admins." />
      </div>
    );
  }
  const approvals = (apprRes.data ?? []) as Array<{ approver_id: string; approver_name: string | null; approved_at: string; withdrawn_at: string | null }>;
  const current = approvals.filter((a) => !a.withdrawn_at);
  const receipts = ((recRes.data ?? []) as Receipt[]).filter((x) => !x.removed_at);
  const events = (evRes.data ?? []) as Event[];
  const settings = setRes.data ?? { approver_may_pay_up_to: 50000, no_receipt_max: 5000, second_approval_above: 250000 };
  const links = await signedLinks(supabase, [...receipts.map((x) => x.file_path ?? ""), r.pay_slip_path ?? ""]);

  const mine = r.requester_id === me.userId;
  const iApproved = current.some((a) => a.approver_id === me.userId);
  const canDecide =
    r.status === "submitted" && !mine && !iApproved && me.limit >= Math.min(Number(r.amount), Number(settings.second_approval_above));
  const canPay = me.canPay && !mine && (r.status === "approved" || r.status === "paying");
  const canCheck = r.status === "checking" && !mine && (me.canPay || me.limit > 0);
  const accounting = mine && r.status === "paid" && r.kind === "advance";
  const receiptsTotal = receipts.filter((x) => x.stage === "accounting").reduce((s, x) => s + Number(x.amount), 0);
  const changeDue = Math.max(Number(r.amount) - receiptsTotal, 0);
  const late = r.status === "paid" && r.due_by && r.due_by < lagosToday();
  const lastReason = [...events].reverse().find((e) => e.reason_code && (e.action === "sent_back" || e.action === "returned" || e.action === "declined"));
  const paystackOn = paystackConfigured();
  const unreceiptedOver = receipts.some((x) => !x.file_path && Number(x.amount) > Number(settings.no_receipt_max));

  return (
    <div className="space-y-6">
      <UrlToast key={searchParams?.toast ?? "none"} />
      <PageHeader
        learn={LEARN.spending}
        back={{ href: "/admin/spending", label: "Back to spending requests" }}
        eyebrow={`${KIND_LABEL[r.kind]} · ${r.expense_categories?.name ?? ""}`}
        title={`${r.request_no}: ${naira(r.amount)}`}
        description={r.purpose}
        actions={
          <Badge tone={late ? "red" : STATUS_TONE[r.status]} dot>
            {late ? "Receipts overdue" : STATUS_LABEL[r.status]}
          </Badge>
        }
      />

      {r.flags.length && !mine ? (
        <Alert tone="warning" title="Worth a look before you act">
          <ul className="list-disc space-y-1 pl-5">
            {r.flags.map((f) => (
              <li key={f}>{FLAG_LABEL[f] ?? f}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {mine && lastReason && (r.status === "sent_back" || r.status === "declined" || (r.status === "paid" && lastReason.action === "returned")) ? (
        <Alert tone={r.status === "declined" ? "danger" : "warning"} title={ACTION_LABEL[lastReason.action]}>
          {reasonLabel(lastReason.reason_code)}
          {lastReason.note ? `: ${lastReason.note}` : ""} ({lastReason.done_by_name})
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ---- What to do now ---- */}
          {mine && r.status === "sent_back" ? (
            <Card>
              <CardHeader title="Change it and send it again" description="Fix what the approver asked for. Approvals start again." />
              <CardBody>
                <ButtonLink href={`/admin/spending/new?edit=${r.id}`}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Change and send again
                </ButtonLink>
              </CardBody>
            </Card>
          ) : null}

          {canDecide ? (
            <Card>
              <CardHeader
                title="Your decision"
                description={r.approvals_needed === 2 ? `This needs two approvals (${current.length} so far). The final one must come from someone whose limit covers ${naira(r.amount)}.` : "One approval is enough."}
              />
              <CardBody className="space-y-6">
                <form action={decideAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <label className="block flex-1">
                    <span className="gf-label">Note (optional)</span>
                    <input className="gf-input" name="note" maxLength={300} />
                  </label>
                  <SubmitButton pendingText="Approving…">Approve {naira(r.amount)}</SubmitButton>
                </form>
                <details className="rounded-xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Send back for changes</summary>
                  <form action={decideAction} className="mt-4 space-y-3">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="send_back" />
                    <ReasonFields reasons={SEND_BACK_REASONS} label="What needs changing?" />
                    <SubmitButton variant="secondary" pendingText="Sending back…">
                      Send back
                    </SubmitButton>
                  </form>
                </details>
                <details className="rounded-xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-red-700">Decline</summary>
                  <form action={decideAction} className="mt-4 space-y-3">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="decline" />
                    <ReasonFields reasons={DECLINE_REASONS} label="Why?" />
                    <SubmitButton variant="danger" pendingText="Declining…">
                      Decline
                    </SubmitButton>
                  </form>
                </details>
              </CardBody>
            </Card>
          ) : null}

          {canPay && r.status === "approved" ? (
            <Card>
              <CardHeader
                title="Pay it out"
                description={`${naira(r.amount)} to ${r.account_name ?? r.payee_name}, ${r.bank_name} ${r.account_number}.`}
              />
              <CardBody className="space-y-6">
                {iApproved ? (
                  <Alert tone="warning">
                    You approved this request.{" "}
                    {Number(r.amount) > Number(settings.approver_may_pay_up_to)
                      ? "Someone else must pay it out."
                      : "Only pay it yourself if no one else can, and say why in the note."}
                  </Alert>
                ) : null}
                {paystackOn && r.bank_code ? (
                  <form action={payPaystackAction} className="space-y-3">
                    <input type="hidden" name="id" value={r.id} />
                    {iApproved ? (
                      <label className="block">
                        <span className="gf-label">Why are you paying it yourself?</span>
                        <input className="gf-input" name="note" maxLength={300} required />
                      </label>
                    ) : null}
                    <SubmitButton pendingText="Contacting Paystack…">Pay {naira(r.amount)} through Paystack</SubmitButton>
                    <p className="gf-hint">Paystack sends a code to the business phone; you type it here to finish. Its charge is about {naira(Number(r.amount) <= 5000 ? 10 : Number(r.amount) <= 50000 ? 25 : 50)}{Number(r.amount) >= 10000 ? " plus ₦50 stamp duty" : ""}.</p>
                  </form>
                ) : (
                  <Alert tone="info">
                    {paystackOn ? "These bank details weren't checked with the bank, so they can't be paid through Paystack." : "Paystack isn't connected yet."} Pay another way and record it below.
                  </Alert>
                )}
                <details className="rounded-xl border border-slate-200 p-4" open={!paystackOn || !r.bank_code}>
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Paid another way (bank app, cash, POS)</summary>
                  <form action={recordPayoutAction} className="mt-4 space-y-3">
                    <input type="hidden" name="id" value={r.id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="gf-label">How it was paid</span>
                        <select className="gf-select" name="method" required defaultValue="">
                          <option value="" disabled>
                            Choose…
                          </option>
                          {PAY_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="gf-label">Reference (not needed for cash)</span>
                        <input className="gf-input" name="reference" maxLength={80} />
                      </label>
                      <label className="block">
                        <span className="gf-label">Bank charge (₦, optional)</span>
                        <input className="gf-input text-right tabular-nums" name="charge" inputMode="decimal" />
                      </label>
                    </div>
                    <div>
                      <span className="gf-label">Transfer slip or receipt (optional)</span>
                      <SpendingSlip />
                    </div>
                    <label className="block">
                      <span className="gf-label">Note {iApproved ? "(required: you approved this)" : "(optional)"}</span>
                      <input className="gf-input" name="note" maxLength={300} required={iApproved} />
                    </label>
                    <SubmitButton variant="secondary" pendingText="Saving…">
                      Record the payment
                    </SubmitButton>
                  </form>
                </details>
              </CardBody>
            </Card>
          ) : null}

          {canPay && r.status === "paying" ? (
            <Card>
              <CardHeader title="Paying through Paystack" description={r.paystack_message ? `Paystack: ${r.paystack_message}` : "Waiting for Paystack."} />
              <CardBody className="space-y-4">
                {r.paystack_status === "otp" ? (
                  <form action={finalizeOtpAction} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="block">
                      <span className="gf-label">Code from the business phone</span>
                      <input className="gf-input w-40 tabular-nums" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required />
                    </label>
                    <SubmitButton pendingText="Paying…">Finish the payment</SubmitButton>
                  </form>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <form action={checkPaystackAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton variant="secondary" size="sm" pendingText="Checking…">
                      Check with Paystack
                    </SubmitButton>
                  </form>
                  {r.paystack_status === "otp" ? (
                    <form action={resendOtpAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton variant="ghost" size="sm" pendingText="Asking…">
                        Send a new code
                      </SubmitButton>
                    </form>
                  ) : null}
                  <form action={stopPaystackAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton variant="ghost" size="sm" pendingText="Stopping…">
                      Stop this payment
                    </SubmitButton>
                  </form>
                </div>
                <p className="gf-hint">&ldquo;Stop&rdquo; asks Paystack first; if the money has already gone, the request is marked paid instead.</p>
              </CardBody>
            </Card>
          ) : null}

          {accounting ? (
            <Card>
              <CardHeader
                title="Account for this advance"
                description={`Add a receipt for each thing you bought. Due by ${r.due_by ? formatLagosDate(`${r.due_by}T12:00:00Z`) : "—"}.`}
              />
              <CardBody className="space-y-6">
                <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                  <p>
                    Paid to you <strong className="block text-base tabular-nums">{naira(r.amount)}</strong>
                  </p>
                  <p>
                    Receipts so far <strong className="block text-base tabular-nums">{naira(receiptsTotal)}</strong>
                  </p>
                  <p>
                    Change to hand in <strong className="block text-base tabular-nums">{naira(changeDue)}</strong>
                  </p>
                </div>
                <form action={addReceiptAction} className="space-y-3">
                  <input type="hidden" name="id" value={r.id} />
                  <SpendingReceipts mode="accounting" />
                  <SubmitButton variant="secondary" pendingText="Adding…">
                    Add this receipt
                  </SubmitButton>
                </form>
                <form action={sendAccountingAction} className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="block">
                    <span className="gf-label">Change handed to the cashier (₦)</span>
                    <input className="gf-input w-44 text-right tabular-nums" name="change" inputMode="decimal" defaultValue={String(changeDue)} />
                  </label>
                  <SubmitButton pendingText="Sending…">Send for checking</SubmitButton>
                  <p className="gf-hint w-full">Receipts plus change must equal what you were paid. Hand the change to the cashier before sending.</p>
                </form>
              </CardBody>
            </Card>
          ) : null}

          {canCheck ? (
            <Card>
              <CardHeader
                title="Check the receipts"
                description={`Receipts ${naira(receiptsTotal)} + change ${naira(r.change_returned ?? 0)} = ${naira(receiptsTotal + Number(r.change_returned ?? 0))} of ${naira(r.amount)} paid.`}
              />
              <CardBody className="space-y-4">
                {Number(r.change_returned ?? 0) > 0 ? (
                  <Alert tone="info">Accepting confirms you have received {naira(r.change_returned)} in change.</Alert>
                ) : null}
                {unreceiptedOver && me.limit <= 0 ? (
                  <Alert tone="warning">An item without a receipt is over {naira(settings.no_receipt_max)}, so an approver must accept this one.</Alert>
                ) : null}
                <form action={checkAccountingAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="accept" />
                  <label className="block flex-1">
                    <span className="gf-label">Note (optional)</span>
                    <input className="gf-input" name="note" maxLength={300} />
                  </label>
                  <SubmitButton pendingText="Closing…">Accept and close</SubmitButton>
                </form>
                <details className="rounded-xl border border-slate-200 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Send back to the requester</summary>
                  <form action={checkAccountingAction} className="mt-4 space-y-3">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="return" />
                    <ReasonFields reasons={RETURN_REASONS} label="What's wrong?" />
                    <SubmitButton variant="secondary" pendingText="Sending back…">
                      Send back
                    </SubmitButton>
                  </form>
                </details>
              </CardBody>
            </Card>
          ) : null}

          {/* ---- Receipts ---- */}
          <Card>
            <CardHeader title={r.kind === "supplier" ? "Invoice and receipts" : "Receipts"} description={receipts.length ? `${receipts.length} on record` : undefined} />
            {receipts.length ? (
              <ul className="divide-y divide-slate-100">
                {receipts.map((x) => {
                  const href = x.file_path ? links.get(x.file_path) : null;
                  return (
                    <li key={x.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {x.vendor} <span className="font-normal text-slate-500">· {formatLagosDate(`${x.spent_on}T12:00:00Z`)}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {x.file_path ? "Photo or PDF attached" : `No receipt: ${reasonLabel(x.no_receipt_reason)}`}
                          {x.seller_phone ? ` · seller ${x.seller_phone}` : ""}
                          {x.note ? ` · ${x.note}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">{naira(x.amount)}</span>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                            <FileText className="h-4 w-4" aria-hidden="true" />
                            Open
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : null}
                        {accounting && x.stage === "accounting" ? (
                          <details>
                            <summary className="cursor-pointer text-xs font-medium text-slate-600">Take off</summary>
                            <form action={removeReceiptAction} className="mt-2 space-y-2">
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="receipt_id" value={x.id} />
                              <ReasonFields reasons={REMOVE_RECEIPT_REASONS} label="Why?" />
                              <SubmitButton variant="ghost" size="sm" pendingText="Taking off…">
                                Take this receipt off
                              </SubmitButton>
                            </form>
                          </details>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-slate-600">{r.kind === "advance" ? "Receipts are added after the advance is paid." : "None."}</p>
              </CardBody>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="divide-y divide-slate-100">
                <Row label="Asked by">{r.requester_name ?? "Staff"}</Row>
                <Row label="Asked on">{formatLagosDateTime(r.submitted_at)}</Row>
                {r.needed_by ? <Row label="Needed by">{formatLagosDate(`${r.needed_by}T12:00:00Z`)}</Row> : null}
                <Row label="Pay to">
                  {r.payee_name}
                  <span className="block text-slate-600">
                    {r.bank_name} {r.account_number}
                  </span>
                  {r.account_name ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Bank&apos;s name: {r.account_name}
                    </span>
                  ) : (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-gold-800">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      Name not checked with the bank
                    </span>
                  )}
                </Row>
                <Row label="Approvals">
                  {current.length ? current.map((a) => <span key={a.approver_id} className="block">{a.approver_name} · {formatLagosDate(a.approved_at)}</span>) : "None yet"}
                  <span className="block text-xs text-slate-500">{r.approvals_needed === 2 ? "Two needed" : "One needed"}</span>
                </Row>
                {r.paid_at ? (
                  <Row label="Paid">
                    {formatLagosDateTime(r.paid_at)} by {r.paid_by_name ?? "—"}
                    <span className="block text-slate-600">
                      {PAY_METHOD_LABEL[r.pay_method ?? ""] ?? r.pay_method} {r.pay_reference ? `· ${r.pay_reference}` : ""}
                    </span>
                    {Number(r.charge) > 0 ? <span className="block text-xs text-slate-500">Charge {naira(r.charge)}</span> : null}
                    {r.pay_slip_path && links.get(r.pay_slip_path) ? (
                      <a href={links.get(r.pay_slip_path)} target="_blank" rel="noopener noreferrer" className="gf-link text-xs">
                        Open the slip
                      </a>
                    ) : null}
                  </Row>
                ) : null}
                {r.change_returned != null ? <Row label="Change returned">{naira(r.change_returned)}</Row> : null}
              </dl>
            </CardBody>
          </Card>

          {(mine && ["submitted", "sent_back", "approved"].includes(r.status)) || (me.isAdmin && ["submitted", "sent_back", "approved"].includes(r.status)) ? (
            <Card>
              <CardBody>
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">Cancel this request</summary>
                  <form action={cancelAction} className="mt-4 space-y-3">
                    <input type="hidden" name="id" value={r.id} />
                    <ReasonFields reasons={CANCEL_REASONS} label="Why?" />
                    <SubmitButton variant="danger" size="sm" pendingText="Cancelling…">
                      Cancel the request
                    </SubmitButton>
                  </form>
                </details>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="History" />
            <CardBody>
              <ol className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p className="font-medium text-slate-900">{ACTION_LABEL[e.action] ?? e.action}</p>
                    <p className="text-xs text-slate-500">
                      {e.done_by_name} · {formatLagosDateTime(e.done_at)}
                    </p>
                    {e.reason_code || e.note ? (
                      <p className="text-xs text-slate-700">
                        {reasonLabel(e.reason_code)}
                        {e.reason_code && e.note ? ": " : ""}
                        {e.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-slate-500">
                Nothing here can be deleted. <Link href="/admin/learn#spending-requests" className="gf-link">How spending requests work</Link>
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

