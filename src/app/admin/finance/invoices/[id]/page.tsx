import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type InvoiceBalanceRow = {
  invoice_id: string;
  invoice_no: string | null;
  bill_to_guardian_id: string;
  student_id: string | null;
  issue_date: string;
  due_date: string | null;
  status: string;
  currency: string;
  invoice_total: number;
  allocated_total: number;
  balance: number;
};

type InvoiceItemRow = {
  id: string;
  description: string;
  quantity: number;
  unit_amount: number;
};

type FeeScheduleRow = {
  id: string;
  name: string;
  academic_term_id: string | null;
};

type InvoiceAdjustmentRow = {
  id: string;
  type: string;
  amount: number;
  notes: string | null;
};

type AllocationRow = {
  id: string;
  amount: number;
  finance_payment_transactions: Array<{
    id: string;
    paid_at: string;
    method: string | null;
    reference: string | null;
    provider: string | null;
    provider_txn_id: string | null;
  }>;
};

type PaymentIntentRow = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

function asMoney(n: number) {
  return Number(n ?? 0).toLocaleString();
}

export default async function AdminInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [
    { data: balanceRow },
    { data: items },
    { data: adjustments },
    { data: allocations },
    { data: intents },
    { data: invoiceHeader }
  ] = await Promise.all([
    supabase
      .from("finance_invoice_balances")
      .select(
        "invoice_id, invoice_no, bill_to_guardian_id, student_id, issue_date, due_date, status, currency, invoice_total, allocated_total, balance"
      )
      .eq("invoice_id", id)
      .maybeSingle(),
    supabase
      .from("finance_invoice_items")
      .select("id, description, quantity, unit_amount")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("finance_invoice_adjustments")
      .select("id, type, amount, notes")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("finance_payment_allocations")
      .select(
        "id, amount, finance_payment_transactions(id, paid_at, method, reference, provider, provider_txn_id)"
      )
      .eq("invoice_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("finance_payment_intents")
      .select("id, reference, amount, currency, status, created_at")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false })
    ,
    supabase
      .from("finance_invoices")
      .select("id, student_id, academic_year_id, academic_term_id")
      .eq("id", id)
      .maybeSingle()
  ]);

  const invoice = balanceRow as InvoiceBalanceRow | null;
  if (!invoice) {
    redirect("/admin/finance/invoices");
  }

  const itemRows = (items ?? []) as InvoiceItemRow[];
  const adjustmentRows = (adjustments ?? []) as InvoiceAdjustmentRow[];
  const allocationRows = (allocations ?? []) as unknown as AllocationRow[];
  const intentRows = (intents ?? []) as PaymentIntentRow[];

  const header = (invoiceHeader ?? null) as {
    id: string;
    student_id: string | null;
    academic_year_id: string | null;
    academic_term_id: string | null;
  } | null;

  const studentId = header?.student_id ?? invoice.student_id;

  const { data: studentRow } = studentId
    ? await supabase.from("students").select("id, class_id").eq("id", studentId).maybeSingle()
    : await Promise.resolve({ data: null as { id: string; class_id: string | null } | null });

  const classId = (studentRow?.class_id ?? null) as string | null;

  const { data: schedules } = classId && header?.academic_year_id
    ? await supabase
        .from("fee_schedules")
        .select("id, name, academic_term_id")
        .eq("class_id", classId)
        .eq("academic_year_id", header.academic_year_id)
        .eq("active", true)
        .order("academic_term_id", { ascending: true })
        .order("name", { ascending: true })
    : await Promise.resolve({ data: [] as FeeScheduleRow[] });

  const scheduleRows = (schedules ?? []) as FeeScheduleRow[];
  const eligibleSchedules = header?.academic_term_id
    ? scheduleRows.filter((s) => s.academic_term_id === null || s.academic_term_id === header.academic_term_id)
    : scheduleRows;

  async function createMoniepointIntent(formData: FormData) {
    "use server";

    const amount = Number(String(formData.get("amount") ?? "0").trim() || "0");

    if (!Number.isFinite(amount) || amount <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const { data: freshInvoice } = await supabase
      .from("finance_invoice_balances")
      .select(
        "invoice_id, bill_to_guardian_id, student_id, academic_year_id, academic_term_id, currency, balance"
      )
      .eq("invoice_id", id)
      .maybeSingle();

    if (!freshInvoice) return;

    const reference = globalThis.crypto?.randomUUID
      ? `MP-${globalThis.crypto.randomUUID()}`
      : `MP-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    await supabase.from("finance_payment_intents").insert({
      provider: "moniepoint",
      reference,
      invoice_id: freshInvoice.invoice_id,
      guardian_id: freshInvoice.bill_to_guardian_id,
      student_id: freshInvoice.student_id,
      academic_year_id: freshInvoice.academic_year_id,
      academic_term_id: freshInvoice.academic_term_id,
      amount,
      currency: freshInvoice.currency,
      status: "created"
    });

    revalidatePath(`/admin/finance/invoices/${id}`);
  }

  async function addItem(formData: FormData) {
    "use server";

    const description = String(formData.get("description") ?? "").trim();
    const quantity = Number(String(formData.get("quantity") ?? "1").trim() || "1");
    const unitAmount = Number(String(formData.get("unit_amount") ?? "0").trim() || "0");

    if (!description) return;
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    if (!Number.isFinite(unitAmount) || unitAmount < 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("finance_invoice_items").insert({
      invoice_id: id,
      description,
      quantity,
      unit_amount: unitAmount
    });

    revalidatePath(`/admin/finance/invoices/${id}`);
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/debtors");
  }

  async function generateItemsFromSchedule(formData: FormData) {
    "use server";

    const feeScheduleId = String(formData.get("fee_schedule_id") ?? "").trim();
    if (!feeScheduleId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const [{ data: existingItems }, { data: scheduleLines }] = await Promise.all([
      supabase.from("finance_invoice_items").select("id").eq("invoice_id", id).limit(1),
      supabase
        .from("fee_schedule_lines")
        .select("amount, fee_components(id, name, revenue_category_id)")
        .eq("fee_schedule_id", feeScheduleId)
        .order("created_at", { ascending: true })
    ]);

    if ((existingItems ?? []).length) return;

    const lines = (scheduleLines ?? []) as unknown as Array<{
      amount: number;
      fee_components: Array<{ id: string; name: string; revenue_category_id: string | null }>;
    }>;

    const payload = lines
      .map((l) => {
        const fc = (l.fee_components ?? [])[0] ?? null;
        return {
          invoice_id: id,
          revenue_category_id: fc?.revenue_category_id ?? null,
          description: fc?.name ?? "",
          quantity: 1,
          unit_amount: l.amount
        };
      })
      .filter((r) => r.description.length > 0);

    if (!payload.length) return;

    await supabase.from("finance_invoice_items").insert(payload);

    revalidatePath(`/admin/finance/invoices/${id}`);
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/debtors");
  }

  async function addAdjustment(formData: FormData) {
    "use server";

    const type = String(formData.get("type") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").trim() || "0");
    const notes = String(formData.get("notes") ?? "").trim();

    if (!type) return;
    if (!Number.isFinite(amount) || amount <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("finance_invoice_adjustments").insert({
      invoice_id: id,
      type,
      amount,
      notes: notes.length ? notes : null
    });

    revalidatePath(`/admin/finance/invoices/${id}`);
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/debtors");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Invoice {invoice.invoice_no ?? "—"}</h1>
        <p className="mt-2 text-sm text-slate-600">View details, items, adjustments, and allocations.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/invoices">
            Back to invoices
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            href={`/admin/finance/payments/new?invoice_id=${encodeURIComponent(id)}`}
          >
            Record payment
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold text-slate-500">Total</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {invoice.currency} {asMoney(invoice.invoice_total)}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold text-slate-500">Paid</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {invoice.currency} {asMoney(invoice.allocated_total)}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-semibold text-slate-500">Balance</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {invoice.currency} {asMoney(invoice.balance)}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Generate from fee schedule</h2>
          <p className="mt-1 text-sm text-slate-600">
            Create invoice items using the configured fee schedule for the student’s class.
          </p>

          <form action={generateItemsFromSchedule} className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-900">Fee schedule</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="fee_schedule_id"
                defaultValue=""
                required
                disabled={!eligibleSchedules.length || itemRows.length > 0}
              >
                <option value="" disabled>
                  {itemRows.length > 0
                    ? "Items already exist (clear items to regenerate)"
                    : eligibleSchedules.length
                      ? "Select schedule"
                      : "No matching schedules"}
                </option>
                {eligibleSchedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.academic_term_id ? "Term" : "Annual"})
                  </option>
                ))}
              </select>
              {!classId ? (
                <div className="mt-2 text-xs text-slate-500">No class is assigned to this student yet.</div>
              ) : null}
            </div>

            <div className="flex items-end">
              <button
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
                type="submit"
                disabled={!eligibleSchedules.length || itemRows.length > 0}
              >
                Generate items
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-6">
            <h2 className="text-lg font-semibold text-slate-900">Add item</h2>
            <form action={addItem} className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className="text-sm font-semibold text-slate-900">Description</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="description"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Qty</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="quantity"
                  defaultValue="1"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Unit amount</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="unit_amount"
                  defaultValue="0"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                  type="submit"
                >
                  Add item
                </button>
              </div>
            </form>

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                <div className="col-span-7">Item</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-3 text-right">Amount</div>
              </div>
              {itemRows.length ? (
                itemRows.map((it) => (
                  <div key={it.id} className="grid grid-cols-12 border-t border-slate-200 px-4 py-3 text-sm">
                    <div className="col-span-7 font-semibold text-slate-900">{it.description}</div>
                    <div className="col-span-2 text-right text-slate-700">{Number(it.quantity).toLocaleString()}</div>
                    <div className="col-span-3 text-right text-slate-700">
                      {invoice.currency} {asMoney(Number(it.quantity) * Number(it.unit_amount))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-4 text-sm text-slate-600">No items yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Online payment (Moniepoint)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Create a payment reference for Moniepoint. Use the generated reference as the Moniepoint
              <span className="font-semibold"> merchantReference</span>.
            </p>

            <form action={createMoniepointIntent} className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-900">Amount</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="amount"
                  defaultValue={String(invoice.balance ?? 0)}
                  required
                />
              </div>
              <div className="flex items-end">
                <button
                  className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                  type="submit"
                >
                  Create reference
                </button>
              </div>
            </form>

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                <div className="col-span-6">Reference (merchantReference)</div>
                <div className="col-span-3">Status</div>
                <div className="col-span-3 text-right">Amount</div>
              </div>
              {intentRows.length ? (
                intentRows.map((pi) => (
                  <div key={pi.id} className="grid grid-cols-12 border-t border-slate-200 px-4 py-3 text-sm">
                    <div className="col-span-6 font-semibold text-slate-900">{pi.reference}</div>
                    <div className="col-span-3 text-slate-700">{pi.status}</div>
                    <div className="col-span-3 text-right text-slate-700">
                      {pi.currency} {asMoney(pi.amount)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-4 text-sm text-slate-600">No online payment references yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Add adjustment</h2>
            <form action={addAdjustment} className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-900">Type</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="type"
                  defaultValue="discount"
                >
                  <option value="discount">discount</option>
                  <option value="waiver">waiver</option>
                  <option value="penalty">penalty</option>
                  <option value="writeoff">writeoff</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Amount</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="amount"
                  defaultValue="0"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Notes (optional)</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="notes"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                  type="submit"
                >
                  Add adjustment
                </button>
              </div>
            </form>

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                <div className="col-span-5">Type</div>
                <div className="col-span-7 text-right">Amount</div>
              </div>
              {adjustmentRows.length ? (
                adjustmentRows.map((a) => (
                  <div key={a.id} className="grid grid-cols-12 border-t border-slate-200 px-4 py-3 text-sm">
                    <div className="col-span-5 font-semibold text-slate-900">{a.type}</div>
                    <div className="col-span-7 text-right text-slate-700">
                      {invoice.currency} {asMoney(a.amount)}
                    </div>
                    {a.notes ? (
                      <div className="col-span-12 mt-1 text-xs text-slate-600">{a.notes}</div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="px-4 py-4 text-sm text-slate-600">No adjustments yet.</div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Allocations</h2>
            <p className="mt-1 text-sm text-slate-600">Payments allocated to this invoice.</p>

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                <div className="col-span-5">Date</div>
                <div className="col-span-4">Reference</div>
                <div className="col-span-3 text-right">Amount</div>
              </div>
              {allocationRows.length ? (
                allocationRows.map((al) => {
                  const txn = (al.finance_payment_transactions ?? [])[0] ?? null;
                  const ref = txn?.provider_txn_id || txn?.reference || txn?.id || "—";
                  return (
                    <div key={al.id} className="grid grid-cols-12 border-t border-slate-200 px-4 py-3 text-sm">
                      <div className="col-span-5 text-slate-700">
                        {txn?.paid_at ? new Date(txn.paid_at).toLocaleString() : "—"}
                      </div>
                      <div className="col-span-4 truncate text-slate-700" title={ref}>
                        {ref}
                      </div>
                      <div className="col-span-3 text-right text-slate-700">
                        {invoice.currency} {asMoney(al.amount)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-4 text-sm text-slate-600">No allocations yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
