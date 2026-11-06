import type { SupabaseClient } from "@supabase/supabase-js";
import { termWeeks } from "@/lib/welfare";
import { toLagosDateInput } from "@/lib/lagos-dates";

// Lesson notes (migration 20261107_lesson_notes.sql). Teachers prepare them per class and subject, by term, week and
// topic, on /admin/academics/lesson-notes; a note is a draft until it is published, then the class's pupils and
// parents read and download it on /portal/lesson-notes. Files live in the private "lesson-notes" bucket at
// notes/<note>/…, opened with short-lived signed links.

export const LESSON_NOTES_BUCKET = "lesson-notes";
export const MAX_NOTE_FILE_BYTES = 20 * 1024 * 1024;
export const NOTE_FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.rtf,.txt,image/*";

export type NoteStatus = "draft" | "published";

export type LessonNoteRow = {
  id: string;
  class_id: string;
  subject_id: string | null;
  academic_term_id: string | null;
  week: number | null;
  topic: string;
  body: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  status: NoteStatus;
  published_at: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
};

export const NOTE_COLUMNS =
  "id, class_id, subject_id, academic_term_id, week, topic, body, file_path, file_name, file_type, file_size, status, published_at, author_name, created_at, updated_at";

/** A published note counts as new for a week. */
export function isNewNote(n: Pick<LessonNoteRow, "status" | "published_at">, now = new Date()) {
  return n.status === "published" && Boolean(n.published_at) && now.getTime() - new Date(n.published_at as string).getTime() < 7 * 24 * 3600 * 1000;
}

export type TermForWeeks = { id: string; starts_on: string | null; ends_on: string | null };

/**
 * The term's weeks for pickers and headings: "Week 3 · 21–25 Sep". Terms without dates get Weeks 1–14 with no dates.
 * `current` is this week's number when the term is running.
 */
export function noteWeeks(term: TermForWeeks | null | undefined) {
  const today = toLagosDateInput(new Date().toISOString());
  const weeks = term?.starts_on && term.ends_on ? termWeeks(term.starts_on, term.ends_on, [], today) : [];
  if (!weeks.length) {
    return { weeks: Array.from({ length: 14 }, (_, i) => ({ number: i + 1, label: `Week ${i + 1}` })), current: null as number | null };
  }
  return {
    weeks: weeks.map((w) => ({ number: w.number, label: `Week ${w.number} · ${w.range}` })),
    current: weeks.find((w) => w.current)?.number ?? null
  };
}

export function weekLabel(week: number | null, weeks: Array<{ number: number; label: string }>) {
  if (!week) return "No week set";
  return weeks.find((w) => w.number === week)?.label ?? `Week ${week}`;
}

/** "PDF", "Word", "PowerPoint" … from the file's type or name. */
export function fileKind(type: string | null, name: string | null) {
  const t = (type ?? "").toLowerCase();
  const ext = (name ?? "").toLowerCase().split(".").pop() ?? "";
  if (t.includes("pdf") || ext === "pdf") return "PDF";
  if (t.includes("word") || ext === "doc" || ext === "docx" || ext === "rtf") return "Word";
  if (t.includes("presentation") || t.includes("powerpoint") || ext === "ppt" || ext === "pptx") return "PowerPoint";
  if (t.includes("sheet") || t.includes("excel") || ext === "xls" || ext === "xlsx") return "Excel";
  if (t.startsWith("image/")) return "Picture";
  if (t.startsWith("text/") || ext === "txt") return "Text";
  return "File";
}

export function fileSizeLabel(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Short-lived links (10 minutes) to open and to download a note's file, made with the signed-in person's own login
 * so the bucket's rules decide. Null when they may not open it (or it's gone).
 */
export async function noteFileLinks(client: SupabaseClient, path: string | null, name: string | null) {
  if (!path) return null;
  const bucket = client.storage.from(LESSON_NOTES_BUCKET);
  const [{ data: open }, { data: download }] = await Promise.all([
    bucket.createSignedUrl(path, 600),
    bucket.createSignedUrl(path, 600, { download: name || true })
  ]);
  if (!open?.signedUrl) return null;
  return { open: open.signedUrl, download: download?.signedUrl ?? open.signedUrl };
}

/** Friendly words for errors from the table and the bucket. */
export function lessonNoteErrorMessage(message: string) {
  if (/lesson_notes/.test(message) && /does not exist|schema cache/i.test(message)) {
    return "Lesson notes need a database update first. Ask the school's IT person to run 20261107_lesson_notes.sql.";
  }
  if (/lesson_notes_published_has_content/.test(message)) return "Add the notes (type them or attach a file) before publishing.";
  if (/lesson_notes_file_folder/.test(message)) return "That file belongs to another lesson note. Upload it again here.";
  if (/row-level security|permission denied/i.test(message)) return "You can only add notes for the classes and subjects you teach.";
  return message.replace(/^.*?ERROR:\s*/i, "");
}
