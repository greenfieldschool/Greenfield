import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import { parseEmailAlert, parseStatement, words, normaliseInvoiceNo } from "@/lib/bank-match";
import { importBankLines, summaryMessage } from "@/lib/bank-import";
import { transferDescription } from "@/lib/payment-codes";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { CheckCircle2, FileUp, Inbox, Mail, Sparkles, Tags } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/form-section";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { currencyPrefix, fmtDate } from "../../_components/finance-ui";
import { toastUrl } from "../../_components/finance-server";
import { LEARN } from "@/lib/learn-guides";

type StudentRef = { first_name: string; last_name: string; admission_number: string | null };
type InvoiceRef = { invoice_no: string | null };
type LineRow = {
  id: string;
  source: string;
  txn_date: string | null;
  amount: number;
  narration: string;
  bank_reference: string | null;
  status: string;
  match_level: string;
  match_note: string | null;
  match_student_id: string | null;
  match_invoice_id: string | null;
  recorded_at: string | null;
  payment_transaction_id: string | null;
  student: StudentRef | StudentRef[] | null;
  invoice: InvoiceRef | InvoiceRef[] | null;
};

const PATH = "/admin/finance/payments/import";
const MIGRATION_MISSING =
  "The bank inbox is not set up in the database yet. Run docs/migrations/20261101_payment_ids_bank_inbox.sql in Supabase.";
const SELECT =
  "id, source, txn_date, amount, narration, bank_reference, status, match_level, match_note, match_student_id, match_invoice_id, recorded_at, payment_transaction_id, student:students!match_student_id(first_name, last_name, admission_number), invoice:finance_invoices!match_invoice_id(invoice_no)";

