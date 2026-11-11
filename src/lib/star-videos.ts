// Star of the week videos (table star_videos, docs/migrations/20261112_star_videos.sql): each week, for each class,
// a video of a pupil who did well in each of the class's two major subjects. The video stays where the teacher put
// it (Google Drive, YouTube …); the school keeps the link.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, shortDate } from "@/lib/mi-periods";

export const STAR_VIDEO_COLUMNS = "id, class_id, subject_id, week_start, student_id, video_url, reason, author_name, created_at, updated_at";

export type StarVideoRow = {
  id: string;
  class_id: string;
  subject_id: string;
  week_start: string;
  student_id: string;
  video_url: string;
  reason: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
};

/** "9 Nov – 15 Nov 2026". */
export function weekLabel(monday: string) {
  return `${shortDate(monday)} – ${shortDate(addDays(monday, 6), true)}`;
}

/** A pasted link, trimmed; null unless it is a plain https:// link (no spaces). */
export function cleanVideoUrl(raw: string): string | null {
  const v = raw.trim();
  if (!/^https:\/\/\S+$/i.test(v) || v.length > 1000) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/** Where the video lives, in plain words, for the "Watch on …" button. */
export function videoHost(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the video";
  }
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return "YouTube";
  if (/(^|\.)drive\.google\.com$|(^|\.)photos\.google\.com$/.test(host)) return "Google Drive";
  if (/(^|\.)vimeo\.com$/.test(host)) return "Vimeo";
  if (/(^|\.)dropbox\.com$/.test(host)) return "Dropbox";
  if (/(^|\.)1drv\.ms$|(^|\.)onedrive\.live\.com$|sharepoint\.com$/.test(host)) return "OneDrive";
  return host || "the video";
}

export function starVideoErrorMessage(message: string): string {
  if (/does not exist|schema cache|star_videos/i.test(message) && /relation|schema cache|column/i.test(message))
    return "Star videos need a database update first: 20261112_star_videos.sql.";
  if (/duplicate key/i.test(message)) return "This subject already has a video for that week. Change it instead.";
  if (/row-level security|permission/i.test(message))
    return "You can only post videos for subjects you teach, for a pupil in the class, and only for the class's major subjects.";
  if (/video_url/i.test(message)) return "Paste the full video link (it starts with https://).";
  return message;
}

export type Suggestion = { studentId: string; percent: number; pieces: number };

/**
 * Pupils with the best marks on this class's work in a subject that was marked during the week: average of
 * score ÷ max score. A hint for the teacher, not a rule.
 */
export async function suggestStars(
  supabase: SupabaseClient,
  classId: string,
  subjectId: string,
  weekStartIso: string,
  weekEndIsoExclusive: string,
  limit = 3
): Promise<Suggestion[]> {
  const { data: work } = await supabase
    .from("assignments")
    .select("id, max_score")
    .eq("class_id", classId)
    .eq("subject_id", subjectId)
    .limit(500);
  const max = new Map(((work ?? []) as Array<{ id: string; max_score: number | null }>).map((w) => [w.id, Number(w.max_score ?? 0)] as const));
  if (!max.size) return [];
  const { data: subs } = await supabase
    .from("assignment_submissions")
    .select("assignment_id, student_id, score")
    .in("assignment_id", [...max.keys()])
    .not("score", "is", null)
    .gte("marked_at", weekStartIso)
    .lt("marked_at", weekEndIsoExclusive)
    .limit(2000);
  const per = new Map<string, { sum: number; n: number }>();
  for (const s of (subs ?? []) as Array<{ assignment_id: string; student_id: string; score: number }>) {
    const m = max.get(s.assignment_id) ?? 0;
    if (m <= 0) continue;
    const e = per.get(s.student_id) ?? { sum: 0, n: 0 };
    e.sum += (Number(s.score) / m) * 100;
    e.n++;
    per.set(s.student_id, e);
  }
  return [...per.entries()]
    .map(([studentId, e]) => ({ studentId, percent: Math.round(e.sum / e.n), pieces: e.n }))
    .sort((a, b) => b.percent - a.percent || b.pieces - a.pieces)
    .slice(0, limit);
}
