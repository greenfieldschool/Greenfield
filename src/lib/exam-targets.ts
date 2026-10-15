// Question targets ("how many questions of each type this test needs") are stored inside the test's
// description as a `||TARGETS:{...}||` marker, so no schema change was needed.
const TARGETS_RE = /\|\|TARGETS:(.*?)\|\|/;

export function parseDescriptionAndTargets(desc: string | null) {
  const text = desc || "";
  const match = text.match(TARGETS_RE);
  if (match) {
    try {
      const targets = JSON.parse(match[1]);
      const cleanDesc = text.replace(TARGETS_RE, "").trim();
      return { description: cleanDesc, targets: targets as Record<string, number> };
    } catch {
      // ignore malformed marker
    }
  }
  return { description: text, targets: {} as Record<string, number> };
}

export function formatDescriptionWithTargets(cleanDesc: string, targets: Record<string, number>) {
  const jsonStr = JSON.stringify(targets);
  return `${cleanDesc.trim()} ||TARGETS:${jsonStr}||`;
}

export function totalTarget(targets: Record<string, number>) {
  return Object.values(targets).reduce((acc, n) => acc + (Number(n) || 0), 0);
}

// ---------------------------------------------------------------------------------------------
// Targets can be set by question type (legacy / advanced) or as two totals — "objective" (any of
// the auto-marked types) and "theory" (written answers). Totals are what teachers usually think in
// ("30 objective and 5 theory"), and they count questions that were already set, whatever their type.
// ---------------------------------------------------------------------------------------------
export const OBJECTIVE_TYPES = ["mcq_single", "mcq_multi", "true_false", "fill_blank"] as const;
export const THEORY_TYPES = ["short_answer", "essay"] as const;

export type QuestionCounts = Record<string, number>;

export function countByType(questionTypes: string[]): QuestionCounts {
  const counts: QuestionCounts = {};
  for (const t of questionTypes) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

export function groupCounts(counts: QuestionCounts) {
  const sum = (types: readonly string[]) => types.reduce((acc, t) => acc + (counts[t] ?? 0), 0);
  return { objective: sum(OBJECTIVE_TYPES), theory: sum(THEORY_TYPES) };
}

/** Targets that match what has already been set: `{ objective: 30, theory: 5 }` (zeros omitted). */
export function targetsFromCounts(counts: QuestionCounts): Record<string, number> {
  const g = groupCounts(counts);
  const targets: Record<string, number> = {};
  if (g.objective > 0) targets.objective = g.objective;
  if (g.theory > 0) targets.theory = g.theory;
  return targets;
}

export function hasTargets(targets: Record<string, number>) {
  return totalTarget(targets) > 0;
}

export type TargetRow = { key: string; label: string; target: number; actual: number };

const TYPE_LABELS: Record<string, string> = {
  mcq_single: "MCQ (single answer)",
  mcq_multi: "MCQ (multiple answers)",
  true_false: "True / False",
  fill_blank: "Fill in the blank",
  short_answer: "Short answer",
  essay: "Essay"
};

/**
 * Progress of the questions already set against the targets. A total target ("objective"/"theory")
 * counts every question of those types; per-type targets are only compared with their own type.
 * A per-type target is ignored when a total covering its type exists, so nothing is counted twice.
 */
export function targetProgress(targets: Record<string, number>, counts: QuestionCounts) {
  const g = groupCounts(counts);
  const rows: TargetRow[] = [];
  const covered = new Set<string>();

  if ((targets.objective ?? 0) > 0) {
    rows.push({ key: "objective", label: "Objective questions", target: targets.objective, actual: g.objective });
    OBJECTIVE_TYPES.forEach((t) => covered.add(t));
  }
  if ((targets.theory ?? 0) > 0) {
    rows.push({ key: "theory", label: "Theory questions", target: targets.theory, actual: g.theory });
    THEORY_TYPES.forEach((t) => covered.add(t));
  }
  for (const [key, target] of Object.entries(targets)) {
    if (key === "objective" || key === "theory" || covered.has(key) || !(Number(target) > 0)) continue;
    rows.push({ key, label: TYPE_LABELS[key] ?? key, target: Number(target), actual: counts[key] ?? 0 });
  }

  const totalTargetN = rows.reduce((acc, r) => acc + r.target, 0);
  const totalSetN = rows.reduce((acc, r) => acc + r.actual, 0);
  // Extra questions in one row never make up for a shortfall in another, so "remaining" is per row.
  const remaining = rows.reduce((acc, r) => acc + Math.max(0, r.target - r.actual), 0);
  return { rows, totalTarget: totalTargetN, totalSet: totalSetN, remaining, met: rows.length > 0 && remaining === 0 };
}
