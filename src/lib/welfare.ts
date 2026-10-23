import { round2 } from "@/lib/results";

// Welfare is scored out of 100 from the criteria set for the class's level (Welfare → Welfare criteria).
// Each criterion is either rated 1–5 by the class teacher, or worked out from the term's welfare records.

export type WelfareSource = "rating" | "attendance" | "punctuality" | "uniform" | "conduct";

export const welfareSources: Array<{ value: WelfareSource; label: string; help: string }> = [
  { value: "rating", label: "Teacher rating (1–5)", help: "The class teacher rates each pupil from 1 to 5 on the welfare score sheet." },
  { value: "attendance", label: "Attendance", help: "Days present (or late) out of the days attendance was taken this term." },
  { value: "punctuality", label: "Punctuality", help: "Days on time out of the days present, from the “late” attendance marks." },
  { value: "uniform", label: "Uniform checks", help: "Uniform checks passed out of the checks recorded this term." },
  { value: "conduct", label: "Conduct", help: "Starts at full marks; each discipline record takes off its severity × the penalty." }
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
        detail: days ? `Present ${attended} of ${days} days` : "No attendance taken"
      };
    }
    case "punctuality":
      return {
        criterion: c,
        rating: null,
        points: attended ? round2((max * r.present) / attended) : null,
        detail: attended ? `On time ${r.present} of ${attended} days` : "No attendance taken"
      };
    case "uniform":
      return {
        criterion: c,
        rating: null,
        points: r.uniformChecks ? round2((max * (r.uniformChecks - r.uniformFailures)) / r.uniformChecks) : null,
        detail: r.uniformChecks
          ? `Passed ${r.uniformChecks - r.uniformFailures} of ${r.uniformChecks} checks`
          : "No uniform checks recorded"
      };
    case "conduct": {
      const deduction = r.disciplineSeverity * disciplinePenalty;
      return {
        criterion: c,
        rating: null,
        points: round2(Math.max(0, max - deduction)),
        detail: r.disciplineCount
          ? `${r.disciplineCount} discipline record${r.disciplineCount === 1 ? "" : "s"} (−${round2(Math.min(max, deduction))})`
          : "No discipline records"
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
