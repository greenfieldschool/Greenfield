import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import PortalDebugLogger from "./PortalDebugLogger";

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

type TestRow = { id: string; name: string };

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
  let testsById = new Map<string, TestRow>();
  let classesById = new Map<string, ClassRow>();

  try {
    const sessionsQuery = supabase
      .from("exam_test_sessions")
      .select("id, test_id, class_id, starts_at, ends_at, status, requires_secret_code")
      .order("starts_at", { ascending: false })
      .limit(50);
    const { data: sessionsData, error: sessionsError } = await withTimeout(Promise.resolve(sessionsQuery), 6000);
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
      const testsQuery = supabase.from("exam_tests").select("id, name").in("id", testIds);
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

  return (
    <div className="space-y-6">
      <PortalDebugLogger enabled={debug} />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Exams</h1>
        <p className="mt-2 text-sm text-slate-600">Available exam sessions.</p>

        {examsErrorMsg ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            <div className="text-sm font-semibold">Exams temporarily unavailable</div>
            <div className="mt-2 text-xs opacity-80">{examsErrorMsg}</div>
          </div>
        ) : null}

        {role === "student" ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
            <div className="text-xs font-semibold text-slate-500">Student access</div>
            <div className="mt-2">
              {student ? (
                <div>
                  <div className="font-semibold text-slate-900">{student.admission_number ?? "Student"}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Class: {cls ? `${cls.level} - ${cls.name}` : student.class_id ? "—" : "not assigned"}
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    Sessions appear only when they are active, within the time window, and match your class.
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-700">
                  No student record is linked to this account yet. Ask an admin to link your portal account to admission
                  number.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-6">Test</div>
          <div className="col-span-4">Class</div>
          <div className="col-span-2">Action</div>
        </div>
        <div>
          {sessions.length ? (
            sessions.map((s) => {
              const test = testsById.get(s.test_id) ?? null;
              const rowClassId = typeof s.class_id === "string" ? s.class_id : null;
              const rowClass = rowClassId ? classesById.get(rowClassId) ?? null : null;
              return (
                <div key={s.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                  <div className="col-span-6">
                    <div className="font-semibold text-slate-900">{test?.name ?? s.test_id}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {s.starts_at || s.ends_at
                        ? `${s.starts_at ? String(s.starts_at).slice(0, 16) : "—"} → ${s.ends_at ? String(s.ends_at).slice(0, 16) : "—"}`
                        : "—"}
                      {s.requires_secret_code ? " • code required" : ""}
                    </div>
                  </div>
                  <div className="col-span-4 text-slate-700">{rowClass ? `${rowClass.level} - ${rowClass.name}` : "—"}</div>
                  <div className="col-span-2">
                    <Link
                      href={`/portal/exams/${s.id}`}
                      className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-xs font-semibold text-white hover:brightness-95"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No exam sessions available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
