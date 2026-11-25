import Link from "next/link";
import { ArrowRight, CalendarClock, Clock, FileText, Lock, PlayCircle, UserCheck, type LucideIcon } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard, toneStyles, type Tone } from "@/components/ui/stat-card";
import { Alert } from "@/components/ui/alert";
import { LEARN } from "@/lib/learn-guides";
import { cn } from "@/lib/cn";

// Exams overview: what needs attention now (tests waiting for approval, sessions open, pupils locked), then the
// three areas. Counts come from what the signed-in person can see (RLS).

const sections: Array<{ href: string; title: string; description: string; icon: LucideIcon; tone: Tone; teachersAndAdmins?: boolean }> = [
  {
    href: "/admin/exams/tests",
    title: "Tests & questions",
    description: "Set a paper and its questions, then send it for approval. Admins approve or send it back.",
    icon: FileText,
    tone: "violet",
    teachersAndAdmins: true
  },
  {
    href: "/admin/exams/sessions",
    title: "Sessions",
    description: "Open an approved test to a class between two dates, run the exam room and release results.",
    icon: CalendarClock,
    tone: "gold"
  },
  {
    href: "/admin/exams/conductors",
    title: "Conductors",
    description: "The invigilators who unlock learners and add time in the hall, and their sign-ins.",
    icon: UserCheck,
    tone: "blue"
  }
];

export default async function AdminExamsPage() {
  const supabase = getSupabaseServerClient();
  let role = "";
  let waiting: number | null = null;
  let openNow = 0;
  let locked = 0;
  let noClass = 0;
  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
    role = (profile as { role?: string } | null)?.role ?? "";
    const nowIso = new Date().toISOString();
    const [w, o, l, n] = await Promise.all([
      supabase.from("exam_tests").select("id", { count: "exact", head: true }).eq("approval_status", "submitted"),
      supabase
        .from("exam_test_sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("active", true)
        .not("class_id", "is", null)
        .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
        .or(`ends_at.is.null,ends_at.gte.${nowIso}`),
      supabase.from("exam_attempts").select("id", { count: "exact", head: true }).not("locked_at", "is", null).is("submitted_at", null),
      supabase
        .from("exam_test_sessions")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .is("class_id", null)
        .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    ]);
    waiting = w.error ? null : (w.count ?? 0);
    openNow = o.count ?? 0;
    locked = l.count ?? 0;
    noClass = n.count ?? 0;
  }
  const teachesOrAdmin = role === "teacher" || role === "admin" || role === "super_admin";

  return (
    <div className="space-y-6">
      <PageHeader
        learn={LEARN.tests}
        eyebrow="Exams"
        title="Exams"
        description="Set and approve tests, open them to classes in sessions, run the exam room, and release results."
      />

      {noClass > 0 ? (
        <Alert
          tone="warning"
          title={`${noClass} ${noClass === 1 ? "session has" : "sessions have"} no class`}
          action={
            <Link href="/admin/exams/sessions?class_id=none" className="gf-link text-sm font-semibold">
              Choose the classes
            </Link>
          }
        >
          Learners can&apos;t see a session until it has a class. Open each one and pick the class that sits it.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {teachesOrAdmin && waiting !== null ? (
          <StatCard
            label="Waiting for approval"
            value={waiting}
            hint={role === "teacher" ? "Your papers with the admins" : "Papers teachers have sent"}
            icon={Clock}
            tone={waiting ? "gold" : "slate"}
            href="/admin/exams/tests?approval=submitted"
          />
        ) : null}
        <StatCard label="Sessions open now" value={openNow} hint="Learners can sit these today" icon={PlayCircle} tone={openNow ? "green" : "slate"} href="/admin/exams/sessions?status=active" />
        <StatCard label="Learners locked" value={locked} hint={locked ? "Open the session's exam room to unlock" : "No one is locked"} icon={Lock} tone={locked ? "rose" : "slate"} href="/admin/exams/sessions?status=active" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections
          .filter((s) => !s.teachersAndAdmins || teachesOrAdmin)
          .map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 active:scale-[0.99] hover:border-brand-green-200 hover:shadow-lift"
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
