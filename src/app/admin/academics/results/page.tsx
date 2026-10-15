import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import { isResultColumnType, resultColumns, resultColumnTypes, type ResultColumnType } from "@/lib/results";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import SheetPicker from "./SheetPicker";
import { Download, EyeOff, FileSpreadsheet, MonitorCheck, Save, Send, Settings2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string; academic_year_id: string };
type ClassRow = { id: string; level: string; name: string };
type SubjectRow = { id: string; name: string };
type StudentRow = { id: string; first_name: string; last_name: string; admission_number: string | null };
type AssessmentRow = { id: string; assessment_type: string; max_score: number };
type ScoreRow = { assessment_id: string; student_id: string; score: number };
type GradeRow = { grade: string; min_score: number; max_score: number };
type SessionRow = {
  id: string;
  starts_at: string | null;
  academic_term_id: string | null;
  results_released_at: string | null;
  exam_tests: { id: string; name: string; subject_id: string | null } | Array<{ id: string; name: string; subject_id: string | null }> | null;
};

type SheetContext = { classId: string; subjectId: string; yearId: string; termId: string };

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function sheetUrl(ctx: SheetContext, extra?: Record<string, string>) {
  const params = new URLSearchParams({
    class_id: ctx.classId,
    subject_id: ctx.subjectId,
    year_id: ctx.yearId,
    term_id: ctx.termId,
    ...(extra ?? {})
  });
  return `/admin/academics/results?${params.toString()}`;
}

function back(ctx: SheetContext, message: string, type: "success" | "error" = "success"): never {
  redirect(sheetUrl(ctx, { toast: message, toast_type: type }));
}

