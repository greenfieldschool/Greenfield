// Spending requests: words, lists and small helpers shared by the pages (see the spending-requests skill).
// The lists of reasons must stay in step with spending_reason_ok() and the checks in
// docs/migrations/20261119_spending_requests.sql.

export const SPENDING_BUCKET = "spending-files";
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_RECEIPTS = 6;

export type SpendingKind = "advance" | "supplier" | "reimburse";
export type SpendingStatus =
  | "submitted"
  | "sent_back"
  | "approved"
  | "declined"
  | "cancelled"
  | "paying"
  | "paid"
  | "checking"
  | "closed";

export const KINDS: Array<{ value: SpendingKind; label: string; hint: string }> = [
  { value: "advance", label: "Advance", hint: "I need money before I buy. I'll bring receipts and any change after." },
  { value: "supplier", label: "Pay a supplier", hint: "The school pays the seller straight into their account. Add their invoice or quote." },
  { value: "reimburse", label: "Pay me back", hint: "I already paid with my own money. Add the receipt." }
];
export const KIND_LABEL: Record<SpendingKind, string> = { advance: "Advance", supplier: "Pay a supplier", reimburse: "Pay me back" };

export const STATUS_LABEL: Record<SpendingStatus, string> = {
  submitted: "Waiting for approval",
  sent_back: "Sent back for changes",
  approved: "Approved, to pay",
  declined: "Declined",
  cancelled: "Cancelled",
  paying: "Paying through Paystack",
  paid: "Paid, receipts due",
  checking: "Receipts being checked",
  closed: "Closed"
};
export const STATUS_TONE: Record<SpendingStatus, "green" | "gold" | "red" | "blue" | "slate" | "violet"> = {
  submitted: "gold",
  sent_back: "violet",
  approved: "blue",
  declined: "red",
  cancelled: "slate",
  paying: "blue",
  paid: "gold",
  checking: "violet",
  closed: "green"
};

export type Reason = { value: string; label: string };
export const DECLINE_REASONS: Reason[] = [
  { value: "not_in_budget", label: "Not in the budget" },
  { value: "not_needed", label: "Not needed now" },
  { value: "too_expensive", label: "Too expensive: get another quote" },
  { value: "duplicate", label: "Already asked for or bought" },
  { value: "missing_details", label: "Details are missing" },
  { value: "other", label: "Other (explain)" }
];
export const SEND_BACK_REASONS: Reason[] = [
  { value: "missing_details", label: "Add more details" },
  { value: "wrong_amount", label: "The amount needs changing" },
  { value: "wrong_bank_details", label: "Check the bank details" },
  { value: "need_quote", label: "Add a quote or invoice" },
  { value: "other", label: "Other (explain)" }
];
export const CANCEL_REASONS: Reason[] = [
  { value: "no_longer_needed", label: "No longer needed" },
  { value: "made_by_mistake", label: "Made by mistake" },
  { value: "duplicate", label: "Asked for twice" },
  { value: "other", label: "Other (explain)" }
];
export const RETURN_REASONS: Reason[] = [
  { value: "receipts_unclear", label: "A receipt photo is unclear" },
  { value: "amounts_dont_match", label: "Amounts don't match the receipts" },
  { value: "missing_receipt", label: "A receipt is missing" },
  { value: "change_not_received", label: "The change hasn't been handed in" },
  { value: "other", label: "Other (explain)" }
];
export const NO_RECEIPT_REASONS: Reason[] = [
  { value: "no_receipt_given", label: "The seller gave no receipt" },
  { value: "transport_fare", label: "Transport fare (okada, keke, bus)" },
  { value: "receipt_lost", label: "Receipt lost" },
  { value: "other", label: "Other (explain)" }
];
export const REMOVE_RECEIPT_REASONS: Reason[] = [
  { value: "added_by_mistake", label: "Added by mistake" },
  { value: "wrong_amount", label: "Wrong amount or details" },
  { value: "other", label: "Other (explain)" }
];
export const VOID_TOPUP_REASONS: Reason[] = [
  { value: "entered_twice", label: "Entered twice" },
  { value: "wrong_amount", label: "Wrong amount" },
  { value: "other", label: "Other (explain)" }
];
export const VOID_EXPENSE_REASONS: Reason[] = [
  { value: "entered_twice", label: "Entered twice" },
  { value: "wrong_details", label: "Wrong amount or details" },
  { value: "not_school_expense", label: "Not a school expense" },
  { value: "other", label: "Other (explain)" }
];
export const PAY_METHODS: Reason[] = [
  { value: "bank_app", label: "Transfer from the bank app" },
  { value: "cash", label: "Cash (petty cash box)" },
  { value: "pos", label: "POS" }
];
export const PAY_METHOD_LABEL: Record<string, string> = {
  paystack: "Paystack wallet",
  bank_app: "Transfer from the bank app",
  cash: "Cash",
  pos: "POS"
};

