import type { SupabaseClient } from "@supabase/supabase-js";

// Report cards (and certificates) in the portal are held back until the pupil's fees are paid.
//
// What counts: the pupil's invoices that still have a balance and belong to the report's term or an earlier one.
// Every status counts except void: the app saves new invoices as "draft" and never changes that, and parents
// already see drafts as bills. An invoice with no term counts when it was issued before the term ended. Invoices for a
// later term (e.g. next term's fees sent out early) never hold back this term's report card.
// Staff are not affected: the school can still print report cards from the dashboard.

export type FeeHold =
  | { status: "clear" }
  | { status: "held"; outstanding: number; invoices: number; currency: string }
  /** Fees could not be checked; the report stays hidden and the parent is asked to try again. */
  | { status: "unknown" };

type BalanceRow = {
  invoice_id: string;
  student_id: string;
  academic_term_id: string | null;
  issue_date: string | null;
  status: string;
  currency: string | null;
  balance: number | string | null;
};

/** Fee holds for several pupils at once (the admin report cards list). Null when fees couldn't be read. */
export async function feeHolds(
  client: SupabaseClient,
  studentIds: string[],
  term: { id: string; starts_on: string | null; ends_on: string | null }
): Promise<Map<string, FeeHold> | null> {
  const out = new Map<string, FeeHold>(studentIds.map((id) => [id, { status: "clear" } as FeeHold]));
  if (!studentIds.length) return out;

  const { data, error } = await client
    .from("finance_invoice_balances")
    .select("invoice_id, student_id, academic_term_id, issue_date, status, currency, balance")
    .in("student_id", studentIds)
    .gt("balance", 0)
    .limit(1000);
  if (error) return null;

  const open = ((data ?? []) as BalanceRow[]).filter((r) => r.status !== "void" && Number(r.balance) > 0);
  if (!open.length) return out;

  const termIds = Array.from(new Set(open.map((r) => r.academic_term_id).filter((v): v is string => Boolean(v) && v !== term.id)));
  const startsById = new Map<string, string | null>();
  if (termIds.length) {
    const { data: terms, error: termsError } = await client.from("academic_terms").select("id, starts_on").in("id", termIds);
    if (termsError) return null;
    for (const t of (terms ?? []) as Array<{ id: string; starts_on: string | null }>) startsById.set(t.id, t.starts_on);
  }

  const counts = (r: BalanceRow) => {
    if (r.academic_term_id === term.id) return true;
    if (r.academic_term_id) {
      const starts = startsById.get(r.academic_term_id);
      // Unknown dates: count it, so a report card is never released by mistake.
      return !starts || !term.starts_on || starts <= term.starts_on;
    }
    return !r.issue_date || !term.ends_on || r.issue_date.slice(0, 10) <= term.ends_on;
  };

  for (const r of open) {
    if (!counts(r)) continue;
    const prev = out.get(r.student_id);
    const held = prev?.status === "held" ? prev : { status: "held" as const, outstanding: 0, invoices: 0, currency: r.currency ?? "NGN" };
    out.set(r.student_id, {
      ...held,
      outstanding: Math.round((held.outstanding + Number(r.balance)) * 100) / 100,
      invoices: held.invoices + 1
    });
  }
  return out;
}

export async function reportFeeHold(
  client: SupabaseClient,
  studentId: string,
  term: { id: string; starts_on: string | null; ends_on: string | null }
): Promise<FeeHold> {
  const holds = await feeHolds(client, [studentId], term);
  return holds?.get(studentId) ?? { status: "unknown" };
}
