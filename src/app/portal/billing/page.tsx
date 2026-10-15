import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, CreditCard, History, Receipt, Wallet } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { buttonClasses } from "@/components/ui/button";
import SubmitButton from "@/components/submit-button";
import { PortalPageHeader, portalMessages, statusBadge } from "../_components/portal-ui";
import CopyReferenceButton from "./CopyReferenceButton";

type InvoiceBalanceRow = {
  invoice_id: string;
  invoice_no: string | null;
  issue_date: string;
  due_date: string | null;
  status: string;
  currency: string;
  invoice_total: number;
  allocated_total: number;
  balance: number;
};

type IntentRow = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

type PaymentRow = {
  id: string;
  paid_at: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  provider: string | null;
  reference: string | null;
};

function asMoney(n: number) {
  return Number(n ?? 0).toLocaleString("en-NG");
}

function money(currency: string | null | undefined, n: number) {
  const cur = String(currency ?? "NGN").toUpperCase();
  return cur === "NGN" ? `₦${asMoney(n)}` : `${cur} ${asMoney(n)}`;
}

function BillingNotice({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <PortalPageHeader title="Fees & billing" />
      <Card>
        <EmptyState icon={Receipt} title="Billing isn't available" description={message} />
      </Card>
    </div>
  );
}

