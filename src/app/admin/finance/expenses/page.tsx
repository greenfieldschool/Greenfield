import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import SubmitButton from "@/components/submit-button";
import { VOID_EXPENSE_REASONS } from "@/lib/spending";
import { voidExpenseAction } from "../../spending/actions";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import UrlToast from "@/components/url-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtDateTime, fmtMoney } from "../_components/finance-ui";
import { LEARN } from "@/lib/learn-guides";

type ExpenseRow = {
  id: string;
  category_id: string | null;
  vendor_name: string | null;
  description: string | null;
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  spent_at: string;
  voided_at: string | null;
  void_reason: string | null;
  spending_request_id: string | null;
  spending_requests?: { request_no: string } | null;
};

export default async function AdminFinanceExpensesPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("finance_expenses")
    .select("id, category_id, vendor_name, description, amount, currency, method, reference, spent_at, voided_at, void_reason, spending_request_id, spending_requests(request_no)")
    .order("spent_at", { ascending: false })
    .limit(200);

  const expenses = (data ?? []) as unknown as ExpenseRow[];

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.expenses}
        back={{ href: "/admin/finance", label: "Back to finance" }}
        eyebrow="Finance"
        title="Expenses"
        description="Recent spending records. Spending requests add their receipts here when they close. A mistake is voided with a reason, never deleted."
        actions={
          <ButtonLink href="/admin/finance/expenses/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New expense
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader title="Recent expenses" description={`${expenses.length} shown (latest 200)`} />
        {expenses.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(e.spent_at)}</td>
                    <td className="max-w-[220px] truncate font-medium text-slate-900" title={e.vendor_name ?? ""}>
                      {e.vendor_name ?? "—"}
                    </td>
                    <td className="max-w-[320px] truncate" title={e.description ?? ""}>
                      {e.spending_request_id ? (
                        <Link href={`/admin/spending/${e.spending_request_id}`} className="gf-link mr-1">
                          {e.spending_requests?.request_no ?? "Request"}
                        </Link>
                      ) : null}
                      {e.description ?? "—"}
                    </td>
                    <td className={`whitespace-nowrap text-right font-semibold tabular-nums ${e.voided_at ? "text-slate-400 line-through" : "text-slate-900"}`}>
                      {fmtMoney(e.amount, e.currency)}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {e.voided_at ? (
                        <Badge tone="slate">Voided</Badge>
                      ) : e.spending_request_id ? null : (
                        <details className="text-left">
                          <summary className="cursor-pointer text-xs text-slate-600">Void</summary>
                          <form action={voidExpenseAction} className="mt-2 space-y-2">
                            <input type="hidden" name="id" value={e.id} />
                            <select className="gf-select" name="reason" required defaultValue="">
                              <option value="" disabled>
                                Why?
                              </option>
                              {VOID_EXPENSE_REASONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <input className="gf-input" name="note" maxLength={300} placeholder="Note (for Other)" />
                            <SubmitButton variant="ghost" size="sm" pendingText="Voiding…">
                              Void this expense
                            </SubmitButton>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No expenses yet"
            description="Spending you log will show up here."
            action={
              <ButtonLink href="/admin/finance/expenses/new" size="sm">
                New expense
              </ButtonLink>
            }
          />
        )}
      </Card>
    </div>
  );
}
