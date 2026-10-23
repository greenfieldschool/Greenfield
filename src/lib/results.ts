import type { getSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

// Result sheet columns. Each class + subject + term has its own columns, stored as academic_assessments with
// on_result_sheet = true (title = column name, max_score, position, component_group). A subject's score is
// (sum of scores / sum of column max scores) x 100, so the columns don't have to add up to exactly 100.

export type ComponentGroup = "ca" | "exam" | "other";

export const componentGroups: Array<{ value: ComponentGroup; label: string }> = [
  { value: "ca", label: "CA / test" },
  { value: "exam", label: "Exam" },
  { value: "other", label: "Other (assignment, project…)" }
];

export type LayoutComponent = { label: string; group: ComponentGroup; max: number };

/** Used when no layout has been saved anywhere. */
export const builtInLayout: LayoutComponent[] = [
  { label: "1st CA", group: "ca", max: 20 },
  { label: "2nd CA", group: "ca", max: 20 },
  { label: "Exam (Objective)", group: "exam", max: 30 },
  { label: "Exam (Theory)", group: "exam", max: 30 }
];

export const MAX_COMPONENTS = 12;

function isGroup(v: unknown): v is ComponentGroup {
  return v === "ca" || v === "exam" || v === "other";
}

/** Validates a stored or submitted layout. Returns null when it is unusable. */
export function parseLayout(value: unknown): LayoutComponent[] | null {
  if (!Array.isArray(value)) return null;
  const out: LayoutComponent[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const label = String(r.label ?? "").trim().replace(/\s+/g, " ");
    const max = Number(r.max);
    if (!label || !Number.isFinite(max) || max <= 0 || max > 1000) return null;
    out.push({ label: label.slice(0, 60), group: isGroup(r.group) ? r.group : "other", max: Math.round(max * 100) / 100 });
  }
  if (!out.length || out.length > MAX_COMPONENTS) return null;
  const labels = out.map((c) => c.label.toLowerCase());
  if (new Set(labels).size !== labels.length) return null;
  return out;
}

export function layoutTotal(components: Array<{ max: number }>) {
  return Math.round(components.reduce((acc, c) => acc + Number(c.max), 0) * 100) / 100;
}

export type LayoutSource = "class_subject" | "class" | "level" | "school" | "built_in";

export const layoutSourceLabel: Record<LayoutSource, string> = {
  class_subject: "saved for this class and subject",
  class: "this class's default",
  level: "the level default",
  school: "the school default",
  built_in: "the standard layout"
};

type LayoutRow = { level: string | null; class_id: string | null; subject_id: string | null; components: unknown };

/** The columns a new sheet starts with: class + subject, then class, then level, then school default. */
export async function resolveLayout(
  supabase: Supabase,
  scope: { classId: string; subjectId: string; level: string | null }
): Promise<{ components: LayoutComponent[]; source: LayoutSource }> {
  const { data } = await supabase.from("result_layouts").select("level, class_id, subject_id, components");
  const rows = (data ?? []) as LayoutRow[];
  const pick = (match: (r: LayoutRow) => boolean) => {
    const row = rows.find(match);
    return row ? parseLayout(row.components) : null;
  };

  const candidates: Array<[LayoutSource, (r: LayoutRow) => boolean]> = [
    ["class_subject", (r) => r.class_id === scope.classId && r.subject_id === scope.subjectId],
    ["class", (r) => r.class_id === scope.classId && !r.subject_id],
    ["level", (r) => !!scope.level && r.level === scope.level && !r.class_id && !r.subject_id],
    ["school", (r) => !r.level && !r.class_id && !r.subject_id]
  ];
  for (const [source, match] of candidates) {
    const components = pick(match);
    if (components) return { components, source };
  }
  return { components: builtInLayout, source: "built_in" };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Percentage of the column maxima, or null when nothing has been scored. */
export function subjectPercent(scores: Array<number | null>, maxes: number[]) {
  if (scores.every((s) => s === null)) return null;
  const maxTotal = maxes.reduce((a, b) => a + b, 0);
  if (maxTotal <= 0) return null;
  const total = scores.reduce<number>((a, s) => a + (s ?? 0), 0);
  return round2((total / maxTotal) * 100);
}

export type GradeBand = { grade: string; min_score: number; max_score: number };

export function gradeFor(percent: number | null, bands: GradeBand[]) {
  if (percent === null) return null;
  const p = round2(percent);
  return bands.find((g) => p >= Number(g.min_score) && p <= Number(g.max_score))?.grade ?? null;
}
