// What an invoice's status means to a person. Invoices are saved as "draft" and nothing moves them on (see the
// finance-payments skill), so the stored status says nothing useful: the state comes from what is still owed.

export type InvoiceState = "void" | "paid" | "part_paid" | "overdue" | "unpaid";
export type InvoiceStateTone = "green" | "gold" | "red" | "slate";

const LABEL: Record<InvoiceState, string> = {
  void: "Cancelled",
  paid: "Paid",
  part_paid: "Part paid",
  overdue: "Overdue",
  unpaid: "Unpaid"
};

const TONE: Record<InvoiceState, InvoiceStateTone> = {
  void: "slate",
  paid: "green",
  part_paid: "gold",
  overdue: "red",
  unpaid: "gold"
};

/** Today's date in Lagos as YYYY-MM-DD. */
function lagosToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}

export function invoiceState(inv: {
  status: string | null | undefined;
  balance: number | string | null | undefined;
  invoice_total?: number | string | null;
  due_date?: string | null;
}): { state: InvoiceState; label: string; tone: InvoiceStateTone } {
  const status = String(inv.status ?? "").toLowerCase();
  const balance = Number(inv.balance ?? 0);
  const total = Number(inv.invoice_total ?? balance);
  let state: InvoiceState;
  if (status === "void" || status === "voided") state = "void";
  else if (balance <= 0) state = "paid";
  else if (inv.due_date && inv.due_date.slice(0, 10) < lagosToday()) state = "overdue";
  else if (balance < total) state = "part_paid";
  else state = "unpaid";
  return { state, label: LABEL[state], tone: TONE[state] };
}
