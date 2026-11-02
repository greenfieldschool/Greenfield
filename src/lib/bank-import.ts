import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  fingerprintAll,
  matchLine,
  type BankLineInput,
  type MatchContext,
  type MatchInvoice,
  type MatchResult
} from "@/lib/bank-match";

// Loads what the matcher needs, stores bank lines in the inbox (finance_bank_lines) and records the sure ones.
// Used by the Import page (signed-in admin) and by the email-alert endpoint (service key).

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export async function loadMatchContext(supabase: SupabaseClient): Promise<MatchContext> {
  const [students, categories, balances] = await Promise.all([
    fetchAllRows<{ id: string; admission_number: string | null; first_name: string; last_name: string }>(() =>
      supabase.from("students").select("id, admission_number, first_name, last_name").not("admission_number", "is", null).order("id")
    ),
    supabase.from("revenue_categories").select("id, name, payment_code").not("payment_code", "is", null),
    fetchAllRows<{
      invoice_id: string;
      invoice_no: string | null;
      student_id: string | null;
      issue_date: string;
      status: string;
      balance: number;
    }>(() =>
      supabase
        .from("finance_invoice_balances")
        .select("invoice_id, invoice_no, student_id, issue_date, status, balance")
        .gt("balance", 0)
        .in("status", ["issued", "partially_paid"])
        .order("invoice_id")
    )
  ]);

  const categoriesByInvoice = new Map<string, string[]>();
  for (const ids of chunk(
    balances.map((b) => b.invoice_id),
    100
  )) {
    const { data } = await supabase.from("finance_invoice_items").select("invoice_id, revenue_category_id").in("invoice_id", ids);
    for (const row of (data ?? []) as Array<{ invoice_id: string; revenue_category_id: string | null }>) {
      if (!row.revenue_category_id) continue;
      const list = categoriesByInvoice.get(row.invoice_id) ?? [];
      if (!list.includes(row.revenue_category_id)) list.push(row.revenue_category_id);
      categoriesByInvoice.set(row.invoice_id, list);
    }
  }

  return {
    students: students.map((s) => ({
      id: s.id,
      admissionNumber: s.admission_number,
      name: `${s.first_name} ${s.last_name}`.trim()
    })),
    categories: ((categories.data ?? []) as Array<{ id: string; name: string; payment_code: string }>).map((c) => ({
      id: c.id,
      name: c.name,
      code: c.payment_code
    })),
    invoices: balances.map<MatchInvoice>((b) => ({
      id: b.invoice_id,
      invoiceNo: b.invoice_no,
      studentId: b.student_id,
      issueDate: b.issue_date,
      balance: Number(b.balance),
      categoryIds: categoriesByInvoice.get(b.invoice_id) ?? []
    }))
  };
}

export type ImportSummary = {
  read: number;
  added: number;
  duplicates: number;
  recorded: number;
  needsReview: number;
  failed: number;
  error: string | null;
};

type Recorder = { kind: "user" } | { kind: "service" };

async function record(supabase: SupabaseClient, recorder: Recorder, lineId: string, invoiceId: string | null, studentId: string | null) {
  return recorder.kind === "user"
    ? supabase.rpc("record_bank_line", { p_line: lineId, p_invoice: invoiceId, p_student: studentId })
    : supabase.rpc("record_bank_line_unchecked", { p_line: lineId, p_invoice: invoiceId, p_student: studentId, p_by: null });
}

/**
 * Adds the lines to the inbox (skipping ones already there) and, when `autoRecord` is on, records every line the
 * matcher is sure about. Lines that need a person stay in the inbox.
 */
export async function importBankLines(
  supabase: SupabaseClient,
  lines: BankLineInput[],
  options: { autoRecord: boolean; recorder: Recorder; fingerprintExtra?: string }
): Promise<ImportSummary> {
  const summary: ImportSummary = { read: lines.length, added: 0, duplicates: 0, recorded: 0, needsReview: 0, failed: 0, error: null };
  if (!lines.length) return summary;

  const fingerprints = fingerprintAll(lines, options.fingerprintExtra ?? "");

  const existing = new Set<string>();
  for (const ids of chunk(fingerprints, 100)) {
    const { data, error } = await supabase.from("finance_bank_lines").select("fingerprint").in("fingerprint", ids);
    if (error) {
      summary.error = /finance_bank_lines|schema cache/i.test(error.message)
        ? "The bank inbox is not set up in the database yet. Run docs/migrations/20261101_payment_ids_bank_inbox.sql in Supabase."
        : error.message;
      return summary;
    }
    for (const row of (data ?? []) as Array<{ fingerprint: string }>) existing.add(row.fingerprint);
  }

  const ctx = await loadMatchContext(supabase);
  const invoiceById = new Map(ctx.invoices.map((i) => [i.id, i] as const));

  type Row = {
    fingerprint: string;
    source: string;
    txn_date: string | null;
    amount: number;
    narration: string;
    bank_reference: string | null;
    match_student_id: string | null;
    match_invoice_id: string | null;
    match_category_id: string | null;
    match_level: MatchResult["level"];
    match_note: string;
  };
  const rows: Row[] = [];

  lines.forEach((line, i) => {
    if (existing.has(fingerprints[i])) {
      summary.duplicates += 1;
      return;
    }
    const m = matchLine(line, ctx);
    // Money already promised to an invoice by an earlier line in this batch is no longer available to the next.
    if (m.level === "auto" && m.invoiceId) {
      const inv = invoiceById.get(m.invoiceId);
      if (inv) inv.balance = Math.max(0, inv.balance - line.amount);
    }
    rows.push({
      fingerprint: fingerprints[i],
      source: line.source,
      txn_date: line.txnDate,
      amount: line.amount,
      narration: line.narration.slice(0, 600),
      bank_reference: line.bankReference,
      match_student_id: m.studentId,
      match_invoice_id: m.invoiceId,
      match_category_id: m.categoryId,
      match_level: m.level,
      match_note: m.note
    });
  });

  if (!rows.length) return summary;

  const { data: inserted, error: insertError } = await supabase
    .from("finance_bank_lines")
    .upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true })
    .select("id, fingerprint, match_level, match_invoice_id, match_student_id");
  if (insertError) {
    summary.error = insertError.message;
    return summary;
  }

  const stored = (inserted ?? []) as Array<{
    id: string;
    match_level: string;
    match_invoice_id: string | null;
    match_student_id: string | null;
  }>;
  summary.added = stored.length;
  summary.duplicates += rows.length - stored.length;

  for (const row of stored) {
    if (options.autoRecord && row.match_level === "auto" && (row.match_invoice_id || row.match_student_id)) {
      const { error } = await record(supabase, options.recorder, row.id, row.match_invoice_id, row.match_student_id);
      if (error) {
        summary.failed += 1;
        summary.needsReview += 1;
      } else summary.recorded += 1;
    } else {
      summary.needsReview += 1;
    }
  }
  return summary;
}

export function summaryMessage(s: ImportSummary): string {
  if (s.error) return s.error;
  if (!s.read) return "No money-received rows were found.";
  const parts = [`Read ${s.read} payment${s.read === 1 ? "" : "s"}`];
  if (s.recorded) parts.push(`${s.recorded} recorded automatically`);
  if (s.needsReview) parts.push(`${s.needsReview} need${s.needsReview === 1 ? "s" : ""} a look`);
  if (s.duplicates) parts.push(`${s.duplicates} already imported`);
  if (s.failed) parts.push(`${s.failed} could not be recorded`);
  return `${parts.join(", ")}.`;
}
