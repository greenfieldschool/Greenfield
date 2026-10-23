import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import { canTeach, getTeacherAccess } from "@/lib/teacher-access";
import {
  componentGroups,
  gradeFor,
  gradeRemark,
  groupColors,
  layoutSourceLabel,
  layoutTotal,
  parseLayout,
  resolveLayout,
  round2,
  subjectPercent,
  type ComponentGroup,
  type GradeBand
} from "@/lib/results";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import ColumnsEditor from "@/components/columns-editor";
import SheetPicker from "./SheetPicker";
import { Columns3, Download, FilePen, FileSpreadsheet, FileText, History, Lock, LockOpen, MonitorCheck, Save, Send, Settings2, Upload, Users } from "lucide-react";
import { CorrectionRequestCard, loadCorrectionRequests } from "../corrections/_requests";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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
type ColumnRow = { id: string; title: string | null; max_score: number; position: number; component_group: string | null };
type ScoreRow = { assessment_id: string; student_id: string; score: number };
type SessionRow = {
  id: string;
  starts_at: string | null;
  academic_term_id: string | null;
  exam_tests: { id: string; name: string; subject_id: string | null } | Array<{ id: string; name: string; subject_id: string | null }> | null;
};

type SheetContext = { classId: string; subjectId: string; yearId: string; termId: string };

