import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import PortalDebugLogger from "./PortalDebugLogger";

type SessionRow = {
  id: string;
  test_id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  requires_secret_code: boolean;
  exam_tests:
    | { id: string; name: string }
    | Array<{ id: string; name: string }>
    | null;
  classes:
    | { id: string; level: string; name: string }
    | Array<{ id: string; level: string; name: string }>
    | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined) {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type ProfileRow = { role: string };

type StudentLinkRow = { student_id: string };

type StudentRow = {
  id: string;
  admission_number: string | null;
  class_id: string | null;
  classes:
    | { id: string; level: string; name: string }
    | Array<{ id: string; level: string; name: string }>
    | null;
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

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    role = ((profile ?? null) as ProfileRow | null)?.role ?? null;

    if (role === "student") {
      const { data: link } = await supabase
        .from("student_user_links")
        .select("student_id")
        .eq("user_id", user.id)
        .maybeSingle();

      const studentId = ((link ?? null) as StudentLinkRow | null)?.student_id ?? null;
      if (studentId) {
        const { data: studentData } = await supabase
          .from("students")
          .select("id, admission_number, class_id, classes!students_class_id_fkey(id, level, name)")
          .eq("id", studentId)
          .maybeSingle();

        student = (studentData ?? null) as unknown as StudentRow | null;
      }
    }
  }

  const { data } = await supabase
    .from("exam_test_sessions")
    .select("id, test_id, starts_at, ends_at, status, requires_secret_code, exam_tests(id, name), classes(id, level, name)")
    .order("starts_at", { ascending: false })
    .limit(50);

  const sessions = (data ?? []) as unknown as SessionRow[];

  return (
    <div className="space-y-6">
      <PortalDebugLogger enabled={debug} />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Exams</h1>
        <p className="mt-2 text-sm text-slate-600">Available exam sessions.</p>

        {role === "student" ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
            <div className="text-xs font-semibold text-slate-500">Student access</div>
            <div className="mt-2">
              {student ? (
                <div>
                  <div className="font-semibold text-slate-900">{student.admission_number ?? "Student"}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Class: {firstOrNull(student.classes) ? `${firstOrNull(student.classes)?.level} - ${firstOrNull(student.classes)?.name}` : student.class_id ? "—" : "not assigned"}
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
              const test = firstOrNull(s.exam_tests);
              const cls = firstOrNull(s.classes);
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
                  <div className="col-span-4 text-slate-700">{cls ? `${cls.level} - ${cls.name}` : "—"}</div>
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
