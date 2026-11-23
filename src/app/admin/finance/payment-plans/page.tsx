import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { PolicyExcerpt } from "@/components/policies/policy-view";
import { LEARN } from "@/lib/learn-guides";
import { fetchAllRows } from "@/lib/fetch-all";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate, formatLagosDateTime } from "@/lib/lagos-dates";
import { planError } from "@/lib/payment-plans";
import { fmtMoney } from "../_components/finance-ui";
import { chargeDefaultAction } from "../invoices/[id]/plan-actions";

// Payment plans for admins: missed payments waiting for a decision (add the default fee or waive it), then every
// active plan. The rules are in the database (docs/migrations/20261122_payment_plans.sql).

type Missed = {
  instalment_id: string;
  invoice_id: string;
  invoice_no: string | null;
  student_id: string | null;
  guardian_id: string;
  seq: number;
  instalments: number;
  due_date: string;
  due_so_far: number;
  paid: number;
  default_fee: number;
};

type PlanListRow = {
  id: string;
  invoice_id: string;
  instalments: number;
  agreed_via: string;
  agreed_name: string;
  agreed_at: string;
  plan_total: number;
  finance_invoices: Array<{ invoice_no: string | null; student_id: string | null; bill_to_guardian_id: string }> | null;
};

const day = (d: string) => formatLagosDate(`${d.slice(0, 10)}T12:00:00Z`);