const groupLabel = Object.fromEntries(componentGroups.map((g) => [g.value, g.label.split(" ")[0]])) as Record<ComponentGroup, string>;

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function asGroup(v: string | null): ComponentGroup {
  return v === "ca" || v === "exam" ? v : "other";
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

function sheetColumns(supabase: SupabaseClient, ctx: SheetContext) {
  return supabase
    .from("academic_assessments")
    .select("id, title, max_score, position, component_group")
    .eq("class_id", ctx.classId)
    .eq("subject_id", ctx.subjectId)
    .eq("academic_year_id", ctx.yearId)
    .eq("academic_term_id", ctx.termId)
    .eq("on_result_sheet", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
}

// Teachers only work on the subjects they teach in this class (the database enforces this too).
async function requireTeachAccess(supabase: SupabaseClient, ctx: SheetContext) {
  const access = await getTeacherAccess(supabase as Parameters<typeof getTeacherAccess>[0]);
  if (!canTeach(access, ctx.classId, ctx.subjectId)) {
    back(ctx, "You are not assigned to teach this subject in this class. Ask an admin to assign it to you.", "error");
  }
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
  revalidatePath("/admin/academics/reports");
  revalidatePath("/admin/academics/assessments");
  revalidatePath("/portal/academics");
  revalidatePath("/portal");
}

function readContext(formData: FormData): SheetContext {
  return {
    classId: String(formData.get("class_id") ?? "").trim(),
    subjectId: String(formData.get("subject_id") ?? "").trim(),
    yearId: String(formData.get("year_id") ?? "").trim(),
    termId: String(formData.get("term_id") ?? "").trim()
  };
}

// Creates, renames, resizes, reorders and removes the sheet's columns.
async function saveColumns(formData: FormData) {
  "use server";
  const ctx = readContext(formData);
  if (!ctx.classId || !ctx.subjectId || !ctx.yearId || !ctx.termId) back(ctx, "Choose a class, subject and term first", "error");
  const supabase = getSupabaseServerClient();
  if (!supabase) back(ctx, "Database is not configured", "error");
  await requireTeachAccess(supabase, ctx);

  let submitted: Array<{ id?: string; label: string; group: ComponentGroup; max: number }> = [];
  try {
    submitted = JSON.parse(String(formData.get("columns") ?? "[]"));
  } catch {
    back(ctx, "Could not read the columns. Please try again.", "error");
  }
  const parsed = parseLayout(submitted);
  if (!parsed) {
    back(ctx, "Every column needs a name (all different) and a max score above 0, with at most 12 columns.", "error");
  }
  const rows = parsed.map((c, i) => ({ ...c, id: typeof submitted[i]?.id === "string" ? submitted[i].id : undefined }));

  const { data: existingData, error: readError } = await sheetColumns(supabase, ctx);
  if (readError) back(ctx, readError.message, "error");
  const existing = (existingData ?? []) as ColumnRow[];
  const existingIds = new Set(existing.map((c) => c.id));

  const { data: scoreData } = existing.length
    ? await supabase
        .from("academic_assessment_scores")
        .select("assessment_id, score")
        .in(
          "assessment_id",
          existing.map((c) => c.id)
        )
    : { data: [] };
  const highest = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const s of (scoreData ?? []) as Array<{ assessment_id: string; score: number }>) {
    highest.set(s.assessment_id, Math.max(highest.get(s.assessment_id) ?? 0, Number(s.score)));
    counts.set(s.assessment_id, (counts.get(s.assessment_id) ?? 0) + 1);
  }

  const keptIds = new Set(rows.map((r) => r.id).filter((id): id is string => !!id && existingIds.has(id)));
  const removed = existing.filter((c) => !keptIds.has(c.id));
  if (removed.some((c) => counts.get(c.id)) && formData.get("confirm_remove") !== "on") {
    back(ctx, "Tick the box to confirm deleting the scores in the columns you removed.", "error");
  }
  for (const r of rows) {
    if (r.id && keptIds.has(r.id) && (highest.get(r.id) ?? 0) > r.max) {
      back(ctx, `“${r.label}” already has a score of ${highest.get(r.id)}, so its max score can't be lower than that.`, "error");
    }
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (removed.length) {
    const { error } = await supabase
      .from("academic_assessments")
      .delete()
      .in(
        "id",
        removed.map((c) => c.id)
      );
    if (error) back(ctx, error.message, "error");
  }

  for (const [i, r] of rows.entries()) {
    const values = { title: r.label, max_score: r.max, component_group: r.group, assessment_type: r.group, position: i + 1 };
    const { error } =
      r.id && keptIds.has(r.id)
        ? await supabase.from("academic_assessments").update(values).eq("id", r.id)
        : await supabase.from("academic_assessments").insert({
            ...values,
            class_id: ctx.classId,
            subject_id: ctx.subjectId,
            academic_year_id: ctx.yearId,
            academic_term_id: ctx.termId,
            on_result_sheet: true,
            created_by: user?.id ?? null
          });
    if (error) back(ctx, error.message, "error");
  }

  // Optionally keep this layout for future terms of this subject in this class.
  if (formData.get("save_default") === "on") {
    const components = rows.map(({ label, group, max }) => ({ label, group, max }));
    const { data: current } = await supabase
      .from("result_layouts")
      .select("id")
      .eq("class_id", ctx.classId)
      .eq("subject_id", ctx.subjectId)
      .is("level", null)
      .maybeSingle();
    const { error } = current
      ? await supabase
          .from("result_layouts")
          .update({ components, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
          .eq("id", (current as { id: string }).id)
      : await supabase
          .from("result_layouts")
          .insert({ class_id: ctx.classId, subject_id: ctx.subjectId, components, updated_by: user?.id ?? null });
    if (error) back(ctx, `Columns saved, but they could not be kept for future terms: ${error.message}`, "error");
  }

  revalidateResults();
  const total = layoutTotal(rows);
  back(ctx, total === 100 ? "Columns saved" : `Columns saved. They add up to ${total}, so totals are scaled to 100.`);
}

// Saves only the boxes that changed since the sheet was opened, so CA scores can be saved now and exam scores
// later (or by someone else) without one overwriting the other.
async function saveScores(formData: FormData) {
  "use server";
  const ctx = readContext(formData);
  const supabase = getSupabaseServerClient();
  if (!supabase) back(ctx, "Database is not configured", "error");
  await requireTeachAccess(supabase, ctx);

  const { data: colData } = await sheetColumns(supabase, ctx);
  const columns = (colData ?? []) as ColumnRow[];
  if (!columns.length) back(ctx, "Set up the sheet's columns first", "error");

  const studentIds = String(formData.get("student_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const upserts: Array<{ assessment_id: string; student_id: string; score: number; graded_by: string | null }> = [];
  const deletesByColumn = new Map<string, string[]>();
  const problems: string[] = [];

  for (const studentId of studentIds) {
    for (const col of columns) {
      const field = `${col.id}:${studentId}`;
      if (!formData.has(`score:${field}`)) continue;
      const raw = String(formData.get(`score:${field}`) ?? "").trim();
      const orig = String(formData.get(`orig:${field}`) ?? "").trim();
      if (raw === orig) continue;
      if (!raw.length) {
        deletesByColumn.set(col.id, [...(deletesByColumn.get(col.id) ?? []), studentId]);
        continue;
      }
      const score = Number(raw);
      if (!Number.isFinite(score) || score < 0 || score > Number(col.max_score)) {
        problems.push(`${col.title ?? "Score"} must be between 0 and ${col.max_score}`);
        continue;
      }
      upserts.push({ assessment_id: col.id, student_id: studentId, score, graded_by: user?.id ?? null });
    }
  }

  if (upserts.length) {
    const { error } = await supabase.from("academic_assessment_scores").upsert(upserts, { onConflict: "assessment_id,student_id" });
    if (error) back(ctx, error.message, "error");
  }
  for (const [columnId, ids] of Array.from(deletesByColumn.entries())) {
    const { error } = await supabase.from("academic_assessment_scores").delete().eq("assessment_id", columnId).in("student_id", ids);
    if (error) back(ctx, error.message, "error");
  }

  revalidateResults();
  const changed = upserts.length + Array.from(deletesByColumn.values()).reduce((a, ids) => a + ids.length, 0);
  if (problems.length) {
    back(ctx, `Saved ${changed} change(s), but some scores were skipped: ${Array.from(new Set(problems)).join("; ")}`, "error");
  }
  back(ctx, changed ? `Saved ${changed} change(s)` : "Nothing had changed");
}

async function importCbtScores(formData: FormData) {
  "use server";
  const ctx = readContext(formData);
  const supabase = getSupabaseServerClient();
  if (!supabase) back(ctx, "Database is not configured", "error");
  await requireTeachAccess(supabase, ctx);

  const sessionId = String(formData.get("session_id") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim();
  if (!sessionId || !target) back(ctx, "Choose an exam session and a column", "error");

  const { data: colData } = await sheetColumns(supabase, ctx);
  const column = ((colData ?? []) as ColumnRow[]).find((c) => c.id === target);
  if (!column) back(ctx, "That column is no longer on the sheet", "error");

  const [{ data: attempts }, { data: classStudents }] = await Promise.all([
    supabase
      .from("exam_attempts")
      .select("student_id, obtained_marks, max_marks, submitted_at")
      .eq("session_id", sessionId)
      .not("submitted_at", "is", null),
    supabase.from("students").select("id").eq("class_id", ctx.classId)
  ]);

  const inClass = new Set(((classStudents ?? []) as Array<{ id: string }>).map((s) => s.id));
  const colMax = Number(column.max_score);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const rows = ((attempts ?? []) as Array<{ student_id: string; obtained_marks: number; max_marks: number }>)
    .filter((a) => inClass.has(a.student_id) && Number(a.max_marks) > 0)
    .map((a) => ({
      assessment_id: column.id,
      student_id: a.student_id,
      score: Math.min(colMax, round2((Number(a.obtained_marks) / Number(a.max_marks)) * colMax)),
      remarks: "Imported from CBT exam",
      graded_by: user?.id ?? null
    }));
  if (!rows.length) back(ctx, "No submitted attempts from this class were found for that session", "error");

  const { error } = await supabase.from("academic_assessment_scores").upsert(rows, { onConflict: "assessment_id,student_id" });
  if (error) back(ctx, error.message, "error");

  revalidateResults();
  back(ctx, `Copied ${rows.length} CBT score(s) into ${column.title ?? "the column"} (scaled to ${colMax})`);
}

// Paste from Excel: rows of [admission no, pupil name, score per column] (or [admission no or name, scores…]).
// Fills only the cells that have a value; empty cells keep what is saved. Locked sheets are refused by the database.
async function bulkUpload(formData: FormData) {
  "use server";
  const ctx = readContext(formData);
  const supabase = getSupabaseServerClient();
  if (!supabase) back(ctx, "Database is not configured", "error");
  await requireTeachAccess(supabase, ctx);

  const [{ data: colData }, { data: studentData }] = await Promise.all([
    sheetColumns(supabase, ctx),
    supabase.from("students").select("id, first_name, last_name, admission_number").eq("class_id", ctx.classId)
  ]);
  const columns = (colData ?? []) as ColumnRow[];
  const pupils = (studentData ?? []) as StudentRow[];
  if (!columns.length) back(ctx, "This sheet has no columns yet", "error");

  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  const byKey = new Map<string, string>();
  for (const p of pupils) {
    if (p.admission_number) byKey.set(norm(p.admission_number), p.id);
    byKey.set(norm(`${p.last_name} ${p.first_name}`), p.id);
    byKey.set(norm(`${p.first_name} ${p.last_name}`), p.id);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const upserts = new Map<string, { assessment_id: string; student_id: string; score: number; graded_by: string | null }>();
  const unmatched: string[] = [];
  const problems: string[] = [];
  const lines = String(formData.get("pasted") ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length);

  for (const line of lines) {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (/admission|pupil|name/i.test(cells[0] ?? "") && cells.slice(1).some((c) => /ca|exam|theory|objective/i.test(c))) continue; // heading row
    let studentId: string | undefined;
    let scores: string[];
    if (cells.length >= columns.length + 2) {
      studentId = byKey.get(norm(cells[0])) ?? byKey.get(norm(cells[1]));
      scores = cells.slice(2, 2 + columns.length);
    } else {
      studentId = byKey.get(norm(cells[0]));
      scores = cells.slice(1, 1 + columns.length);
    }
    if (!studentId) {
      unmatched.push(cells[1] || cells[0]);
      continue;
    }
    columns.forEach((col, i) => {
      const raw = (scores[i] ?? "").trim();
      if (!raw) return;
      const score = Number(raw);
      if (!Number.isFinite(score) || score < 0 || score > Number(col.max_score)) {
        problems.push(`${col.title} "${raw}" (max ${Number(col.max_score)})`);
        return;
      }
      upserts.set(`${col.id}:${studentId}`, { assessment_id: col.id, student_id: studentId!, score, graded_by: user?.id ?? null });
    });
  }

  if (upserts.size) {
    const { error } = await supabase
      .from("academic_assessment_scores")
      .upsert(Array.from(upserts.values()), { onConflict: "assessment_id,student_id" });
    if (error) back(ctx, error.message, "error");
  }
  revalidateResults();
  const notes = [
    unmatched.length ? `${unmatched.length} row(s) not matched to a pupil in this class (${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? "…" : ""})` : null,
    problems.length ? `${problems.length} score(s) skipped because they were not numbers or above the maximum: ${problems.slice(0, 5).join("; ")}` : null
  ].filter(Boolean);
  back(ctx, `Uploaded ${upserts.size} score(s).${notes.length ? ` ${notes.join(". ")}.` : ""}`, notes.length ? "error" : "success");
}

// Marks the sheet as final. From then on nobody can change its scores or columns until an admin unlocks it.
async function submitSheet(formData: FormData) {
  "use server";
  const ctx = readContext(formData);
  const supabase = getSupabaseServerClient();
  if (!supabase) back(ctx, "Database is not configured", "error");
  const { error } = await supabase.rpc("submit_result_sheet", { p_class: ctx.classId, p_subject: ctx.subjectId, p_term: ctx.termId });
  if (error) back(ctx, error.message, "error");
  revalidateResults();
  back(ctx, "Submitted as final. The scores are now locked.");
}

// On a locked sheet: the boxes the teacher changed become a correction request for an admin to approve.
async function requestCorrection(formData: FormData) {
  "use server";
  const ctx = readContext(formData);
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(ctx, "Database is not configured", "error");
  if (reason.length < 5) redirect(sheetUrl(ctx, { request: "1", toast: "Explain why the scores need correcting", toast_type: "error" }));

  const { data: colData } = await sheetColumns(supabase, ctx);
  const columns = (colData ?? []) as ColumnRow[];
  const studentIds = String(formData.get("student_ids") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const items: Array<{ assessment_id: string; student_id: string; new_score: number | null }> = [];
  for (const studentId of studentIds) {
    for (const col of columns) {
      const field = `${col.id}:${studentId}`;
      if (!formData.has(`score:${field}`)) continue;
      const raw = String(formData.get(`score:${field}`) ?? "").trim();
      if (raw === String(formData.get(`orig:${field}`) ?? "").trim()) continue;
      const value = raw.length ? Number(raw) : null;
      if (value !== null && !Number.isFinite(value)) continue;
      items.push({ assessment_id: col.id, student_id: studentId, new_score: value });
    }
  }
  if (!items.length) {
    redirect(sheetUrl(ctx, { request: "1", toast: "Change the score(s) that are wrong first, then send the request", toast_type: "error" }));
  }

  const { error } = await supabase.rpc("request_result_correction", {
    p_class: ctx.classId,
    p_subject: ctx.subjectId,
    p_term: ctx.termId,
    p_reason: reason,
    p_items: items
  });
  if (error) redirect(sheetUrl(ctx, { request: "1", toast: error.message, toast_type: "error" }));
  revalidateResults();
  revalidatePath("/admin/academics/corrections");
  back(ctx, `Correction request sent to the admin (${items.length} change${items.length === 1 ? "" : "s"}). The scores change only if it is approved.`);
}

// Admin only, with a reason that is kept in the audit log.
async function unlockSheet(formData: FormData) {
  "use server";
  const ctx = readContext(formData);
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(ctx, "Database is not configured", "error");
  if (reason.length < 5) back(ctx, "Give a reason for unlocking (it is kept in the audit log)", "error");
  const { error } = await supabase.rpc("unlock_result_sheet", {
    p_class: ctx.classId,
    p_subject: ctx.subjectId,
    p_term: ctx.termId,
    p_reason: reason
  });
  if (error) back(ctx, error.message, "error");
  revalidateResults();
  back(ctx, "Sheet unlocked. Make the correction, then submit it as final again.");
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
  let yearId = str(sp.year_id);
  const requestMode = str(sp.request) === "1";
  const termId = str(sp.term_id);
  const importSessionId = str(sp.session_id);

  // Teachers see only their classes, and in each class only the subjects they teach.
  const access = await getTeacherAccess(supabase);
  const isTeacher = access.isTeacher;

  const [{ data: years }, { data: terms }, { data: classes }, { data: subjects }] = await Promise.all([
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name, academic_year_id").order("starts_on", { ascending: false }),
    !isTeacher
      ? supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name")
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("subjects").select("id, name").eq("active", true).order("name")
  ]);

  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  // Links from other pages may leave out the year; it follows from the term.
  if (!yearId) yearId = termRows.find((t) => t.id === str(sp.term_id))?.academic_year_id ?? "";
  const classRows = isTeacher ? (access.classes as ClassRow[]) : ((classes ?? []) as ClassRow[]);
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
  if (isTeacher) {
    // The teacher's own subjects replace the class list; "all" (empty list) keeps the class's own rules.
    for (const c of classRows) {
      const mine = access.subjectsByClass[c.id];
      if (mine === "all") continue;
      subjectIdsByClass[c.id] = mine ?? [];
    }
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
  let columns: ColumnRow[] = [];
  const scoreByKey = new Map<string, number>();
  let grades: GradeBand[] = [];
  let published = false;
  let lockedAt: string | null = null;
  let sessions: SessionRow[] = [];
  let layout: Awaited<ReturnType<typeof resolveLayout>> | null = null;

  if (ready) {
    const [{ data: studentsData }, { data: columnsData }, { data: gradesData }, { data: pubData }, { data: sessionsData }] =
      await Promise.all([
        supabase
          .from("students")
          .select("id, first_name, last_name, admission_number")
          .eq("class_id", classId)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true }),
        sheetColumns(supabase, ctx),
        cls
          ? supabase
              .from("grading_scales")
              .select("grade, min_score, max_score, remark")
              .eq("level", cls.level)
              .eq("active", true)
              .order("min_score", { ascending: false })
          : Promise.resolve({ data: [] as unknown[] }),
        supabase
          .from("result_publications")
          .select("id")
          .eq("scope", "term_results")
          .eq("class_id", classId)
          .eq("academic_term_id", termId)
          .maybeSingle(),
        supabase
          .from("exam_test_sessions")
          .select("id, starts_at, academic_term_id, exam_tests(id, name, subject_id)")
          .eq("class_id", classId)
          .order("starts_at", { ascending: false })
          .limit(100)
      ]);

    students = (studentsData ?? []) as StudentRow[];
    columns = (columnsData ?? []) as ColumnRow[];
    grades = (gradesData ?? []) as GradeBand[];
    published = Boolean(pubData);
    const { data: lockRow } = await supabase
      .from("result_sheet_locks")
      .select("locked_at")
      .eq("class_id", classId)
      .eq("subject_id", subjectId)
      .eq("academic_term_id", termId)
      .maybeSingle();
    lockedAt = (lockRow as { locked_at: string } | null)?.locked_at ?? null;

    // CBT sessions for this class: ones for this subject (or with no subject).
    sessions = ((sessionsData ?? []) as unknown as SessionRow[]).filter((s) => {
      const test = firstOrNull(s.exam_tests);
      return !test?.subject_id || test.subject_id === subjectId;
    });

    if (columns.length) {
      const { data: scoresData } = await supabase
        .from("academic_assessment_scores")
        .select("assessment_id, student_id, score")
        .in(
          "assessment_id",
          columns.map((c) => c.id)
        );
      for (const s of (scoresData ?? []) as ScoreRow[]) {
        scoreByKey.set(`${s.assessment_id}:${s.student_id}`, Number(s.score));
      }
    } else {
      layout = await resolveLayout(supabase, { classId, subjectId, level: cls?.level ?? null });
      // Open straight onto the standard columns (1st CA, 2nd CA, Exam Objective, Exam Theory, or the saved layout)
      // instead of asking for columns first. The database only allows it for teachers of the subject.
      if (canTeach(access, classId, subjectId)) {
        const { error: ensureError } = await supabase.rpc("ensure_result_sheet", {
          p_class: classId,
          p_subject: subjectId,
          p_term: termId,
          p_columns: layout.components
        });
        if (!ensureError) {
          const { data: again } = await sheetColumns(supabase, ctx);
          columns = (again ?? []) as ColumnRow[];
        }
      }
    }
  }

  const locked = Boolean(lockedAt) || published;
  const { data: me } = access.userId
    ? await supabase.from("profiles").select("role").eq("id", access.userId).maybeSingle()
    : { data: null };
  const myRole = (me as { role?: string } | null)?.role ?? "";
  const isAdmin = myRole === "admin" || myRole === "super_admin";
  const corrections =
    ready && columns.length
      ? await loadCorrectionRequests(supabase, { classId, subjectId, termId, limit: 20 })
      : { requests: [], studentName: new Map<string, string>(), error: null };

  const maxTotal = layoutTotal(columns.map((c) => ({ max: Number(c.max_score) })));
  const scoreFor = (columnId: string, studentId: string) => {
    const v = scoreByKey.get(`${columnId}:${studentId}`);
    return v === undefined ? null : v;
  };
  const columnStats = (columnId: string) => {
    let count = 0;
    let highest = 0;
    for (const st of students) {
      const v = scoreFor(columnId, st.id);
      if (v !== null) {
        count += 1;
        highest = Math.max(highest, v);
      }
    }
    return { count, highest };
  };

  const rowsComplete = students.filter((st) => columns.length && columns.every((c) => scoreFor(c.id, st.id) !== null)).length;
  const rowsStarted = students.filter((st) => columns.some((c) => scoreFor(c.id, st.id) !== null)).length;

  // Class summary: totals of pupils with every column filled, plus each column's average.
  const maxes = columns.map((c) => Number(c.max_score));
  const completeTotals = students
    .map((st) => columns.map((c) => scoreFor(c.id, st.id)))
    .filter((v) => v.length && v.every((x) => x !== null))
    .map((v) => subjectPercent(v, maxes) ?? 0);
  const startedTotals = students
    .map((st) => subjectPercent(columns.map((c) => scoreFor(c.id, st.id)), maxes))
    .filter((p): p is number => p !== null);
  const avg = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const classAverage = avg(completeTotals);
  const classAverageSoFar = avg(startedTotals);
  const gradeCounts = grades.map((g) => ({
    grade: g.grade,
    remark: g.remark ?? null,
    count: completeTotals.filter((t) => gradeFor(t, grades) === g.grade).length
  }));
  const columnAverage = (columnId: string) =>
    avg(students.map((st) => scoreFor(columnId, st.id)).filter((v): v is number => v !== null));
  const usedGroups = (["ca", "exam", "other"] as const).filter((g) => columns.some((c) => asGroup(c.component_group) === g));

  const gradeTone = (g: string | null) => {
    if (!g) return "slate" as const;
    const c = g.trim().toUpperCase()[0];
    if (c === "A") return "green" as const;
    if (c === "B" || c === "C") return "blue" as const;
    if (c === "D" || c === "E") return "gold" as const;
    if (c === "F") return "red" as const;
    return "slate" as const;
  };

  const contextFields = (
    <>
      <input type="hidden" name="class_id" value={classId} />
      <input type="hidden" name="subject_id" value={subjectId} />
      <input type="hidden" name="year_id" value={yearId} />
      <input type="hidden" name="term_id" value={termId} />
    </>
  );

  const saveDefaultLabel = `Also use these columns for ${subject?.name ?? "this subject"} in ${cls?.name ?? "this class"} in future terms`;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Result sheet"
        description="Enter each subject's CA and exam scores for a class. Choose the columns you need (e.g. 1st CA objective and theory, assignments, exam). Only the boxes you change are saved, so CA scores can go in now and exam scores later."
        actions={
          <>
            <ButtonLink href="/admin/academics/config" variant="secondary" size="sm">
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Grading & layouts
            </ButtonLink>
            {ready ? (
              <ButtonLink href={`/admin/academics/reports?class_id=${classId}&term_id=${termId}`} variant="secondary" size="sm">
                <FileText className="h-4 w-4" aria-hidden="true" />
                Report cards
              </ButtonLink>
            ) : null}
          </>
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
            <Alert tone="warning">No classes are assigned to your account yet. Ask an admin to assign you to at least one class.</Alert>
          ) : null}
        </CardBody>
      </Card>

      {!ready ? (
        <Card>
          <EmptyState
            icon={FileSpreadsheet}
            title="No sheet open"
            description="Choose a class, subject and term above, then open the sheet to start entering scores."
          />
        </Card>
      ) : !columns.length ? (
        <form action={saveColumns}>
          {contextFields}
          <Card>
            <CardHeader
              title="Set up this sheet's columns"
              description={`Starting from ${layout ? layoutSourceLabel[layout.source] : "the standard layout"}. Add, remove or rename columns to suit how this subject is assessed this term — e.g. split 1st CA into objective and theory, or add assignments. The total is always shown out of 100.`}
            />
            <CardBody className="space-y-4">
              <ColumnsEditor name="columns" initial={(layout?.components ?? []).map((c) => ({ ...c }))} />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="save_default" className="h-4 w-4" />
                {saveDefaultLabel}
              </label>
              <div className="flex justify-end">
                <SubmitButton variant="primary" pendingText="Creating…">
                  <span className="inline-flex items-center gap-2">
                    <Columns3 className="h-4 w-4" aria-hidden="true" />
                    Create sheet
                  </span>
                </SubmitButton>
              </div>
            </CardBody>
          </Card>
        </form>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className={locked ? "!border-brand-green-200" : undefined}>
              <CardHeader
                title="Status"
                action={
                  published ? (
                    <Badge tone="green" dot>
                      Published
                    </Badge>
                  ) : lockedAt ? (
                    <Badge tone="blue" dot>
                      Final
                    </Badge>
                  ) : (
                    <Badge tone="gold" dot>
                      Draft
                    </Badge>
                  )
                }
              />
              <CardBody className="space-y-3">
                {published ? (
                  <p className="text-sm text-slate-700">
                    The report cards for this class are published, so these scores are locked. If a score is wrong, send a
                    correction request: an admin approves or rejects it, and either way it is recorded.
                  </p>
                ) : lockedAt ? (
                  <>
                    <p className="text-sm text-slate-700">
                      Submitted as final on {new Date(lockedAt).toLocaleString()}. Scores and columns are locked for everyone.
                    </p>
                    {isAdmin ? (
                      <form action={unlockSheet} className="space-y-2">
                        {contextFields}
                        <label htmlFor="unlock-reason" className="gf-label">
                          Reason for unlocking (kept in the audit log)
                        </label>
                        <input id="unlock-reason" name="reason" className="gf-input" minLength={5} required placeholder="e.g. 1st CA mis-keyed for 2 pupils" />
                        <SubmitButton variant="secondary" size="sm" pendingText="Unlocking…">
                          <span className="inline-flex items-center gap-1.5">
                            <LockOpen className="h-4 w-4" aria-hidden="true" />
                            Unlock for correction
                          </span>
                        </SubmitButton>
                      </form>
                    ) : (
                      <p className="text-xs text-slate-500">If a score is wrong, send a correction request to an admin.</p>
                    )}
                  </>
                ) : (
                  <form action={submitSheet} className="space-y-2">
                    {contextFields}
                    <p className="text-sm text-slate-700">
                      When every score is entered and checked against the marked scripts, submit the sheet as final. It is then
                      locked: only an admin can unlock it, and the reason is recorded.
                    </p>
                    <ConfirmSubmitButton
                      confirmMessage={`Submit ${subject?.name ?? "this subject"} for ${cls?.name ?? "this class"} as final?${
                        rowsComplete < students.length ? `\n\n${students.length - rowsComplete} pupil(s) still have empty boxes.` : ""
                      }\n\nAfter this, scores can only be changed if an admin unlocks the sheet. Save any changes first.`}
                      className={buttonClasses({ variant: "primary", size: "sm" })}
                    >
                      <Lock className="h-4 w-4" aria-hidden="true" />
                      Submit as final
                    </ConfirmSubmitButton>
                  </form>
                )}
                {locked && !requestMode ? (
                  <ButtonLink href={sheetUrl(ctx, { request: "1" })} variant="secondary" size="sm">
                    <FilePen className="h-4 w-4" aria-hidden="true" />
                    Request a correction
                  </ButtonLink>
                ) : null}
                <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-sm">
                  <Link className="gf-link" href={`/admin/academics/reports?class_id=${classId}&term_id=${termId}`}>
                    Report cards
                  </Link>
                  <Link className="gf-link inline-flex items-center gap-1" href={`/admin/academics/audit?class_id=${classId}&subject_id=${subjectId}&term_id=${termId}`}>
                    <History className="h-3.5 w-3.5" aria-hidden="true" />
                    Change history
                  </Link>
                </div>
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader
                title="Copy scores from a CBT exam"
                description="Takes each student's score from a computer-based exam session and scales it to the column's max score. Only the chosen column is changed."
              />
              <CardBody>
                {locked ? (
                  <p className="text-sm text-slate-600">This sheet is locked, so no scores can be copied into it.</p>
                ) : sessions.length ? (
                  <form action={importCbtScores} className="grid gap-4 sm:grid-cols-3">
                    {contextFields}
                    <div className="sm:col-span-2">
                      <label htmlFor="cbt-session" className="gf-label">
                        Exam session
                      </label>
                      <select id="cbt-session" className="gf-select" name="session_id" defaultValue={importSessionId} required>
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
                        Into column
                      </label>
                      <select
                        id="cbt-target"
                        className="gf-select"
                        name="target"
                        defaultValue={columns.find((c) => /obj/i.test(c.title ?? ""))?.id ?? columns[0]?.id}
                      >
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title} (/{Number(c.max_score)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end sm:col-span-3">
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

          {/* Columns */}
          {locked ? null : (
          <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
              <div>
                <div className="text-base font-semibold text-slate-900">Columns</div>
                <div className="mt-0.5 text-sm text-slate-500">
                  {columns.map((c) => `${c.title} /${Number(c.max_score)}`).join(" · ")} — total {maxTotal}
                  {maxTotal === 100 ? "" : " (scaled to 100)"}
                </div>
              </div>
              <span className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <Columns3 className="h-4 w-4" aria-hidden="true" />
                Edit columns
              </span>
            </summary>
            <form action={saveColumns} className="space-y-4 border-t border-slate-100 px-5 py-5 sm:px-6">
              {contextFields}
              <ColumnsEditor
                name="columns"
                initial={columns.map((c) => {
                  const st = columnStats(c.id);
                  return {
                    id: c.id,
                    label: c.title ?? "",
                    group: asGroup(c.component_group),
                    max: Number(c.max_score),
                    scoreCount: st.count,
                    highest: st.highest
                  };
                })}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="save_default" className="h-4 w-4" />
                {saveDefaultLabel}
              </label>
              <div className="flex justify-end">
                <SubmitButton variant="primary" pendingText="Saving…">
                  Save columns
                </SubmitButton>
              </div>
            </form>
          </details>
          )}

          {/* Class summary */}
          <Card>
            <CardHeader
              title="Class summary"
              description={
                rowsComplete < students.length
                  ? `Based on the ${rowsComplete} pupil(s) with every column filled. ${students.length - rowsComplete} still to finish.`
                  : "All pupils have every column filled."
              }
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Class average", value: classAverage === null ? "—" : `${classAverage}%`, hint: classAverage === null && classAverageSoFar !== null ? `${classAverageSoFar}% so far` : "out of 100" },
                  { label: "Highest", value: completeTotals.length ? `${Math.max(...completeTotals)}%` : "—", hint: "complete pupils" },
                  { label: "Lowest", value: completeTotals.length ? `${Math.min(...completeTotals)}%` : "—", hint: "complete pupils" },
                  { label: "Complete", value: `${rowsComplete}/${students.length}`, hint: "pupils" }
                ].map((t) => (
                  <div key={t.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.label}</div>
                    <div className="text-xl font-bold tabular-nums text-slate-900">{t.value}</div>
                    <div className="text-xs text-slate-500">{t.hint}</div>
                  </div>
                ))}
              </div>
              {grades.length ? (
                <div className="flex flex-wrap gap-2">
                  {gradeCounts.map((g) => (
                    <span key={g.grade} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs">
                      <Badge tone={gradeTone(g.grade)}>{g.grade}</Badge>
                      <span className="text-slate-600">{g.remark ?? ""}</span>
                      <span className="font-semibold tabular-nums text-slate-900">{g.count}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>

          {/* Bulk upload */}
          {!locked ? (
            <details className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <div>
                  <div className="text-base font-semibold text-slate-900">Bulk upload from Excel</div>
                  <div className="mt-0.5 text-sm text-slate-500">
                    Download the sheet, fill it in Excel, then copy the rows and paste them here. Empty cells are left as they are.
                  </div>
                </div>
                <span className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Bulk upload
                </span>
              </summary>
              <form action={bulkUpload} className="space-y-3 border-t border-slate-100 px-5 py-5 sm:px-6">
                {contextFields}
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  <li>
                    <a className="gf-link" href={`/admin/academics/results/template?${new URLSearchParams({ class_id: classId, subject_id: subjectId, term_id: termId }).toString()}`}>
                      Download this sheet (CSV for Excel)
                    </a>{" "}
                    — it lists every pupil with columns: Admission no, Pupil name, {columns.map((c) => c.title).join(", ")}.
                  </li>
                  <li>Fill in the scores. Leave a cell empty to keep what is already saved.</li>
                  <li>Select the rows in Excel (with or without the heading row), copy, and paste below.</li>
                </ol>
                <textarea
                  name="pasted"
                  rows={6}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15"
                  placeholder={`GRE/2024/398\tABUBAKAR KHADIJAH\t20\t19\t\t`}
                />
                <div className="flex justify-end">
                  <SubmitButton variant="primary" pendingText="Uploading…">
                    Upload scores
                  </SubmitButton>
                </div>
              </form>
            </details>
          ) : null}

          {/* Score grid */}
          {corrections.requests.length ? (
            <Card>
              <CardHeader
                title="Correction requests for this sheet"
                description="Changes asked for after the sheet was final. Approved ones have been applied; all are in the change history."
              />
              <div className="divide-y divide-slate-100">
                {corrections.requests.map((r) => (
                  <CorrectionRequestCard
                    key={r.id}
                    request={r}
                    studentName={corrections.studentName}
                    isAdmin={isAdmin}
                    userId={access.userId}
                    returnTo={sheetUrl(ctx)}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          {requestMode && locked ? (
            <Alert tone="warning">
              <strong>Requesting a correction.</strong> Change only the boxes that are wrong, explain why at the bottom, and send
              the request. Nothing changes on the sheet until an admin approves it.
            </Alert>
          ) : null}

          <form action={locked ? requestCorrection : saveScores}>
            {contextFields}
            <Card>
              <input type="hidden" name="student_ids" value={students.map((s) => s.id).join(",")} />
              <CardHeader
                title={`${subject?.name ?? "Subject"} · ${cls ? `${cls.level} - ${cls.name}` : "Class"}${term ? ` · ${termLabel(term)}` : ""}`}
                description={`${rowsComplete} of ${students.length} complete${
                  rowsStarted > rowsComplete ? `, ${rowsStarted - rowsComplete} partly entered` : ""
                }. ${locked ? (requestMode ? "Enter the corrected scores, then send the request below." : "Locked — scores can't be changed. Use “Request a correction” if one is wrong.") : "Only changed boxes are saved — leave a box empty to clear it."}`}
                action={
                  students.length && !locked ? (
                    <div className="hidden sm:block">
                      <SubmitButton variant="primary" pendingText="Saving…">
                        Save changes
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
                        {columns.map((c) => (
                          <th
                            key={c.id}
                            scope="col"
                            className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-xs font-semibold text-slate-600"
                          >
                            <div className="whitespace-nowrap">{c.title}</div>
                            <div className="font-normal text-slate-400">
                              {groupLabel[asGroup(c.component_group)]} · out of {Number(c.max_score)}
                            </div>
                          </th>
                        ))}
                        <th
                          scope="col"
                          className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-right text-xs font-semibold text-slate-600"
                        >
                          <div>Total</div>
                          <div className="font-normal text-slate-400">out of 100</div>
                        </th>
                        <th
                          scope="col"
                          className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs font-semibold text-slate-600"
                        >
                          Grade
                        </th>
                        <th
                          scope="col"
                          className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 sm:pr-6"
                        >
                          <div>Scores chart</div>
                          <div className="mt-0.5 flex gap-2 font-normal text-slate-500">
                            {usedGroups.map((g) => (
                              <span key={g} className="inline-flex items-center gap-1">
                                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: groupColors[g] }} aria-hidden="true" />
                                {groupLabel[g]}
                              </span>
                            ))}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((st, rowIndex) => {
                        const values = columns.map((c) => scoreFor(c.id, st.id));
                        const percent = subjectPercent(values, columns.map((c) => Number(c.max_score)));
                        const complete = values.every((v) => v !== null);
                        const grade = gradeFor(percent, grades);
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
                              {st.admission_number ? <div className="text-xs text-slate-500">{st.admission_number}</div> : null}
                            </th>
                            {columns.map((c, i) => {
                              const value = values[i] === null ? "" : String(values[i]);
                              return (
                                <td
                                  key={c.id}
                                  className={cn("border-b border-slate-100 px-2 py-2 text-center group-hover:bg-brand-green-50", zebra)}
                                >
                                  <input type="hidden" name={`orig:${c.id}:${st.id}`} value={value} />
                                  <input
                                    className="h-9 w-[4.5rem] rounded-lg border border-slate-300 bg-white px-2 text-center text-sm tabular-nums text-slate-900 shadow-sm outline-none transition placeholder:text-slate-300 focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15 invalid:border-red-400 invalid:bg-red-50"
                                    name={`score:${c.id}:${st.id}`}
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    max={String(Number(c.max_score))}
                                    placeholder="–"
                                    defaultValue={value}
                                    disabled={locked && !requestMode}
                                    aria-label={`${c.title} for ${st.first_name} ${st.last_name}`}
                                  />
                                </td>
                              );
                            })}
                            <td
                              className={cn(
                                "border-b border-slate-100 px-4 py-2 text-right font-semibold tabular-nums text-slate-900 group-hover:bg-brand-green-50",
                                zebra
                              )}
                            >
                              {percent === null ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div>
                                  {percent}
                                  {!complete ? <div className="text-[11px] font-medium text-brand-gold-800">so far</div> : null}
                                </div>
                              )}
                            </td>
                            <td className={cn("border-b border-slate-100 px-4 py-2 text-center group-hover:bg-brand-green-50", zebra)}>
                              {grade && complete ? (
                                <div className="flex flex-col items-center">
                                  <Badge tone={gradeTone(grade)}>{grade}</Badge>
                                  {gradeRemark(grade, grades) ? (
                                    <span className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500">{gradeRemark(grade, grades)}</span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className={cn("border-b border-slate-100 px-4 py-2 group-hover:bg-brand-green-50 sm:pr-6", zebra)}>
                              {/* One segment per column, sized out of the sheet's total, coloured by kind; hover for the score. */}
                              <div
                                className="flex h-3 w-40 gap-[2px] overflow-hidden rounded bg-slate-100"
                                role="img"
                                aria-label={columns.map((c, i) => `${c.title} ${values[i] ?? "not entered"} of ${Number(c.max_score)}`).join(", ")}
                              >
                                {columns.map((c, i) =>
                                  values[i] ? (
                                    <span
                                      key={c.id}
                                      title={`${c.title}: ${values[i]} / ${Number(c.max_score)}`}
                                      className="h-full first:rounded-l last:rounded-r"
                                      style={{
                                        width: `${maxTotal ? ((values[i] as number) / maxTotal) * 100 : 0}%`,
                                        backgroundColor: groupColors[asGroup(c.component_group)]
                                      }}
                                    />
                                  ) : null
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" className="sticky bottom-0 left-0 z-30 border-t-2 border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-700 sm:pl-6">
                          Class average
                        </th>
                        {columns.map((c) => (
                          <td key={c.id} className="sticky bottom-0 z-20 border-t-2 border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-xs font-semibold tabular-nums text-slate-700">
                            {columnAverage(c.id) ?? "—"}
                          </td>
                        ))}
                        <td className="sticky bottom-0 z-20 border-t-2 border-slate-200 bg-slate-50 px-4 py-2.5 text-right text-sm font-bold tabular-nums text-slate-900">
                          {classAverage ?? "—"}
                        </td>
                        <td className="sticky bottom-0 z-20 border-t-2 border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs text-slate-600">
                          {classAverage !== null ? gradeFor(classAverage, grades) ?? "" : ""}
                        </td>
                        <td className="sticky bottom-0 z-20 border-t-2 border-slate-200 bg-slate-50 sm:pr-6" />
                      </tr>
                    </tfoot>
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
                    <Badge tone={rowsComplete === students.length ? "green" : rowsStarted ? "gold" : "slate"} dot>
                      {rowsComplete}/{students.length} complete
                    </Badge>
                    <span className="hidden sm:inline">Totals and grades refresh after saving.</span>
                  </div>
                  {locked && requestMode ? (
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <input
                        name="reason"
                        className="gf-input sm:w-80"
                        minLength={5}
                        maxLength={500}
                        required
                        placeholder="Why? e.g. script shows 15, keyed 17"
                        aria-label="Reason for the correction"
                      />
                      <SubmitButton className={buttonClasses({ variant: "primary", className: "shrink-0" })} pendingText="Sending…">
                        <span className="inline-flex items-center gap-2">
                          <Send className="h-4 w-4" aria-hidden="true" />
                          Send to admin
                        </span>
                      </SubmitButton>
                      <Link href={sheetUrl(ctx)} className={buttonClasses({ variant: "ghost", className: "shrink-0" })}>
                        Cancel
                      </Link>
                    </div>
                  ) : locked ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600">
                      <Lock className="h-4 w-4" aria-hidden="true" />
                      Locked
                    </span>
                  ) : (
                    <SubmitButton className={buttonClasses({ variant: "primary", className: "w-full sm:w-auto" })} pendingText="Saving…">
                      <span className="inline-flex items-center gap-2">
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Save changes
                      </span>
                    </SubmitButton>
                  )}
                </div>
              ) : null}
            </Card>
          </form>

          <p className="text-xs text-slate-500">
            The total is the scores out of the columns&apos; max scores, shown out of 100. Grades appear once every column
            is filled, using the grading scale in{" "}
            <Link className="gf-link" href="/admin/academics/config">
              Grading & layouts
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
