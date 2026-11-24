import Link from "next/link";
import { CalendarClock, Percent } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import SubmitButton from "@/components/submit-button";
import { PolicyExcerpt } from "@/components/policies/policy-view";
import {
  DISCOUNT_OPTIONS,
  PLAN_CANCEL_REASONS,
  PLAN_CHOICES,
  PLAN_STATE,
  REMOVE_FEE_REASONS,
  WAIVE_REASONS,
  planError,
  type PlanRow,
  type PreviewRow
} from "@/lib/payment-plans";
import { formatLagosDate, formatLagosDateTime } from "@/lib/lagos-dates";
import { fmtMoney } from "../../_components/finance-ui";
import {
  applyDiscountAction,
  cancelPlanAction,
  chargeDefaultAction,
  createPlanAction,
  removeDefaultAction,
  removeDiscountAction,
  waiveDefaultAction
} from "./plan-actions";

type PlanRecord = {
  id: string;
  instalments: number;
  agreed_via: "portal" | "paper";
  agreed_name: string;
  agreed_at: string;
  policy_version: string;
  recorded_by_name: string | null;
};
type ChargeRow = { id: string; instalment_id: string; status: string; amount: number; reason: string | null; decided_by_name: string | null; decided_at: string };
type DiscountOption = { option: string; percent: number; tuition_total: number; amount: number; deadline: string | null; paid_by_deadline: number; met: boolean };
type AppliedDiscount = { id: string; option: string; amount: number; applied_by_name: string | null; applied_at: string; note: string | null };

const date = (d: string | null | undefined) => (d ? formatLagosDate(`${d.slice(0, 10)}T12:00:00Z`) : "—");

