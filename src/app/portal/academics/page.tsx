import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentLinkRow = { student_id: string };

type GuardianLinkRow = { guardian_id: string };

type StudentGuardianRow = { student_id: string };

type ProfileRow = { role: string };

type StudentRow = {
  id: string;
  first_name?: string;
  last_name?: string;
  class_id: string | null;
  classes: Array<{ id: string; level: string; name: string }>;
};

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

  const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = ((profileData ?? null) as ProfileRow | null)?.role ?? null;

  if (role !== "student" && role !== "parent") return null;

  const sp = (await searchParams) ?? {};
  const selectedStudentIdRaw = sp.student_id;
  const selectedStudentId = Array.isArray(selectedStudentIdRaw)
    ? (selectedStudentIdRaw[0] ?? "")
    : (selectedStudentIdRaw ?? "");

  let studentId: string | null = null;
  let parentStudents: Array<{ id: string; first_name: string; last_name: string }> = [];

  if (role === "student") {
    const { data: studentLink } = await supabase
      .from("student_user_links")
      .select("student_id")
      .eq("user_id", user.id)
      .maybeSingle();

    studentId = (studentLink as StudentLinkRow | null)?.student_id ?? null;
  }

  if (role === "parent") {
    const { data: guardianLink } = await supabase
      .from("guardian_user_links")
      .select("guardian_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const guardianId = (guardianLink as GuardianLinkRow | null)?.guardian_id ?? null;
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
    .select("id, first_name, last_name, class_id, classes(id, level, name)")
    .eq("id", studentId)
    .maybeSingle();

  const student = (studentData ?? null) as unknown as StudentRow | null;
  const classId = student?.class_id ?? null;
  const cls = (student?.classes ?? [])[0] ?? null;

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
  const latest = pubs[0] ?? null;

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

  const [{ data: subjectData }, { data: termData }, { data: welfareData }] = await Promise.all([
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
      .maybeSingle()
  ]);

  const subjects = (subjectData ?? []) as unknown as SubjectSummaryRow[];
  const term = (termData ?? null) as unknown as TermSummaryRow | null;
  const welfare = (welfareData ?? null) as unknown as WelfareSummaryRow | null;

  const year = (latest.academic_years ?? [])[0] ?? null;
  const termMeta = (latest.academic_terms ?? [])[0] ?? null;

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
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-6">Subject</div>
          <div className="col-span-3">Score</div>
          <div className="col-span-3">Grade</div>
        </div>
        <div>
          {subjects.length ? (
            subjects.map((s) => (
              <div key={s.subject_id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-6 font-semibold text-slate-900">{s.subject_name}</div>
                <div className="col-span-3 text-slate-700">{Number(s.weighted_score ?? 0).toFixed(2)}%</div>
                <div className="col-span-3 text-slate-700">{s.grade ?? "—"}</div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No subject results available yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
