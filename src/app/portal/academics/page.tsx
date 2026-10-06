import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resultColumnTypes } from "@/lib/results";

type StudentGuardianRow = { student_id: string };

type IdentityRow = {
  role: string | null;
  student_id: string | null;
  guardian_id: string | null;
};

type StudentRow = {
  id: string;
  first_name?: string;
  last_name?: string;
  class_id: string | null;
  classes:
    | { id: string; level: string; name: string }
    | Array<{ id: string; level: string; name: string }>
    | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined) {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type PubRow = {
  id: string;
  scope: string;
  academic_year_id: string | null;
  academic_term_id: string | null;
  level: string | null;
  class_id: string | null;
  published_at: string;
  academic_years: Array<{ id: string; name: string }>;
  academic_terms: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; level: string; name: string }>;
};

type SubjectSummaryRow = {
  student_id: string;
  academic_year_id: string | null;
  academic_term_id: string | null;
  subject_id: string;
  subject_name: string;
  weighted_score: number;
  grade: string | null;
};

type TermSummaryRow = {
  student_id: string;
  academic_year_id: string | null;
  academic_term_id: string | null;
  average_score: number;
};

type BreakdownRow = {
  score: number;
  academic_assessments:
    | { subject_id: string; assessment_type: string; max_score: number }
    | Array<{ subject_id: string; assessment_type: string; max_score: number }>
    | null;
};

type WelfareSummaryRow = {
  student_id: string;
  academic_year_id: string | null;
  academic_term_id: string | null;
  welfare_score: number;
  welfare_badge: string | null;
};

