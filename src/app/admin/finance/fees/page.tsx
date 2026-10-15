import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  Layers,
  PieChart,
  School,
  Tags,
  TableProperties,
  type LucideIcon
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toneStyles, type Tone } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";

const items: Array<{ href: string; label: string; description: string; icon: LucideIcon; tone: Tone }> = [
  { href: "/admin/finance/fees/classes", label: "Classes", description: "Manage Year/JSS/SS class names.", icon: School, tone: "blue" },
  {
    href: "/admin/finance/fees/components",
    label: "Fee components",
    description: "Breakdowns like Tuition, Books, Transport…",
    icon: Layers,
    tone: "green"
  },
  {
    href: "/admin/finance/fees/schedules",
    label: "Fee schedules",
    description: "Define per-class fees per term or annual.",
    icon: TableProperties,
    tone: "gold"
  },
  {
    href: "/admin/finance/fees/revenue-categories",
    label: "Revenue categories",
    description: "Buckets used for fee component mapping & reporting.",
    icon: Tags,
    tone: "violet"
  },
  {
    href: "/admin/finance/fees/budget-sectors",
    label: "Budget sectors",
    description: "Expense categories for budgets and spending.",
    icon: PieChart,
    tone: "rose"
  },
  {
    href: "/admin/finance/fees/academic-years",
    label: "Academic years",
    description: "Manage academic years and terms.",
    icon: CalendarRange,
    tone: "slate"
  }
];

export default function AdminFinanceFeesHomePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/finance", label: "Back to finance" }}
        eyebrow="Finance"
        title="Fee setup"
        description="Configure class names (Year 1… / JSS1… / SS3…), fee components (Tuition, Books, Transport…), and fee schedules per term or annual."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="group flex items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-green-200 hover:shadow-lift"
          >
            <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", toneStyles[it.tone].icon)}>
              <it.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">
                {it.label}
                <ArrowRight
                  className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-green"
                  aria-hidden="true"
                />
              </span>
              <span className="mt-0.5 block text-sm text-slate-500">{it.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