export default async function PaymentPlansPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: missedData, error: missedErr }, plansRes, { data: chargedData }] = await Promise.all([
    supabase.rpc("fee_plan_missed"),
    fetchAllRows<PlanListRow>(() =>
      supabase
        .from("fee_payment_plans")
        .select("id, invoice_id, instalments, agreed_via, agreed_name, agreed_at, plan_total, finance_invoices(invoice_no, student_id, bill_to_guardian_id)")
        .eq("status", "active")
        .order("agreed_at", { ascending: false })
    ).then((rows) => ({ rows, error: null as string | null })),
    supabase
      .from("fee_plan_default_charges")
      .select("id, invoice_id, amount, decided_at, decided_by_name")
      .eq("status", "charged")
      .order("decided_at", { ascending: false })
      .limit(20)
  ]);

  const missed = (missedData ?? []) as Missed[];
  const plans = plansRes.rows.map((p) => ({ ...p, finance_invoices: firstOrNull(p.finance_invoices) }));
  const charged = (chargedData ?? []) as Array<{ id: string; invoice_id: string; amount: number; decided_at: string; decided_by_name: string | null }>;

  // Names for the rows on screen.
  const studentIds = Array.from(new Set([...missed.map((m) => m.student_id), ...plans.map((p) => p.finance_invoices?.student_id)].filter((v): v is string => !!v)));
  const guardianIds = Array.from(new Set([...missed.map((m) => m.guardian_id), ...plans.map((p) => p.finance_invoices?.bill_to_guardian_id)].filter((v): v is string => !!v)));
  const [{ data: studs }, { data: gds }] = await Promise.all([
    studentIds.length ? supabase.from("students").select("id, first_name, last_name").in("id", studentIds) : Promise.resolve({ data: [] }),
    guardianIds.length ? supabase.from("guardians").select("id, full_name, phone").in("id", guardianIds) : Promise.resolve({ data: [] })
  ]);
  const pupil = new Map(((studs ?? []) as Array<{ id: string; first_name: string; last_name: string }>).map((s) => [s.id, `${s.first_name} ${s.last_name}`]));
  const parent = new Map(((gds ?? []) as Array<{ id: string; full_name: string; phone: string | null }>).map((g) => [g.id, g]));
  const invNo = new Map(plans.map((p) => [p.invoice_id, p.finance_invoices?.invoice_no ?? null]));

  const setupMissing = missedErr && /does not exist|schema cache/i.test(missedErr.message);

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.paymentPlans}
        eyebrow="Finance"
        title="Payment plans"
        description="Families paying a term's fees in 2 to 5 parts. Missed payments wait here for you to add the default fee or waive it."
      />
      <PolicyExcerpt policy="families" section="late-payment" />

      {missedErr ? (
        <Alert tone="warning" title={setupMissing ? "Payment plans aren't set up yet" : "Missed payments couldn't be loaded"}>
          {planError(missedErr.message)}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active plans" value={plans.length} icon={CalendarClock} tone="blue" />
        <StatCard label="Missed, waiting for you" value={missed.length} icon={AlertTriangle} tone={missed.length ? "rose" : "slate"} />
        <StatCard label="Default fees added (latest 20)" value={charged.length} icon={CheckCircle2} tone="slate" />
      </div>

      <Card>
        <CardHeader
          title="Missed payments"
          description="Check the bank first: a payment that arrived on time but isn't recorded yet should be recorded, not charged. Tick the ones to charge."
        />
        {missed.length ? (
          <form action={chargeDefaultAction}>
            <input type="hidden" name="back" value="/admin/finance/payment-plans" />
            <ul className="divide-y divide-slate-100">
              {missed.map((m) => {
                const g = parent.get(m.guardian_id);
                return (
                  <li key={m.instalment_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input type="checkbox" name="instalment_id" value={m.instalment_id} className="mt-1" aria-label={`Charge default fee for ${pupil.get(m.student_id ?? "") ?? "this pupil"}, payment ${m.seq}`} />
                      <span className="min-w-0 text-sm">
                        <span className="font-semibold text-slate-900">{pupil.get(m.student_id ?? "") ?? "Pupil"}</span>{" "}
                        <span className="text-slate-500">
                          · {g?.full_name ?? "Parent"}
                          {g?.phone ? ` · ${g.phone}` : ""}
                        </span>
                        <span className="mt-0.5 block text-slate-700">
                          Payment {m.seq} of {m.instalments} was due {day(m.due_date)}. Due so far {fmtMoney(m.due_so_far)}, paid {fmtMoney(m.paid)}: short by{" "}
                          <span className="font-semibold">{fmtMoney(Number(m.due_so_far) - Number(m.paid))}</span>.
                        </span>
                        <span className="mt-0.5 block text-slate-500">Default fee if charged: {fmtMoney(m.default_fee)}</span>
                      </span>
                    </label>
                    <Link href={`/admin/finance/invoices/${m.invoice_id}#payment-plan`} className="gf-link shrink-0 text-sm">
                      Open {m.invoice_no ?? "invoice"} (to waive)
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
              <SubmitButton variant="danger" pendingText="Adding fees…">
                Add default fees for the ticked payments
              </SubmitButton>
              <span className="text-sm text-slate-500">Each parent is told on the portal and by email, with a default letter.</span>
            </div>
          </form>
        ) : (
          <EmptyState icon={CheckCircle2} title="No missed payments" description="Every plan is up to date, or each missed payment already has a decision." />
        )}
      </Card>

      {charged.length ? (
        <Card>
          <CardHeader title="Default fees added recently" description="Open a letter to print it for the family's file." />
          <ul className="divide-y divide-slate-100">
            {charged.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm sm:px-6">
                <span>
                  {fmtMoney(c.amount)} on {invNo.get(c.invoice_id) ?? "an invoice"}, by {c.decided_by_name ?? "an admin"}, {formatLagosDateTime(c.decided_at)}
                </span>
                <Link href={`/admin/finance/payment-plans/letter/${c.id}`} className="gf-link">
                  Default letter
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Active plans" description="Set up a plan from the invoice page (paper agreement) or the parent chooses one on the portal." />
        {plansRes.error ? (
          <div className="px-5 py-4 sm:px-6">
            <Alert tone="warning">{planError(plansRes.error)}</Alert>
          </div>
        ) : plans.length ? (
          <ul className="divide-y divide-slate-100">
            {plans.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span>
                  <span className="font-semibold text-slate-900">{pupil.get(p.finance_invoices?.student_id ?? "") ?? "Pupil"}</span>{" "}
                  <span className="text-slate-500">· {p.instalments} payments of {fmtMoney(p.plan_total)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={p.agreed_via === "portal" ? "blue" : "slate"}>{p.agreed_via === "portal" ? "Chosen on the portal" : "Paper agreement"}</Badge>
                  <Link href={`/admin/finance/invoices/${p.invoice_id}#payment-plan`} className="gf-link">
                    {p.finance_invoices?.invoice_no ?? "Invoice"}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={CalendarClock} title="No payment plans yet" description="Open an invoice and use Payment plan, or parents can choose one on the portal before term starts." />
        )}
      </Card>
    </div>
  );
}
