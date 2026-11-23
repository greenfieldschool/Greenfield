// Payment plans, default fees and early payment discounts (docs/migrations/20261122_payment_plans.sql).
// The percentages, weeks and amounts live in the database (fee_plan_template, charge_plan_default,
// early_discount_options); this file only holds the words people see.

export type PlanRow = {
  plan_id: string;
  instalment_id: string;
  seq: number;
  percent: number | string;
  amount: number | string;
  due_date: string;
  due_label: string;
  due_so_far: number | string;
  paid_towards: number | string;
  state: "paid" | "missed" | "due_soon" | "upcoming";
  default_status: "charged" | "waived" | "removed" | null;
  default_amount: number | string | null;
};

export type PreviewRow = { seq: number; percent: number | string; amount: number | string; due_date: string; label: string };

export const PLAN_STATE: Record<PlanRow["state"], { label: string; tone: "green" | "red" | "gold" | "slate" }> = {
  paid: { label: "Paid", tone: "green" },
  missed: { label: "Missed", tone: "red" },
  due_soon: { label: "Due soon", tone: "gold" },
  upcoming: { label: "Not due yet", tone: "slate" }
};

export const PLAN_CANCEL_REASONS = [
  { value: "paid_in_full", label: "Paid in full" },
  { value: "wrong_plan", label: "Wrong plan chosen" },
  { value: "parent_request", label: "Parent asked to change" },
  { value: "invoice_changed", label: "Invoice changed" },
  { value: "other", label: "Other (type the reason)" }
] as const;

export const WAIVE_REASONS = [
  { value: "paid_not_recorded", label: "Paid on time, recorded late" },
  { value: "agreed_extension", label: "School agreed more time" },
  { value: "hardship", label: "Hardship, agreed by management" },
  { value: "other", label: "Other (type the reason)" }
] as const;

export const REMOVE_FEE_REASONS = [
  ...WAIVE_REASONS.slice(0, 3),
  { value: "charged_by_mistake", label: "Added by mistake" },
  { value: "other", label: "Other (type the reason)" }
] as const;

export const DISCOUNT_OPTIONS: Record<string, { label: string; needsNote: boolean }> = {
  two_sessions: { label: "Paid two sessions in advance", needsNote: true },
  one_session: { label: "Paid one session in advance", needsNote: true },
  one_term: { label: "Paid one term in advance", needsNote: true },
  two_weeks: { label: "Paid in full two weeks before the term", needsNote: false }
};

export const PLAN_CHOICES = [2, 3, 4, 5] as const;

/** Turn a Postgres error from the plan functions into the sentence to show (they are written for people). */
export function planError(message: string | null | undefined) {
  const m = String(message ?? "").trim();
  if (!m) return "Something went wrong. Please try again.";
  if (/function .* does not exist|relation .* does not exist|schema cache/i.test(m)) {
    return "Payment plans aren't set up in the database yet. Ask the developers to run the payment plans update.";
  }
  return m;
}

/** "3 payments: 40%, 30%, 30%" */
export function planSummary(rows: Array<{ percent: number | string }>) {
  return `${rows.length} payments: ${rows.map((r) => `${Number(r.percent)}%`).join(", ")}`;
}