export default async function PortalAcademicsPage({
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

  const { data: identityRows } = await supabase.rpc("portal_identity");
  const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as unknown as IdentityRow | null;
  const role = identity?.role ?? null;

  if (role !== "student" && role !== "parent") return null;

  const sp = (await searchParams) ?? {};
  const selectedStudentIdRaw = sp.student_id;
  const selectedStudentId = Array.isArray(selectedStudentIdRaw)
    ? (selectedStudentIdRaw[0] ?? "")
    : (selectedStudentIdRaw ?? "");

  let studentId: string | null = null;
  let parentStudents: Array<{ id: string; first_name: string; last_name: string }> = [];

  if (role === "student") {
    studentId = identity?.student_id ?? null;
  }

  if (role === "parent") {
    const guardianId = identity?.guardian_id ?? null;
    if (!guardianId) {
      return (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Portal</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Academic records</h1>
          <p className="mt-2 text-sm text-slate-600">No guardian record is linked to your account yet.</p>
        </div>
      );
    }

    const { data: links } = await supabase
      .from("student_guardians")
      .select("student_id")
      .eq("guardian_id", guardianId);

    const studentIds = (links as StudentGuardianRow[] | null | undefined)
      ?.map((r) => r.student_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0) ?? [];

    if (!studentIds.length) {
      return (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Portal</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Academic records</h1>
          <p className="mt-2 text-sm text-slate-600">No students are linked to this account yet.</p>
        </div>
      );
    }

    const { data: studentsData } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .in("id", studentIds)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    parentStudents = (studentsData ?? []) as Array<{ id: string; first_name: string; last_name: string }>;

    const fallbackId = parentStudents[0]?.id ?? studentIds[0] ?? null;
    studentId = selectedStudentId.length ? selectedStudentId : fallbackId;
  }

  if (!studentId) return null;

  const { data: studentData } = await supabase
    .from("students")
    .select("id, first_name, last_name, class_id")
    .eq("id", studentId)
    .maybeSingle();

  let classesData = null;
  if (studentData?.class_id) {
    const { data } = await supabase
      .from("classes")
      .select("id, level, name")
      .eq("id", studentData.class_id)
      .maybeSingle();
    classesData = data;
  }

  const student = studentData ? {
    ...studentData,
    classes: classesData
  } as unknown as StudentRow : null;
  const classId = student?.class_id ?? null;
  const cls = firstOrNull(student?.classes);

  if (!classId) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Academic records</h1>
        <p className="mt-2 text-sm text-slate-600">Your profile is not assigned to a class yet.</p>
      </div>
    );
  }

  const { data: pubsData } = await supabase
    .from("result_publications")
    .select(
      "id, scope, academic_year_id, academic_term_id, level, class_id, published_at, academic_years(id, name), academic_terms(id, name), classes(id, level, name)"
    )
    .eq("scope", "term_results")
    .eq("class_id", classId)
    .order("published_at", { ascending: false })
    .limit(6);

  const pubs = (pubsData ?? []) as unknown as PubRow[];
  const selectedPubRaw = sp.pub;
  const selectedPubId = Array.isArray(selectedPubRaw) ? (selectedPubRaw[0] ?? "") : (selectedPubRaw ?? "");
  const latest = pubs.find((p) => p.id === selectedPubId) ?? pubs[0] ?? null;

  if (!latest?.academic_year_id || !latest?.academic_term_id) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Portal</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Academic records</h1>
          <p className="mt-2 text-sm text-slate-600">No term results have been published for your class yet.</p>
        </div>
      </div>
    );
  }

  const yearId = latest.academic_year_id;
  const termId = latest.academic_term_id;

  const [{ data: subjectData }, { data: termData }, { data: welfareData }, { data: breakdownData }] = await Promise.all([
    supabase
      .from("academic_student_subject_term_summary")
      .select("student_id, academic_year_id, academic_term_id, subject_id, subject_name, weighted_score, grade")
      .eq("student_id", studentId)
      .eq("academic_year_id", yearId)
      .eq("academic_term_id", termId)
      .order("subject_name", { ascending: true }),
    supabase
      .from("academic_student_term_summary")
      .select("student_id, academic_year_id, academic_term_id, average_score")
      .eq("student_id", studentId)
      .eq("academic_year_id", yearId)
      .eq("academic_term_id", termId)
      .maybeSingle(),
    supabase
      .from("welfare_student_term_summary")
      .select("student_id, academic_year_id, academic_term_id, welfare_score, welfare_badge")
      .eq("student_id", studentId)
      .eq("academic_year_id", yearId)
      .eq("academic_term_id", termId)
      .maybeSingle(),
    supabase
      .from("academic_assessment_scores")
      .select("score, academic_assessments!inner(subject_id, assessment_type, max_score, academic_year_id, academic_term_id)")
      .eq("student_id", studentId)
      .eq("academic_assessments.academic_year_id", yearId)
      .eq("academic_assessments.academic_term_id", termId)
      .in("academic_assessments.assessment_type", resultColumnTypes)
  ]);

  const subjects = (subjectData ?? []) as unknown as SubjectSummaryRow[];
  const term = (termData ?? null) as unknown as TermSummaryRow | null;
  const welfare = (welfareData ?? null) as unknown as WelfareSummaryRow | null;

  // 1st CA / 2nd CA / Exam breakdown per subject from the result sheet (exam = objective + theory).
  const breakdown = new Map<string, { ca1: number | null; ca2: number | null; exam: number | null }>();
  for (const row of (breakdownData ?? []) as unknown as BreakdownRow[]) {
    const a = firstOrNull(row.academic_assessments);
    if (!a) continue;
    const entry = breakdown.get(a.subject_id) ?? { ca1: null, ca2: null, exam: null };
    const score = Number(row.score ?? 0);
    if (a.assessment_type === "first_ca") entry.ca1 = (entry.ca1 ?? 0) + score;
    else if (a.assessment_type === "second_ca") entry.ca2 = (entry.ca2 ?? 0) + score;
    else entry.exam = (entry.exam ?? 0) + score;
    breakdown.set(a.subject_id, entry);
  }
  const showBreakdown = breakdown.size > 0;
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(Math.round(v * 100) / 100));

  const year = firstOrNull(latest.academic_years);
  const termMeta = firstOrNull(latest.academic_terms);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Academic records</h1>
        {role === "parent" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {parentStudents.map((st) => {
              const active = st.id === studentId;
              return (
                <Link
                  key={st.id}
                  href={`/portal/academics?student_id=${st.id}`}
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
        <p className="mt-2 text-sm text-slate-600">
          {cls ? `${cls.level} - ${cls.name}` : "Class"} • {year?.name ?? "Year"} • {termMeta?.name ?? "Term"}
        </p>
        {pubs.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {pubs.map((p) => {
              const active = p.id === latest.id;
              const params = new URLSearchParams({ pub: p.id });
              if (role === "parent") params.set("student_id", studentId!);
              return (
                <Link
                  key={p.id}
                  href={`/portal/academics?${params.toString()}`}
                  className={
                    "rounded-xl border px-3 py-1.5 text-xs font-semibold transition " +
                    (active
                      ? "border-brand-green bg-brand-green text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  {firstOrNull(p.academic_years)?.name ?? ""} {firstOrNull(p.academic_terms)?.name ?? "Term"}
                </Link>
              );
            })}
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
          <div>
            <div className="text-xs font-semibold text-slate-500">Average</div>
            <div className="mt-1 font-semibold text-slate-900">{Number(term?.average_score ?? 0).toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Welfare</div>
            <div className="mt-1 font-semibold text-slate-900">{Number(welfare?.welfare_score ?? 0).toFixed(2)}%</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Badge</div>
            <div className="mt-1 font-semibold text-slate-900">{welfare?.welfare_badge ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left">Subject</th>
                {showBreakdown ? (
                  <>
                    <th className="px-3 py-3 text-right">1st CA</th>
                    <th className="px-3 py-3 text-right">2nd CA</th>
                    <th className="px-3 py-3 text-right">Exam</th>
                  </>
                ) : null}
                <th className="px-3 py-3 text-right">{showBreakdown ? "Total" : "Score"}</th>
                <th className="px-6 py-3 text-right">Grade</th>
              </tr>
            </thead>
            <tbody>
              {subjects.length ? (
                subjects.map((s) => {
                  const b = breakdown.get(s.subject_id);
                  return (
                    <tr key={s.subject_id} className="border-t border-slate-200">
                      <td className="px-6 py-4 font-semibold text-slate-900">{s.subject_name}</td>
                      {showBreakdown ? (
                        <>
                          <td className="px-3 py-4 text-right text-slate-700">{fmt(b?.ca1)}</td>
                          <td className="px-3 py-4 text-right text-slate-700">{fmt(b?.ca2)}</td>
                          <td className="px-3 py-4 text-right text-slate-700">{fmt(b?.exam)}</td>
                        </>
                      ) : null}
                      <td className="px-3 py-4 text-right font-semibold text-slate-900">
                        {Number(s.weighted_score ?? 0).toFixed(2)}
                        {showBreakdown ? "" : "%"}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-700">{s.grade ?? "—"}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={showBreakdown ? 6 : 3} className="px-6 py-8 text-sm text-slate-600">
                    No subject results available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
