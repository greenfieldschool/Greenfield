import { round2 } from "@/lib/results";

// Welfare is scored out of 100 from the criteria set for the class's level (Welfare → Welfare criteria).
// Each criterion is either rated 1–5 by the class teacher, or worked out from the welfare records.
// scoreWelfare scores one period (a week, or a whole term for terms rated before weekly scoring).

export type WelfareSource = "rating" | "attendance" | "punctuality" | "uniform" | "conduct";

export const welfareSources: Array<{ value: WelfareSource; label: string; help: string }> = [
  { value: "rating", label: "Teacher rating (1–5)", help: "The class teacher rates each pupil from 1 to 5 every week on the welfare score sheet." },
  { value: "attendance", label: "Attendance", help: "Days present (or late) out of the days attendance was taken that week." },
  { value: "punctuality", label: "Punctuality", help: "Days on time out of the days present, from the “late” attendance marks." },
  { value: "uniform", label: "Uniform checks", help: "Uniform checks passed out of the checks recorded that week." },
  { value: "conduct", label: "Conduct", help: "Starts at full marks each week; each discipline record that week takes off its severity × the penalty." }
];

export const ratingLabels: Record<number, string> = {
  5: "Excellent",
  4: "Very good",
  3: "Good",
  2: "Fair",
  1: "Poor"
};

export type WelfareCriterion = {
  id: string;
  name: string;
  description: string | null;
  source: WelfareSource;
  max_points: number;
  position: number;
};

export type WelfareRecords = {
  present: number;
  late: number;
  absent: number;
  uniformChecks: number;
  uniformFailures: number;
  disciplineCount: number;
  disciplineSeverity: number;
  /** criterion id -> rating 1..5 */
  ratings: Record<string, number>;
};

export const emptyWelfareRecords = (): WelfareRecords => ({
  present: 0,
  late: 0,
  absent: 0,
  uniformChecks: 0,
  uniformFailures: 0,
  disciplineCount: 0,
  disciplineSeverity: 0,
  ratings: {}
});

export type WelfareItem = {
  criterion: WelfareCriterion;
  /** null when there is nothing to score yet (not rated, no attendance taken, no uniform checks). */
  points: number | null;
  detail: string;
  /** A few words for the score sheet ("4/5 days"). */
  short?: string;
  rating: number | null;
};

export function scoreCriterion(c: WelfareCriterion, r: WelfareRecords, disciplinePenalty: number): WelfareItem {
  const max = Number(c.max_points);
  const attended = r.present + r.late;
  switch (c.source) {
    case "rating": {
      const rating = r.ratings[c.id] ?? null;
      return {
        criterion: c,
        rating,
        points: rating === null ? null : round2((max * rating) / 5),
        detail: rating === null ? "Not rated yet" : `${rating}/5 · ${ratingLabels[rating] ?? ""}`
      };
    }
    case "attendance": {
      const days = attended + r.absent;
      return {
        criterion: c,
        rating: null,
        points: days ? round2((max * attended) / days) : null,
        detail: days ? `Present ${attended} of ${days} days` : "No attendance taken",
        short: days ? `${attended}/${days} days` : "not taken"
      };
    }
    case "punctuality":
      return {
        criterion: c,
        rating: null,
        points: attended ? round2((max * r.present) / attended) : null,
        detail: attended ? `On time ${r.present} of ${attended} days` : "No attendance taken",
        short: attended ? `${r.present}/${attended} on time` : "not taken"
      };
    case "uniform":
      return {
        criterion: c,
        rating: null,
        points: r.uniformChecks ? round2((max * (r.uniformChecks - r.uniformFailures)) / r.uniformChecks) : null,
        detail: r.uniformChecks
          ? `Passed ${r.uniformChecks - r.uniformFailures} of ${r.uniformChecks} checks`
          : "No uniform checks recorded",
        short: r.uniformChecks ? `${r.uniformChecks - r.uniformFailures}/${r.uniformChecks} passed` : "no check"
      };
    case "conduct": {
      const deduction = r.disciplineSeverity * disciplinePenalty;
      return {
        criterion: c,
        rating: null,
        points: round2(Math.max(0, max - deduction)),
        detail: r.disciplineCount
          ? `${r.disciplineCount} discipline record${r.disciplineCount === 1 ? "" : "s"} (−${round2(Math.min(max, deduction))})`
          : "No discipline records",
        short: r.disciplineCount ? `${r.disciplineCount} record${r.disciplineCount === 1 ? "" : "s"} −${round2(Math.min(max, deduction))}` : "no records"
      };
    }
  }
}

