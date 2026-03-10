import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type StudentGuardianRow = { student_id: string };

type StudentRow = { id: string; first_name: string; last_name: string };

type DisciplineRow = {
  id: string;
  category: string | null;
  description: string;
  severity: number;
  occurred_at: string;
  sanction: string | null;
};

export default async function PortalDisciplinePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  let errorMsg: string | null = null;

  const { data: identityRows, error: identityError } = await withTimeout(
    supabase.rpc("portal_identity"),
    6000
  );
  if (identityError) {
    errorMsg = String(identityError.message ?? "");
  }
  const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as unknown as {
    role?: string | null;
    student_id?: string | null;
    guardian_id?: string | null;
  } | null;

  const role = identity?.role ?? null;
  if (role !== "student" && role !== "parent") return null;

  const sp = (await searchParams) ?? {};
  const selectedStudentIdRaw = sp.student_id;
  const selectedStudentId = Array.isArray(selectedStudentIdRaw)
    ? (selectedStudentIdRaw[0] ?? "")
    : (selectedStudentIdRaw ?? "");

  let studentId: string | null = null;
  let parentStudents: StudentRow[] = [];

  if (role === "student") {
    studentId = identity?.student_id ?? null;
  }

  if (role === "parent") {
    const guardianId = identity?.guardian_id ?? null;
    if (!guardianId) return null;

    const { data: links } = await supabase
      .from("student_guardians")
      .select("student_id")
      .eq("guardian_id", guardianId);

    const studentIds = (links as StudentGuardianRow[] | null | undefined)
      ?.map((r) => r.student_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0) ?? [];

    if (!studentIds.length) return null;

    const { data: studentsData } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .in("id", studentIds)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    parentStudents = (studentsData ?? []) as StudentRow[];
    const fallbackId = parentStudents[0]?.id ?? studentIds[0] ?? null;
    studentId = selectedStudentId.length ? selectedStudentId : fallbackId;
  }

  if (!studentId) return null;

  let rows: DisciplineRow[] = [];
  try {
    const { data, error: disciplineError } = await withTimeout(
      supabase
        .from("welfare_discipline_records")
        .select("id, category, description, severity, occurred_at, sanction")
        .eq("student_id", studentId)
        .order("occurred_at", { ascending: false })
        .limit(50),
      6000
    );
    if (disciplineError && !errorMsg) {
      errorMsg = String(disciplineError.message ?? "");
    }
    rows = (data ?? []) as DisciplineRow[];
  } catch (e) {
    if (!errorMsg) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Discipline records</h1>
        {role === "parent" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {parentStudents.map((st) => {
              const active = st.id === studentId;
              return (
                <Link
                  key={st.id}
                  href={`/portal/discipline?student_id=${st.id}`}
                  className={
                    "rounded-xl border px-3 py-1.5 text-xs font-semibold transition " +
                    (active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  {st.first_name} {st.last_name}
                </Link>
              );
            })}
          </div>
        ) : null}
        <p className="mt-2 text-sm text-slate-600">Recent discipline records.</p>

        {errorMsg ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            <div className="text-sm font-semibold">Discipline records temporarily unavailable</div>
            <div className="mt-2 text-xs opacity-80">{errorMsg}</div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{r.category ?? "Discipline"}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{String(r.occurred_at).slice(0, 10)}</div>
                </div>
                <div className="text-xs font-semibold text-slate-700">Severity: {r.severity}</div>
              </div>
              <div className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{r.description}</div>
              {r.sanction ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500">Sanction</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{r.sanction}</div>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
            No discipline records yet.
          </div>
        )}
      </div>
    </div>
  );
}
