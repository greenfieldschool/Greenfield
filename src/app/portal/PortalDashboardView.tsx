import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarCheck,
  Clock,
  FileText,
  GraduationCap,
  Receipt,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type StudentDashboard = {
  kind: "student";
  name: string;
  classLabel: string | null;
  admissionNumber: string | null;
  openExams: Array<{
    id: string;
    name: string;
    durationLabel: string;
    closesLabel: string | null;
  }>;
  recentResults: Array<{
    id: string;
    name: string;
    score: string;
    percent: number;
  }>;
  termResultsPublished: boolean;
  attendance: { present: number; late: number; absent: number } | null;
};

export type ParentDashboard = {
  kind: "parent";
  name: string;
  children: Array<{
    id: string;
    name: string;
    classLabel: string | null;
    admissionNumber: string | null;
  }>;
  billing: { outstanding: number; unpaidInvoices: number } | null;
};

export type PortalDashboardData = (StudentDashboard | ParentDashboard) & {
  errorMsg?: string | null;
};

function greeting() {
  const hour = Number(
    new Date().toLocaleString("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Lagos",
    }),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Hero({
  title,
  subtitle,
  chips,
}: {
  title: string;
  subtitle: string;
  chips?: string[];
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-brand-green px-6 py-8 text-white sm:px-8 sm:py-10">
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-gold/20 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-brand-green-400/20 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="text-sm font-medium text-brand-gold-300">
          {greeting()}
        </div>
        <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-brand-green-100">{subtitle}</p>
        {chips?.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/15"
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Shortcut({
  href,
  label,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <span
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          tone,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="flex-1 text-sm font-semibold text-slate-900">
        {label}
      </span>
      <ArrowRight
        className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
        aria-hidden="true"
      />
    </Link>
  );
}

function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <div className="font-semibold">
          Some information could not be loaded
        </div>
        <div className="mt-0.5 text-xs opacity-80">{message}</div>
      </div>
    </div>
  );
}

function StudentView({
  data,
}: {
  data: StudentDashboard & { errorMsg?: string | null };
}) {
  const att = data.attendance;
  const attTotal = att ? att.present + att.late + att.absent : 0;
  const attPct =
    att && attTotal
      ? Math.round(((att.present + att.late) / attTotal) * 100)
      : null;

  return (
    <div className="space-y-6">
      <ErrorBanner message={data.errorMsg} />
      <Hero
        title={`Hi, ${data.name.split(" ")[0]}!`}
        subtitle="Your exams, results and school records in one place."
        chips={[data.classLabel, data.admissionNumber].filter(
          (v): v is string => Boolean(v),
        )}
      />

      {/* Exams open now — the most time-sensitive thing, so it comes first. */}
      <Card>
        <CardHeader
          title="Exams open now"
          description={
            data.openExams.length
              ? "Make sure you have enough time before you start."
              : undefined
          }
          action={
            <Link
              href="/portal/exams"
              className="text-sm font-semibold text-brand-green hover:underline"
            >
              All exams
            </Link>
          }
        />
        {data.openExams.length ? (
          <ul className="divide-y divide-slate-100">
            {data.openExams.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gold-50 text-brand-gold-700">
                    <Timer className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{e.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {e.durationLabel}
                      </span>
                      {e.closesLabel ? (
                        <span>Closes {e.closesLabel}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <Link
                  href={`/portal/exams/${e.id}`}
                  className={buttonClasses({ size: "sm" })}
                >
                  Start exam
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FileText}
            title="No exams open right now"
            description="When your teacher opens an exam for your class, it appears here."
          />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Latest results"
            action={
              <Link
                href="/portal/exams/results"
                className="text-sm font-semibold text-brand-green hover:underline"
              >
                See all
              </Link>
            }
          />
          {data.recentResults.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recentResults.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/portal/exams/results/${r.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {r.name}
                      </div>
                      <div className="text-xs text-slate-500">{r.score}</div>
                    </div>
                    <Badge
                      tone={
                        r.percent >= 70
                          ? "green"
                          : r.percent >= 50
                            ? "gold"
                            : "red"
                      }
                    >
                      {r.percent.toFixed(0)}%
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="No results released yet"
              description="Results show here once your teachers release them."
            />
          )}
          {data.termResultsPublished ? (
            <div className="border-t border-slate-100 px-5 py-3 sm:px-6">
              <Link
                href="/portal/academics"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand-green hover:underline"
              >
                <Sparkles
                  className="h-4 w-4 text-brand-gold-600"
                  aria-hidden="true"
                />
                Your term report card is ready
              </Link>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Attendance"
            description="Last 30 days"
            action={
              <Link
                href="/portal/attendance"
                className="text-sm font-semibold text-brand-green hover:underline"
              >
                Details
              </Link>
            }
          />
          {att && attTotal ? (
            <div className="px-5 py-5 sm:px-6">
              <div className="flex items-end gap-2">
                <span className="text-4xl font-bold tracking-tight text-slate-900">
                  {attPct}%
                </span>
                <span className="pb-1.5 text-sm text-slate-500">
                  of school days attended
                </span>
              </div>
              <div
                className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100"
                aria-hidden="true"
              >
                <div
                  className="bg-brand-green-500"
                  style={{ width: `${(att.present / attTotal) * 100}%` }}
                />
                <div
                  className="bg-brand-gold"
                  style={{ width: `${(att.late / attTotal) * 100}%` }}
                />
                <div
                  className="bg-rose-400"
                  style={{ width: `${(att.absent / attTotal) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex gap-4 text-xs text-slate-600">
                <span>{att.present} present</span>
                <span>{att.late} late</span>
                <span>{att.absent} absent</span>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={CalendarCheck}
              title="No attendance recorded yet"
            />
          )}
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Shortcut
          href="/portal/academics"
          label="Report card"
          icon={BookOpen}
          tone="bg-violet-50 text-violet-600"
        />
        <Shortcut
          href="/portal/activities"
          label="Clubs & activities"
          icon={Sparkles}
          tone="bg-sky-50 text-sky-600"
        />
        <Shortcut
          href="/portal/students"
          label="My profile"
          icon={GraduationCap}
          tone="bg-brand-green-50 text-brand-green-600"
        />
      </div>
    </div>
  );
}

function ParentView({
  data,
}: {
  data: ParentDashboard & { errorMsg?: string | null };
}) {
  return (
    <div className="space-y-6">
      <ErrorBanner message={data.errorMsg} />
      <Hero
        title={`Welcome, ${data.name.split(" ")[0]}`}
        subtitle="Follow your children's progress, attendance and school fees."
      />

      {data.billing ? (
        <div
          className={cn(
            "flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between",
            data.billing.outstanding > 0
              ? "border-brand-gold-200 bg-brand-gold-50"
              : "border-brand-green-100 bg-brand-green-50",
          )}
        >
          <div className="flex items-center gap-4">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-green shadow-card">
              <Receipt className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="text-sm font-medium text-slate-600">
                School fees
              </div>
              <div className="text-xl font-bold text-slate-900">
                {data.billing.outstanding > 0
                  ? `₦${Math.round(data.billing.outstanding).toLocaleString("en-NG")} outstanding`
                  : "All fees paid — thank you!"}
              </div>
              {data.billing.unpaidInvoices > 0 ? (
                <div className="text-xs text-slate-600">
                  {data.billing.unpaidInvoices} invoice
                  {data.billing.unpaidInvoices === 1 ? "" : "s"} to settle
                </div>
              ) : null}
            </div>
          </div>
          <Link
            href="/portal/billing"
            className={buttonClasses({
              variant: data.billing.outstanding > 0 ? "primary" : "secondary",
            })}
          >
            {data.billing.outstanding > 0 ? "View & pay" : "View invoices"}
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="children-heading">
        <h2
          id="children-heading"
          className="text-sm font-semibold text-slate-900"
        >
          Your children
        </h2>
        {data.children.length ? (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {data.children.map((c) => (
              <Card key={c.id} className="p-5">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-green text-lg font-semibold text-white ring-4 ring-brand-gold/20">
                    {c.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">
                      {c.name}
                    </div>
                    <div className="text-sm text-slate-500">
                      {[c.classLabel ?? "No class yet", c.admissionNumber]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    {
                      href: `/portal/academics?student_id=${c.id}`,
                      label: "Report card",
                      icon: BookOpen,
                    },
                    {
                      href: `/portal/attendance?student_id=${c.id}`,
                      label: "Attendance",
                      icon: CalendarCheck,
                    },
                    {
                      href: `/portal/activities?student_id=${c.id}`,
                      label: "Activities",
                      icon: Sparkles,
                    },
                  ].map((l) => (
                    <Link
                      key={l.label}
                      href={l.href}
                      className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 px-2 py-3 text-xs font-medium text-slate-700 transition hover:border-brand-green-200 hover:bg-brand-green-50/50 hover:text-brand-green"
                    >
                      <l.icon
                        className="h-[18px] w-[18px]"
                        aria-hidden="true"
                      />
                      {l.label}
                    </Link>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="mt-3">
            <EmptyState
              icon={GraduationCap}
              title="No children linked yet"
              description="Ask the school office to link your children to this account."
            />
          </Card>
        )}
      </section>
    </div>
  );
}

export default function PortalDashboardView({
  data,
}: {
  data: PortalDashboardData;
}) {
  return data.kind === "student" ? (
    <StudentView data={data} />
  ) : (
    <ParentView data={data} />
  );
}
