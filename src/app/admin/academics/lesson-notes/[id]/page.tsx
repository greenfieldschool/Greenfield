import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Download, Eye, EyeOff, FileText, Save, Send, Trash2 } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canTeach, getTeacherAccess } from "@/lib/teacher-access";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate } from "@/lib/lagos-dates";
import {
  LESSON_NOTES_BUCKET,
  MAX_NOTE_FILE_BYTES,
  NOTE_COLUMNS,
  NOTE_FILE_ACCEPT,
  fileKind,
  fileSizeLabel,
  lessonNoteErrorMessage,
  noteFileLinks,
  noteWeeks,
  weekLabel,
  type LessonNoteRow
} from "@/lib/lesson-notes";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { AssignmentFilePicker } from "@/components/assignment-file-picker";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";

const LIST = "/admin/academics/lesson-notes";

function back(id: string, message: string, type: "success" | "error" = "success"): never {
  redirect(`${LIST}/${id}?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

// Saves the note. "intent" decides the status: save keeps it, publish publishes, draft takes it back to draft.
// A replaced or removed file is deleted from storage after the note is saved.
async function saveNote(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const intent = String(formData.get("intent") ?? "save");
  const topic = String(formData.get("topic") ?? "").trim().replace(/\s+/g, " ");
  const body = String(formData.get("body") ?? "").trim();
  const subjectRaw = String(formData.get("subject_id") ?? "").trim();
  const weekRaw = String(formData.get("week") ?? "").trim();
  const week = weekRaw ? Number(weekRaw) : null;
  const filePath = String(formData.get("file_path") ?? "").trim();
  const fileName = String(formData.get("file_name") ?? "").trim();
  const fileType = String(formData.get("file_type") ?? "").trim();
  const previousPath = String(formData.get("previous_path") ?? "").trim();
  if (topic.length < 2) back(id, "Give the topic", "error");
  if (!subjectRaw) back(id, "Choose the subject", "error");
  if (week !== null && (!Number.isInteger(week) || week < 1 || week > 30)) back(id, "Choose a week", "error");
  if (filePath && !filePath.startsWith(`notes/${id}/`)) back(id, "That file belongs to another lesson note. Upload it again here.", "error");
  if (intent === "publish" && !filePath && !body) back(id, "Add the notes first: type them, or attach a file.", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // The file's size, for the portal ("PDF · 1.2 MB"). Only read when the file changed.
  let fileSize: number | null | undefined;
  if (filePath && filePath !== previousPath) {
    const folder = filePath.slice(0, filePath.lastIndexOf("/"));
    const { data: listed } = await supabase.storage.from(LESSON_NOTES_BUCKET).list(folder, { search: filePath.slice(folder.length + 1) });
    fileSize = (listed?.[0]?.metadata as { size?: number } | undefined)?.size ?? null;
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    topic,
    body: body || null,
    subject_id: subjectRaw === "none" ? null : subjectRaw,
    week,
    file_path: filePath || null,
    file_name: filePath ? fileName || "Lesson note" : null,
    file_type: filePath ? fileType || null : null,
    updated_by: user?.id ?? null,
    updated_at: now
  };
  if (fileSize !== undefined) update.file_size = fileSize;
  if (!filePath) update.file_size = null;
  if (intent === "publish") Object.assign(update, { status: "published", published_at: now });
  if (intent === "draft") Object.assign(update, { status: "draft", published_at: null });

  const { data, error } = await supabase.from("lesson_notes").update(update).eq("id", id).select("id");
  if (error) back(id, lessonNoteErrorMessage(error.message), "error");
  if (!data?.length) back(id, "Only the teacher of this class and subject (or an admin) can change this note.", "error");

  // The old file isn't used any more.
  if (previousPath && previousPath !== filePath) await supabase.storage.from(LESSON_NOTES_BUCKET).remove([previousPath]);

  revalidatePath(LIST);
  revalidatePath(`${LIST}/${id}`);
  revalidatePath("/portal/lesson-notes");
  back(
    id,
    intent === "publish"
      ? "Published. Pupils and parents of the class can read it now."
      : intent === "draft"
        ? "Taken back to draft. Pupils and parents can't see it any more."
        : "Saved"
  );
}

// One action per button, so the status change never depends on which button the browser reports.
async function publishNote(formData: FormData) {
  "use server";
  formData.set("intent", "publish");
  return saveNote(formData);
}

async function draftNote(formData: FormData) {
  "use server";
  formData.set("intent", "draft");
  return saveNote(formData);
}

async function deleteNote(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error");
  const { data: note } = await supabase.from("lesson_notes").select("class_id, academic_term_id, file_path").eq("id", id).maybeSingle();
  const n = note as { class_id: string; academic_term_id: string | null; file_path: string | null } | null;
  if (!n) back(id, "That note isn't there any more.", "error");
  const { data, error } = await supabase.from("lesson_notes").delete().eq("id", id).select("id");
  if (error) back(id, lessonNoteErrorMessage(error.message), "error");
  if (!data?.length) back(id, "Only the teacher of this class and subject (or an admin) can delete this note.", "error");
  if (n.file_path) await supabase.storage.from(LESSON_NOTES_BUCKET).remove([n.file_path]);
  revalidatePath(LIST);
  revalidatePath("/portal/lesson-notes");
  redirect(`${LIST}?class_id=${n.class_id}&term_id=${n.academic_term_id ?? ""}&toast=${encodeURIComponent("Lesson note deleted")}&toast_type=success`);
}

export default async function LessonNotePage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const access = await getTeacherAccess(supabase);

  const { data: noteData, error } = await supabase.from("lesson_notes").select(NOTE_COLUMNS).eq("id", id).maybeSingle();
  const note = noteData as LessonNoteRow | null;
  if (!note) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: LIST, label: "Lesson notes" }} eyebrow="Lesson notes" title="Lesson note" />
        {error ? (
          <Alert tone="danger">{lessonNoteErrorMessage(error.message)}</Alert>
        ) : (
          <Card>
            <EmptyState
              icon={FileText}
              title="This lesson note isn't available"
              description="It may have been deleted, or it's for a class or subject you don't teach."
              action={
                <ButtonLink href={LIST} variant="secondary" size="sm">
                  Back to lesson notes
                </ButtonLink>
              }
            />
          </Card>
        )}
      </div>
    );
  }

  const [{ data: cls }, { data: termData }, { data: offered }, links] = await Promise.all([
    supabase.from("classes").select("id, name, level").eq("id", note.class_id).maybeSingle(),
    note.academic_term_id
      ? supabase.from("academic_terms").select("id, name, starts_on, ends_on, academic_years(name)").eq("id", note.academic_term_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("class_subjects").select("subjects(id, name)").eq("class_id", note.class_id),
    noteFileLinks(supabase, note.file_path, note.file_name)
  ]);
  const c = cls as { id: string; name: string; level: string } | null;
  const term = termData as { id: string; name: string; starts_on: string | null; ends_on: string | null; academic_years: { name: string } | { name: string }[] | null } | null;
  const { weeks } = noteWeeks(term);
  const subjects = ((offered ?? []) as Array<{ subjects: { id: string; name: string } | { id: string; name: string }[] | null }>)
    .map((o) => firstOrNull(o.subjects))
    .filter((s): s is { id: string; name: string } => Boolean(s))
    .filter((s) => canTeach(access, note.class_id, s.id) || s.id === note.subject_id)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (note.subject_id && !subjects.some((s) => s.id === note.subject_id)) {
    const { data } = await supabase.from("subjects").select("id, name").eq("id", note.subject_id).maybeSingle();
    if (data) subjects.push(data as { id: string; name: string });
  }
  const canWriteGeneral = !access.isTeacher || access.classTeacherClassIds.includes(note.class_id) || !note.subject_id;
  const subjectName = note.subject_id ? subjects.find((s) => s.id === note.subject_id)?.name ?? "Subject" : "General";
  const termName = term ? [firstOrNull(term.academic_years)?.name, term.name].filter(Boolean).join(" · ") : "No term";
  const published = note.status === "published";
  const hasContent = Boolean(note.file_path || note.body);
  const listHref = `${LIST}?class_id=${note.class_id}&term_id=${note.academic_term_id ?? ""}`;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: listHref, label: "Lesson notes" }}
        learn={LEARN.lessonNotes}
        eyebrow={`${c?.name ?? "Class"} · ${subjectName}`}
        title={note.topic}
        description={`${termName} · ${weekLabel(note.week, weeks)}${note.author_name ? ` · by ${note.author_name}` : ""}`}
      />

      <Card className={published ? "!border-brand-green-200" : "!border-brand-gold-200"}>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Badge tone={published ? "green" : "gold"} dot>
              {published ? "Published" : "Draft"}
            </Badge>
            <p className="text-sm text-slate-700">
              {published
                ? `Pupils and parents of ${c?.name ?? "the class"} can read and download it${note.published_at ? ` (since ${formatLagosDate(note.published_at)})` : ""}.`
                : hasContent
                  ? "Only staff can see it. Publish it when it's ready."
                  : "Only staff can see it. Type the notes or attach a file below, then publish."}
            </p>
          </div>
          {links ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <a href={links.open} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                Open file
              </a>
              <a href={links.download} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download
              </a>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <form action={saveNote}>
        <input type="hidden" name="id" value={note.id} />
        <input type="hidden" name="previous_path" value={note.file_path ?? ""} />
        <Card>
          <CardHeader title="The lesson note" description="Attach the file you prepared, type the notes here, or both." />
          <CardBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ln-subject" className="gf-label">
                  Subject
                </label>
                <select id="ln-subject" name="subject_id" required defaultValue={note.subject_id ?? "none"} className="gf-select">
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {canWriteGeneral ? <option value="none">General (no subject)</option> : null}
                </select>
              </div>
              <div>
                <label htmlFor="ln-week" className="gf-label">
                  Week
                </label>
                <select id="ln-week" name="week" defaultValue={note.week ? String(note.week) : ""} className="gf-select">
                  <option value="">No particular week</option>
                  {weeks.map((w) => (
                    <option key={w.number} value={w.number}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="ln-topic" className="gf-label">
                Topic
              </label>
              <input id="ln-topic" name="topic" required minLength={2} maxLength={160} defaultValue={note.topic} className="gf-input" />
            </div>
            <div>
              <span className="gf-label">File</span>
              <AssignmentFilePicker
                folder={`notes/${note.id}`}
                bucket={LESSON_NOTES_BUCKET}
                accept={NOTE_FILE_ACCEPT}
                maxBytes={MAX_NOTE_FILE_BYTES}
                camera={false}
                label={note.file_path ? "Replace the file" : "Upload the lesson note"}
                hint="PDF, Word, PowerPoint or Excel, or a picture, up to 20 MB."
                current={note.file_path ? { path: note.file_path, name: note.file_name, type: note.file_type, url: links?.open ?? null } : null}
              />
              {note.file_path ? (
                <p className="gf-hint mt-1.5">
                  {fileKind(note.file_type, note.file_name)}
                  {note.file_size ? ` · ${fileSizeLabel(note.file_size)}` : ""}. To replace it, remove it (×), upload the new one and save.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="ln-body" className="gf-label">
                Notes <span className="font-normal text-slate-500">(optional if you attach a file)</span>
              </label>
              <textarea
                id="ln-body"
                name="body"
                rows={12}
                maxLength={50000}
                defaultValue={note.body ?? ""}
                className="gf-input"
                placeholder="Type the lesson note, a summary, or what pupils should read before the lesson."
              />
            </div>
          </CardBody>
          <div className="sticky bottom-0 flex flex-col gap-2 rounded-b-2xl border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            {published ? (
              <>
                <SubmitButton variant="secondary" formAction={draftNote} pendingText="Saving…">
                  <span className="inline-flex items-center gap-2">
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                    Take back to draft
                  </span>
                </SubmitButton>
                <SubmitButton pendingText="Saving…">
                  <span className="inline-flex items-center gap-2">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save changes
                  </span>
                </SubmitButton>
              </>
            ) : (
              <>
                <SubmitButton variant="secondary" pendingText="Saving…">
                  <span className="inline-flex items-center gap-2">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save draft
                  </span>
                </SubmitButton>
                <SubmitButton formAction={publishNote} pendingText="Publishing…">
                  <span className="inline-flex items-center gap-2">
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Save and publish
                  </span>
                </SubmitButton>
              </>
            )}
          </div>
        </Card>
      </form>

      <Card>
        <CardHeader title="Delete this lesson note" description="Removes the note and its file for everyone. This can't be undone." />
        <CardBody>
          <form action={deleteNote}>
            <input type="hidden" name="id" value={note.id} />
            <ConfirmSubmitButton
              confirmMessage={`Delete "${note.topic}"?${published ? " Pupils and parents will no longer see it." : ""} This can't be undone.`}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete lesson note
            </ConfirmSubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
