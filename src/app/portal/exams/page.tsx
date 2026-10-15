import Link from "next/link";
import { ArrowRight, CalendarClock, Clock, FileText, KeyRound, Timer } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import PortalDebugLogger from "./PortalDebugLogger";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { PortalPageHeader } from "../_components/portal-ui";

function classText(c: ClassRow | null) {
  return c ? `${c.level.charAt(0).toUpperCase()}${c.level.slice(1)} · ${c.name}` : null;
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type SessionRow = {
  id: string;
  test_id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  requires_secret_code: boolean;
  class_id?: string | null;
};

type IdentityRow = {
  role: string | null;
  student_id: string | null;
  guardian_id: string | null;
};

type StudentRow = {
  id: string;
  admission_number: string | null;
  class_id: string | null;
};

type ClassRow = { id: string; level: string; name: string };

type TestRow = { id: string; name: string; duration_minutes?: number | null };

type PortalSessionRpcRow = {
  id: string;
  test_id: string;
  test_name: string;
  duration_minutes: number | null;
  class_id: string | null;
  class_level: string | null;
  class_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  requires_secret_code: boolean;
};

export default async function PortalExamsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const debugRaw = sp.debug;
  const debug =
    debugRaw === "1" ||
    debugRaw === "true" ||
    (Array.isArray(debugRaw) && (debugRaw[0] === "1" || debugRaw[0] === "true"));

  const {
    data: { user }
  } = await supabase.auth.getUser();

  let role: string | null = null;
  let student: StudentRow | null = null;
  let cls: ClassRow | null = null;
  let examsErrorMsg: string | null = null;

  if (user) {
    try {
      const identityQuery = supabase.rpc("portal_identity");
      const { data: identityRows, error: identityError } = await withTimeout(Promise.resolve(identityQuery), 6000);
      if (identityError) {
        examsErrorMsg = String(identityError.message ?? "");
      }

      const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as unknown as IdentityRow | null;
      role = identity?.role ?? null;

      if (role === "student") {
        const studentId = identity?.student_id ?? null;
        if (studentId) {
        const studentQuery = supabase
          .from("students")
          .select("id, admission_number, class_id")
          .eq("id", studentId)
          .maybeSingle();
        const { data: studentData, error: studentError } = await withTimeout(Promise.resolve(studentQuery), 6000);
        if (studentError && !examsErrorMsg) {
          examsErrorMsg = String(studentError.message ?? "");
        }

        student = (studentData ?? null) as unknown as StudentRow | null;

        const classId = (studentData as { class_id?: string | null } | null)?.class_id ?? null;
        if (classId) {
          const classQuery = supabase.from("classes").select("id, level, name").eq("id", classId).maybeSingle();
          const { data: classData, error: classError } = await withTimeout(Promise.resolve(classQuery), 6000);
          if (classError && !examsErrorMsg) {
            examsErrorMsg = String(classError.message ?? "");
          }
          cls = (classData ?? null) as ClassRow | null;
        }
      }
      }
    } catch (e) {
      if (!examsErrorMsg) {
        examsErrorMsg = e instanceof Error ? e.message : String(e);
      }
    }
  }

  let sessions: SessionRow[] = [];
  const testsById = new Map<string, TestRow>();
  const classesById = new Map<string, ClassRow>();

  // Preferred path: one security-definer call (docs/migrations/20261015_portal_exam_sessions.sql).
  let usedRpc = false;
  if (role === "student") {
    try {
      const { data: rpcData, error: rpcError } = await withTimeout(
        Promise.resolve(supabase.rpc("portal_student_exam_sessions")),
        10000
      );
      if (!rpcError) {
        usedRpc = true;
        for (const r of (rpcData ?? []) as PortalSessionRpcRow[]) {
          sessions.push({
            id: r.id,
            test_id: r.test_id,
            class_id: r.class_id,
            starts_at: r.starts_at,
            ends_at: r.ends_at,
            status: "active",
            requires_secret_code: r.requires_secret_code
          });
          testsById.set(r.test_id, { id: r.test_id, name: r.test_name, duration_minutes: r.duration_minutes });
          if (r.class_id && r.class_level && r.class_name) {
            classesById.set(r.class_id, { id: r.class_id, level: r.class_level, name: r.class_name });
          }
        }
      }
    } catch (e) {
      if (!examsErrorMsg) {
        examsErrorMsg = e instanceof Error ? e.message : String(e);
      }
      usedRpc = true;
    }
  }

  if (!usedRpc) {
    try {
      const sessionsQuery = supabase
        .from("exam_test_sessions")
        .select("id, test_id, class_id, starts_at, ends_at, status, requires_secret_code")
        .eq("status", "active")
        .order("starts_at", { ascending: false })
        .limit(50);
      const { data: sessionsData, error: sessionsError } = await withTimeout(Promise.resolve(sessionsQuery), 10000);
      if (sessionsError && !examsErrorMsg) {
        examsErrorMsg = String(sessionsError.message ?? "");
      }
      sessions = ((sessionsData ?? []) as unknown as SessionRow[]) ?? [];

      const testIds = Array.from(new Set(sessions.map((s) => s.test_id).filter((v): v is string => typeof v === "string" && v.length > 0)));
      const classIds = Array.from(
        new Set(
          sessions
            .map((s) => (typeof s.class_id === "string" ? s.class_id : ""))
            .filter((v): v is string => typeof v === "string" && v.length > 0)
        )
      );

      if (testIds.length) {
        const testsQuery = supabase.from("exam_tests").select("id, name, duration_minutes").in("id", testIds);
        const { data: testsData } = await withTimeout(Promise.resolve(testsQuery), 6000);
        for (const t of (testsData ?? []) as TestRow[]) {
          if (t?.id) testsById.set(t.id, t);
        }
      }

      if (classIds.length) {
        const classesQuery = supabase.from("classes").select("id, level, name").in("id", classIds);
        const { data: classesData } = await withTimeout(Promise.resolve(classesQuery), 6000);
        for (const c of (classesData ?? []) as ClassRow[]) {
          if (c?.id) classesById.set(c.id, c);
        }
      }
    } catch (e) {
      if (!examsErrorMsg) {
        examsErrorMsg = e instanceof Error ? e.message : String(e);
      }
    }
  }

  return (
    <div className="space-y-6">
      <PortalDebugLogger enabled={debug} />
      <PortalPageHeader
        title="Exams"
        description="Exams open for you right now. Make sure you have enough time before you start."
        actions={
          <Link href="/portal/exams/results" className={buttonClasses({ variant: "secondary" })}>
            My results
          </Link>
        }
      />

      {examsErrorMsg ? (
        <Alert tone="warning" title="Exams temporarily unavailable">
          <span className="text-xs">{examsErrorMsg}</span>
        </Alert>
      ) : null}

      {role === "student" ? (
        student ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge tone="slate">{student.admission_number ?? "Student"}</Badge>
            <Badge tone="green">{classText(cls) ?? (student.class_id ? "Class —" : "No class yet")}</Badge>
            <span className="text-xs text-slate-500">
              Exams appear here on their start date. Ask your teacher if one is missing.
            </span>
          </div>
        ) : (
          <Alert tone="info" title="Your account isn't linked yet">
            No student record is linked to this account yet. Ask the school office to link your portal account to
            your admission number.
          </Alert>
        )
      ) : null}

      <Card>
        <CardHeader title="Open now" description={sessions.length ? `${sessions.length} exam${sessions.length === 1 ? "" : "s"} available` : undefined} />
        {sessions.length ? (
          <ul className="divide-y divide-slate-100">
            {sessions.map((s) => {
              const test = testsById.get(s.test_id) ?? null;
              const rowClassId = typeof s.class_id === "string" ? s.class_id : null;
              const rowClass = rowClassId ? classesById.get(rowClassId) ?? null : null;
              return (
                <li key={s.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-gold-50 text-brand-gold-700">
                      <Timer className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-slate-900">{test?.name ?? s.test_id}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-4 w-4" aria-hidden="true" />
                          {test?.duration_minutes ? `${test.duration_minutes} minutes` : "No time limit"}
                        </span>
                        {s.ends_at ? (
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarClock className="h-4 w-4" aria-hidden="true" />
                            Open until {formatLagosDate(s.ends_at)}
                          </span>
                        ) : null}
                        {rowClass ? <span>{classText(rowClass)}</span> : null}
                        {s.requires_secret_code ? (
                          <Badge tone="gold">
                            <KeyRound className="h-3 w-3" aria-hidden="true" />
                            Code needed
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <Link href={`/portal/exams/${s.id}`} className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}>
                    Open exam
                    <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={FileText}
            title="No exams open right now"
            description="When your teacher opens an exam for your class, it appears here."
          />
        )}
      </Card>
    </div>
  );
}
