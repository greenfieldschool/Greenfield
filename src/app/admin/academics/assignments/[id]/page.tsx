import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Paperclip, Save, Trash2 } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  ASSIGNMENT_COLUMNS,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  SUBMISSION_COLUMNS,
  assignmentErrorMessage,
  dueLabel,
  lagosDateTimeParts,
  lagosDueAt,
  pupilStatus,
  signedFileLinks,
  type AssignmentRow,
  type SubmissionRow
} from "@/lib/assignments";
import { resultsErrorMessage } from "@/lib/results";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { AssignmentFilePicker } from "@/components/assignment-file-picker";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";

const LIST = "/admin/academics/assignments";

function back(id: string, message: string, type: "success" | "error" = "success", hash = ""): never {
  redirect(`${LIST}/${id}?toast=${encodeURIComponent(message)}&toast_type=${type}${hash}`);
}

async function saveDetails(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().replace(/\s+/g, " ");
  const instructions = String(formData.get("instructions") ?? "").trim();
  const dueAt = lagosDueAt(String(formData.get("due_date") ?? ""), String(formData.get("due_time") ?? ""));
  const maxRaw = String(formData.get("max_score") ?? "").trim();
  const maxScore = maxRaw ? Number(maxRaw) : null;
  const kind = String(formData.get("kind") ?? "assignment") === "classwork" ? "classwork" : "assignment";
  const filePath = String(formData.get("file_path") ?? "").trim();
  const fileName = String(formData.get("file_name") ?? "").trim();
  if (title.length < 2) back(id, "Give it a title", "error");
  if (maxScore !== null && (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000)) back(id, "The marks must be a number above 0", "error");
  if (filePath && !filePath.startsWith(`briefs/${id}/`)) back(id, "That worksheet belongs to another assignment", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error");
  const { data, error } = await supabase
    .from("assignments")
    .update({
      title,
      instructions: instructions || null,
      due_at: dueAt,
      max_score: maxScore,
      kind,
      accepts_late: formData.get("accepts_late") === "on",
      attachment_path: filePath || null,
      attachment_name: filePath ? fileName || "Worksheet" : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("id");
  if (error) back(id, assignmentErrorMessage(error.message), "error");
  if (!data?.length) back(id, "Only the teacher of this class and subject (or an admin) can change this.", "error");
  revalidatePath(`${LIST}/${id}`);
  revalidatePath("/portal/assignments");
  back(id, "Saved");
}

// Saves only the marks and comments that changed since the page was opened.
async function saveMarks(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error", "#marking");
  let saved = 0;
  const problems: string[] = [];
  for (const [key, value] of Array.from(formData.entries())) {
    if (!key.startsWith("score:")) continue;
    const studentId = key.slice(6);
    const raw = String(value).trim().replace(",", ".");
    const feedback = String(formData.get(`feedback:${studentId}`) ?? "").trim();
    if (raw === String(formData.get(`orig:${studentId}`) ?? "") && feedback === String(formData.get(`origfb:${studentId}`) ?? "")) continue;
    const score = raw ? Number(raw) : null;
    if (score !== null && !Number.isFinite(score)) {
      problems.push(raw);
      continue;
    }
    const { error } = await supabase.rpc("mark_submission", { p_assignment: id, p_student: studentId, p_score: score, p_feedback: feedback || null });
    if (error) problems.push(assignmentErrorMessage(error.message));
    else saved += 1;
  }
  revalidatePath(`${LIST}/${id}`);
  revalidatePath("/portal/assignments");
  if (problems.length) back(id, `Saved ${saved}. Not saved: ${problems.slice(0, 2).join("; ")}`, "error", "#marking");
  back(id, saved ? `Saved ${saved} mark${saved === 1 ? "" : "s"}` : "Nothing had changed", "success", "#marking");
}

// Copies the marks into a result sheet column, scaled to that column's total. Goes through the result sheet's own
// rules: a locked or published sheet refuses it, and every change is kept in the results history.
async function sendToResultSheet(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim();
  if (!assessmentId) back(id, "Choose the result sheet column", "error", "#result-sheet");
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error", "#result-sheet");

  const [{ data: a }, { data: col }, { data: subs }] = await Promise.all([
    supabase.from("assignments").select("max_score").eq("id", id).maybeSingle(),
    supabase.from("academic_assessments").select("max_score, title").eq("id", assessmentId).maybeSingle(),
    supabase.from("assignment_submissions").select("student_id, score").eq("assignment_id", id).not("score", "is", null)
  ]);
  const max = Number((a as { max_score: number | null } | null)?.max_score ?? 0);
  const colMax = Number((col as { max_score: number } | null)?.max_score ?? 0);
  if (!max) back(id, "Give this work its total marks first, so the marks can be scaled to the column.", "error", "#result-sheet");
  if (!colMax) back(id, "That result sheet column wasn't found.", "error", "#result-sheet");
  const rows = ((subs ?? []) as Array<{ student_id: string; score: number }>).map((s) => ({
    assessment_id: assessmentId,
    student_id: s.student_id,
    score: Math.round(((Number(s.score) / max) * colMax) * 100) / 100
  }));
  if (!rows.length) back(id, "Mark some work first.", "error", "#result-sheet");
  const { error } = await supabase.from("academic_assessment_scores").upsert(rows, { onConflict: "assessment_id,student_id" });
  if (error) back(id, resultsErrorMessage(error.message), "error", "#result-sheet");
  await supabase.from("assignments").update({ result_assessment_id: assessmentId }).eq("id", id);
  revalidatePath("/admin/academics/results");
  revalidatePath(`${LIST}/${id}`);
  back(id, `Sent ${rows.length} mark${rows.length === 1 ? "" : "s"} to the result sheet (${(col as { title: string | null }).title ?? "column"})`, "success", "#result-sheet");
}

async function deleteAssignment(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const classId = String(formData.get("class_id") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error");
  const { data, error } = await supabase.from("assignments").delete().eq("id", id).select("id");
  if (error || !data?.length) back(id, error ? assignmentErrorMessage(error.message) : "Only the teacher of this class and subject (or an admin) can delete this.", "error");
  revalidatePath(LIST);
  revalidatePath("/portal/assignments");
  redirect(`${LIST}?class_id=${encodeURIComponent(classId)}&toast=${encodeURIComponent("Deleted")}&toast_type=success`);
}

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: aData, error: aError } = await supabase.from("assignments").select(ASSIGNMENT_COLUMNS).eq("id", id).maybeSingle();
  const a = aData as AssignmentRow | null;
  if (aError || !a) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Assignments" title="Not found" back={{ href: LIST, label: "Assignments & classwork" }} />
        <Alert tone="warning">{aError ? assignmentErrorMessage(aError.message) : "This work doesn't exist, or it's for a class you don't teach."}</Alert>
      </div>
    );
  }

  const [{ data: cls }, { data: subject }, { data: pupilData }, { data: subData }, { data: columnData }] = await Promise.all([
    supabase.from("classes").select("name").eq("id", a.class_id).maybeSingle(),
    a.subject_id ? supabase.from("subjects").select("name").eq("id", a.subject_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("students").select("id, first_name, last_name, status").eq("class_id", a.class_id).order("last_name").order("first_name"),
    supabase.from("assignment_submissions").select(SUBMISSION_COLUMNS).eq("assignment_id", id),
    a.subject_id
      ? supabase
          .from("academic_assessments")
          .select("id, title, max_score, academic_term_id")
          .eq("class_id", a.class_id)
          .eq("subject_id", a.subject_id)
          .order("created_at")
      : Promise.resolve({ data: [] })
  ]);
  const pupils = ((pupilData ?? []) as Array<{ id: string; first_name: string; last_name: string; status: string }>).filter(
    (p) => !["withdrawn", "graduated", "transferred"].includes(p.status)
  );
  const subs = new Map(((subData ?? []) as SubmissionRow[]).map((s) => [s.student_id, s] as const));
  const columns = ((columnData ?? []) as Array<{ id: string; title: string | null; max_score: number; academic_term_id: string | null }>).filter(
    (c) => !a.academic_term_id || !c.academic_term_id || c.academic_term_id === a.academic_term_id
  );
  const links = await signedFileLinks(supabase, [a.attachment_path, ...Array.from(subs.values()).map((s) => s.file_path)]);
  const { date: dueDate, time: dueTime } = lagosDateTimeParts(a.due_at);
  const handedIn = Array.from(subs.values()).filter((s) => s.submitted_at).length;
  const marked = Array.from(subs.values()).filter((s) => s.marked_at).length;
  const subjectName = (subject as { name: string } | null)?.name ?? "General";

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.assignments}
        eyebrow={`${KIND_LABEL[a.kind]} · ${(cls as { name: string } | null)?.name ?? "Class"} · ${subjectName}`}
        title={a.title}
        description={`${dueLabel(a.due_at)}${a.max_score ? ` · out of ${Number(a.max_score)}` : ""} · ${handedIn} of ${pupils.length} handed in · ${marked} marked`}
        back={{ href: `${LIST}?class_id=${a.class_id}`, label: "Assignments & classwork" }}
      />

      {/* Marking */}
      <Card id="marking" className="scroll-mt-24">
        <CardHeader title="Pupils' work" description="Open each pupil's work, give a mark and a comment, then save once. Work handed in on paper can be marked here too." />
        {pupils.length ? (
          <form action={saveMarks}>
            <input type="hidden" name="id" value={a.id} />
            <ul className="divide-y divide-slate-100">
              {pupils.map((p) => {
                const s = subs.get(p.id);
                const status = pupilStatus(a, s);
                const url = s?.file_path ? links.get(s.file_path) : null;
                const isImage = (s?.file_type ?? "").startsWith("image/");
                return (
                  <li key={p.id} className="space-y-3 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">
                        {p.first_name} {p.last_name}
                      </div>
                      <div className="flex items-center gap-2">
                        {s?.submitted_at ? (
                          <span className="text-xs text-slate-500">
                            {new Date(s.submitted_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" })}
                          </span>
                        ) : null}
                        <Badge tone={STATUS_TONE[status]} dot>
                          {STATUS_LABEL[status]}
                        </Badge>
                      </div>
                    </div>
                    {s?.body || url ? (
                      <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        {s?.body ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{s.body}</p> : <span />}
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="block">
                            {isImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={url} alt={`${p.first_name}'s work`} className="h-28 w-28 rounded-lg object-cover ring-1 ring-slate-200 sm:h-32 sm:w-32" />
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-brand-green-700">
                                <Paperclip className="h-4 w-4" aria-hidden="true" />
                                {s?.file_name ?? "Open file"}
                              </span>
                            )}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                      <input type="hidden" name={`orig:${p.id}`} value={s?.score === null || s?.score === undefined ? "" : String(Number(s.score))} />
                      <input type="hidden" name={`origfb:${p.id}`} value={s?.feedback ?? ""} />
                      <label className="flex items-center gap-2">
                        <span className="sr-only">Mark for {p.first_name}</span>
                        <input
                          name={`score:${p.id}`}
                          defaultValue={s?.score === null || s?.score === undefined ? "" : String(Number(s.score))}
                          inputMode="decimal"
                          type="number"
                          min={0}
                          max={a.max_score ?? undefined}
                          step="0.5"
                          placeholder="Mark"
                          className="gf-input w-24"
                        />
                        {a.max_score ? <span className="text-sm text-slate-500">/ {Number(a.max_score)}</span> : null}
                      </label>
                      <input name={`feedback:${p.id}`} defaultValue={s?.feedback ?? ""} maxLength={4000} placeholder="Comment for the pupil (optional)" aria-label={`Comment for ${p.first_name}`} className="gf-input" />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-b-2xl border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:px-6">
              <p className="text-xs text-slate-500">Pupils and parents see the mark and comment once saved. A marked piece of work can&apos;t be changed by the pupil.</p>
              <SubmitButton pendingText="Saving…">
                <span className="inline-flex items-center gap-2">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save marks
                </span>
              </SubmitButton>
            </div>
          </form>
        ) : (
          <CardBody>
            <EmptyState title="No pupils in this class" description="Add pupils to the class first." />
          </CardBody>
        )}
      </Card>

      {/* Result sheet */}
      {a.subject_id ? (
        <Card id="result-sheet" className="scroll-mt-24">
          <CardHeader
            title="Send the marks to the result sheet"
            description="Copies each marked pupil's mark into a column of this subject's result sheet, scaled to that column's total (e.g. 15/20 into a 10-mark column gives 7.5). A locked or published sheet won't change."
          />
          <CardBody>
            {!a.max_score ? (
              <Alert tone="info">Give this work its total marks (below) to send marks to the result sheet.</Alert>
            ) : columns.length ? (
              <form action={sendToResultSheet} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="id" value={a.id} />
                <div className="min-w-0 flex-1">
                  <label htmlFor="rs-col" className="gf-label">
                    Result sheet column
                  </label>
                  <select id="rs-col" name="assessment_id" defaultValue={a.result_assessment_id ?? ""} className="gf-select" required>
                    <option value="" disabled>
                      Choose…
                    </option>
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title ?? "Column"} (out of {Number(c.max_score)})
                      </option>
                    ))}
                  </select>
                </div>
                <SubmitButton variant="secondary" pendingText="Sending…">
                  <span className="inline-flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                    Send {marked} mark{marked === 1 ? "" : "s"}
                  </span>
                </SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-slate-600">
                This subject&apos;s result sheet has no columns yet.{" "}
                <Link href="/admin/academics/results" className="gf-link">
                  Open the result sheet
                </Link>
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {/* Details */}
      <Card>
        <CardHeader title="Details" description="Changes show on the portal straight away." />
        <form action={saveDetails} className="space-y-4 px-5 pb-5 sm:px-6">
          <input type="hidden" name="id" value={a.id} />
          <div>
            <label htmlFor="d-title" className="gf-label">
              Title
            </label>
            <input id="d-title" name="title" defaultValue={a.title} required minLength={2} maxLength={160} className="gf-input" />
          </div>
          <div>
            <label htmlFor="d-instructions" className="gf-label">
              Instructions
            </label>
            <textarea id="d-instructions" name="instructions" rows={5} maxLength={20000} defaultValue={a.instructions ?? ""} className="gf-input" />
          </div>
          <div>
            <span className="gf-label">Worksheet (optional)</span>
            <AssignmentFilePicker
              folder={`briefs/${a.id}`}
              label="Add a worksheet"
              current={a.attachment_path ? { path: a.attachment_path, name: a.attachment_name, url: links.get(a.attachment_path) ?? null } : null}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="d-kind" className="gf-label">
                Type
              </label>
              <select id="d-kind" name="kind" defaultValue={a.kind} className="gf-select">
                <option value="assignment">Assignment</option>
                <option value="classwork">Classwork</option>
              </select>
            </div>
            <div>
              <label htmlFor="d-due-date" className="gf-label">
                Due date
              </label>
              <input id="d-due-date" name="due_date" type="date" defaultValue={dueDate} className="gf-input" />
            </div>
            <div>
              <label htmlFor="d-due-time" className="gf-label">
                Due time
              </label>
              <input id="d-due-time" name="due_time" type="time" defaultValue={dueTime || "16:00"} className="gf-input" />
            </div>
            <div>
              <label htmlFor="d-max" className="gf-label">
                Marks
              </label>
              <input id="d-max" name="max_score" type="number" min={1} max={1000} step="0.5" defaultValue={a.max_score ?? ""} className="gf-input" />
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" name="accepts_late" defaultChecked={a.accepts_late} className="h-5 w-5 rounded border-slate-300 text-brand-green focus:ring-brand-green-500" />
            Accept work handed in after the due date
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SubmitButton pendingText="Saving…">Save details</SubmitButton>
            <Link href={`${LIST}?class_id=${a.class_id}`} className={buttonClasses({ variant: "ghost" })}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to the list
            </Link>
          </div>
        </form>
      </Card>

      <form action={deleteAssignment} className="flex justify-end">
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="class_id" value={a.class_id} />
        <ConfirmSubmitButton
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
          confirmMessage="Delete this work, with every pupil's answers and marks? This cannot be undone. Marks already sent to the result sheet stay there."
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete this work
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}
