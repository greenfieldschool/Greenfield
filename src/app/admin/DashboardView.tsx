import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  FileSpreadsheet,
  GraduationCap,
  Inbox,
  School,
  Timer,
  UserPlus,
  Wallet,
  type LucideIcon
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard, toneStyles, type Tone } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export type DashboardData = {
  greetingName: string;
  isAdmin: boolean;
  todayLabel: string;
  stats: {
    activeStudents: number | null;
    classes: number | null;
    pendingApplications: number | null;
    openExamSessions: number | null;
  };
  attendanceToday: { present: number; absent: number; late: number; expected: number } | null;
  openSessions: Array<{ id: string; testName: string; className: string; endsLabel: string }>;
  finance: {
    collectedThisMonth: number;
    outstanding: number;
    recentPayments: Array<{
      id: string;
      studentName: string;
      className: string;
      amount: number;
      method: string;
      whenLabel: string;
    }>;
  } | null;
};

function money(n: number) {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

function fmt(n: number | null) {
  return n === null ? "—" : n.toLocaleString("en-NG");
}

function greeting() {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type QuickAction = { href: string; label: string; description: string; icon: LucideIcon; tone: Tone; adminOnly?: boolean };

const quickActions: QuickAction[] = [
  { href: "/admin/welfare/attendance", label: "Take attendance", description: "Mark today's register", icon: CalendarCheck, tone: "blue" },
  { href: "/admin/academics/results", label: "Enter results", description: "CA and exam scores", icon: FileSpreadsheet, tone: "violet" },
  { href: "/admin/exams/sessions", label: "Schedule an exam", description: "Open a CBT session", icon: Timer, tone: "gold" },
  { href: "/admin/finance/payments/new", label: "Record payment", description: "Log school fees", icon: Wallet, tone: "green", adminOnly: true },
  { href: "/admin/students/applications", label: "Review applications", description: "New admissions", icon: UserPlus, tone: "rose" },
  { href: "/admin/classes", label: "Class lists", description: "Check and fix registers", icon: School, tone: "slate" }
];

export default function DashboardView({ data }: { data: DashboardData }) {
  const actions = quickActions.filter((a) => data.isAdmin || !a.adminOnly);
  const att = data.attendanceToday;
  const marked = att ? att.present + att.absent + att.late : 0;
  const presentPct = att && marked > 0 ? Math.round(((att.present + att.late) / marked) * 100) : null;

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium text-slate-500">{data.todayLabel}</div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {greeting()}, {data.greetingName} <span aria-hidden="true">👋</span>
        </h1>
        <p className="text-sm text-slate-600">Here&apos;s what&apos;s happening at Greenfield today.</p>
      </div>

      {/* Key numbers */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current students"
          value={fmt(data.stats.activeStudents)}
          hint="Active and enrolled"
          icon={GraduationCap}
          tone="green"
          href="/admin/students"
        />
        <StatCard label="Classes" value={fmt(data.stats.classes)} hint="Active classes" icon={School} tone="blue" href="/admin/classes" />
        <StatCard
          label="Applications to review"
          value={fmt(data.stats.pendingApplications)}
          hint="Submitted, awaiting a decision"
          icon={Inbox}
          tone="rose"
          href="/admin/students/applications?status=submitted"
        />
        <StatCard
          label="Exams open now"
          value={fmt(data.stats.openExamSessions)}
          hint="Students can sit these today"
          icon={Timer}
          tone="gold"
          href="/admin/exams/sessions"
        />
      </div>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="text-sm font-semibold text-slate-900">
          Quick actions
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-green-200 hover:shadow-lift"
            >
              <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", toneStyles[a.tone].icon)}>
                <a.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="mt-3 text-sm font-semibold text-slate-900">{a.label}</span>
              <span className="text-xs text-slate-500">{a.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Attendance */}
        <Card>
          <CardHeader
            title="Attendance today"
            description={att ? `${marked} of ${att.expected} students marked` : "No register taken yet"}
            action={
              <Link href="/admin/welfare/attendance" className="text-sm font-semibold text-brand-green hover:underline">
                Open
              </Link>
            }
          />
          <div className="px-5 py-5 sm:px-6">
            {att && marked > 0 ? (
              <>
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">{presentPct}%</span>
                  <span className="pb-1.5 text-sm text-slate-500">in school</span>
                </div>
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div className="bg-brand-green-500" style={{ width: `${(att.present / Math.max(marked, 1)) * 100}%` }} />
                  <div className="bg-brand-gold" style={{ width: `${(att.late / Math.max(marked, 1)) * 100}%` }} />
                  <div className="bg-rose-400" style={{ width: `${(att.absent / Math.max(marked, 1)) * 100}%` }} />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  {[
                    { label: "Present", value: att.present, dot: "bg-brand-green-500" },
                    { label: "Late", value: att.late, dot: "bg-brand-gold" },
                    { label: "Absent", value: att.absent, dot: "bg-rose-400" }
                  ].map((r) => (
                    <div key={r.label}>
                      <dt className="flex items-center gap-1.5 text-slate-500">
                        <span className={cn("h-2 w-2 rounded-full", r.dot)} aria-hidden="true" />
                        {r.label}
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <EmptyState
                icon={CalendarCheck}
                title="No attendance yet today"
                description="Registers taken by class teachers will show up here."
                className="py-4"
              />
            )}
          </div>
        </Card>

        {/* Open exam sessions */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Exams open to students"
            description="CBT sessions students can take right now"
            action={
              <Link href="/admin/exams/sessions" className="text-sm font-semibold text-brand-green hover:underline">
                All sessions
              </Link>
            }
          />
          {data.openSessions.length ? (
            <ul className="divide-y divide-slate-100">
              {data.openSessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/admin/exams/sessions/${s.id}/attempts`}
                    className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50 sm:px-6"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-gold-50 text-brand-gold-700">
                      <Timer className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{s.testName}</span>
                      <span className="block text-xs text-slate-500">{s.className}</span>
                    </span>
                    <Badge tone="green" dot>
                      {s.endsLabel}
                    </Badge>
                    <ArrowRight className="hidden h-4 w-4 text-slate-300 sm:block" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Timer}
              title="No exams are open right now"
              description="Schedule a session with today's date and status 'active' to open an exam."
              action={
                <Link href="/admin/exams/sessions" className="text-sm font-semibold text-brand-green hover:underline">
                  Schedule an exam
                </Link>
              }
            />
          )}
        </Card>
      </div>

      {data.finance ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <StatCard
              label="Collected this month"
              value={money(data.finance.collectedThisMonth)}
              hint="Posted payments"
              icon={Wallet}
              tone="green"
              href="/admin/finance/payments"
            />
            <StatCard
              label="Outstanding fees"
              value={money(data.finance.outstanding)}
              hint="Across all guardians"
              icon={Inbox}
              tone="rose"
              href="/admin/finance/debtors"
            />
          </div>

          <Card className="xl:col-span-2">
            <CardHeader
              title="Recent payments"
              action={
                <Link href="/admin/finance/payments" className="text-sm font-semibold text-brand-green hover:underline">
                  All payments
                </Link>
              }
            />
            {data.finance.recentPayments.length ? (
              <ul className="divide-y divide-slate-100">
                {data.finance.recentPayments.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/finance/payments/${p.id}`}
                      className="flex items-center gap-4 px-5 py-3 transition hover:bg-slate-50 sm:px-6"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-sm font-semibold text-brand-green-700">
                        {p.studentName.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{p.studentName}</span>
                        <span className="block text-xs text-slate-500">
                          {p.className} · {p.method} · {p.whenLabel}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{money(p.amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Wallet} title="No payments yet" />
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