// Finds (or creates) the four assessments that back the sheet columns for this class/subject/term.
async function ensureAssessments(
  supabase: SupabaseClient,
  ctx: SheetContext,
  maxOverrides?: Partial<Record<ResultColumnType, number>>
) {
  const { data } = await supabase
    .from("academic_assessments")
    .select("id, assessment_type, max_score")
    .eq("class_id", ctx.classId)
    .eq("subject_id", ctx.subjectId)
    .eq("academic_year_id", ctx.yearId)
    .eq("academic_term_id", ctx.termId)
    .in("assessment_type", resultColumnTypes)
    .order("created_at", { ascending: true });

  const byType = new Map<string, AssessmentRow>();
  for (const a of (data ?? []) as AssessmentRow[]) {
    if (!byType.has(a.assessment_type)) byType.set(a.assessment_type, a);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  for (const col of resultColumns) {
    const wantedMax = maxOverrides?.[col.type];
    const existing = byType.get(col.type);

    if (!existing) {
      const { data: created } = await supabase
        .from("academic_assessments")
        .insert({
          class_id: ctx.classId,
          subject_id: ctx.subjectId,
          academic_year_id: ctx.yearId,
          academic_term_id: ctx.termId,
          assessment_type: col.type,
          title: col.label,
          max_score: wantedMax ?? col.defaultMax,
          created_by: user?.id ?? null
        })
        .select("id, assessment_type, max_score")
        .maybeSingle();
      if (created) byType.set(col.type, created as AssessmentRow);
    } else if (wantedMax !== undefined && Number(existing.max_score) !== wantedMax) {
      await supabase.from("academic_assessments").update({ max_score: wantedMax }).eq("id", existing.id);
      existing.max_score = wantedMax;
    }
  }

  return byType;
}

// Module level so it cannot capture values from the page render (inline actions that do can crash).
async function openSheet(formData: FormData) {
  "use server";
  const nextTermId = String(formData.get("term_id") ?? "").trim();
  const supabase = getSupabaseServerClient();
  const { data: nextTerm } =
    supabase && nextTermId
      ? await supabase.from("academic_terms").select("academic_year_id").eq("id", nextTermId).maybeSingle()
      : { data: null };
  const next: SheetContext = {
    classId: String(formData.get("class_id") ?? "").trim(),
    subjectId: String(formData.get("subject_id") ?? "").trim(),
    yearId: (nextTerm as { academic_year_id: string } | null)?.academic_year_id ?? "",
    termId: nextTermId
  };
  redirect(sheetUrl(next));
}

function revalidateResults() {
  revalidatePath("/admin/academics/results");
  revalidatePath("/admin/academics/assessments");
  revalidatePath("/admin/academics/publications");
  revalidatePath("/portal/academics");
  revalidatePath("/portal");
}

export default async function AdminResultSheetPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const classId = str(sp.class_id);
  const subjectId = str(sp.subject_id);
  const yearId = str(sp.year_id);
  const termId = str(sp.term_id);
  const importSessionId = str(sp.session_id);

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null as unknown };
  const isTeacher = (profile as { role?: string } | null)?.role === "teacher";

  const [{ data: years }, { data: terms }, { data: teacherClasses }, { data: classes }, { data: subjects }] =
    await Promise.all([
      supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
      supabase.from("academic_terms").select("id, name, academic_year_id").order("starts_on", { ascending: false }),
      isTeacher && user
        ? supabase
            .from("teacher_class_assignments")
            .select("class_id, classes(id, level, name)")
            .eq("teacher_id", user.id)
            .eq("active", true)
        : Promise.resolve({ data: [] as unknown[] }),
      !isTeacher
        ? supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name")
        : Promise.resolve({ data: [] as unknown[] }),
      supabase.from("subjects").select("id, name").eq("active", true).order("name")
    ]);

  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const classRows = isTeacher
    ? ((teacherClasses ?? []) as Array<{ classes: ClassRow | ClassRow[] | null }>)
        .map((r) => firstOrNull(r.classes))
        .filter((c): c is ClassRow => Boolean(c))
    : ((classes ?? []) as ClassRow[]);
  const subjectRows = (subjects ?? []) as SubjectRow[];

  // Subjects assigned to each visible class (Academics → Class subjects). Empty if none are set up yet.
  const { data: classSubjects } = classRows.length
    ? await supabase
        .from("class_subjects")
        .select("class_id, subject_id")
        .in(
          "class_id",
          classRows.map((c) => c.id)
        )
    : { data: [] as unknown[] };
  const subjectIdsByClass: Record<string, string[]> = {};
  for (const row of (classSubjects ?? []) as Array<{ class_id: string; subject_id: string }>) {
    (subjectIdsByClass[row.class_id] ??= []).push(row.subject_id);
  }
  const classSubjectIds = subjectIdsByClass[classId] ?? [];
  const classSubjectRows = subjectRows.filter((s) => classSubjectIds.includes(s.id));
  const yearNameById = new Map(yearRows.map((y) => [y.id, y.name] as const));
  const termLabel = (t: TermRow) => `${yearNameById.get(t.academic_year_id) ?? ""} · ${t.name}`.replace(/^ · /, "");

  const ready = Boolean(classId && subjectId && yearId && termId);
  const ctx: SheetContext = { classId, subjectId, yearId, termId };
  const cls = classRows.find((c) => c.id === classId) ?? null;
  const subject = subjectRows.find((s) => s.id === subjectId) ?? null;
  const term = termRows.find((t) => t.id === termId) ?? null;

  let students: StudentRow[] = [];
  const assessmentByType = new Map<string, AssessmentRow>();
  const scoreByKey = new Map<string, number>();
  let grades: GradeRow[] = [];
  let publicationId: string | null = null;
  let publishedAt: string | null = null;
  let sessions: SessionRow[] = [];

  if (ready) {
    const [{ data: studentsData }, { data: assessmentsData }, { data: gradesData }, { data: pubData }, { data: sessionsData }] =
      await Promise.all([
        supabase
          .from("students")
          .select("id, first_name, last_name, admission_number")
          .eq("class_id", classId)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true }),
        supabase
          .from("academic_assessments")
          .select("id, assessment_type, max_score")
          .eq("class_id", classId)
          .eq("subject_id", subjectId)
          .eq("academic_year_id", yearId)
          .eq("academic_term_id", termId)
          .in("assessment_type", resultColumnTypes)
          .order("created_at", { ascending: true }),
        cls
          ? supabase
              .from("grading_scales")
              .select("grade, min_score, max_score")
              .eq("level", cls.level)
              .eq("active", true)
              .order("min_score", { ascending: false })
          : Promise.resolve({ data: [] as unknown[] }),
        supabase
          .from("result_publications")
          .select("id, published_at")
          .eq("scope", "term_results")
          .eq("class_id", classId)
          .eq("academic_year_id", yearId)
          .eq("academic_term_id", termId)
          .maybeSingle(),
        supabase
          .from("exam_test_sessions")
          .select("id, starts_at, academic_term_id, results_released_at, exam_tests(id, name, subject_id)")
          .eq("class_id", classId)
          .order("starts_at", { ascending: false })
          .limit(100)
      ]);

    students = (studentsData ?? []) as StudentRow[];
    for (const a of (assessmentsData ?? []) as AssessmentRow[]) {
      if (!assessmentByType.has(a.assessment_type)) assessmentByType.set(a.assessment_type, a);
    }
    grades = (gradesData ?? []) as GradeRow[];
    publicationId = (pubData as { id: string } | null)?.id ?? null;
    publishedAt = (pubData as { published_at: string } | null)?.published_at ?? null;

    // CBT sessions for this class: show ones for this subject (or with no subject) first.
    sessions = ((sessionsData ?? []) as unknown as SessionRow[]).filter((s) => {
      const test = firstOrNull(s.exam_tests);
      return !test?.subject_id || test.subject_id === subjectId;
    });

    const assessmentIds = Array.from(assessmentByType.values()).map((a) => a.id);
    if (assessmentIds.length) {
      const { data: scoresData } = await supabase
        .from("academic_assessment_scores")
        .select("assessment_id, student_id, score")
        .in("assessment_id", assessmentIds);
      for (const s of (scoresData ?? []) as ScoreRow[]) {
        scoreByKey.set(`${s.assessment_id}:${s.student_id}`, Number(s.score));
      }
    }
  }

  const columnMax = (type: ResultColumnType) => {
    const a = assessmentByType.get(type);
    return a ? Number(a.max_score) : resultColumns.find((c) => c.type === type)!.defaultMax;
  };
  const maxTotal = resultColumns.reduce((acc, c) => acc + columnMax(c.type), 0);

  const scoreFor = (type: ResultColumnType, studentId: string) => {
    const a = assessmentByType.get(type);
    if (!a) return null;
    const v = scoreByKey.get(`${a.id}:${studentId}`);
    return v === undefined ? null : v;
  };

  const gradeFor = (total: number) => {
    const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
    return grades.find((g) => pct >= Number(g.min_score) && pct <= Number(g.max_score))?.grade ?? null;
  };

  const enteredCount = students.filter((st) => resultColumns.some((c) => scoreFor(c.type, st.id) !== null)).length;

  async function saveColumns(formData: FormData) {
    "use server";
    const supabase = getSupabaseServerClient();
    if (!ready) back(ctx, "Choose a class, subject and term first", "error");
    if (!supabase) back(ctx, "Database is not configured", "error");

    const overrides: Partial<Record<ResultColumnType, number>> = {};
    for (const col of resultColumns) {
      const v = Number(String(formData.get(`max:${col.type}`) ?? "").trim());
      if (!Number.isFinite(v) || v <= 0) back(ctx, `Enter a valid max score for ${col.label}`, "error");
      overrides[col.type] = v;
    }

    await ensureAssessments(supabase, ctx, overrides);
    revalidateResults();

    const total = Object.values(overrides).reduce((acc, v) => acc + (v ?? 0), 0);
    back(ctx, total === 100 ? "Max scores saved" : `Max scores saved (they add up to ${total}, not 100)`);
  }

  async function saveScores(formData: FormData) {
    "use server";
    const supabase = getSupabaseServerClient();
    if (!ready) back(ctx, "Choose a class, subject and term first", "error");
    if (!supabase) back(ctx, "Database is not configured", "error");

    const byType = await ensureAssessments(supabase, ctx);
    const missingColumns = resultColumns.filter((c) => !byType.get(c.type)).map((c) => c.label);
    if (missingColumns.length) {
      back(ctx, `Could not prepare the result sheet (${missingColumns.join(", ")}). Nothing was saved — please try again.`, "error");
    }
    const studentIds = String(formData.get("student_ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const upserts: Array<{ assessment_id: string; student_id: string; score: number; graded_by: string | null }> = [];
    const deletesByAssessment = new Map<string, string[]>();
    const problems: string[] = [];

    const {
      data: { user }
    } = await supabase.auth.getUser();

    for (const studentId of studentIds) {
      for (const col of resultColumns) {
        const a = byType.get(col.type);
        if (!a) continue;
        const raw = String(formData.get(`score:${col.type}:${studentId}`) ?? "").trim();
        if (!raw.length) {
          deletesByAssessment.set(a.id, [...(deletesByAssessment.get(a.id) ?? []), studentId]);
          continue;
        }
        const score = Number(raw);
        if (!Number.isFinite(score) || score < 0 || score > Number(a.max_score)) {
          problems.push(`${col.label} must be between 0 and ${a.max_score}`);
          continue;
        }
        upserts.push({ assessment_id: a.id, student_id: studentId, score, graded_by: user?.id ?? null });
      }
    }

    if (upserts.length) {
      const { error } = await supabase
        .from("academic_assessment_scores")
        .upsert(upserts, { onConflict: "assessment_id,student_id" });
      if (error) back(ctx, error.message, "error");
    }

    for (const [assessmentId, ids] of Array.from(deletesByAssessment.entries())) {
      const { error } = await supabase
        .from("academic_assessment_scores")
        .delete()
        .eq("assessment_id", assessmentId)
        .in("student_id", ids);
      if (error) back(ctx, error.message, "error");
    }

    revalidateResults();
    if (problems.length) {
      back(ctx, `Saved, but some scores were skipped: ${Array.from(new Set(problems)).join("; ")}`, "error");
    }
    back(ctx, "Scores saved");
  }

  async function importCbtScores(formData: FormData) {
    "use server";
    const supabase = getSupabaseServerClient();
    if (!ready) back(ctx, "Choose a class, subject and term first", "error");
    if (!supabase) back(ctx, "Database is not configured", "error");

    const sessionId = String(formData.get("session_id") ?? "").trim();
    const target = String(formData.get("target") ?? "").trim();
    if (!sessionId || !isResultColumnType(target)) back(ctx, "Choose an exam session and a column", "error");

    const byType = await ensureAssessments(supabase, ctx);
    const assessment = byType.get(target as ResultColumnType);
    if (!assessment) back(ctx, "Could not prepare the result sheet", "error");

    const [{ data: attempts }, { data: classStudents }] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select("student_id, obtained_marks, max_marks, submitted_at")
        .eq("session_id", sessionId)
        .not("submitted_at", "is", null),
      supabase.from("students").select("id").eq("class_id", ctx.classId)
    ]);

    const inClass = new Set(((classStudents ?? []) as Array<{ id: string }>).map((s) => s.id));
    const colMax = Number(assessment!.max_score);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const rows = ((attempts ?? []) as Array<{ student_id: string; obtained_marks: number; max_marks: number }>)
      .filter((a) => inClass.has(a.student_id) && Number(a.max_marks) > 0)
      .map((a) => ({
        assessment_id: assessment!.id,
        student_id: a.student_id,
        score: Math.min(colMax, round2((Number(a.obtained_marks) / Number(a.max_marks)) * colMax)),
        remarks: "Imported from CBT exam",
        graded_by: user?.id ?? null
      }));

    if (!rows.length) back(ctx, "No submitted attempts from this class were found for that session", "error");

    const { error } = await supabase
      .from("academic_assessment_scores")
      .upsert(rows, { onConflict: "assessment_id,student_id" });
    if (error) back(ctx, error.message, "error");

    revalidateResults();
    const label = resultColumns.find((c) => c.type === target)!.label;
    back(ctx, `Copied ${rows.length} CBT score(s) into ${label} (scaled to ${colMax})`);
  }

  async function publishResults() {
    "use server";
    const supabase = getSupabaseServerClient();
    if (!ready) back(ctx, "Choose a class, subject and term first", "error");
    if (!supabase) back(ctx, "Database is not configured", "error");

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("result_publications").upsert(
      {
        scope: "term_results",
        academic_year_id: ctx.yearId,
        academic_term_id: ctx.termId,
        level: cls?.level ?? null,
        class_id: ctx.classId,
        published_at: new Date().toISOString(),
        published_by: user?.id ?? null
      },
      { onConflict: "scope,academic_year_id,academic_term_id,level,class_id" }
    );
    if (error) back(ctx, error.message, "error");

    revalidateResults();
    back(ctx, "Results published — students and parents can now see them");
  }

  async function unpublishResults() {
    "use server";
    const supabase = getSupabaseServerClient();
    if (!ready) back(ctx, "Choose a class, subject and term first", "error");
    if (!supabase) back(ctx, "Database is not configured", "error");

    const { error } = await supabase
      .from("result_publications")
      .delete()
      .eq("scope", "term_results")
      .eq("class_id", ctx.classId)
      .eq("academic_year_id", ctx.yearId)
      .eq("academic_term_id", ctx.termId);

    revalidateResults();
    if (error) back(ctx, error.message, "error");
    back(ctx, "Results unpublished");
  }

  const gradeTone = (g: string | null) => {
    if (!g) return "slate" as const;
    const c = g.trim().toUpperCase()[0];
    if (c === "A") return "green" as const;
    if (c === "B" || c === "C") return "blue" as const;
    if (c === "D" || c === "E") return "gold" as const;
    if (c === "F") return "red" as const;
    return "slate" as const;
  };

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Result sheet"
        description="Enter 1st CA, 2nd CA and Exam scores for a class and subject, copy objective scores from a CBT exam, then publish so students and parents can see the result."
        actions={
          <ButtonLink href="/admin/academics/config" variant="secondary" size="sm">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Grading scale
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader title="Open a sheet" description="Pick the class, subject and term you want to enter scores for." />
        <CardBody className="space-y-4">
          <SheetPicker
            key={`${classId}|${subjectId}|${termId}`}
            action={openSheet}
            classes={classRows.map((c) => ({ id: c.id, label: `${c.level} - ${c.name}` }))}
            subjects={subjectRows.map((sub) => ({ id: sub.id, label: sub.name }))}
            terms={termRows.map((t) => ({ id: t.id, label: termLabel(t) }))}
            subjectIdsByClass={subjectIdsByClass}
            defaultClassId={classId}
            defaultSubjectId={subjectId}
            defaultTermId={termId}
          />
          {ready && classSubjectRows.length ? (
            <div className="border-t border-slate-100 pt-4">
              <div className="text-xs font-medium text-slate-500">
                Subjects for {cls ? cls.name : "this class"} · {classSubjectRows.length} in total
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {classSubjectRows.map((sub) => (
                  <Link
                    key={sub.id}
                    href={sheetUrl({ ...ctx, subjectId: sub.id })}
                    aria-current={sub.id === subjectId ? "page" : undefined}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition",
                      sub.id === subjectId
                        ? "border-brand-green bg-brand-green text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-brand-green-300 hover:bg-brand-green-50"
                    )}
                  >
                    {sub.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {ready && classSubjectIds.length > 0 && !classSubjectIds.includes(subjectId) ? (
            <Alert tone="warning">{subject?.name ?? "This subject"} is not assigned to this class.</Alert>
          ) : null}
          {isTeacher && !classRows.length ? (
            <Alert tone="warning">
              No classes are assigned to your account yet. Ask an admin to assign you to at least one class.
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      {ready ? (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Publish status */}
            <Card className={publicationId ? "!border-brand-green-200" : "!border-brand-gold-200"}>
              <CardHeader
                title="Publish status"
                action={
                  publicationId ? (
                    <Badge tone="green" dot>
                      Published
                    </Badge>
                  ) : (
                    <Badge tone="gold" dot>
                      Not published
                    </Badge>
                  )
                }
              />
              <CardBody className="space-y-4">
                <p className="text-sm text-slate-700">
                  {publicationId
                    ? `Published ${publishedAt ? new Date(publishedAt).toLocaleString() : ""}. Students and parents in ${
                        cls?.name ?? "this class"
                      } can see ${term?.name ?? "this term"}'s results.`
                    : "Not published. Students and parents cannot see these results yet."}
                </p>
                <p className="text-xs text-slate-500">Publishing applies to all subjects for this class and term.</p>
                {publicationId ? (
                  <form action={unpublishResults}>
                    <ConfirmSubmitButton
                      confirmMessage="Hide this term's results from students and parents?"
                      className={buttonClasses({ variant: "secondary" })}
                    >
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                      Unpublish
                    </ConfirmSubmitButton>
                  </form>
                ) : (
                  <form action={publishResults}>
                    <ConfirmSubmitButton
                      confirmMessage={`Publish ${term?.name ?? "this term"} results for ${cls?.name ?? "this class"}? Students and parents will be able to see them.`}
                      className={buttonClasses({ variant: "primary" })}
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      Publish results
                    </ConfirmSubmitButton>
                  </form>
                )}
              </CardBody>
            </Card>

            {/* CBT import */}
            <Card className="lg:col-span-2">
              <CardHeader
                title="Copy objective scores from a CBT exam"
                description="Takes each student's score from a computer-based exam session for this class and scales it to the column's max score. Re-importing overwrites the column, so theory scores are never touched."
              />
              <CardBody>
                {sessions.length ? (
                  <form action={importCbtScores} className="grid gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label htmlFor="cbt-session" className="gf-label">
                        Exam session
                      </label>
                      <select
                        id="cbt-session"
                        className="gf-select"
                        name="session_id"
                        defaultValue={importSessionId}
                        required
                      >
                        <option value="">Select exam session</option>
                        {sessions.map((s) => {
                          const test = firstOrNull(s.exam_tests);
                          const when = s.starts_at ? new Date(s.starts_at).toLocaleDateString() : "no date";
                          return (
                            <option key={s.id} value={s.id}>
                              {test?.name ?? "Exam"} ({when})
                              {s.academic_term_id && s.academic_term_id !== termId ? " · other term" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="cbt-target" className="gf-label">
                        Column
                      </label>
                      <select id="cbt-target" className="gf-select" name="target" defaultValue="exam_objective">
                        {resultColumns.map((c) => (
                          <option key={c.type} value={c.type}>
                            into {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3 flex justify-end">
                      <ConfirmSubmitButton
                        confirmMessage="Copy CBT scores into the selected column? Existing scores in that column will be replaced for students who took the exam."
                        className={buttonClasses({ variant: "secondary" })}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Copy CBT scores
                      </ConfirmSubmitButton>
                    </div>
                  </form>
                ) : (
                  <EmptyState
                    icon={MonitorCheck}
                    title="No CBT exam sessions"
                    description="No CBT exam sessions found for this class and subject. Create one under Exams → Sessions with this class."
                    className="py-6"
                  />
                )}
              </CardBody>
            </Card>
          </div>

          {/* Column max scores */}
          <form action={saveColumns}>
            <FormSection
              title="Max scores"
              description={
                <>
                  They should add up to 100 (currently{" "}
                  <span className={cn("font-semibold", maxTotal === 100 ? "text-brand-green-700" : "text-red-600")}>
                    {maxTotal}
                  </span>
                  ). Defaults: 1st CA 20, 2nd CA 20, Objective 30, Theory 30.
                </>
              }
              footer={
                <SubmitButton variant="secondary" pendingText="Saving…">
                  Save max scores
                </SubmitButton>
              }
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {resultColumns.map((c) => (
                  <Field key={c.type} label={c.label} htmlFor={`max-${c.type}`}>
                    <input
                      id={`max-${c.type}`}
                      className="gf-input tabular-nums"
                      name={`max:${c.type}`}
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0.5"
                      defaultValue={String(columnMax(c.type))}
                      required
                    />
                  </Field>
                ))}
              </div>
            </FormSection>
          </form>

          {/* Score grid */}
          <form action={saveScores}>
            <Card>
              <input type="hidden" name="student_ids" value={students.map((s) => s.id).join(",")} />
              <CardHeader
                title={`${subject?.name ?? "Subject"} · ${cls ? `${cls.level} - ${cls.name}` : "Class"}${
                  term ? ` · ${termLabel(term)}` : ""
                }`}
                description={`${enteredCount} of ${students.length} students have scores. Leave a box empty to clear it.`}
                action={
                  students.length ? (
                    <div className="hidden sm:block">
                      <SubmitButton variant="primary" pendingText="Saving…">
                        Save all scores
                      </SubmitButton>
                    </div>
                  ) : null
                }
              />

              {students.length ? (
                <div className="max-h-[70vh] overflow-auto overscroll-x-contain">
                  <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="sticky left-0 top-0 z-30 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 sm:pl-6"
                        >
                          Student
                        </th>
                        {resultColumns.map((c) => (
                          <th
                            key={c.type}
                            scope="col"
                            className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-xs font-semibold text-slate-600"
                          >
                            <div className="whitespace-nowrap">{c.label}</div>
                            <div className="font-normal text-slate-400">out of {columnMax(c.type)}</div>
                          </th>
                        ))}
                        <th
                          scope="col"
                          className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-right text-xs font-semibold text-slate-600"
                        >
                          <div>Total</div>
                          <div className="font-normal text-slate-400">out of {maxTotal}</div>
                        </th>
                        <th
                          scope="col"
                          className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs font-semibold text-slate-600 sm:pr-6"
                        >
                          Grade
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((st, rowIndex) => {
                        const values = resultColumns.map((c) => scoreFor(c.type, st.id));
                        const hasAny = values.some((v) => v !== null);
                        const total = round2(values.reduce<number>((acc, v) => acc + (v ?? 0), 0));
                        const grade = hasAny ? gradeFor(total) : null;
                        const zebra = rowIndex % 2 === 1 ? "bg-slate-50/60" : "bg-white";
                        return (
                          <tr key={st.id} className="group">
                            <th
                              scope="row"
                              className={cn(
                                "sticky left-0 z-10 border-b border-slate-100 px-4 py-2 text-left font-normal group-hover:bg-brand-green-50 sm:pl-6",
                                rowIndex % 2 === 1 ? "bg-slate-50" : "bg-white"
                              )}
                            >
                              <div className="max-w-[12rem] truncate font-semibold text-slate-900 sm:max-w-none">
                                {st.last_name} {st.first_name}
                              </div>
                              {st.admission_number ? (
                                <div className="text-xs text-slate-500">{st.admission_number}</div>
                              ) : null}
                            </th>
                            {resultColumns.map((c, i) => (
                              <td
                                key={c.type}
                                className={cn("border-b border-slate-100 px-2 py-2 text-center group-hover:bg-brand-green-50", zebra)}
                              >
                                <input
                                  className="h-9 w-[4.5rem] rounded-lg border border-slate-300 bg-white px-2 text-center text-sm tabular-nums text-slate-900 shadow-sm outline-none transition placeholder:text-slate-300 focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15 invalid:border-red-400 invalid:bg-red-50"
                                  name={`score:${c.type}:${st.id}`}
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  min="0"
                                  max={String(columnMax(c.type))}
                                  placeholder="–"
                                  defaultValue={values[i] === null ? "" : String(values[i])}
                                  aria-label={`${c.label} for ${st.first_name} ${st.last_name}`}
                                />
                              </td>
                            ))}
                            <td
                              className={cn(
                                "border-b border-slate-100 px-4 py-2 text-right font-semibold tabular-nums text-slate-900 group-hover:bg-brand-green-50",
                                zebra
                              )}
                            >
                              {hasAny ? total : <span className="text-slate-400">—</span>}
                            </td>
                            <td
                              className={cn(
                                "border-b border-slate-100 px-4 py-2 text-center group-hover:bg-brand-green-50 sm:pr-6",
                                zebra
                              )}
                            >
                              {grade ? (
                                <Badge tone={gradeTone(grade)}>{grade}</Badge>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={Users}
                  title="No students in this class"
                  description="Add students to this class and they will appear here for score entry."
                />
              )}

              {students.length ? (
                <div className="sticky bottom-0 z-30 flex flex-col gap-3 rounded-b-2xl border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Badge tone={enteredCount === students.length ? "green" : enteredCount ? "gold" : "slate"} dot>
                      {enteredCount}/{students.length} entered
                    </Badge>
                    <span className="hidden sm:inline">Totals and grades refresh after saving.</span>
                  </div>
                  <SubmitButton
                    className={buttonClasses({ variant: "primary", className: "w-full sm:w-auto" })}
                    pendingText="Saving…"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Save all scores
                    </span>
                  </SubmitButton>
                </div>
              ) : null}
            </Card>
          </form>

          <p className="text-xs text-slate-500">
            Totals and grades shown above refresh after saving. Grades come from the grading scale in{" "}
            <Link className="gf-link" href="/admin/academics/config">
              Config
            </Link>
            .
          </p>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title="No sheet open"
            description="Choose a class, subject and term above, then open the sheet to start entering scores."
          />
        </Card>
      )}
    </div>
  );
}
