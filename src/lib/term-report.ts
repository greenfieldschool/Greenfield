import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetch-all";
import { gradeFor, round2, subjectPercent, type ComponentGroup, type GradeBand } from "@/lib/results";
import { emptyWelfareRecords, scoreWelfare, type WelfareCriterion, type WelfareRecords, type WelfareResult } from "@/lib/welfare";

// Everything on a class's termly report cards, worked out in one place so the admin pages, the printed
// report cards and the parent portal always agree.
//
//  - Subject score: (sum of the sheet's scores / sum of its column max scores) × 100.
//  - Academic average: average of the subject scores.
//  - Welfare: out of 100 from the level's welfare criteria (see lib/welfare.ts).
//  - Term total: average of the academic average and the welfare score.

export type ReportColumn = { id: string; label: string; group: ComponentGroup; max: number };

export type ReportSubject = {
  id: string;
  name: string;
  columns: ReportColumn[];
  classAverage: number | null;
  highest: number | null;
  lowest: number | null;
  /** Students with every column scored. */
  completeCount: number;
  /** Students with at least one score. */
  startedCount: number;
  /** The subject teacher has submitted the sheet as final (locked). */
  submitted: boolean;
};

export type StudentSubjectResult = {
  subjectId: string;
  scores: Array<number | null>;
  percent: number | null;
  grade: string | null;
  complete: boolean;
  position: number | null;
};

export type StudentReport = {
  student: {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    admission_number: string | null;
    sex: string | null;
    date_of_birth: string | null;
    photo_url: string | null;
  };
  subjects: StudentSubjectResult[];
  academicAverage: number | null;
  academicGrade: string | null;
  welfare: WelfareResult;
  welfareBadge: string | null;
  termTotal: number | null;
  termGrade: string | null;
  position: number | null;
  attendance: { present: number; late: number; absent: number };
  comments: { classTeacher: string | null; head: string | null };
};

export type ClassReport = {
  cls: { id: string; level: string; name: string };
  term: { id: string; name: string; starts_on: string | null; ends_on: string | null };
  year: { id: string; name: string } | null;
  nextTermStartsOn: string | null;
  daysOpened: number;
  subjects: ReportSubject[];
  welfareCriteria: WelfareCriterion[];
  grades: GradeBand[];
  students: StudentReport[];
  publication: { id: string; published_at: string } | null;
  completeness: {
    subjectsComplete: number;
    subjectsSubmitted: number;
    ratingsComplete: number;
    classCommentsDone: number;
    headCommentsDone: number;
    uniformChecks: number;
    ready: boolean;
  };
};

type TermRow = { id: string; name: string; academic_year_id: string; starts_on: string | null; ends_on: string | null };
type AssessmentRow = {
  id: string;
  subject_id: string;
  title: string | null;
  assessment_type: string;
  max_score: number;
  position: number;
  component_group: string | null;
};

