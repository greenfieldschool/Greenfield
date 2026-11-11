// Periods for the management information pack: Lagos weeks (Monday to Sunday) and calendar months.
// Pure date maths on "YYYY-MM-DD" strings (no server timezone involved), so it gives the same answer on Vercel (UTC).
import { lagosStartOfDayIso } from "@/lib/lagos-dates";

export type MiView = "week" | "month";

export type MiRange = {
  /** First day, "YYYY-MM-DD" (Lagos). */
  start: string;
  /** Last day counted, inclusive. */
  end: string;
  /** Start of `start` in Lagos, as an ISO timestamp (for timestamp columns). */
  startIso: string;
  /** Start of the day after `end` in Lagos: use with `.lt()`. */
  endIsoExclusive: string;
  label: string;
};

export type MiPeriod = MiRange & {
  view: MiView;
  /** "2026-11-09" (the Monday) for a week, "2026-11" for a month. */
  key: string;
  /** The full period's last day (end may be earlier while the period is still running). */
  fullEnd: string;
  /** True while today is inside the period: figures are "so far". */
  inProgress: boolean;
  /** The period before, cut to the same number of days when this one is still running. */
  previous: MiRange;
  /** "last week" / "last month". */
  previousWord: string;
  /** Keys of the periods before and after (null when that would be in the future). */
  prevKey: string;
  nextKey: string | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toUtc = (d: string) => new Date(`${d}T00:00:00Z`);
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

/** Today's date in Lagos (UTC+1). */
export function lagosToday(now = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** Days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86400000);
}

/** The Monday of the week that contains `date`. */
export function mondayOf(date: string): string {
  const dow = toUtc(date).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

function monthStart(key: string) {
  return `${key}-01`;
}

function monthEnd(key: string) {
  const [y, m] = key.split("-").map(Number);
  return fromUtc(new Date(Date.UTC(y, m, 0)));
}

function shiftMonth(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return fromUtc(d).slice(0, 7);
}

/** "9 Nov" or "9 Nov 2026". */
export function shortDate(date: string, withYear = false) {
  const d = toUtc(date);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
}

function rangeLabel(start: string, end: string) {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${shortDate(start, !sameYear)} – ${shortDate(end, true)}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function makeRange(start: string, end: string, label: string): MiRange {
  return {
    start,
    end,
    label,
    startIso: lagosStartOfDayIso(start) ?? `${start}T00:00:00.000Z`,
    endIsoExclusive: lagosStartOfDayIso(addDays(end, 1)) ?? `${addDays(end, 1)}T00:00:00.000Z`
  };
}

export function parseView(v: string | undefined): MiView {
  return v === "month" ? "month" : "week";
}

/** Works out the period to show. Unknown or future keys fall back to the current week / month. */
export function resolvePeriod(view: MiView, key: string | undefined, today = lagosToday()): MiPeriod {
  if (view === "week") {
    const current = mondayOf(today);
    let start = key && /^\d{4}-\d{2}-\d{2}$/.test(key) ? mondayOf(key) : current;
    if (start > current) start = current;
    const fullEnd = addDays(start, 6);
    const inProgress = today >= start && today <= fullEnd;
    const end = inProgress ? today : fullEnd;
    const prevStart = addDays(start, -7);
    const prevEnd = addDays(prevStart, daysBetween(start, end));
    return {
      view,
      key: start,
      ...makeRange(start, end, `Week of ${rangeLabel(start, fullEnd)}`),
      fullEnd,
      inProgress,
      previous: makeRange(prevStart, prevEnd, rangeLabel(prevStart, prevEnd)),
      previousWord: start === current ? "last week" : "the week before",
      prevKey: prevStart,
      nextKey: start === current ? null : addDays(start, 7)
    };
  }

  const currentKey = today.slice(0, 7);
  let mk = key && /^\d{4}-\d{2}$/.test(key) ? key : currentKey;
  if (mk > currentKey) mk = currentKey;
  const start = monthStart(mk);
  const fullEnd = monthEnd(mk);
  const inProgress = mk === currentKey;
  const end = inProgress ? today : fullEnd;
  const prevKey = shiftMonth(mk, -1);
  const prevStart = monthStart(prevKey);
  const prevFullEnd = monthEnd(prevKey);
  // While a month is running, compare with the same days of last month (1–11 Nov against 1–11 Oct).
  const sameDay = addDays(prevStart, daysBetween(start, end));
  const prevEnd = inProgress && sameDay < prevFullEnd ? sameDay : prevFullEnd;
  return {
    view,
    key: mk,
    ...makeRange(start, end, monthLabel(mk)),
    fullEnd,
    inProgress,
    previous: makeRange(prevStart, prevEnd, inProgress ? rangeLabel(prevStart, prevEnd) : monthLabel(prevKey)),
    previousWord: mk === currentKey ? "last month" : "the month before",
    prevKey,
    nextKey: mk === currentKey ? null : shiftMonth(mk, 1)
  };
}

/** Recent periods for the picker, newest first. */
export function recentPeriods(view: MiView, today = lagosToday(), count = view === "week" ? 16 : 12) {
  const out: Array<{ key: string; label: string }> = [];
  if (view === "week") {
    let start = mondayOf(today);
    for (let i = 0; i < count; i++) {
      out.push({ key: start, label: `${rangeLabel(start, addDays(start, 6))}${i === 0 ? " (this week)" : i === 1 ? " (last week)" : ""}` });
      start = addDays(start, -7);
    }
  } else {
    let mk = today.slice(0, 7);
    for (let i = 0; i < count; i++) {
      out.push({ key: mk, label: `${monthLabel(mk)}${i === 0 ? " (this month)" : ""}` });
      mk = shiftMonth(mk, -1);
    }
  }
  return out;
}

/** Monday-to-Friday days between two dates, inclusive (school days, before holidays). */
export function weekdaysBetween(start: string, end: string): number {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = toUtc(d).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}