export default async function PortalBillingPage({
  searchParams
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: identityRows, error: identityError } = await supabase.rpc("portal_identity");
  const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : identityRows) as {
    role?: string | null;
    guardian_id?: string | null;
  } | null;

  const role = identity?.role ?? null;

  if (role === "student") {
    redirect("/portal");
  }

  if (identityError) {
    return <BillingNotice message="We couldn't load your account details. Please reload the page in a moment." />;
  }

  if (role !== "parent") {
    return <BillingNotice message="Billing is available for parent and guardian accounts." />;
  }

  const guardianId = identity?.guardian_id ?? undefined;

  if (!guardianId) {
    return <BillingNotice message={portalMessages.noGuardian} />;
  }

  const { data } = await supabase
    .from("finance_invoice_balances")
    .select("invoice_id, invoice_no, issue_date, due_date, status, currency, invoice_total, allocated_total, balance")
    .eq("bill_to_guardian_id", guardianId)
    .order("issue_date", { ascending: false })
    .limit(200);

  const invoices = (data ?? []) as InvoiceBalanceRow[];

  async function payNow(formData: FormData) {
    "use server";

    const invoiceId = String(formData.get("invoice_id") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").trim() || "0");
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";

    if (!invoiceId) return;
    if (!Number.isFinite(amount) || amount <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: guardianLink } = await supabase
      .from("guardian_user_links")
      .select("guardian_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const guardianId = guardianLink?.guardian_id as string | undefined;
    if (!guardianId) return;

    const reference = globalThis.crypto?.randomUUID
      ? `MP-${globalThis.crypto.randomUUID()}`
      : `MP-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error } = await supabase.from("finance_payment_intents").insert({
      provider: "moniepoint",
      reference,
      invoice_id: invoiceId,
      guardian_id: guardianId,
      amount,
      currency,
      status: "created"
    });

    if (error) return;

    revalidatePath("/portal/billing");

    redirect(`/portal/billing?ref=${encodeURIComponent(reference)}`);
  }

  const { data: recentIntents } = await supabase
    .from("finance_payment_intents")
    .select("id, reference, amount, currency, status, created_at")
    .eq("provider", "moniepoint")
    .eq("guardian_id", guardianId)
    .order("created_at", { ascending: false })
    .limit(20);

  const intentRows = (recentIntents ?? []) as IntentRow[];

  const { data: payments } = await supabase
    .from("finance_payment_transactions")
    .select("id, paid_at, amount, currency, status, method, provider, reference")
    .eq("guardian_id", guardianId)
    .order("paid_at", { ascending: false })
    .limit(50);

  const paymentRows = (payments ?? []) as PaymentRow[];

  const createdIntent = ref
    ? intentRows.find((r) => r.reference === ref) ?? null
    : null;

  const openInvoices = invoices.filter((inv) => inv.status !== "void" && Number(inv.balance ?? 0) > 0);
  const outstanding = openInvoices.reduce((acc, inv) => acc + Number(inv.balance ?? 0), 0);

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Fees & billing"
        description="See your invoices, pay what's due and keep track of payments."
      />

      {ref ? (
        <Card className="border-brand-green-200 bg-brand-green-50/40">
          <CardBody>
            <div className="flex items-start gap-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-green text-white">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-brand-green-700">Payment reference created</div>
                <div className="mt-1 break-all font-mono text-lg font-semibold text-slate-900">{ref}</div>
                <p className="mt-2 text-sm text-slate-600">
                  Use this as your Moniepoint <span className="font-semibold">merchantReference</span>.
                  {createdIntent ? (
                    <>
                      {" "}
                      Amount: <span className="font-semibold">{money(createdIntent.currency, createdIntent.amount)}</span>.
                    </>
                  ) : null}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <CopyReferenceButton value={ref} />
                  <Link className={buttonClasses({ variant: "ghost", size: "md" })} href="/portal/billing">
                    Done
                  </Link>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Outstanding"
          value={outstanding > 0 ? `₦${asMoney(outstanding)}` : "All paid"}
          hint={outstanding > 0 ? `${openInvoices.length} invoice${openInvoices.length === 1 ? "" : "s"} to settle` : "Thank you!"}
          icon={Wallet}
          tone={outstanding > 0 ? "gold" : "green"}
        />
        <StatCard label="Payments recorded" value={paymentRows.length} icon={History} tone="blue" />
      </div>

      <Card>
        <CardHeader title="Invoices" description="Tap Pay to get a payment reference for an invoice." />
        {invoices.length ? (
          <ul className="divide-y divide-slate-100">
            {invoices.map((inv) => {
              const badge = statusBadge(inv.status);
              const due = inv.balance > 0;
              return (
                <li
                  key={inv.invoice_id}
                  className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:px-6"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <span
                      className={
                        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " +
                        (due ? "bg-brand-gold-50 text-brand-gold-700" : "bg-brand-green-50 text-brand-green-600")
                      }
                    >
                      <Receipt className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{inv.invoice_no ?? inv.invoice_id}</span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>Issued {formatLagosDate(inv.issue_date)}</span>
                        <span>Due {inv.due_date ? formatLagosDate(inv.due_date) : "—"}</span>
                        <span>Total {money(inv.currency, inv.invoice_total)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <div className="text-xs text-slate-500">Balance</div>
                      <div className={"text-lg font-bold tabular-nums " + (due ? "text-slate-900" : "text-slate-400")}>
                        {money(inv.currency, inv.balance)}
                      </div>
                    </div>
                    {due ? (
                      <form action={payNow}>
                        <input type="hidden" name="invoice_id" value={inv.invoice_id} />
                        <input type="hidden" name="amount" value={String(inv.balance)} />
                        <input type="hidden" name="currency" value={inv.currency} />
                        <SubmitButton variant="primary" size="lg" pendingText="Preparing…">
                          <span className="inline-flex items-center gap-2">
                            <CreditCard className="h-5 w-5" aria-hidden="true" />
                            Pay
                          </span>
                        </SubmitButton>
                      </form>
                    ) : (
                      <Badge tone="green" dot>
                        Paid
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Receipt} title="No invoices yet" description="Invoices from the school will appear here." />
        )}
      </Card>

      <Card>
        <CardHeader title="Payment history" description="Payments recorded against your account." />
        {paymentRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((p) => {
                  const badge = statusBadge(p.status);
                  return (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">{formatLagosDate(p.paid_at)}</td>
                      <td className="capitalize">{p.method ?? p.provider ?? "—"}</td>
                      <td className="font-mono text-xs text-slate-900">{p.reference ?? "—"}</td>
                      <td>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td className="text-right font-semibold tabular-nums text-slate-900">{money(p.currency, p.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={History} title="No payments yet" />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Payment references"
          description="Created each time you tap Pay. Use the reference as the Moniepoint merchantReference."
        />
        {intentRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[520px]">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {intentRows.map((pi) => {
                  const badge = statusBadge(pi.status);
                  return (
                    <tr key={pi.id}>
                      <td className="font-mono text-xs text-slate-900">{pi.reference}</td>
                      <td className="whitespace-nowrap">{formatLagosDate(pi.created_at)}</td>
                      <td>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td className="text-right font-semibold tabular-nums text-slate-900">{money(pi.currency, pi.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={CreditCard} title="No references yet" />
        )}
      </Card>
    </div>
  );
}