function money(n: number) {
  return Number(n ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

function explain(message: string) {
  return /finance_bank_lines|record_bank_line|schema cache|could not find the function/i.test(message) ? MIGRATION_MISSING : message;
}

function done(message: string, type: "success" | "error" = "success"): never {
  revalidatePath(PATH);
  revalidatePath("/admin/finance/payments");
  revalidatePath("/admin/finance/invoices");
  revalidatePath("/admin/finance/debtors");
  redirect(toastUrl(PATH, message, type));
}

// Server actions live at module level so they cannot accidentally capture values from the page render.

async function importAction(formData: FormData) {
  "use server";

  const kind = String(formData.get("kind") ?? "statement");
  const pasted = String(formData.get("text") ?? "");
  const file = formData.get("file");
  const fileText = file instanceof File && file.size > 0 ? await file.text() : "";
  const text = fileText || pasted;
  const autoRecord = String(formData.get("auto_record") ?? "") === "on";
  if (!text.trim()) done("Paste the statement rows or the alert text, or choose a CSV file.", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) done("Database is not configured", "error");

  const parsed = kind === "email" ? parseEmailAlert(text) : parseStatement(text);
  if (!parsed.lines.length) done(parsed.warning ?? "No money-received rows were found.", "error");

  const summary = await importBankLines(supabase, parsed.lines, { autoRecord, recorder: { kind: "user" } });
  if (summary.error) done(explain(summary.error), "error");
  done(summaryMessage(summary) + (parsed.warning ? ` ${parsed.warning}` : ""));
}

// What an admin typed for a line the app could not place: an invoice number or an admission number.
async function resolveTarget(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  raw: string
): Promise<{ invoiceId: string | null; studentId: string | null } | null> {
  const ws = words(raw);
  if (!ws.length) return null;

  const invNo = normaliseInvoiceNo(raw);
  if (invNo && /^INV-\d{4}-\d{5}$/.test(invNo)) {
    const { data } = await supabase.from("finance_invoices").select("id, student_id").eq("invoice_no", invNo).maybeSingle();
    if (data) return { invoiceId: (data as { id: string }).id, studentId: (data as { student_id: string | null }).student_id };
    return null;
  }

  const wanted = ws.join("");
  const { data: candidates } = await supabase
    .from("students")
    .select("id, admission_number")
    .ilike("admission_number", `%${ws.join("%")}%`)
    .limit(20);
  const hit = ((candidates ?? []) as Array<{ id: string; admission_number: string | null }>).find(
    (s) => words(s.admission_number ?? "").join("") === wanted
  );
  if (!hit) return null;

  // The child's oldest unpaid invoice, if any (otherwise it is recorded as money paid in advance).
  const { data: open } = await supabase
    .from("finance_invoice_balances")
    .select("invoice_id")
    .eq("student_id", hit.id)
    .gt("balance", 0)
    .in("status", ["issued", "partially_paid"])
    .order("issue_date", { ascending: true })
    .limit(1);
  return { invoiceId: ((open ?? [])[0] as { invoice_id: string } | undefined)?.invoice_id ?? null, studentId: hit.id };
}

async function recordLineAction(formData: FormData) {
  "use server";

  const lineId = String(formData.get("line_id") ?? "").trim();
  let invoiceId = String(formData.get("invoice_id") ?? "").trim() || null;
  let studentId = String(formData.get("student_id") ?? "").trim() || null;
  const typed = String(formData.get("target") ?? "").trim();
  if (!lineId) done("Missing bank line", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) done("Database is not configured", "error");

  if (typed) {
    const found = await resolveTarget(supabase, typed);
    if (!found) done(`No child or invoice matches "${typed}". Type an admission number (GRE/2026/447) or an invoice number (INV-2026-00012).`, "error");
    invoiceId = found.invoiceId;
    studentId = found.studentId;
  }
  if (!invoiceId && !studentId) done("Type the admission number or invoice number this payment is for.", "error");

  const { data, error } = await supabase.rpc("record_bank_line", { p_line: lineId, p_invoice: invoiceId, p_student: studentId });
  if (error) done(explain(error.message), "error");

  const r = data as { allocated?: number; on_account?: number } | null;
  const extra = Number(r?.on_account ?? 0) > 0 ? ` ₦${money(Number(r?.on_account))} was more than the invoice needed and is kept as paid in advance.` : "";
  done(`Payment recorded.${extra}`);
}

async function ignoreLineAction(formData: FormData) {
  "use server";
  const lineId = String(formData.get("line_id") ?? "").trim();
  if (!lineId) done("Missing bank line", "error");
  const supabase = getSupabaseServerClient();
  if (!supabase) done("Database is not configured", "error");
  const { error } = await supabase.from("finance_bank_lines").update({ status: "ignored" }).eq("id", lineId).eq("status", "pending");
  if (error) done(explain(error.message), "error");
  done("Line ignored. It will not be imported again.");
}

async function recordSureAction() {
  "use server";
  const supabase = getSupabaseServerClient();
  if (!supabase) done("Database is not configured", "error");
  const { data, error } = await supabase
    .from("finance_bank_lines")
    .select("id, match_invoice_id, match_student_id")
    .eq("status", "pending")
    .eq("match_level", "auto")
    .order("created_at", { ascending: true });
  if (error) done(explain(error.message), "error");

  let recorded = 0;
  let failed = 0;
  for (const row of (data ?? []) as Array<{ id: string; match_invoice_id: string | null; match_student_id: string | null }>) {
    const { error: e } = await supabase.rpc("record_bank_line", {
      p_line: row.id,
      p_invoice: row.match_invoice_id,
      p_student: row.match_student_id
    });
    if (e) failed += 1;
    else recorded += 1;
  }
  done(
    recorded || failed
      ? `${recorded} payment${recorded === 1 ? "" : "s"} recorded${failed ? `, ${failed} could not be recorded` : ""}.`
      : "There were no sure matches waiting."
  );
}

function who(line: LineRow) {
  const s = firstOrNull(line.student);
  return s ? `${s.first_name} ${s.last_name}` : null;
}

export default async function AdminBankImportPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [pendingRes, recordedRes, codesRes, sampleRes] = await Promise.all([
    supabase.from("finance_bank_lines").select(SELECT).eq("status", "pending").order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    supabase.from("finance_bank_lines").select(SELECT).eq("status", "recorded").order("recorded_at", { ascending: false }).limit(15),
    supabase.from("revenue_categories").select("id, name, payment_code").not("payment_code", "is", null).order("name"),
    supabase.from("students").select("admission_number").not("admission_number", "is", null).limit(1)
  ]);

  const migrationMissing = Boolean(pendingRes.error && /finance_bank_lines|schema cache/i.test(pendingRes.error.message));
  const pending = (pendingRes.data ?? []) as unknown as LineRow[];
  const recorded = (recordedRes.data ?? []) as unknown as LineRow[];
  const codes = (codesRes.data ?? []) as Array<{ id: string; name: string; payment_code: string }>;
  const sampleAdmission = ((sampleRes.data ?? [])[0] as { admission_number: string } | undefined)?.admission_number ?? null;
  const sure = pending.filter((l) => l.match_level === "auto");
  const others = pending.filter((l) => l.match_level !== "auto");
  const exampleCode = codes[0]?.payment_code ?? "SF";

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.paymentIds}
        back={{ href: "/admin/finance/payments", label: "Back to payments" }}
        eyebrow="Finance"
        title="Bank statement & alerts"
        description="Add a month's bank statement or a bank email alert. Each payment is matched to the child and invoice from the admission number and payment ID in the transfer description."
        actions={
          <ButtonLink href="/admin/finance/fees/revenue-categories" variant="secondary">
            <Tags className="h-4 w-4" aria-hidden="true" />
            Payment IDs
          </ButtonLink>
        }
      />

      {migrationMissing ? (
        <Alert tone="danger" title="The bank inbox is not set up in the database yet">
          Run docs/migrations/20261101_payment_ids_bank_inbox.sql in Supabase, then reload this page.
        </Alert>
      ) : null}

      <Alert tone="info" title="What parents write in the transfer description">
        <p className="mt-1">
          The child&apos;s <strong className="font-semibold">admission number</strong> and the <strong className="font-semibold">payment ID</strong> of what
          they are paying for, for example{" "}
          <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[13px]">{transferDescription(sampleAdmission, exampleCode)}</code>.
          An invoice number such as INV-2026-00012 also works.
        </p>
        {codes.length ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {codes.map((c) => (
              <span key={c.id}>
                <span className="font-mono font-semibold">{c.payment_code}</span> = {c.name}
              </span>
            ))}
          </p>
        ) : null}
      </Alert>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <FileUp className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
              Add payments from the bank
            </span>
          }
          description="Export the statement as CSV (or copy its rows from Excel), or paste the text of a bank alert email. Payments already added before are skipped."
        />
        <CardBody>
          <form action={importAction} className="space-y-4">
            <fieldset>
              <legend className="gf-label">What are you adding?</legend>
              <div className="flex flex-wrap gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-brand-green-300 has-[:checked]:bg-brand-green-50">
                  <input type="radio" name="kind" value="statement" defaultChecked />
                  <FileUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Bank statement (many payments)
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-brand-green-300 has-[:checked]:bg-brand-green-50">
                  <input type="radio" name="kind" value="email" />
                  <Mail className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Email alert (one payment)
                </label>
              </div>
            </fieldset>

            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="CSV file" htmlFor="import-file" hint="Statement exported from the bank as CSV.">
                <input id="import-file" className="gf-input" name="file" type="file" accept=".csv,.txt,text/csv,text/plain" />
              </Field>
              <Field label="…or paste here" htmlFor="import-text" hint="Rows copied from Excel, or the text of the alert email.">
                <textarea id="import-text" className="gf-input font-mono text-xs" name="text" rows={5} placeholder="Date, Narration, Credit …" />
              </Field>
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input className="gf-checkbox mt-0.5" type="checkbox" name="auto_record" defaultChecked />
              <span>
                Record the sure matches straight away
                <span className="block text-xs text-slate-500">
                  Sure = a known admission number and payment ID, with an unpaid invoice that is not smaller than the amount. Everything else waits below
                  for you.
                </span>
              </span>
            </label>

            <div className="flex justify-end">
              <SubmitButton variant="primary" pendingText="Reading…">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Read and match
              </SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>

      {sure.length ? (
        <Card className="!border-brand-green-200">
          <CardHeader
            title={`${sure.length} sure match${sure.length === 1 ? "" : "es"} waiting`}
            description="These were not recorded yet (the box above was off). Check them and record."
            action={
              <form action={recordSureAction}>
                <ConfirmSubmitButton
                  confirmMessage={`Record all ${sure.length} sure matches as payments?`}
                  className={buttonClasses({ variant: "primary", size: "sm" })}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Record all
                </ConfirmSubmitButton>
              </form>
            }
          />
          <LinesTable lines={sure} />
        </Card>
      ) : null}

      <Card className={others.length ? "!border-brand-gold-200" : undefined}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-brand-gold-600" aria-hidden="true" />
              Needs a look ({others.length})
            </span>
          }
          description="Payments the app could not place with certainty. Confirm the suggestion, type the admission number or invoice number, or ignore the line."
        />
        {others.length ? (
          <LinesTable lines={others} editable />
        ) : (
          <EmptyState icon={CheckCircle2} title="Nothing waiting" description="Every payment read so far has been recorded or ignored." />
        )}
      </Card>

      {recorded.length ? (
        <Card>
          <CardHeader title="Recently recorded from the bank" description="The latest 15." />
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Child</th>
                  <th>Invoice</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recorded.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap">{fmtDate(l.txn_date)}</td>
                    <td className="font-semibold text-slate-900">{who(l) ?? "—"}</td>
                    <td className="whitespace-nowrap">{firstOrNull(l.invoice)?.invoice_no ?? "Paid in advance"}</td>
                    <td className="max-w-[260px] truncate" title={l.narration}>
                      {l.narration}
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">
                      {currencyPrefix("NGN")}
                      {money(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function LinesTable({ lines, editable = false }: { lines: LineRow[]; editable?: boolean }) {
  return (
    <div className="gf-table-wrap">
      <table className="gf-table min-w-[900px]">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description from the bank</th>
            <th className="text-right">Amount</th>
            <th>What the app found</th>
            <th className="text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const name = who(l);
            const invoiceNo = firstOrNull(l.invoice)?.invoice_no ?? null;
            const canConfirm = Boolean(l.match_invoice_id || l.match_student_id);
            return (
              <tr key={l.id} className="align-top">
                <td className="whitespace-nowrap">{fmtDate(l.txn_date)}</td>
                <td className="max-w-[260px]">
                  <div className="break-words text-slate-900">{l.narration}</div>
                  {l.source === "email" ? <Badge tone="blue">email alert</Badge> : null}
                </td>
                <td className="whitespace-nowrap text-right font-semibold tabular-nums">
                  {currencyPrefix("NGN")}
                  {money(l.amount)}
                </td>
                <td className="max-w-[300px] text-sm">
                  {name ? (
                    <div className="font-semibold text-slate-900">
                      {name}
                      {invoiceNo ? <span className="ml-2 font-normal text-slate-500">{invoiceNo}</span> : null}
                    </div>
                  ) : null}
                  <div className="text-xs text-slate-500">{l.match_note}</div>
                </td>
                <td className="min-w-[250px]">
                  <div className="flex flex-col items-end gap-2">
                    {canConfirm ? (
                      <form action={recordLineAction}>
                        <input type="hidden" name="line_id" value={l.id} />
                        <input type="hidden" name="invoice_id" value={l.match_invoice_id ?? ""} />
                        <input type="hidden" name="student_id" value={l.match_student_id ?? ""} />
                        <SubmitButton variant="primary" size="sm" pendingText="Recording…">
                          {editable ? "Confirm" : "Record"}
                        </SubmitButton>
                      </form>
                    ) : null}
                    {editable ? (
                      <form action={recordLineAction} className="flex w-full items-center justify-end gap-2">
                        <input type="hidden" name="line_id" value={l.id} />
                        <input
                          className="gf-input w-44 px-2.5 py-1.5 text-xs"
                          name="target"
                          placeholder="GRE/2026/447 or INV-2026-00012"
                          aria-label="Admission number or invoice number"
                        />
                        <SubmitButton variant="secondary" size="sm" pendingText="…" showSpinner={false}>
                          Record
                        </SubmitButton>
                      </form>
                    ) : null}
                    <form action={ignoreLineAction}>
                      <input type="hidden" name="line_id" value={l.id} />
                      <ConfirmSubmitButton
                        confirmMessage="Ignore this payment? It will not be imported again."
                        className={buttonClasses({ variant: "ghost", size: "sm", className: "text-slate-500" })}
                      >
                        Ignore
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
