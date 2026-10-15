// The school runs on Lagos time (WAT, UTC+1, no daylight saving). Date-only inputs are converted with
// this fixed offset so results don't depend on the server's timezone (Vercel runs in UTC).
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function isDateOnly(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** "2026-10-14" → start of that day in Lagos, as an ISO timestamp. */
export function lagosStartOfDayIso(date: string): string | null {
  if (!isDateOnly(date)) return null;
  return new Date(`${date}T00:00:00+01:00`).toISOString();
}

/** "2026-10-14" → last second of that day in Lagos, as an ISO timestamp. */
export function lagosEndOfDayIso(date: string): string | null {
  if (!isDateOnly(date)) return null;
  return new Date(`${date}T23:59:59+01:00`).toISOString();
}

/** ISO timestamp → "YYYY-MM-DD" in Lagos, for <input type="date">. */
export function toLagosDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO timestamp → "14 Oct 2026" in Lagos. */
export function formatLagosDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}

export type SessionVisibilityInput = {
  active: boolean;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

/** Why students can or cannot see a session right now (mirrors the database access rule). */
export function sessionVisibility(s: SessionVisibilityInput, now = new Date()): { visible: boolean; reason: string } {
  if (!s.active) return { visible: false, reason: "Turned off (not active)" };
  if (s.status === "draft") return { visible: false, reason: "Draft — set status to active" };
  if (s.status === "closed") return { visible: false, reason: "Closed" };
  if (s.status !== "active") return { visible: false, reason: `Status is ${s.status}` };
  if (s.starts_at && new Date(s.starts_at) > now) return { visible: false, reason: `Opens ${formatLagosDate(s.starts_at)}` };
  if (s.ends_at && new Date(s.ends_at) < now) return { visible: false, reason: `Ended ${formatLagosDate(s.ends_at)}` };
  return { visible: true, reason: "Open to students now" };
}
