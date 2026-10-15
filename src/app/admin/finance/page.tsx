import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Receipt,
  Settings2,
  UserX,
  Wallet,
  type LucideIcon
} from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, toneStyles, type Tone } from "@/components/ui/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const sections: Array<{ href: string; label: string; description: string; icon: LucideIcon; tone: Tone }> = [
  {
    href: "/admin/finance/invoices",
    label: "Invoices",
    description: "Create and manage bills per guardian/student.",
    icon: FileText,
    tone: "blue"
  },
  {
    href: "/admin/finance/payments",
    label: "Payments",
    description: "Record payments and allocate across invoices.",
    icon: Wallet,
    tone: "green"
  },
  {
    href: "/admin/finance/expenses",
    label: "Expenses",
    description: "Log spending and categorize expenses.",
    icon: Receipt,
    tone: "violet"
  },
  {
    href: "/admin/finance/debtors",
    label: "Debtors",
    description: "Find outstanding balances and follow up.",
    icon: UserX,
    tone: "rose"
  },
  {
    href: "/admin/finance/fees",
    label: "Fee setup",
    description: "Configure classes, fee components, and schedules.",
    icon: Settings2,
    tone: "gold"
  }
];

export default async function AdminFinancePage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const [{ count: invoiceCount }, { count: paymentCount }, { count: expenseCount }] = await Promise.all([
    supabase.from("finance_invoices").select("id", { count: "exact", head: true }),
    supabase.from("finance_payment_transactions").select("id", { count: "exact", head: true }),
    supabase.from("finance_expenses").select("id", { count: "exact", head: true })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Overview"
        description="Track invoices, payments, expenses, budgets, and debtors. More dashboards will appear here as we build out the module."
        actions={
          <>
            <ButtonLink href="/admin/finance/invoices/new" variant="secondary">
              <FileText className="h-4 w-4" aria-hidden="true" />
              New invoice
            </ButtonLink>
            <ButtonLink href="/admin/finance/payments/new">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              Record payment
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Invoices"
          value={<span className="tabular-nums">{(invoiceCount ?? 0).toLocaleString("en-NG")}</span>}
          icon={FileText}
          tone="blue"
          href="/admin/finance/invoices"
        />
        <StatCard
          label="Payments"
          value={<span className="tabular-nums">{(paymentCount ?? 0).toLocaleString("en-NG")}</span>}
          icon={Wallet}
          tone="green"
          href="/admin/finance/payments"
        />
        <StatCard
          label="Expenses"
          value={<span className="tabular-nums">{(expenseCount ?? 0).toLocaleString("en-NG")}</span>}
          icon={Receipt}
          tone="violet"
          href="/admin/finance/expenses"
        />
      </div>

      <section aria-labelledby="finance-sections">
        <h2 id="finance-sections" className="text-sm font-semibold text-slate-900">
          Finance areas
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-green-200 hover:shadow-lift"
            >
              <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", toneStyles[s.tone].icon)}>
                <s.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                  {s.label}
                  <ArrowRight
                    className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-green"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-0.5 block text-sm text-slate-500">{s.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
