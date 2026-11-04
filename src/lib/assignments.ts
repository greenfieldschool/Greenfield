import type { SupabaseClient } from "@supabase/supabase-js";

// Assignments and classwork (migration 20261105_assignments.sql). Teachers set them per class (and subject) on
// /admin/academics/assignments; pupils hand in on /portal/assignments; parents follow along there. Files live in the
// private "assignment-files" bucket: briefs/<assignment>/… (the teacher's worksheet) and
// work/<assignment>/<pupil>/… (the pupil's work), opened with short-lived signed links.

export const ASSIGNMENT_BUCKET = "assignment-files";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type AssignmentKind = "assignment" | "classwork";
export const KIND_LABEL: Record<AssignmentKind, string> = { assignment: "Assignment", classwork: "Classwork" };

export type AssignmentRow = {
  id: string;
  class_id: string;
  subject_id: string | null;
  academic_term_id: string | null;
  kind: AssignmentKind;
  title: string;
  instructions: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  due_at: string | null;
  max_score: number | null;
  accepts_late: boolean;
  result_assessment_id: string | null;
  created_at: string;
};

export type SubmissionRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  body: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  submitted_at: string | null;
  score: number | null;
  feedback: string | null;
  marked_at: string | null;
};

export const ASSIGNMENT_COLUMNS =
  "id, class_id, subject_id, academic_term_id, kind, title, instructions, attachment_path, attachment_name, due_at, max_score, accepts_late, result_assessment_id, created_at";
export const SUBMISSION_COLUMNS =
  "id, assignment_id, student_id, body, file_path, file_name, file_type, submitted_at, score, feedback, marked_at";

export type PupilStatus = "marked" | "late" | "handed_in" | "overdue" | "to_do";

export const STATUS_LABEL: Record<PupilStatus, string> = {
  marked: "Marked",
  late: "Handed in late",
  handed_in: "Handed in",
  overdue: "Not handed in",
  to_do: "To do"
};

export const STATUS_TONE: Record<PupilStatus, "green" | "gold" | "blue" | "red" | "slate"> = {
  marked: "green",
  late: "gold",
  handed_in: "blue",
  overdue: "red",
  to_do: "slate"
};

/** Where one pupil stands on one assignment. */
export function pupilStatus(a: Pick<AssignmentRow, "due_at">, s: Pick<SubmissionRow, "submitted_at" | "marked_at"> | null | undefined, now = new Date()): PupilStatus {
  if (s?.marked_at) return "marked";
  if (s?.submitted_at) return a.due_at && new Date(s.submitted_at) > new Date(a.due_at) ? "late" : "handed_in";
  if (a.due_at && now > new Date(a.due_at)) return "overdue";
  return "to_do";
}

/** "Due Fri 7 Nov, 4:00 pm" in Lagos time; "No due date" when there isn't one. */
export function dueLabel(dueAt: string | null) {
  if (!dueAt) return "No due date";
  return `Due ${new Date(dueAt).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Lagos"
  })}`;
}

/** A Lagos date + time ("2026-11-07", "16:00") as an ISO timestamp, or null. */
export function lagosDueAt(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : "23:59";
  return new Date(`${date}T${t}:00+01:00`).toISOString();
}

/** An ISO timestamp as the Lagos date and time for <input type="date"> / <input type="time">. */
export function lagosDateTimeParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const lagos = new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString();
  return { date: lagos.slice(0, 10), time: lagos.slice(11, 16) };
}

/**
 * Short-lived links (10 minutes) to files the signed-in user may open; the bucket's rules decide which. Paths the
 * user can't open are simply left out.
 */
export async function signedFileLinks(client: SupabaseClient, paths: Array<string | null | undefined>) {
  const wanted = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  const out = new Map<string, string>();
  if (!wanted.length) return out;
  const { data } = await client.storage.from(ASSIGNMENT_BUCKET).createSignedUrls(wanted, 600);
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}

/** A safe file name for storage: letters, numbers, dots, dashes; keeps the extension. */
export function storageFileName(name: string) {
  const clean = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${Date.now()}-${clean || "file"}`.slice(0, 120);
}

/** Friendly words for errors from the database functions and the bucket. */
export function assignmentErrorMessage(message: string) {
  if (/assignments|assignment_submissions|submit_assignment|mark_submission/.test(message) && /does not exist|schema cache|function/i.test(message)) {
    return "Assignments need a database update first. Ask the school's IT person to run 20261105_assignments.sql.";
  }
  if (/row-level security|permission denied/i.test(message)) return "You can't do that for this class.";
  // The database functions already speak plainly ("The due date has passed …").
  return message.replace(/^.*?ERROR:\s*/i, "");
}
