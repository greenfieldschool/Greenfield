import { Award, BookOpen, HeartHandshake, TrendingUp } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resultColumnTypes } from "@/lib/results";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { PillLinks, PortalPageHeader, PortalNotice, portalMessages } from "../_components/portal-ui";

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

function EmptyAcademics({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <PortalPageHeader title="Report card" description="Term results published by the school." />
      <Card>
        <EmptyState icon={BookOpen} title="Nothing to show yet" description={message} />
      </Card>
    </div>
  );
}

function gradeTone(grade: string | null): BadgeTone {
  const g = (grade ?? "").trim().toUpperCase().charAt(0);
  if (g === "A" || g === "B") return "green";
  if (g === "C" || g === "D") return "gold";
  if (g === "E" || g === "F") return "red";
  return "slate";
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

  if (role !== "student" && role !== "parent") return <PortalNotice title="Report card" message={portalMessages.notPortal} />;

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
      return <EmptyAcademics message={portalMessages.noGuardian} />;
    }

    const { data: links } = await supabase
      .from("student_guardians")
      .select("student_id")
      .eq("guardian_id", guardianId);

    const studentIds = (links as StudentGuardianRow[] | null | undefined)
      ?.map((r) => r.student_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0) ?? [];

    if (!studentIds.length) {
      return <EmptyAcademics message={portalMessages.noChildren} />;
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

  if (!studentId)
    return (
      <PortalNotice
        title="Report card"
        message={role === "parent" ? portalMessages.noChildren : portalMessages.noStudent}
      />
    );

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
    return <EmptyAcademics message="Not assigned to a class yet — please contact the school office." />;
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
      <EmptyAcademics message="No term results have been published for this class yet. You'll see the report card here as soon as the school releases it." />
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

  const studentName = student ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() : "";
  const classText = cls ? `${cls.level.charAt(0).toUpperCase()}${cls.level.slice(1)} · ${cls.name}` : null;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        eyebrow={[year?.name, termMeta?.name].filter(Boolean).join(" · ") || undefined}
        title="Report card"
        description={[role === "parent" ? studentName : null, classText].filter(Boolean).join(" · ") || undefined}
      />

      {role === "parent" && parentStudents.length > 1 ? (
        <PillLinks
          label="Choose a child"
          items={parentStudents.map((st) => ({
            key: st.id,
            href: `/portal/academics?student_id=${st.id}`,
            label: `${st.first_name} ${st.last_name}`,
            active: st.id === studentId
          }))}
        />
      ) : null}

      {pubs.length > 1 ? (
        <PillLinks
          label="Choose a term"
          items={pubs.map((p) => {
            const params = new URLSearchParams({ pub: p.id });
            if (role === "parent") params.set("student_id", studentId!);
            return {
              key: p.id,
              href: `/portal/academics?${params.toString()}`,
              label: `${firstOrNull(p.academic_years)?.name ?? ""} ${firstOrNull(p.academic_terms)?.name ?? "Term"}`.trim(),
              active: p.id === latest.id
            };
          })}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Term average" value={`${Number(term?.average_score ?? 0).toFixed(2)}%`} icon={TrendingUp} tone="green" />
        <StatCard label="Welfare score" value={`${Number(welfare?.welfare_score ?? 0).toFixed(2)}%`} icon={HeartHandshake} tone="blue" />
        <StatCard label="Welfare badge" value={welfare?.welfare_badge ?? "—"} icon={Award} tone="gold" />
      </div>

      <Card>
        <CardHeader title="Subjects" description={showBreakdown ? "Continuous assessment (CA), exam and total for each subject." : undefined} />
        {subjects.length ? (
          <div className="gf-table-wrap">
            <table className={showBreakdown ? "gf-table min-w-[560px]" : "gf-table"}>
              <thead>
                <tr>
                  <th>Subject</th>
                  {showBreakdown ? (
                    <>
                      <th className="text-right">1st CA</th>
                      <th className="text-right">2nd CA</th>
                      <th className="text-right">Exam</th>
                    </>
                  ) : null}
                  <th className="text-right">{showBreakdown ? "Total" : "Score"}</th>
                  <th className="text-right">Grade</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => {
                  const b = breakdown.get(s.subject_id);
                  return (
                    <tr key={s.subject_id}>
                      <td className="font-semibold text-slate-900">{s.subject_name}</td>
                      {showBreakdown ? (
                        <>
                          <td className="text-right tabular-nums">{fmt(b?.ca1)}</td>
                          <td className="text-right tabular-nums">{fmt(b?.ca2)}</td>
                          <td className="text-right tabular-nums">{fmt(b?.exam)}</td>
                        </>
                      ) : null}
                      <td className="text-right font-semibold tabular-nums text-slate-900">
                        {Number(s.weighted_score ?? 0).toFixed(2)}
                        {showBreakdown ? "" : "%"}
                      </td>
                      <td className="text-right">
                        {s.grade ? <Badge tone={gradeTone(s.grade)}>{s.grade}</Badge> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={BookOpen} title="No subject results yet" description="Subject scores will appear here once they're ready." />
        )}
      </Card>
    </div>
  );
}