export const FLAG_LABEL: Record<string, string> = {
  new_bank_details: "New or changed bank details: check the name before approving",
  split_check: "Several requests in this category within 7 days: could be one purchase split up",
  over_budget: "Over this category's budget for the term",
  similar_receipt: "A receipt with the same seller, amount and date is already on record",
  payment_reversed: "Paystack says the payment was reversed: check the Paystack dashboard"
};

const ALL_REASONS = [
  ...DECLINE_REASONS,
  ...SEND_BACK_REASONS,
  ...CANCEL_REASONS,
  ...RETURN_REASONS,
  ...NO_RECEIPT_REASONS,
  ...REMOVE_RECEIPT_REASONS
];
export function reasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return ALL_REASONS.find((r) => r.value === code)?.label.replace(" (explain)", "") ?? code.replace(/_/g, " ");
}

export const ACTION_LABEL: Record<string, string> = {
  submitted: "Asked",
  resubmitted: "Changed and sent again",
  first_approval: "First approval",
  approved: "Approved",
  declined: "Declined",
  sent_back: "Sent back for changes",
  cancelled: "Cancelled",
  paying: "Paystack payment started",
  payment_failed: "Paystack payment didn't go through",
  payment_reversed: "Payment reversed by the bank",
  paid: "Paid out",
  receipt_added: "Receipt added",
  receipt_removed: "Receipt taken off",
  accounted: "Receipts sent for checking",
  returned: "Receipts sent back",
  closed: "Closed"
};

export function naira(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  return `₦${n.toLocaleString("en-NG", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Amount typed by a person ("25,000", "₦25000.50") → number, or 0. */
export function parseAmount(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? "").replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** Turns database messages into words for staff. Our functions already raise plain sentences. */
export function spendingError(message: string | null | undefined): string {
  const m = String(message ?? "");
  if (/does not exist|schema cache|could not find the function/i.test(m)) {
    return "Spending requests need a database update. Ask the developers to run the spending requests migration.";
  }
  if (/row-level security|permission denied/i.test(m)) return "You don't have permission to do that.";
  if (/duplicate key/i.test(m)) return "That has already been saved.";
  return m.replace(/^ERROR:\s*/, "") || "Something went wrong. Nothing was saved.";
}

export type RequestRow = {
  id: string;
  request_no: string;
  kind: SpendingKind;
  status: SpendingStatus;
  requester_id: string;
  requester_name: string | null;
  category_id: string;
  purpose: string;
  amount: number;
  needed_by: string | null;
  submitted_at: string;
  due_by: string | null;
  flags: string[];
  approvals_needed: number;
  expense_categories?: { name: string } | null;
};

export const REQUEST_LIST_COLUMNS =
  "id, request_no, kind, status, requester_id, requester_name, category_id, purpose, amount, needed_by, submitted_at, due_by, flags, approvals_needed, expense_categories(name)";

export function categoryName(row: { expense_categories?: { name: string } | Array<{ name: string }> | null }): string {
  const c = row.expense_categories;
  if (!c) return "";
  return Array.isArray(c) ? c[0]?.name ?? "" : c.name;
}

/** Today in Lagos as YYYY-MM-DD. */
export function lagosToday(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}
