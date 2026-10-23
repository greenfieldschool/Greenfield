import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Lock, Save, UserRound } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canTeach, getTeacherAccess } from "@/lib/teacher-access";
import { gradeFor, gradeRemark, resolveLayout, subjectPercent, type GradeBand } from "@/lib/results";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";

// One pupil, every subject for a term: for a late joiner, a single correction before the sheet is final, or
// checking one child's results. Same rules as the class result sheet (only changed boxes are saved; final and
// published sheets are locked by the database).

const PATH = "/admin/academics/results/pupil";

type Column = { id: string; subject_id: string; title: string | null; max_score: number };

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function back(params: Record<string, string>, message: string, type: "success" | "error" = "success"): never {
  const q = new URLSearchParams({ ...params, toast: message, toast_type: type });
  redirect(`${PATH}?${q.toString()}`);
}

async function savePupil(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "");
  const termId = String(formData.get("term_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const params = { class_id: classId, term_id: termId, student_id: studentId };
  const supabase = getSupabaseServerClient();
  if (!supabase || !classId || !termId || !studentId) back(params, "Choose a class, term and pupil first", "error");

  const { data: pupil } = await supabase.from("students").select("id").eq("id", studentId).eq("class_id", classId).maybeSingle();
  if (!pupil) back(params, "That pupil is not in this class", "error");

  const { data: colData } = await supabase
    .from("academic_assessments")
    .select("id, subject_id, title, max_score")
    .eq("class_id", classId)
    .eq("academic_term_id", termId)
    .eq("on_result_sheet", true);
  const columns = (colData ?? []) as Column[];
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Grouped per subject so a locked subject doesn't stop the others from saving.
  const bySubject = new Map<string, { upserts: Array<Record<string, unknown>>; deletes: string[]; name: string }>();
  const problems: string[] = [];
  for (const col of columns) {
    if (!formData.has(`score:${col.id}`)) continue;
    const raw = String(formData.get(`score:${col.id}`) ?? "").trim();
    if (raw === String(formData.get(`orig:${col.id}`) ?? "").trim()) continue;
    const entry = bySubject.get(col.subject_id) ?? { upserts: [], deletes: [], name: String(formData.get(`name:${col.subject_id}`) ?? "Subject") };
    if (!raw) entry.deletes.push(col.id);
    else {
      const score = Number(raw);
      if (!Number.isFinite(score) || score < 0 || score > Number(col.max_score)) {
        problems.push(`${entry.name} ${col.title}: must be 0–${Number(col.max_score)}`);
        continue;
      }
      entry.upserts.push({ assessment_id: col.id, student_id: studentId, score, graded_by: user?.id ?? null });
    }
    bySubject.set(col.subject_id, entry);
  }

  let changed = 0;
  for (const [, entry] of Array.from(bySubject.entries())) {
    if (entry.upserts.length) {
      const { error } = await supabase.from("academic_assessment_scores").upsert(entry.upserts, { onConflict: "assessment_id,student_id" });
      if (error) problems.push(`${entry.name}: ${error.message}`);
      else changed += entry.upserts.length;
    }
    if (entry.deletes.length) {
      const { error } = await supabase.from("academic_assessment_scores").delete().eq("student_id", studentId).in("assessment_id", entry.deletes);
      if (error) problems.push(`${entry.name}: ${error.message}`);
      else changed += entry.deletes.length;
    }
  }

  revalidatePath(PATH);
  revalidatePath("/admin/academics/results");
  revalidatePath("/admin/academics/reports");
  if (problems.length) back(params, `Saved ${changed} change(s). Not saved: ${problems.join("; ")}`, "error");
  back(params, changed ? `Saved ${changed} change(s)` : "Nothing had changed");
}

export default async function PupilResultsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const classId = str(sp.class_id);
  const termId = str(sp.term_id);
  const studentId = str(sp.student_id);

  const access = await getTeacherAccess(supabase);
  const [{ data: classes }, { data: terms }, { data: years }] = await Promise.all([
    access.isTeacher
      ? Promise.resolve({ data: access.classes })
      : supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase.from("academic_terms").select("id, name, academic_year_id, is_active").order("starts_on", { ascending: false }),
    supabase.from("academic_years").select("id, name")
  ]);
  const classRows = (classes ?? []) as Array<{ id: string; level: string; name: string }>;
  const yearName = new Map(((years ?? []) as Array<{ id: string; name: string }>).map((y) => [y.id, y.name] as const));
  const termRows = (terms ?? []) as Array<{ id: string; name: string; academic_year_id: string; is_active: boolean }>;
  const termIdOrActive = termId || termRows.find((t) => t.is_active)?.id || "";
  const cls = classRows.find((c) => c.id === classId) ?? null;

  const { data: pupilsData } = classId
    ? await supabase
        .from("students")
        .select("id, first_name, last_name, admission_number")
        .eq("class_id", classId)
        .order("last_name")
        .order("first_name")
    : { data: [] };
  const pupils = (pupilsData ?? []) as Array<{ id: string; first_name: string; last_name: string; admission_number: string | null }>;
  const pupil = pupils.find((p) => p.id === studentId) ?? null;

  type SubjectBlock = { id: string; name: string; columns: Column[]; locked: boolean; canEdit: boolean };
  let blocks: SubjectBlock[] = [];
  let grades: GradeBand[] = [];
  const scoreOf = new Map<string, number>();
  let published = false;

  if (cls && pupil && termIdOrActive) {
    const [{ data: offered }, { data: gradeData }, { data: pub }, { data: locks }] = await Promise.all([
      supabase.from("class_subjects").select("subject_id, subjects(id, name)").eq("class_id", cls.id),
      supabase.from("grading_scales").select("grade, min_score, max_score, remark").eq("level", cls.level).eq("active", true).order("min_score", { ascending: false }),
      supabase.from("result_publications").select("id").eq("scope", "term_results").eq("class_id", cls.id).eq("academic_term_id", termIdOrActive).maybeSingle(),
      supabase.from("result_sheet_locks").select("subject_id").eq("class_id", cls.id).eq("academic_term_id", termIdOrActive)
    ]);
    grades = (gradeData ?? []) as GradeBand[];
    published = Boolean(pub);
    const lockedIds = new Set(((locks ?? []) as Array<{ subject_id: string }>).map((l) => l.subject_id));
    let subjects = ((offered ?? []) as unknown as Array<{ subject_id: string; subjects: { id: string; name: string } | { id: string; name: string }[] | null }>)
      .map((r) => (Array.isArray(r.subjects) ? r.subjects[0] : r.subjects))
      .filter((x): x is { id: string; name: string } => Boolean(x));
    // No subjects assigned to the class yet: use the subjects that already have a sheet this term.
    if (!subjects.length) {
      const { data: sheetSubjects } = await supabase
        .from("academic_assessments")
        .select("subject_id")
        .eq("class_id", cls.id)
        .eq("academic_term_id", termIdOrActive)
        .eq("on_result_sheet", true);
      const ids = Array.from(new Set(((sheetSubjects ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id)));
      const { data: named } = ids.length ? await supabase.from("subjects").select("id, name").in("id", ids) : { data: [] };
      subjects = (named ?? []) as Array<{ id: string; name: string }>;
    }
    subjects = subjects.filter((x) => canTeach(access, cls.id, x.id)).sort((a, b) => a.name.localeCompare(b.name));

    // Open each subject's sheet with its standard columns if it doesn't exist yet.
    for (const sub of subjects) {
      const layout = await resolveLayout(supabase, { classId: cls.id, subjectId: sub.id, level: cls.level });
      await supabase.rpc("ensure_result_sheet", { p_class: cls.id, p_subject: sub.id, p_term: termIdOrActive, p_columns: layout.components });
    }
    const { data: colData } = await supabase
      .from("academic_assessments")
      .select("id, subject_id, title, max_score")
      .eq("class_id", cls.id)
      .eq("academic_term_id", termIdOrActive)
      .eq("on_result_sheet", true)
      .order("position", { ascending: true });
    const columns = (colData ?? []) as Column[];
    if (columns.length) {
      const { data: scores } = await supabase
        .from("academic_assessment_scores")
        .select("assessment_id, score")
        .eq("student_id", pupil.id)
        .in(
          "assessment_id",
          columns.map((c) => c.id)
        );
      for (const s of (scores ?? []) as Array<{ assessment_id: string; score: number }>) scoreOf.set(s.assessment_id, Number(s.score));
    }
    blocks = subjects.map((sub) => ({
      id: sub.id,
      name: sub.name,
      columns: columns.filter((c) => c.subject_id === sub.id),
      locked: published || lockedIds.has(sub.id),
      canEdit: true
    }));
  }

  const termLabel = (t: { name: string; academic_year_id: string }) => `${yearName.get(t.academic_year_id) ?? ""} · ${t.name}`.replace(/^ · /, "");
  const input =
    "h-9 w-[4.5rem] rounded-lg border border-slate-300 bg-white px-2 text-center text-sm tabular-nums shadow-sm outline-none focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15 invalid:border-red-400 invalid:bg-red-50 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Result management"
        title="Single pupil results"
        description="Enter or check one pupil's scores for every subject in a term. Only the boxes you change are saved. To enter a whole class at once, use the class result sheet."
      />

      <Card>
        <CardHeader title="Choose a pupil" />
        <CardBody>
          <form action={PATH} className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <div>
              <label className="gf-label" htmlFor="p-class">
                Class
              </label>
              <select id="p-class" name="class_id" defaultValue={classId} className="gf-select" required>
                <option value="">Select class</option>
                {classRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="gf-label" htmlFor="p-term">
                Term
              </label>
              <select id="p-term" name="term_id" defaultValue={termIdOrActive} className="gf-select" required>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {termLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="gf-label" htmlFor="p-pupil">
                Pupil
              </label>
              <select id="p-pupil" name="student_id" defaultValue={pupil?.id ?? ""} className="gf-select" disabled={!pupils.length}>
                <option value="">{classId ? (pupils.length ? "Select pupil" : "No pupils in this class") : "Choose a class first"}</option>
                {pupils.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.last_name} {p.first_name}
                    {p.admission_number ? ` (${p.admission_number})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className={buttonClasses({ variant: "primary", className: "w-full sm:w-auto" })}>
                {classId && !pupil ? "Show pupils" : "Open"}
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {!cls || !pupil ? (
        <Card>
          <EmptyState icon={UserRound} title="No pupil chosen" description="Choose a class and term, then pick the pupil." />
        </Card>
      ) : !blocks.length ? (
        <Alert tone="warning">
          No subjects to show. Assign subjects to {cls.name} under Class subjects
          {access.isTeacher ? ", or ask an admin to assign you to subjects in this class" : ""}.
        </Alert>
      ) : (
        <form action={savePupil}>
          <input type="hidden" name="class_id" value={cls.id} />
          <input type="hidden" name="term_id" value={termIdOrActive} />
          <input type="hidden" name="student_id" value={pupil.id} />
          <Card>
            <CardHeader
              title={`${pupil.last_name} ${pupil.first_name}`}
              description={`${cls.name} · ${termRows.find((t) => t.id === termIdOrActive) ? termLabel(termRows.find((t) => t.id === termIdOrActive)!) : ""}${
                published ? " · Report cards published: scores are locked" : ""
              }`}
            />
            <ul className="divide-y divide-slate-100">
              {blocks.map((b) => {
                const values = b.columns.map((c) => (scoreOf.has(c.id) ? scoreOf.get(c.id)! : null));
                const percent = subjectPercent(values, b.columns.map((c) => Number(c.max_score)));
                const complete = values.length > 0 && values.every((v) => v !== null);
                const grade = complete ? gradeFor(percent, grades) : null;
                return (
                  <li key={b.id} className="grid gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[12rem_1fr_8rem]">
                    <input type="hidden" name={`name:${b.id}`} value={b.name} />
                    <div>
                      <div className="font-semibold text-slate-900">{b.name}</div>
                      {b.locked ? (
                        <Badge tone="blue" className="mt-1">
                          <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                          {published ? "Published" : "Final"}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {b.columns.map((c, i) => (
                        <label key={c.id} className="text-xs text-slate-600">
                          <span className="block whitespace-nowrap">
                            {c.title} <span className="text-slate-400">/{Number(c.max_score)}</span>
                          </span>
                          <input type="hidden" name={`orig:${c.id}`} value={values[i] ?? ""} />
                          <input
                            name={`score:${c.id}`}
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            max={String(Number(c.max_score))}
                            defaultValue={values[i] ?? ""}
                            disabled={b.locked}
                            placeholder="–"
                            className={input}
                          />
                        </label>
                      ))}
                      {!b.columns.length ? <span className="text-sm text-slate-500">Sheet not set up.</span> : null}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold tabular-nums text-slate-900">{percent ?? "—"}</div>
                      <div className="text-xs text-slate-500">
                        {grade ? `${grade} · ${gradeRemark(grade, grades) ?? ""}` : percent !== null ? "so far" : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col gap-2 rounded-b-2xl border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-slate-500">
                Locked subjects can only change through a correction request on the{" "}
                <Link className="gf-link" href={`/admin/academics/results?class_id=${cls.id}&term_id=${termIdOrActive}`}>
                  class result sheet
                </Link>
                .
              </p>
              <SubmitButton className={buttonClasses({ variant: "primary" })} pendingText="Saving…">
                <span className="inline-flex items-center gap-2">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save changes
                </span>
              </SubmitButton>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}
