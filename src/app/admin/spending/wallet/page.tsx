import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { LEARN } from "@/lib/learn-guides";
import { formatLagosDate, formatLagosDateTime } from "@/lib/lagos-dates";
import { paystackConfigured, walletBalance } from "@/lib/paystack";
import { VOID_TOPUP_REASONS, lagosToday, naira } from "@/lib/spending";
import { loadViewer } from "../_data";
import { recordTopupAction, voidTopupAction } from "../actions";

// The Paystack expenses wallet: its balance (Paystack is the record), the top-ups from the main account, and what
// was paid out of it, so the two can be compared.

export default async function SpendingWalletPage({ searchParams }: { searchParams?: { toast?: string } }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const me = await loadViewer(supabase);
  if (!me) return null;
  if (!me.canPay && !me.isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: "/admin/spending", label: "Back to spending requests" }} title="Expenses wallet" />
        <Alert tone="info">Only cashiers and admins can see the wallet.</Alert>
      </div>
    );
  }

  const monthStart = `${lagosToday().slice(0, 7)}-01`;
  const [balance, topRes, paidRes, setRes] = await Promise.all([
    walletBalance(),
    supabase.from("spending_wallet_topups").select("*").order("topped_on", { ascending: false }).limit(100),
    supabase
      .from("spending_requests")
      .select("id, request_no, payee_name, amount, charge, paid_at, pay_reference")
      .eq("pay_method", "paystack")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(100),
    supabase.from("spending_settings").select("low_balance_alert").eq("id", 1).maybeSingle()
  ]);
  const topups = (topRes.data ?? []) as Array<{
    id: string;
    amount: number;
    topped_on: string;
    reference: string | null;
    note: string | null;
    recorded_by_name: string | null;
    recorded_at: string;
    voided_at: string | null;
    void_reason: string | null;
  }>;
  const paid = (paidRes.data ?? []) as Array<{ id: string; request_no: string; payee_name: string; amount: number; charge: number; paid_at: string; pay_reference: string | null }>;
  const inMonth = topups.filter((t) => !t.voided_at && t.topped_on >= monthStart).reduce((s, t) => s + Number(t.amount), 0);
  const outMonth = paid.filter((p) => p.paid_at.slice(0, 10) >= monthStart).reduce((s, p) => s + Number(p.amount) + Number(p.charge), 0);
  const low = setRes.data?.low_balance_alert;

  return (
    <div className="space-y-6">
      <UrlToast key={searchParams?.toast ?? "none"} />
      <PageHeader
        learn={LEARN.paystackWallet}
        back={{ href: "/admin/spending", label: "Back to spending requests" }}
        eyebrow="Spending requests"
        title="Expenses wallet"
        description="The Paystack balance that expense payments come from. Top it up from the school's main account and record each top-up here."
      />
      {!paystackConfigured() ? <Alert tone="info">Paystack isn&apos;t connected yet, so the balance can&apos;t be shown. Top-ups can still be recorded.</Alert> : null}
      {balance != null && low != null && balance < Number(low) ? (
        <Alert tone="warning" title="The wallet is running low">
          {naira(balance)} left, below the {naira(low)} warning level. Move money in from the main account.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Balance at Paystack" value={balance == null ? "—" : naira(balance)} icon={Wallet} tone="green" />
        <StatCard label="Topped up this month" value={naira(inMonth)} icon={ArrowDownToLine} tone="blue" />
        <StatCard label="Paid out this month (with charges)" value={naira(outMonth)} icon={ArrowUpFromLine} tone="gold" />
      </div>

      <Card>
        <CardHeader title="Record a top-up" description="Moving the school's own money into the wallet. It is not spending, so it isn't an expense." />
        <CardBody>
          <form action={recordTopupAction} className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <label className="block">
              <span className="gf-label">Amount (₦)</span>
              <input className="gf-input text-right tabular-nums" name="amount" inputMode="decimal" required />
            </label>
            <label className="block">
              <span className="gf-label">Date</span>
              <input className="gf-input" type="date" name="topped_on" required max={lagosToday()} defaultValue={lagosToday()} />
            </label>
            <label className="block">
              <span className="gf-label">Bank reference</span>
              <input className="gf-input" name="reference" maxLength={80} />
            </label>
            <SubmitButton pendingText="Saving…">Record top-up</SubmitButton>
          </form>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top-ups" />
          {topups.length ? (
            <ul className="divide-y divide-slate-100">
              {topups.map((t) => (
                <li key={t.id} className="px-4 py-3 text-sm sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className={t.voided_at ? "text-slate-400 line-through" : "font-semibold tabular-nums"}>{naira(t.amount)}</span>
                    {t.voided_at ? <Badge tone="slate">Marked as a mistake</Badge> : <span className="text-xs text-slate-500">{formatLagosDate(`${t.topped_on}T12:00:00Z`)}</span>}
                  </div>
                  <p className="text-xs text-slate-500">
                    {t.reference ? `${t.reference} · ` : ""}recorded by {t.recorded_by_name} · {formatLagosDateTime(t.recorded_at)}
                  </p>
                  {!t.voided_at ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-slate-600">Mark as a mistake</summary>
                      <form action={voidTopupAction} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <select className="gf-select" name="reason" required defaultValue="">
                          <option value="" disabled>
                            Why?
                          </option>
                          {VOID_TOPUP_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <input className="gf-input" name="note" maxLength={300} placeholder="Note (for Other)" />
                        <SubmitButton variant="ghost" size="sm" pendingText="Saving…">
                          Mark
                        </SubmitButton>
                      </form>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-sm text-slate-600">None recorded yet.</p>
            </CardBody>
          )}
        </Card>
        <Card>
          <CardHeader title="Paid through Paystack" description="Compare with the Paystack dashboard's transfers." />
          {paid.length ? (
            <ul className="divide-y divide-slate-100">
              {paid.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
                  <div className="min-w-0">
                    <Link href={`/admin/spending/${p.id}`} className="gf-link font-semibold">
                      {p.request_no}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {p.payee_name} · {formatLagosDateTime(p.paid_at)}
                    </p>
                  </div>
                  <span className="text-right tabular-nums">
                    {naira(p.amount)}
                    {Number(p.charge) ? <span className="block text-xs text-slate-500">+ {naira(p.charge)} charge</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-sm text-slate-600">Nothing paid through Paystack yet.</p>
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
