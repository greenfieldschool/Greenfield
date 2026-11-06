// Online video classes (migration 20261108_online_classes.sql). Teachers schedule them per class (and subject) on
// /admin/academics/online-classes with a Zoom / Google Meet / Teams link; pupils and parents join from
// /portal/online-classes. Joining goes through join_online_class(), which records attendance and returns the link.

export type Platform = "zoom" | "meet" | "teams" | "other";
export const PLATFORM_LABEL: Record<Platform, string> = { zoom: "Zoom", meet: "Google Meet", teams: "Microsoft Teams", other: "Online meeting" };

export type OnlineClassRow = {
  id: string;
  class_id: string;
  subject_id: string | null;
  academic_term_id: string | null;
  topic: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
  platform: Platform;
  meeting_url: string;
  meeting_code: string | null;
  lesson_note_id: string | null;
  status: "scheduled" | "cancelled";
  cancel_reason: string | null;
  author_name: string | null;
  created_at: string;
};

export const ONLINE_CLASS_COLUMNS =
  "id, class_id, subject_id, academic_term_id, topic, description, starts_at, duration_minutes, platform, meeting_url, meeting_code, lesson_note_id, status, cancel_reason, author_name, created_at";

/** Doors open this long before the start (the database allows joining from then too). */
export const OPEN_EARLY_MINUTES = 15;

export const DURATIONS = [20, 30, 40, 45, 60, 80, 90, 120];

/** Which service a meeting link is for, from its address. */
export function platformFromUrl(url: string): Platform {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "zoom";
  if (host === "meet.google.com") return "meet";
  if (host === "teams.microsoft.com" || host === "teams.live.com" || host.endsWith(".teams.microsoft.com")) return "teams";
  return "other";
}

/** Only full https:// links (what Zoom, Meet and Teams give), so a link can't run anything in the browser. */
export function cleanMeetingUrl(raw: string): string | null {
  const t = raw.trim();
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" || !u.hostname.includes(".") || t.length > 1000 || /\s/.test(t)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type ClassState = "cancelled" | "live" | "soon" | "upcoming" | "ended";

/** live = running now; soon = opens for joining (15 minutes before); upcoming = later; ended = over. */
export function classState(o: Pick<OnlineClassRow, "status" | "starts_at" | "duration_minutes">, now = new Date()): ClassState {
  if (o.status === "cancelled") return "cancelled";
  const start = new Date(o.starts_at).getTime();
  const end = start + o.duration_minutes * 60000;
  const t = now.getTime();
  if (t > end) return "ended";
  if (t >= start) return "live";
  if (t >= start - OPEN_EARLY_MINUTES * 60000) return "soon";
  return "upcoming";
}

export const STATE_LABEL: Record<ClassState, string> = {
  cancelled: "Cancelled",
  live: "Live now",
  soon: "Starting soon",
  upcoming: "Scheduled",
  ended: "Ended"
};

export const STATE_TONE: Record<ClassState, "green" | "gold" | "blue" | "red" | "slate"> = {
  cancelled: "red",
  live: "green",
  soon: "gold",
  upcoming: "blue",
  ended: "slate"
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function lagos(iso: string) {
  return new Date(new Date(iso).getTime() + 60 * 60 * 1000); // Lagos is UTC+1 all year.
}

function clock(d: Date) {
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "Thu 12 Nov · 10:00 am – 10:40 am" in Lagos time. Months spelled by hand ("en-GB" gives "Sept" on some servers). */
export function whenLabel(startsAt: string, minutes: number) {
  const s = lagos(startsAt);
  const e = new Date(s.getTime() + minutes * 60000);
  return `${WEEKDAYS[s.getUTCDay()]} ${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} · ${clock(s)} – ${clock(e)}`;
}

/** "in 2 days", "in 3 hours", "in 12 minutes", for an upcoming class. */
export function startsIn(startsAt: string, now = new Date()) {
  const mins = Math.round((new Date(startsAt).getTime() - now.getTime()) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Lagos calendar day "YYYY-MM-DD" of a timestamp, for grouping. */
export function lagosDay(iso: string) {
  return lagos(iso).toISOString().slice(0, 10);
}

export function dayHeading(day: string, today: string) {
  if (day === today) return "Today";
  const d = new Date(`${day}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Friendly words for errors from the table and join_online_class(). */
export function onlineClassErrorMessage(message: string) {
  if (/online_class/.test(message) && /does not exist|schema cache|function/i.test(message)) {
    return "Online classes need a database update first. Ask the school's IT person to run 20261108_online_classes.sql.";
  }
  if (/meeting_url/.test(message)) return "Paste the full meeting link, starting with https://";
  if (/row-level security|permission denied/i.test(message)) return "You can only schedule online classes for the classes and subjects you teach.";
  // join_online_class() already speaks plainly ("This online class has ended").
  return message.replace(/^.*?ERROR:\s*/i, "");
}
