import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, UserCheck, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { toneStyles, type Tone } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";

const sections: Array<{ href: string; title: string; description: string; icon: LucideIcon; tone: Tone }> = [
  { href: "/admin/exams/tests", title: "Tests", description: "Create tests and questions.", icon: FileText, tone: "violet" },
  {
    href: "/admin/exams/sessions",
    title: "Sessions",
    description: "Schedule sessions and manage conductors.",
    icon: CalendarClock,
    tone: "gold"
  },
  {
    href: "/admin/exams/conductors",
    title: "Conductors",
    description: "Create and link conductors to user accounts.",
    icon: UserCheck,
    tone: "blue"
  }
];

export default async function AdminExamsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Exams" title="Exam portal" description="Create tests, schedule sessions, and review attempts." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-green-200 hover:shadow-lift"
          >
            <span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-xl", toneStyles[s.tone].icon)}>
              <s.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="mt-4 text-base font-semibold text-slate-900">{s.title}</span>
            <span className="mt-1 text-sm text-slate-600">{s.description}</span>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-green-700">
              Open
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
