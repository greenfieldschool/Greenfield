// Plain module-level helpers for finance server actions (safe to call from inline "use server" actions).

/** Build `path?toast=...&toast_type=...`, preserving any existing query string. */
export function toastUrl(path: string, message: string, type: "success" | "error" = "success"): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}toast=${encodeURIComponent(message)}&toast_type=${type}`;
}

/** A datetime-local value ("2026-10-14T09:30") read as Lagos time (UTC+1, no DST). Invalid → null. */
export function lagosLocalToDate(raw: string): Date | null {
  const v = raw.trim();
  if (!v) return null;
  const withOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) ? `${v}+01:00` : v;
  const d = new Date(withOffset);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO timestamp → "YYYY-MM-DDTHH:mm" in Lagos time, for <input type="datetime-local">. */
export function toLagosDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t + 60 * 60 * 1000).toISOString().slice(0, 16);
}
