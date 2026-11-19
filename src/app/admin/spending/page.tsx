import Link from "next/link";
import { AlertTriangle, CheckCheck, HandCoins, Plus, Receipt, Settings2, Wallet } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { LEARN } from "@/lib/learn-guides";
import { formatLagosDate } from "@/lib/lagos-dates";
import {
  KIND_LABEL,
  REQUEST_LIST_COLUMNS,
  STATUS_LABEL,
  STATUS_TONE,
  categoryName,
  lagosToday,
  naira,
  spendingError,
  type RequestRow,
  type SpendingStatus
} from "@/lib/spending";
import { loadViewer } from "./_data";
import { emailPreferenceAction } from "./actions";

// Spending requests: every staff member's own requests, and the queues for approvers and cashiers.

type SP = { tab?: string; status?: string; toast?: string };
type Tab = "mine" | "approve" | "pay" | "check" | "all";

export default async function SpendingPage({ searchParams }: { searchParams?: SP }) {
  const sp = searchParams ?? {};
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const me = await loadViewer(supabase);
  if (!me) return null;

  const [{ data: countsRaw, error: countsErr }, settingsRes, prefRes] = await Promise.all([
    supabase.rpc("spending_my_counts"),
    supabase.from("spending_settings").select("second_approval_above").eq("id", 1).maybeSingle(),
    supabase.from("email_preferences").select("spending").eq("user_id", me.userId).maybeSingle()
  ]);
  const counts = (countsRaw ?? { to_approve: 0, to_pay: 0, to_check: 0, mine_to_do: 0 }) as Record<string, number>;
  const second = Number(settingsRes.data?.second_approval_above ?? 250000);
  const emailsOn = prefRes.data?.spending !== false;

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [{ key: "mine", label: "My requests", count: counts.mine_to_do || undefined }];
  if (me.limit > 0) tabs.push({ key: "approve", label: "To approve", count: counts.to_approve });
  if (me.canPay) tabs.push({ key: "pay", label: "To pay", count: counts.to_pay });
  if (me.canPay || me.limit > 0) tabs.push({ key: "check", label: "Receipts to check", count: counts.to_check });
  if (me.seesAll) tabs.push({ key: "all", label: "All requests" });
  const defaultTab: Tab = counts.to_approve && me.limit > 0 ? "approve" : counts.to_pay && me.canPay ? "pay" : "mine";
  const tab: Tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : defaultTab;
  const statusFilter = tab === "all" && sp.status && sp.status in STATUS_LABEL ? (sp.status as SpendingStatus) : null;

  let q = supabase.from("spending_requests").select(REQUEST_LIST_COLUMNS).order("submitted_at", { ascending: tab !== "mine" && tab !== "all" }).limit(300);
  if (tab === "mine") q = q.eq("requester_id", me.userId);
  if (tab === "approve") q = q.eq("status", "submitted").neq("requester_id", me.userId);
  if (tab === "pay") q = q.in("status", ["approved", "paying"]).neq("requester_id", me.userId);
  if (tab === "check") q = q.eq("status", "checking").neq("requester_id", me.userId);
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data, error } = await q;
  let rows = (data ?? []) as unknown as RequestRow[];

  if (tab === "approve") {
    const ids = rows.map((r) => r.id);
    const { data: mine } = ids.length
      ? await supabase.from("spending_approvals").select("request_id").eq("approver_id", me.userId).is("withdrawn_at", null).in("request_id", ids)
      : { data: [] };
    const done = new Set((mine ?? []).map((a) => a.request_id as string));
    rows = rows.filter((r) => !done.has(r.id) && me.limit >= Math.min(Number(r.amount), second));
  }

  let withStaff = 0;
  let overdue = 0;
  if (me.seesAll) {
    const { data: open } = await supabase.from("spending_requests").select("amount, due_by").eq("kind", "advance").in("status", ["paid", "checking"]);
    const today = lagosToday();
    for (const r of open ?? []) {
      withStaff += Number(r.amount);
      if (r.due_by && r.due_by < today) overdue += 1;
    }
  }

  const missing = me.missing || Boolean(countsErr && /does not exist|schema cache|could not find/i.test(countsErr.message));
  const today = lagosToday();

  return (
    <div className="space-y-6">
      <UrlToast key={sp.toast ?? "none"} />
      <PageHeader
        learn={LEARN.spending}
        eyebrow="Money"
        title="Spending requests"
        description="Ask for money for school spending, and follow it from approval to payment to receipts."
        actions={
          <>
            {me.canPay || me.isAdmin ? (
              <ButtonLink href="/admin/spending/wallet" variant="secondary">
                <Wallet className="h-4 w-4" aria-hidden="true" />
                Wallet
              </ButtonLink>
            ) : null}
            {me.isAdmin ? (
              <ButtonLink href="/admin/spending/settings" variant="secondary">
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                Who approves
              </ButtonLink>
            ) : null}
            <ButtonLink href="/admin/spending/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ask for money
            </ButtonLink>
          </>
        }
      />

      {missing ? (
        <Alert tone="warning" title="This needs a database update">
          {spendingError("does not exist")}
        </Alert>
      ) : null}

      {me.seesAll ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {me.limit > 0 ? <StatCard label="Waiting for your approval" value={counts.to_approve} icon={CheckCheck} tone="gold" href="/admin/spending?tab=approve" /> : null}
          {me.canPay ? <StatCard label="Approved, to pay" value={counts.to_pay} icon={HandCoins} tone="blue" href="/admin/spending?tab=pay" /> : null}
          {me.canPay || me.limit > 0 ? <StatCard label="Receipts to check" value={counts.to_check} icon={Receipt} tone="violet" href="/admin/spending?tab=check" /> : null}
          <StatCard
            label="Money with staff"
            value={naira(withStaff)}
            hint={overdue ? `${overdue} advance${overdue === 1 ? "" : "s"} overdue` : "Advances not yet accounted for"}
            icon={overdue ? AlertTriangle : Wallet}
            tone={overdue ? "rose" : "green"}
            href="/admin/spending?tab=all&status=paid"
          />
        </div>
      ) : null}

      <Card>
        <div className="px-4 pt-2 sm:px-6">
          <LinkTabs tabs={tabs.map((t) => ({ ...t, href: `/admin/spending?tab=${t.key}` }))} active={tab} />
        </div>
        {tab === "all" ? (
          <div className="flex flex-wrap gap-2 px-4 pt-4 sm:px-6">
            <Link href="/admin/spending?tab=all" className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${!statusFilter ? "bg-brand-green-50 text-brand-green-700 ring-brand-green-200" : "text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
              Everything
            </Link>
            {(Object.keys(STATUS_LABEL) as SpendingStatus[]).map((s) => (
              <Link
                key={s}
                href={`/admin/spending?tab=all&status=${s}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${statusFilter === s ? "bg-brand-green-50 text-brand-green-700 ring-brand-green-200" : "text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
              >
                {STATUS_LABEL[s]}
              </Link>
            ))}
          </div>
        ) : null}
        {error && !missing ? (
          <CardBody>
            <Alert tone="danger">{spendingError(error.message)}</Alert>
          </CardBody>
        ) : rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const late = r.status === "paid" && r.due_by && r.due_by < today;
              return (
                <li key={r.id}>
                  <Link href={`/admin/spending/${r.id}`} className="flex flex-col gap-2 px-4 py-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-slate-900">{r.request_no}</span>
                        <span className="text-slate-500">{KIND_LABEL[r.kind]}</span>
                        {r.flags.length && tab !== "mine" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-gold-800">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            {r.flags.length} to look at
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-slate-700">{r.purpose}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {tab === "mine" ? "" : `${r.requester_name ?? "Staff"} · `}
                        {categoryName(r)} · asked {formatLagosDate(r.submitted_at)}
                        {r.status === "paid" && r.due_by ? ` · receipts due ${formatLagosDate(`${r.due_by}T12:00:00Z`)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <span className="text-base font-semibold tabular-nums text-slate-900">{naira(r.amount)}</span>
                      <Badge tone={late ? "red" : STATUS_TONE[r.status]} dot>
                        {late ? "Receipts overdue" : STATUS_LABEL[r.status]}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <CardBody>
            <EmptyState
              icon={HandCoins}
              title={tab === "mine" ? "You haven't asked for money yet" : "Nothing waiting here"}
              description={tab === "mine" ? "Ask for an advance, a payment to a supplier, or to be paid back for something you bought." : "New requests appear here as soon as they need you."}
              action={tab === "mine" ? <ButtonLink href="/admin/spending/new">Ask for money</ButtonLink> : undefined}
            />
          </CardBody>
        )}
      </Card>

      <form action={emailPreferenceAction} className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <input type="hidden" name="on" value={emailsOn ? "0" : "1"} />
        <span>{emailsOn ? "You get emails about spending requests that need you." : "Spending request emails are off for you."}</span>
        <SubmitButton variant="ghost" size="sm" pendingText="Saving…">
          {emailsOn ? "Turn emails off" : "Turn emails on"}
        </SubmitButton>
      </form>
    </div>
  );
}
