import { Plus, Receipt } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import UrlToast from "@/components/url-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtDateTime, fmtMoney } from "../_components/finance-ui";

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
};

export default async function AdminFinanceExpensesPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("finance_expenses")
    .select("id, category_id, vendor_name, description, amount, currency, method, reference, spent_at")
    .order("spent_at", { ascending: false })
    .limit(200);

  const expenses = (data ?? []) as ExpenseRow[];

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance", label: "Back to finance" }}
        eyebrow="Finance"
        title="Expenses"
        description="Recent spending records."
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
                      {e.description ?? "—"}
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                      {fmtMoney(e.amount, e.currency)}
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