export type WelfareResult = {
  items: WelfareItem[];
  earned: number;
  possible: number;
  /** Out of 100, over the criteria that could be scored. null when none could. */
  percent: number | null;
  unrated: number;
};

export function scoreWelfare(criteria: WelfareCriterion[], r: WelfareRecords, disciplinePenalty: number): WelfareResult {
  const items = criteria.map((c) => scoreCriterion(c, r, disciplinePenalty));
  const scored = items.filter((i) => i.points !== null);
  const earned = round2(scored.reduce((a, i) => a + (i.points ?? 0), 0));
  const possible = round2(scored.reduce((a, i) => a + Number(i.criterion.max_points), 0));
  return {
    items,
    earned,
    possible,
    percent: possible > 0 ? round2((earned / possible) * 100) : null,
    unrated: items.filter((i) => i.criterion.source === "rating" && i.rating === null).length
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Weekly welfare
//
// The class teacher scores every pupil each week, out of 100. Record-based criteria use that week's records
// (attendance, uniform checks, discipline). A week counts once the class teacher has rated the pupil that week (or,
// for a level with no teacher-rated criteria, once attendance or uniform was recorded). The term's welfare score
// is the average of the weeks that count, so it is still out of 100.
// Terms scored before weekly scoring started (ratings with no week) keep the whole-term calculation above.
// ---------------------------------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A date or timestamp → its "YYYY-MM-DD" day in Lagos. */
export function lagosDay(v: string): string {
  if (isDay(v)) return v;
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return v.slice(0, 10);
  return new Date(t + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of the week a day falls in. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}

export function isMonday(day: string): boolean {
  return isDay(day) && mondayOf(day) === day;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Spelled out by hand: some servers' locale data says "Sept".
const shortDay = (day: string, withMonth = true) =>
  `${Number(day.slice(8, 10))}${withMonth ? ` ${MONTHS[Number(day.slice(5, 7)) - 1]}` : ""}`;

/** "6 Oct". */
export const dayMonth = (day: string) => shortDay(day);

/** "6–10 Oct" or "29 Sep – 3 Oct" (Monday to Friday). */
export function weekRange(weekStart: string): string {
  const end = addDays(weekStart, 4);
  return weekStart.slice(5, 7) === end.slice(5, 7) ? `${shortDay(weekStart, false)}–${shortDay(end)}` : `${shortDay(weekStart)} – ${shortDay(end)}`;
}

export type TermWeek = {
  /** Monday, "YYYY-MM-DD". */
  start: string;
  number: number;
  range: string;
  current: boolean;
  future: boolean;
};

/** The school weeks of a term, Monday to Monday, plus any week that already has ratings outside the term dates. */
export function termWeeks(startsOn: string | null, endsOn: string | null, extraWeeks: string[], today: string): TermWeek[] {
  const starts = new Set(extraWeeks.filter(isMonday));
  if (startsOn && endsOn && isDay(startsOn.slice(0, 10)) && isDay(endsOn.slice(0, 10))) {
    const last = mondayOf(endsOn.slice(0, 10));
    for (let w = mondayOf(startsOn.slice(0, 10)), i = 0; w <= last && i < 60; w = addDays(w, 7), i++) starts.add(w);
  }
  const thisWeek = mondayOf(today);
  return Array.from(starts)
    .sort()
    .map((start, i) => ({ start, number: i + 1, range: weekRange(start), current: start === thisWeek, future: start > thisWeek }));
}

export type WelfareWeek = {
  weekStart: string;
  items: WelfareItem[];
  /** Out of 100; null when the week doesn't count yet. */
  percent: number | null;
  counted: boolean;
  /** Teacher-rated criteria rated / still to rate this week. */
  rated: number;
  toRate: number;
  /** The school was open (or the teacher started rating) but some ratings are missing. */
  needsRating: boolean;
};

export type WeeklyWelfareResult = WelfareResult & { mode: "weekly"; weeks: WelfareWeek[]; weeksCounted: number };
export type TermWelfareResult = WelfareResult & { mode: "term"; weeks: WelfareWeek[]; weeksCounted: number };
export type AnyWelfareResult = WeeklyWelfareResult | TermWelfareResult;

export function scoreWelfareTerm(criteria: WelfareCriterion[], r: WelfareRecords, disciplinePenalty: number): TermWelfareResult {
  return { ...scoreWelfare(criteria, r, disciplinePenalty), mode: "term", weeks: [], weeksCounted: 0 };
}

const average = (values: number[]) => (values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length) : null);

/**
 * byWeek: the pupil's records for each week (Monday → records). termRecords: the whole term's records, used only
 * for the wording on the report card ("Present 48 of 50 days").
 */
export function scoreWelfareWeekly(
  criteria: WelfareCriterion[],
  byWeek: Map<string, WelfareRecords>,
  weeks: TermWeek[],
  termRecords: WelfareRecords,
  disciplinePenalty: number
): WeeklyWelfareResult {
  const ratingCount = criteria.filter((c) => c.source === "rating").length;
  const scored: WelfareWeek[] = weeks.map((w) => {
    const r = byWeek.get(w.start) ?? emptyWelfareRecords();
    const res = scoreWelfare(criteria, r, disciplinePenalty);
    const rated = ratingCount - res.unrated;
    const recorded = r.present + r.late + r.absent > 0 || r.uniformChecks > 0;
    const counted = res.percent !== null && (ratingCount ? rated > 0 : recorded);
    return {
      weekStart: w.start,
      items: res.items,
      percent: counted ? res.percent : null,
      counted,
      rated,
      toRate: res.unrated,
      needsRating: ratingCount > 0 && !w.future && res.unrated > 0 && (rated > 0 || recorded)
    };
  });
  const counted = scored.filter((w) => w.counted);

  const items: WelfareItem[] = criteria.map((c, i) => {
    const points = counted.map((w) => w.items[i].points).filter((p): p is number => p !== null);
    const ratings = counted.map((w) => w.items[i].rating).filter((p): p is number => p !== null);
    const avgPoints = average(points);
    if (c.source === "rating") {
      const avgRating = average(ratings);
      return {
        criterion: c,
        rating: avgRating,
        points: avgPoints,
        detail: avgRating === null ? "Not rated yet" : `Average ${avgRating}/5 · ${ratingLabels[Math.round(avgRating)] ?? ""}`
      };
    }
    const termDetail = scoreCriterion(c, termRecords, disciplinePenalty).detail;
    return { criterion: c, rating: null, points: avgPoints, detail: termDetail };
  });

  const scoredItems = items.filter((i) => i.points !== null);
  return {
    mode: "weekly",
    items,
    earned: round2(scoredItems.reduce((a, i) => a + (i.points ?? 0), 0)),
    possible: round2(scoredItems.reduce((a, i) => a + Number(i.criterion.max_points), 0)),
    percent: average(counted.map((w) => w.percent as number)),
    // Weeks still to rate; a pupil with no week scored at all also needs attention.
    unrated: scored.filter((w) => w.needsRating).length + (ratingCount && !counted.length ? 1 : 0),
    weeks: scored,
    weeksCounted: counted.length
  };
}
