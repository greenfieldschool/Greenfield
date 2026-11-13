// Deactivating pupils (issue 11): the fixed list of reasons, shared by the pupil page, the students list and the
// log. The database (docs/migrations/20261113b_student_deactivation.sql) checks the same values; keep them in step.

export type DeactivationReason = "duplicate" | "test_record" | "left_school" | "transferred" | "graduated" | "other";

export const DEACTIVATION_REASONS: Array<{ value: DeactivationReason; label: string; hint: string }> = [
  {
    value: "duplicate",
    label: "Duplicate record",
    hint: "The same child was registered twice. Choose the record to keep; the parents linked here are also linked there."
  },
  { value: "test_record", label: "Test or dummy record", hint: "Made while trying the portal out. Not a real pupil." },
  { value: "left_school", label: "Left the school", hint: "The pupil has left. Their records are kept." },
  { value: "transferred", label: "Moved to another school", hint: "The pupil has transferred out. Their records are kept." },
  { value: "graduated", label: "Graduated", hint: "Finished their final year." },
  { value: "other", label: "Other (type the reason)", hint: "Only use this when none of the above fits." }
];

export function reasonLabel(reason: string | null | undefined, other?: string | null) {
  if (!reason) return "—";
  if (reason === "other") return other ? `Other: ${other}` : "Other";
  return DEACTIVATION_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/** Statuses that mean the pupil is no longer on roll (set only through Deactivate). */
export const OFF_ROLL_STATUSES = ["graduated", "withdrawn", "transferred", "inactive"] as const;
export function isOffRoll(status: string | null | undefined) {
  return (OFF_ROLL_STATUSES as readonly string[]).includes(String(status ?? ""));
}

export const STATUS_LABELS: Record<string, string> = {
  applied: "Applied",
  enrolled: "Enrolled",
  active: "Active",
  graduated: "Graduated",
  withdrawn: "Left the school",
  transferred: "Moved school",
  inactive: "Deactivated"
};

// Plain names for what can be attached to a pupil record (student_usage() returns table names).
const USAGE_LABELS: Record<string, string> = {
  academic_assessment_scores: "results",
  report_card_comments: "report comments",
  result_correction_items: "result corrections",
  student_attendance: "attendance",
  attendance_records: "attendance",
  online_class_attendance: "online class attendance",
  finance_invoices: "fee invoices",
  finance_payment_transactions: "payments",
  finance_payment_intents: "payment requests",
  finance_bank_lines: "bank statement lines",
  incidents: "incidents",
  welfare_incidents: "welfare incidents",
  welfare_discipline_records: "discipline records",
  welfare_ratings: "welfare scores",
  student_uniform_checks: "uniform checks",
  exam_attempts: "exams",
  assignment_submissions: "assignments",
  activity_enrollments: "activities",
  star_videos: "star videos",
  notifications: "notifications"
};
export function usageSummary(usage: Record<string, number> | null | undefined) {
  if (!usage) return [];
  const merged = new Map<string, number>();
  for (const [table, n] of Object.entries(usage)) {
    const label = USAGE_LABELS[table] ?? "other records";
    merged.set(label, (merged.get(label) ?? 0) + Number(n));
  }
  return Array.from(merged.entries()).map(([label, n]) => `${n} ${label}`);
}