// Payment plan and early payment discount for one invoice (admin invoice page).
export async function InvoicePlanCards({
  supabase,
  invoiceId,
  balance,
  currency
}: {
  supabase: SupabaseClient;
  invoiceId: string;
  balance: number;
  currency: string;
}) {
  const back = `/admin/finance/invoices/${invoiceId}`;
  const [{ data: planData, error: planErr }, { data: statusData }, { data: chargeData }, { data: discData }, { data: optData, error: optErr }] =
    await Promise.all([
      supabase
        .from("fee_payment_plans")
        .select("id, instalments, agreed_via, agreed_name, agreed_at, policy_version, recorded_by_name")
        .eq("invoice_id", invoiceId)
        .eq("status", "active")
        .maybeSingle(),
      supabase.rpc("payment_plan_status", { p_invoice: invoiceId }),
      supabase.from("fee_plan_default_charges").select("id, instalment_id, status, amount, reason, decided_by_name, decided_at").eq("invoice_id", invoiceId),
      supabase.from("fee_early_discounts").select("id, option, amount, applied_by_name, applied_at, note").eq("invoice_id", invoiceId).eq("status", "applied").maybeSingle(),
      supabase.rpc("early_discount_options", { p_invoice: invoiceId })
    ]);

  if (planErr) {
    return (
      <Alert tone="warning" title="Payment plans aren't available">
        {planError(planErr.message)}
      </Alert>
    );
  }

  const plan = planData as PlanRecord | null;
  const rows = (statusData ?? []) as PlanRow[];
  const charges = new Map(((chargeData ?? []) as ChargeRow[]).map((c) => [c.instalment_id, c]));
  const discount = discData as AppliedDiscount | null;
  const options = (optData ?? []) as DiscountOption[];

  let previews: Array<{ n: number; rows: PreviewRow[]; error: string | null }> = [];
  if (!plan && balance > 0) {
    previews = await Promise.all(
      PLAN_CHOICES.map(async (n) => {
        const { data, error } = await supabase.rpc("preview_payment_plan", { p_invoice: invoiceId, p_instalments: n });
        return { n, rows: (data ?? []) as PreviewRow[], error: error ? planError(error.message) : null };
      })
    );
  }
  const previewError = previews.find((p) => p.error)?.error ?? null;

  return (
    <>
      <Card id="payment-plan">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
              Payment plan
            </span>
          }
          description={plan ? `${plan.instalments} payments` : "Pay this invoice in 2 to 5 parts, as set out in the school policy."}
        />
        <div className="space-y-4 px-5 py-4 sm:px-6">
          <PolicyExcerpt policy="families" section="payment-plans" />
          {plan ? (
            <>
              <p className="text-sm text-slate-600">
                Agreed by <span className="font-medium text-slate-900">{plan.agreed_name}</span>{" "}
                {plan.agreed_via === "portal" ? "on the portal" : `on paper (recorded by ${plan.recorded_by_name ?? "an admin"})`},{" "}
                {formatLagosDateTime(plan.agreed_at)}. Policy version {plan.policy_version}.
              </p>
              <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {rows.map((r) => {
                  const s = PLAN_STATE[r.state];
                  const charge = charges.get(r.instalment_id);
                  return (
                    <li key={r.instalment_id} className="space-y-2 px-3.5 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-900">
                            {r.seq}. {fmtMoney(r.amount, currency)} <span className="font-normal text-slate-500">({Number(r.percent)}%)</span>
                          </div>
                          <div className="text-slate-500">
                            {r.due_label}: {date(r.due_date)}
                          </div>
                        </div>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </div>
                      {charge?.status === "charged" ? (
                        <div className="rounded-lg bg-red-50 px-3 py-2 text-red-900">
                          Default fee {fmtMoney(charge.amount, currency)} added by {charge.decided_by_name ?? "an admin"}, {formatLagosDateTime(charge.decided_at)}.{" "}
                          <Link href={`/admin/finance/payment-plans/letter/${charge.id}`} className="font-semibold underline">
                            Default letter
                          </Link>
                          <details className="mt-2">
                            <summary className="cursor-pointer font-medium">Remove this fee</summary>
                            <form action={removeDefaultAction} className="mt-2 space-y-2">
                              <input type="hidden" name="back" value={back} />
                              <input type="hidden" name="charge_id" value={charge.id} />
                              <select name="reason" className="gf-select" required defaultValue="" aria-label="Why remove the fee">
                                <option value="" disabled>
                                  Why?
                                </option>
                                {REMOVE_FEE_REASONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <input name="note" className="gf-input" placeholder="Details (needed for Other)" aria-label="Details" />
                              <SubmitButton variant="secondary" size="sm" pendingText="Removing…">
                                Remove fee
                              </SubmitButton>
                            </form>
                          </details>
                        </div>
                      ) : charge ? (
                        <div className="text-slate-500">
                          Default fee {charge.status === "waived" ? "waived" : "removed"} by {charge.decided_by_name ?? "an admin"} (
                          {WAIVE_REASONS.find((w) => w.value === charge.reason)?.label ??
                            REMOVE_FEE_REASONS.find((w) => w.value === charge.reason)?.label ??
                            "no reason"}
                          ).
                        </div>
                      ) : r.state === "missed" ? (
                        <div className="flex flex-wrap items-start gap-2">
                          <form action={chargeDefaultAction}>
                            <input type="hidden" name="back" value={back} />
                            <input type="hidden" name="instalment_id" value={r.instalment_id} />
                            <SubmitButton variant="danger" size="sm" pendingText="Adding…">
                              Add default fee and tell the parent
                            </SubmitButton>
                          </form>
                          <details>
                            <summary className="inline-flex min-h-[32px] cursor-pointer items-center text-sm font-medium text-slate-600">Waive it</summary>
                            <form action={waiveDefaultAction} className="mt-2 space-y-2">
                              <input type="hidden" name="back" value={back} />
                              <input type="hidden" name="instalment_id" value={r.instalment_id} />
                              <select name="reason" className="gf-select" required defaultValue="" aria-label="Why waive the fee">
                                <option value="" disabled>
                                  Why?
                                </option>
                                {WAIVE_REASONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <input name="note" className="gf-input" placeholder="Details (needed for Other)" aria-label="Details" />
                              <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                                Waive default fee
                              </SubmitButton>
                            </form>
                          </details>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-600">Cancel this plan</summary>
                <form action={cancelPlanAction} className="mt-3 space-y-2">
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="plan_id" value={plan.id} />
                  <select name="reason" className="gf-select" required defaultValue="" aria-label="Why cancel the plan">
                    <option value="" disabled>
                      Why?
                    </option>
                    {PLAN_CANCEL_REASONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input name="note" className="gf-input" placeholder="Details (needed for Other)" aria-label="Details" />
                  <p className="gf-hint">Payments already made stay on the invoice. You can then set up a new plan.</p>
                  <SubmitButton variant="secondary" size="sm" pendingText="Cancelling…">
                    Cancel plan
                  </SubmitButton>
                </form>
              </details>
            </>
          ) : balance <= 0 ? (
            <p className="text-sm text-slate-500">Nothing is owed on this invoice, so it doesn&apos;t need a plan.</p>
          ) : previewError ? (
            <Alert tone="warning">{previewError}</Alert>
          ) : (
            <form action={createPlanAction} className="space-y-3">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="invoice_id" value={invoiceId} />
              <fieldset className="space-y-2">
                <legend className="gf-label">Plan the parent signed</legend>
                {previews.map((p, i) => (
                  <label key={p.n} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm has-[:checked]:border-brand-green has-[:checked]:bg-brand-green-50/50">
                    <input type="radio" name="instalments" value={p.n} defaultChecked={i === 1} required className="mt-1" />
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">{p.n} payments</span>
                      <span className="mt-0.5 block text-slate-600">
                        {p.rows.map((r) => `${fmtMoney(r.amount, currency)} by ${date(r.due_date)}`).join(" · ")}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div>
                <label className="gf-label" htmlFor="agreed_name">
                  Name of the parent who signed
                </label>
                <input id="agreed_name" name="agreed_name" className="gf-input" required minLength={3} autoComplete="off" />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" name="signed" value="yes" required className="mt-1" />
                The parent signed the School Fees Payment Agreement for this plan. Keep the paper copy in the learner&apos;s file.
              </label>
              <SubmitButton pendingText="Saving…">Save payment plan</SubmitButton>
              <p className="gf-hint">Parents can also choose a plan themselves on the portal, up to the first day of term.</p>
            </form>
          )}
        </div>
      </Card>

      <Card id="early-discount">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Percent className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
              Early payment discount
            </span>
          }
          description="On tuition only, when the invoice was paid in full early."
        />
        <div className="space-y-4 px-5 py-4 sm:px-6">
          <PolicyExcerpt policy="families" section="early-payment" />
          {discount ? (
            <div className="space-y-2 text-sm">
              <p className="text-slate-700">
                {DISCOUNT_OPTIONS[discount.option]?.label ?? discount.option}: <span className="font-semibold">{fmtMoney(discount.amount, currency)}</span> off,
                added by {discount.applied_by_name ?? "an admin"}, {formatLagosDateTime(discount.applied_at)}.
                {discount.note ? ` ${discount.note}` : ""}
              </p>
              <details>
                <summary className="cursor-pointer font-medium text-slate-600">Remove this discount</summary>
                <form action={removeDiscountAction} className="mt-2 space-y-2">
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="discount_id" value={discount.id} />
                  <input name="reason" className="gf-input" required placeholder="Why?" aria-label="Why remove the discount" />
                  <SubmitButton variant="secondary" size="sm" pendingText="Removing…">
                    Remove discount
                  </SubmitButton>
                </form>
              </details>
            </div>
          ) : plan ? (
            <p className="text-sm text-slate-500">This invoice is on a payment plan, so early payment discounts don&apos;t apply.</p>
          ) : optErr ? (
            <Alert tone="warning">{planError(optErr.message)}</Alert>
          ) : !options.length || Number(options[0].tuition_total) <= 0 ? (
            <p className="text-sm text-slate-500">
              No tuition on this invoice. Mark which fee types are tuition under{" "}
              <Link href="/admin/finance/fees/revenue-categories" className="gf-link">
                Revenue categories
              </Link>
              .
            </p>
          ) : (
            <form action={applyDiscountAction} className="space-y-3">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="invoice_id" value={invoiceId} />
              <fieldset className="space-y-2">
                <legend className="gf-label">How the family paid</legend>
                {options.map((o) => (
                  <label
                    key={o.option}
                    className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm has-[:checked]:border-brand-green has-[:checked]:bg-brand-green-50/50"
                  >
                    <input type="radio" name="option" value={o.option} required defaultChecked={o.option === "two_weeks" && o.met} className="mt-1" />
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">
                        {DISCOUNT_OPTIONS[o.option]?.label}: {Number(o.percent)}% = {fmtMoney(o.amount, currency)}
                      </span>
                      <span className={o.met ? "mt-0.5 block text-brand-green-700" : "mt-0.5 block text-slate-500"}>
                        {o.met
                          ? `Paid in full by ${date(o.deadline)}`
                          : `Not paid in full by ${date(o.deadline)} (${fmtMoney(o.paid_by_deadline, currency)} had arrived)`}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div>
                <label className="gf-label" htmlFor="discount_note">
                  Which payment was it? <span className="font-normal text-slate-500">(needed for the advance options)</span>
                </label>
                <input id="discount_note" name="note" className="gf-input" placeholder="For example: paid the whole 2026/27 session on 1 Aug" />
              </div>
              <SubmitButton pendingText="Adding…">Add discount</SubmitButton>
            </form>
          )}
        </div>
      </Card>
    </>
  );
}
