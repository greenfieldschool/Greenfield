import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FinanceStatusBadge, fmtDate, fmtMoney } from "../_components/finance-ui";

type InvoiceBalanceRow = {
  invoice_id: string;
  invoice_no: string;
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

export default async function AdminFinanceInvoicesPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("finance_invoice_balances")
    .select(
      "invoice_id, invoice_no, bill_to_guardian_id, student_id, issue_date, due_date, status, currency, invoice_total, allocated_total, balance"
    )
    .order("issue_date", { ascending: false })
    .limit(200);

  const invoices = (data ?? []) as InvoiceBalanceRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/finance", label: "Back to finance" }}
        eyebrow="Finance"
        title="Invoices"
        description="Most recent invoices and balances."
        actions={
          <ButtonLink href="/admin/finance/invoices/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New invoice
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader title="Recent invoices" description={`${invoices.length} shown (latest 200)`} />
        {invoices.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoice_id}>
                    <td>
                      <Link href={`/admin/finance/invoices/${inv.invoice_id}`} className="gf-link">
                        {inv.invoice_no}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{fmtDate(inv.issue_date)}</td>
                    <td className="whitespace-nowrap">{inv.due_date ? fmtDate(inv.due_date) : "—"}</td>
                    <td>
                      <FinanceStatusBadge status={inv.status} />
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{fmtMoney(inv.invoice_total, inv.currency)}</td>
                    <td
                      className={
                        "whitespace-nowrap text-right font-semibold tabular-nums " +
                        (Number(inv.balance ?? 0) > 0 ? "text-slate-900" : "text-slate-400")
                      }
                    >
                      {fmtMoney(inv.balance, inv.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Invoices you create for guardians and students will appear here."
            action={
              <ButtonLink href="/admin/finance/invoices/new" size="sm">
                New invoice
              </ButtonLink>
            }
          />
        )}
      </Card>
    </div>
  );
}
