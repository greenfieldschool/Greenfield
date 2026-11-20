// Correcting payments the accepted way (docs/migrations/20261120_payment_corrections.sql): a recorded payment is
// never edited or deleted. It is reversed with a reason from this list (the database checks the same list; keep them
// in step with finance_payment_transactions_void_reason_check and reverse_payment), then entered again correctly.

import type { BadgeTone } from "@/components/ui/badge";

export const REVERSE_REASONS: Array<{ value: string; label: string }> = [
  { value: "wrong_amount", label: "Wrong amount entered" },
  { value: "wrong_pupil", label: "Wrong pupil or parent" },
  { value: "wrong_details", label: "Wrong date or payment method" },
  { value: "duplicate", label: "Recorded twice" },
  { value: "bank_reversed", label: "Bank reversed it or it bounced" },
  { value: "not_received", label: "Money never arrived" },
  { value: "other", label: "Other (type the reason)" }
];

export function reverseReasonLabel(reason: string | null | undefined, note?: string | null) {
  if (!reason) return note ? note : "No reason was recorded (reversed before reasons were required)";
  if (reason === "other") return note ? `Other: ${note}` : "Other";
  const label = REVERSE_REASONS.find((r) => r.value === reason)?.label ?? reason;
  return note ? `${label}. ${note}` : label;
}

export type PaymentLogRow = {
  id: string;
  action: string;
  invoice_id: string | null;
  invoice_number: string | null;
  amount: number | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  done_by_name: string | null;
  created_at: string;
};

export const PAYMENT_LOG_COLUMNS = "id, action, invoice_id, invoice_number, amount, changes, reason, done_by_name, created_at";

export const PAYMENT_LOG_ACTIONS: Record<string, { label: string; tone: BadgeTone }> = {
  recorded: { label: "Recorded", tone: "green" },
  details_changed: { label: "Reference or notes changed", tone: "blue" },
  invoice_linked: { label: "Put towards invoice", tone: "blue" },
  invoice_unlinked: { label: "Taken off invoice", tone: "gold" },
  allocation_changed: { label: "Amount on invoice changed", tone: "gold" },
  reversed: { label: "Reversed", tone: "red" }
};

const naira = (n: unknown) => `₦${Number(n ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** Plain-language lines for one history row. */
export function describePaymentLog(row: PaymentLogRow): string[] {
  const c = (row.changes ?? {}) as Record<string, { from?: unknown; to?: unknown } | unknown>;
  const lines: string[] = [];
  const inv = row.invoice_number ?? (row.invoice_id ? "an invoice" : "an invoice that has since been removed");
  switch (row.action) {
    case "recorded":
      lines.push(naira(row.amount));
      if (typeof c.corrects_payment_id === "string") lines.push("Enters again a payment that was reversed");
      break;
    case "invoice_linked":
      lines.push(`${naira(row.amount)} towards ${inv}`);
      break;
    case "invoice_unlinked":
      lines.push(`${naira(row.amount)} taken off ${inv}`);
      break;
    case "allocation_changed": {
      const a = c.amount as { from?: unknown; to?: unknown } | undefined;
      lines.push(`${inv}: ${naira(a?.from)} → ${naira(a?.to)}`);
      break;
    }
    case "details_changed":
      for (const [k, label] of [["reference", "Reference"], ["notes", "Notes"]] as const) {
        const ch = c[k] as { from?: unknown; to?: unknown } | undefined;
        if (ch) lines.push(`${label}: ${ch.from ? String(ch.from) : "—"} → ${ch.to ? String(ch.to) : "—"}`);
      }
      break;
    case "reversed":
      lines.push(`Reason: ${reverseReasonLabel(row.reason, typeof c.note === "string" ? c.note : null)}`);
      break;
  }
  if (row.reason && row.action !== "reversed") lines.push(`Why: ${row.reason}`);
  return lines;
}

export const PAYMENTS_MISSING_DB =
  "Payment corrections are not set up in the database yet. Run docs/migrations/20261120_payment_corrections.sql in Supabase.";

export function friendlyPaymentError(message: string) {
  if (/could not find the function|schema cache|does not exist/i.test(message)) return PAYMENTS_MISSING_DB;
  return message;
}