function asGroup(v: string | null): ComponentGroup {
  return v === "ca" || v === "exam" ? v : "other";
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st … */
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Positions with ties sharing a place (1, 2, 2, 4). */
function rank<T>(items: T[], value: (t: T) => number | null): Map<T, number> {
  const scored = items.filter((i) => value(i) !== null).sort((a, b) => value(b)! - value(a)!);
  const out = new Map<T, number>();
  scored.forEach((item, i) => {
    const prev = i > 0 ? scored[i - 1] : null;
    out.set(item, prev && value(prev) === value(item) ? out.get(prev)! : i + 1);
  });
  return out;
}

function stats(values: number[]) {
  if (!values.length) return { avg: null, hi: null, lo: null };
  return {
    avg: round2(values.reduce((a, b) => a + b, 0) / values.length),
    hi: Math.max(...values),
    lo: Math.min(...values)
  };
}

/** Records belong to the term when they carry its id, or (if they were saved without one) fall inside its dates. */
function termFilter(termId: string, term: TermRow, dateColumn: string) {
  if (term.starts_on && term.ends_on) {
    return `academic_term_id.eq.${termId},and(academic_term_id.is.null,${dateColumn}.gte.${term.starts_on},${dateColumn}.lte.${term.ends_on}T23:59:59)`;
  }
  return `academic_term_id.eq.${termId}`;
}

export async function buildClassReport(
  supabase: SupabaseClient,
  classId: string,
  termId: string,
  options: { studentId?: string } = {}
): Promise<ClassReport | null> {
  const [{ data: clsData }, { data: termData }] = await Promise.all([
    supabase.from("classes").select("id, level, name").eq("id", classId).maybeSingle(),
    supabase.from("academic_terms").select("id, name, academic_year_id, starts_on, ends_on").eq("id", termId).maybeSingle()
  ]);
  if (!clsData || !termData) return null;
  const cls = clsData as { id: string; level: string; name: string };
  const term = termData as TermRow;

  const [
    { data: yearData },
    { data: nextTermData },
    { data: studentsData },
    { data: classSubjectsData },
    { data: gradesData },
    { data: criteriaData },
    { data: rulesData },
    { data: pubData }
  ] = await Promise.all([
    supabase.from("academic_years").select("id, name").eq("id", term.academic_year_id).maybeSingle(),
    term.starts_on
      ? supabase
          .from("academic_terms")
          .select("starts_on")
          .gt("starts_on", term.starts_on)
          .order("starts_on", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("students")
      .select("id, first_name, middle_name, last_name, admission_number, sex, date_of_birth, passport_photo_url, profile_photo_url")
      .eq("class_id", classId)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase.from("class_subjects").select("subject_id").eq("class_id", classId),
    supabase
      .from("grading_scales")
      .select("grade, min_score, max_score")
      .eq("level", cls.level)
      .eq("active", true)
      .order("min_score", { ascending: false }),
    supabase
      .from("welfare_criteria")
      .select("id, name, description, source, max_points, position")
      .eq("level", cls.level)
      .eq("active", true)
      .order("position", { ascending: true }),
    supabase
      .from("welfare_scoring_rules")
      .select("discipline_severity_penalty, gold_min, silver_min, bronze_min")
      .eq("level", cls.level)
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("result_publications")
      .select("id, published_at")
      .eq("scope", "term_results")
      .eq("class_id", classId)
      .eq("academic_term_id", termId)
      .maybeSingle()
  ]);

  type StudentRow = StudentReport["student"] & { passport_photo_url: string | null; profile_photo_url: string | null };
  const studentRows = ((studentsData ?? []) as unknown as StudentRow[]).map((s) => ({
    id: s.id,
    first_name: s.first_name,
    middle_name: s.middle_name,
    last_name: s.last_name,
    admission_number: s.admission_number,
    sex: s.sex,
    date_of_birth: s.date_of_birth,
    photo_url: s.passport_photo_url ?? s.profile_photo_url ?? null
  }));
  const studentIds = studentRows.map((s) => s.id);
  const grades = (gradesData ?? []) as GradeBand[];
  const criteria = (criteriaData ?? []) as WelfareCriterion[];
  const rules = rulesData as { discipline_severity_penalty: number; gold_min: number; silver_min: number; bronze_min: number } | null;
  const disciplinePenalty = Number(rules?.discipline_severity_penalty ?? 1);

  // Sheet columns for every subject of this class this term.
  const assessments = await fetchAllRows<AssessmentRow>(() =>
    supabase
      .from("academic_assessments")
      .select("id, subject_id, title, assessment_type, max_score, position, component_group")
      .eq("class_id", classId)
      .eq("academic_term_id", termId)
      .eq("on_result_sheet", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
  );

  const { data: lockData } = await supabase
    .from("result_sheet_locks")
    .select("subject_id")
    .eq("class_id", classId)
    .eq("academic_term_id", termId);
  const submittedIds = new Set(((lockData ?? []) as Array<{ subject_id: string }>).map((l) => l.subject_id));

  const subjectIds = Array.from(
    new Set([
      ...((classSubjectsData ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id),
      ...assessments.map((a) => a.subject_id)
    ])
  );
  const { data: subjectNames } = subjectIds.length
    ? await supabase.from("subjects").select("id, name").in("id", subjectIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const nameById = new Map(((subjectNames ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name] as const));

  const columnsBySubject = new Map<string, ReportColumn[]>();
  for (const a of assessments) {
    const list = columnsBySubject.get(a.subject_id) ?? [];
    list.push({ id: a.id, label: a.title ?? a.assessment_type, group: asGroup(a.component_group), max: Number(a.max_score) });
    columnsBySubject.set(a.subject_id, list);
  }

  const onlyStudent = options.studentId;
  const scopeIds = studentIds.length ? studentIds : ["00000000-0000-0000-0000-000000000000"];
  const assessmentIds = assessments.map((a) => a.id);

  const [scores, attendance, uniform, discipline, ratings, comments] = await Promise.all([
    assessmentIds.length
      ? fetchAllRows<{ assessment_id: string; student_id: string; score: number }>(() =>
          supabase
            .from("academic_assessment_scores")
            .select("assessment_id, student_id, score")
            .in("assessment_id", assessmentIds)
            .order("id", { ascending: true })
        )
      : Promise.resolve([]),
    fetchAllRows<{ student_id: string; status: string; date: string }>(() =>
      supabase
        .from("student_attendance")
        .select("student_id, status, date")
        .in("student_id", scopeIds)
        .or(termFilter(termId, term, "date"))
        .order("id", { ascending: true })
    ),
    fetchAllRows<{ student_id: string; ok: boolean }>(() =>
      supabase
        .from("student_uniform_checks")
        .select("student_id, ok")
        .in("student_id", scopeIds)
        .or(termFilter(termId, term, "date"))
        .order("id", { ascending: true })
    ),
    fetchAllRows<{ student_id: string; severity: number }>(() =>
      supabase
        .from("welfare_discipline_records")
        .select("student_id, severity")
        .in("student_id", scopeIds)
        .or(termFilter(termId, term, "occurred_at"))
        .order("id", { ascending: true })
    ),
    fetchAllRows<{ student_id: string; criterion_id: string; rating: number }>(() =>
      supabase
        .from("welfare_ratings")
        .select("student_id, criterion_id, rating")
        .in("student_id", scopeIds)
        .eq("academic_term_id", termId)
        .order("id", { ascending: true })
    ),
    fetchAllRows<{ student_id: string; class_teacher_comment: string | null; head_comment: string | null }>(() =>
      supabase
        .from("report_card_comments")
        .select("student_id, class_teacher_comment, head_comment")
        .in("student_id", scopeIds)
        .eq("academic_term_id", termId)
        .order("id", { ascending: true })
    )
  ]);

  const scoreByKey = new Map(scores.map((s) => [`${s.assessment_id}:${s.student_id}`, Number(s.score)] as const));

  const records = new Map<string, WelfareRecords>();
  const rec = (id: string) => {
    let r = records.get(id);
    if (!r) {
      r = emptyWelfareRecords();
      records.set(id, r);
    }
    return r;
  };
  const openedDates = new Set<string>();
  for (const a of attendance) {
    openedDates.add(String(a.date).slice(0, 10));
    const r = rec(a.student_id);
    if (a.status === "present") r.present += 1;
    else if (a.status === "late") r.late += 1;
    else if (a.status === "absent") r.absent += 1;
  }
  for (const u of uniform) {
    const r = rec(u.student_id);
    r.uniformChecks += 1;
    if (!u.ok) r.uniformFailures += 1;
  }
  for (const d of discipline) {
    const r = rec(d.student_id);
    r.disciplineCount += 1;
    r.disciplineSeverity += Number(d.severity ?? 1);
  }
  for (const rt of ratings) rec(rt.student_id).ratings[rt.criterion_id] = Number(rt.rating);
  const commentByStudent = new Map(comments.map((c) => [c.student_id, c] as const));

  const subjectList = subjectIds
    .map((id) => ({ id, name: nameById.get(id) ?? "Subject", columns: columnsBySubject.get(id) ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const badgeFor = (percent: number | null) => {
    if (percent === null || !rules) return null;
    if (percent >= Number(rules.gold_min)) return "Gold";
    if (percent >= Number(rules.silver_min)) return "Silver";
    if (percent >= Number(rules.bronze_min)) return "Bronze";
    return null;
  };

  const reports: StudentReport[] = studentRows.map((student) => {
    const subjects: StudentSubjectResult[] = subjectList.map((sub) => {
      const values = sub.columns.map((c) => {
        const v = scoreByKey.get(`${c.id}:${student.id}`);
        return v === undefined ? null : v;
      });
      const percent = subjectPercent(values, sub.columns.map((c) => c.max));
      return {
        subjectId: sub.id,
        scores: values,
        percent,
        grade: gradeFor(percent, grades),
        complete: sub.columns.length > 0 && values.every((v) => v !== null),
        position: null
      };
    });
    const percents = subjects.map((s) => s.percent).filter((p): p is number => p !== null);
    const academicAverage = percents.length ? round2(percents.reduce((a, b) => a + b, 0) / percents.length) : null;
    const r = records.get(student.id) ?? emptyWelfareRecords();
    const welfare = scoreWelfare(criteria, r, disciplinePenalty);
    // Needs both halves: a pupil with no scores yet must not rank on welfare alone.
    const termTotal =
      academicAverage !== null && welfare.percent !== null ? round2((academicAverage + welfare.percent) / 2) : null;
    const c = commentByStudent.get(student.id);
    return {
      student,
      subjects,
      academicAverage,
      academicGrade: gradeFor(academicAverage, grades),
      welfare,
      welfareBadge: badgeFor(welfare.percent),
      termTotal,
      termGrade: gradeFor(termTotal, grades),
      position: null,
      attendance: { present: r.present, late: r.late, absent: r.absent },
      comments: { classTeacher: c?.class_teacher_comment ?? null, head: c?.head_comment ?? null }
    };
  });

  // Positions in class, overall and per subject.
  const overall = rank(reports, (r) => r.termTotal);
  for (const r of reports) r.position = overall.get(r) ?? null;

  const subjectsOut: ReportSubject[] = subjectList.map((sub, i) => {
    const results = reports.map((r) => r.subjects[i]);
    const byPos = rank(results, (s) => s.percent);
    for (const s of results) s.position = byPos.get(s) ?? null;
    const st = stats(results.map((s) => s.percent).filter((p): p is number => p !== null));
    return {
      ...sub,
      classAverage: st.avg,
      highest: st.hi,
      lowest: st.lo,
      completeCount: results.filter((s) => s.complete).length,
      startedCount: results.filter((s) => s.percent !== null).length,
      submitted: submittedIds.has(sub.id)
    };
  });

  const ratingCriteria = criteria.filter((c) => c.source === "rating").length;
  const completeness = {
    subjectsComplete: subjectsOut.filter((s) => s.columns.length && s.completeCount === reports.length).length,
    subjectsSubmitted: subjectsOut.filter((s) => s.submitted).length,
    ratingsComplete: reports.filter((r) => r.welfare.unrated === 0).length,
    classCommentsDone: reports.filter((r) => r.comments.classTeacher?.trim()).length,
    headCommentsDone: reports.filter((r) => r.comments.head?.trim()).length,
    uniformChecks: uniform.length,
    ready: false
  };
  completeness.ready =
    reports.length > 0 &&
    completeness.subjectsComplete === subjectsOut.length &&
    completeness.subjectsSubmitted === subjectsOut.length &&
    (ratingCriteria === 0 || completeness.ratingsComplete === reports.length) &&
    completeness.classCommentsDone === reports.length &&
    openedDates.size > 0;

  return {
    cls,
    term: { id: term.id, name: term.name, starts_on: term.starts_on, ends_on: term.ends_on },
    year: (yearData as { id: string; name: string } | null) ?? null,
    nextTermStartsOn: (nextTermData as { starts_on: string } | null)?.starts_on ?? null,
    daysOpened: openedDates.size,
    subjects: subjectsOut,
    welfareCriteria: criteria,
    grades,
    students: onlyStudent ? reports.filter((r) => r.student.id === onlyStudent) : reports,
    publication: (pubData as { id: string; published_at: string } | null) ?? null,
    completeness
  };
}

/** A starting comment for the class teacher, by term total. Teachers can edit it. */
export function suggestedComment(firstName: string, termTotal: number | null) {
  if (termTotal === null) return "";
  if (termTotal >= 85) return `${firstName} has had an excellent term. Keep up the outstanding work and conduct.`;
  if (termTotal >= 70) return `${firstName} has worked very well this term. With a little more effort, even better results will follow.`;
  if (termTotal >= 60) return `${firstName} has done well this term. More focus in class and at home will lift these results.`;
  if (termTotal >= 50) return `${firstName} has made fair progress. More attention and regular revision are needed next term.`;
  return `${firstName} needs a lot more support and effort. Let us work together at home and in school to improve next term.`;
}
