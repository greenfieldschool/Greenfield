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

  async function openSheet(formData: FormData) {
    "use server";
    const nextTermId = String(formData.get("term_id") ?? "").trim();
    const next: SheetContext = {
      classId: String(formData.get("class_id") ?? "").trim(),
      subjectId: String(formData.get("subject_id") ?? "").trim(),
      yearId: termRows.find((t) => t.id === nextTermId)?.academic_year_id ?? "",
      termId: nextTermId
    };
    redirect(sheetUrl(next));
  }

  async function saveColumns(formData: FormData) {
    "use server";
    const supabase = getSupabaseServerClient();
    if (!supabase || !ready) return;

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
    if (!supabase || !ready) return;

    const byType = await ensureAssessments(supabase, ctx);
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
      await supabase.from("academic_assessment_scores").delete().eq("assessment_id", assessmentId).in("student_id", ids);
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
    if (!supabase || !ready) return;

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
    if (!supabase || !ready) return;

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
    if (!supabase || !ready) return;

    await supabase
      .from("result_publications")
      .delete()
      .eq("scope", "term_results")
      .eq("class_id", ctx.classId)
      .eq("academic_year_id", ctx.yearId)
      .eq("academic_term_id", ctx.termId);

    revalidateResults();
    back(ctx, "Results unpublished");
  }

  const selectClass =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green";

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Academics</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Result sheet</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter 1st CA, 2nd CA and Exam scores for a class and subject, copy objective scores from a CBT exam, then
          publish so students and parents can see the result.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <form action={openSheet} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-sm font-semibold text-slate-900">Class</label>
            <select className={selectClass} name="class_id" defaultValue={classId} required>
              <option value="">Select class</option>
              {classRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level} - {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Subject</label>
            <select className={selectClass} name="subject_id" defaultValue={subjectId} required>
              <option value="">Select subject</option>
              {subjectRows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Term</label>
            <select className={selectClass} name="term_id" defaultValue={termId} required>
              <option value="">Select term</option>
              {termRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {termLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <SubmitButton
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              pendingText="Opening…"
            >
              Open sheet
            </SubmitButton>
          </div>
        </form>
        {isTeacher && !classRows.length ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No classes are assigned to your account yet. Ask an admin to assign you to at least one class.
          </div>
        ) : null}
      </div>

      {ready ? (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Publish status */}
            <div
              className={`rounded-3xl border p-6 shadow-sm ${
                publicationId ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="text-sm font-semibold text-slate-900">Publish status</div>
              <p className="mt-2 text-sm text-slate-700">
                {publicationId
                  ? `Published ${publishedAt ? new Date(publishedAt).toLocaleString() : ""}. Students and parents in ${
                      cls?.name ?? "this class"
                    } can see ${term?.name ?? "this term"}'s results.`
                  : "Not published. Students and parents cannot see these results yet."}
              </p>
              <p className="mt-1 text-xs text-slate-600">Publishing applies to all subjects for this class and term.</p>
              <div className="mt-4">
                {publicationId ? (
                  <form action={unpublishResults}>
                    <ConfirmSubmitButton
                      confirmMessage="Hide this term's results from students and parents?"
                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Unpublish
                    </ConfirmSubmitButton>
                  </form>
                ) : (
                  <form action={publishResults}>
                    <ConfirmSubmitButton
                      confirmMessage={`Publish ${term?.name ?? "this term"} results for ${cls?.name ?? "this class"}? Students and parents will be able to see them.`}
                      className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
                    >
                      Publish results
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            </div>

            {/* CBT import */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="text-sm font-semibold text-slate-900">Copy objective scores from a CBT exam</div>
              <p className="mt-2 text-sm text-slate-600">
                Takes each student&apos;s score from a computer-based exam session for this class and scales it to the
                column&apos;s max score. Re-importing overwrites the column, so theory scores are never touched.
              </p>
              {sessions.length ? (
                <form action={importCbtScores} className="mt-4 grid gap-3 sm:grid-cols-3">
                  <select className={selectClass + " sm:col-span-2"} name="session_id" defaultValue={importSessionId} required>
                    <option value="">Select exam session</option>
                    {sessions.map((s) => {
                      const test = firstOrNull(s.exam_tests);
                      const when = s.starts_at ? new Date(s.starts_at).toLocaleDateString() : "no date";
                      return (
                        <option key={s.id} value={s.id}>
                          {test?.name ?? "Exam"} ({when}){s.academic_term_id && s.academic_term_id !== termId ? " · other term" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <select className={selectClass} name="target" defaultValue="exam_objective">
                    {resultColumns.map((c) => (
                      <option key={c.type} value={c.type}>
                        into {c.label}
                      </option>
                    ))}
                  </select>
                  <div className="sm:col-span-3">
                    <ConfirmSubmitButton
                      confirmMessage="Copy CBT scores into the selected column? Existing scores in that column will be replaced for students who took the exam."
                      className="inline-flex items-center justify-center rounded-xl border border-brand-green bg-white px-4 py-2 text-sm font-semibold text-brand-green hover:bg-emerald-50 disabled:opacity-60"
                    >
                      Copy CBT scores
                    </ConfirmSubmitButton>
                  </div>
                </form>
              ) : (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  No CBT exam sessions found for this class and subject. Create one under Exams → Sessions with this class.
                </div>
              )}
            </div>
          </div>

          {/* Column max scores */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Max scores</div>
            <p className="mt-1 text-xs text-slate-600">
              They should add up to 100 (currently {maxTotal}). Defaults: 1st CA 20, 2nd CA 20, Objective 30, Theory 30.
            </p>
            <form action={saveColumns} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {resultColumns.map((c) => (
                <div key={c.type}>
                  <label className="text-xs font-semibold text-slate-600">{c.label}</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name={`max:${c.type}`}
                    type="number"
                    step="0.5"
                    min="0.5"
                    defaultValue={String(columnMax(c.type))}
                    required
                  />
                </div>
              ))}
              <div className="flex items-end">
                <SubmitButton
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                  pendingText="Saving…"
                >
                  Save max scores
                </SubmitButton>
              </div>
            </form>
          </div>

          {/* Score grid */}
          <form action={saveScores} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <input type="hidden" name="student_ids" value={students.map((s) => s.id).join(",")} />
            <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-slate-900">
                  {subject?.name ?? "Subject"} · {cls ? `${cls.level} - ${cls.name}` : "Class"} · {term ? termLabel(term) : ""}
                </div>
                <div className="text-xs text-slate-500">
                  {enteredCount} of {students.length} students have scores. Leave a box empty to clear it.
                </div>
              </div>
              <SubmitButton
                className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
                pendingText="Saving…"
              >
                Save all scores
              </SubmitButton>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Student</th>
                    {resultColumns.map((c) => (
                      <th key={c.type} className="px-2 py-3 text-left">
                        {c.label}
                        <span className="ml-1 font-normal text-slate-400">/{columnMax(c.type)}</span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">
                      Total<span className="ml-1 font-normal text-slate-400">/{maxTotal}</span>
                    </th>
                    <th className="px-4 py-3 text-right">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length ? (
                    students.map((st) => {
                      const values = resultColumns.map((c) => scoreFor(c.type, st.id));
                      const hasAny = values.some((v) => v !== null);
                      const total = round2(values.reduce<number>((acc, v) => acc + (v ?? 0), 0));
                      return (
                        <tr key={st.id} className="border-t border-slate-200">
                          <td className="px-4 py-2">
                            <div className="font-semibold text-slate-900">
                              {st.last_name} {st.first_name}
                            </div>
                            {st.admission_number ? <div className="text-xs text-slate-500">{st.admission_number}</div> : null}
                          </td>
                          {resultColumns.map((c, i) => (
                            <td key={c.type} className="px-2 py-2">
                              <input
                                className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                                name={`score:${c.type}:${st.id}`}
                                type="number"
                                step="0.01"
                                min="0"
                                max={String(columnMax(c.type))}
                                defaultValue={values[i] === null ? "" : String(values[i])}
                                aria-label={`${c.label} for ${st.first_name} ${st.last_name}`}
                              />
                            </td>
                          ))}
                          <td className="px-4 py-2 text-right font-semibold text-slate-900">{hasAny ? total : "—"}</td>
                          <td className="px-4 py-2 text-right text-slate-700">{hasAny ? gradeFor(total) ?? "—" : "—"}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={resultColumns.length + 3} className="px-6 py-8 text-sm text-slate-600">
                        No students are in this class.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {students.length ? (
              <div className="flex justify-end border-t border-slate-200 px-6 py-4">
                <SubmitButton
                  className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
                  pendingText="Saving…"
                >
                  Save all scores
                </SubmitButton>
              </div>
            ) : null}
          </form>

          <div className="text-xs text-slate-500">
            Totals and grades shown above refresh after saving. Grades come from the grading scale in{" "}
            <Link className="font-semibold text-brand-green hover:underline" href="/admin/academics/config">
              Config
            </Link>
            .
          </div>
        </>
      ) : null}
    </div>
  );
}

