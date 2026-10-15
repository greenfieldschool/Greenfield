import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import UrlToast from "@/components/url-toast";
import { firstOrNull } from "@/lib/relations";
import { lagosEndOfDayIso, lagosStartOfDayIso } from "@/lib/lagos-dates";
import { classLabel, loadStudentsByClass } from "@/lib/student-classes";
import { fetchAllRows } from "@/lib/fetch-all";

type InvoiceRef = { student_id: string | null };
type AllocationRef = { finance_invoices: InvoiceRef | InvoiceRef[] | null };

type PaymentRow = {
  id: string;
  direction: string;
  guardian_id: string | null;
  student_id: string | null;
  amount: number;
  currency: string;
  method: string | null;
  reference: string | null;
  paid_at: string;
  status: string;
  finance_payment_allocations: AllocationRef[] | null;
};

const NO_CLASS = "none";
const DISPLAY_LIMIT = 300;

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function money(n: number) {
  return Number(n ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

export default async function AdminFinancePaymentsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const sp = (await searchParams) ?? {};
  const classFilter = str(sp.class_id);
  const fromDate = str(sp.from);
  const toDate = str(sp.to);
  const query = str(sp.q).toLowerCase();
  const isFiltered = Boolean(classFilter || fromDate || toDate || query);

  const fromIso = fromDate ? lagosStartOfDayIso(fromDate) : null;
  const toIso = toDate ? lagosEndOfDayIso(toDate) : null;
  const buildPaymentsQuery = () => {
    let q = supabase
      .from("finance_payment_transactions")
      .select(
        "id, direction, guardian_id, student_id, amount, currency, method, reference, paid_at, status, finance_payment_allocations(finance_invoices(student_id))"
      )
      .order("paid_at", { ascending: false })
      .order("id", { ascending: true });
    if (fromIso) q = q.gte("paid_at", fromIso);
    if (toIso) q = q.lte("paid_at", toIso);
    return q;
  };

  const [data, { studentById, classById, classes }] = await Promise.all([
    fetchAllRows<PaymentRow>(buildPaymentsQuery),
    loadStudentsByClass(supabase)
  ]);

  // Older payments may only be linked to the student through the invoice they were allocated to.
  const rows = data.map((p) => {
    const viaInvoice =
      (p.finance_payment_allocations ?? [])
        .map((a) => firstOrNull(a.finance_invoices)?.student_id ?? null)
        .find((v): v is string => Boolean(v)) ?? null;
    const studentId = p.student_id ?? viaInvoice;
    const student = studentId ? (studentById.get(studentId) ?? null) : null;
    const cls = student?.class_id ? (classById.get(student.class_id) ?? null) : null;
    return { ...p, student, cls };
  });

  const filtered = rows.filter((r) => {
    if (classFilter === NO_CLASS ? r.cls !== null : classFilter && r.cls?.id !== classFilter) return false;
    if (query) {
      const hay = [r.student?.first_name, r.student?.last_name, r.student?.admission_number, r.reference]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  const counted = filtered.filter((r) => r.status === "posted" && r.direction === "inflow");
  const totalCollected = counted.reduce((acc, r) => acc + Number(r.amount ?? 0), 0);
  const studentsPaid = new Set(counted.map((r) => r.student?.id).filter(Boolean)).size;

  // Totals per class for the selected dates (ignores the class filter so classes can be compared).
  const byClass = new Map<string, { label: string; total: number; count: number }>();
  for (const r of rows) {
    if (r.status !== "posted" || r.direction !== "inflow") continue;
    if (query) continue;
    const key = r.cls?.id ?? NO_CLASS;
    const entry = byClass.get(key) ?? { label: r.cls ? classLabel(r.cls) : "No student / class", total: 0, count: 0 };
    entry.total += Number(r.amount ?? 0);
    entry.count += 1;
    byClass.set(key, entry);
  }
  const classTotals = Array.from(byClass.entries()).sort((a, b) => b[1].total - a[1].total);

  const linkWith = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { class_id: classFilter, from: fromDate, to: toDate, q: str(sp.q), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/admin/finance/payments?${qs}` : "/admin/finance/payments";
  };

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20";

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Payments</h1>
        <p className="mt-2 text-sm text-slate-600">
          Payments with the student and class they belong to. Click a payment to edit or delete it.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-4">
            <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance">
              Back to finance
            </Link>
            <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/debtors">
              Debtors by class
            </Link>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            href="/admin/finance/payments/new"
          >
            Record payment
          </Link>
        </div>
      </div>

      {/* Filters (plain GET form so the URL can be bookmarked or shared) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form method="get" action="/admin/finance/payments" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <div>
            <label className="text-xs font-semibold text-slate-500">Class</label>
            <select className={inputClass} name="class_id" defaultValue={classFilter}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {classLabel(c)}
                </option>
              ))}
              <option value={NO_CLASS}>No student / class</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">From</label>
            <input className={inputClass} type="date" name="from" defaultValue={fromDate} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">To</label>
            <input className={inputClass} type="date" name="to" defaultValue={toDate} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Student or reference</label>
            <input className={inputClass} name="q" defaultValue={str(sp.q)} placeholder="Name, adm. no, reference…" />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95"
            >
              Filter
            </button>
            {isFiltered ? (
              <Link
                href="/admin/finance/payments"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Total collected</div>
          <div className="mt-2 text-2xl font-bold text-emerald-900">NGN {money(totalCollected)}</div>
          <div className="mt-1 text-xs text-emerald-800">
            {classFilter
              ? classFilter === NO_CLASS
                ? "Payments not linked to a student"
                : classLabel(classById.get(classFilter))
              : "All classes"}
            {fromDate || toDate ? ` · ${fromDate || "start"} to ${toDate || "today"}` : ""}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payments</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{counted.length}</div>
          <div className="mt-1 text-xs text-slate-500">Posted payments (void ones are excluded)</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Students who paid</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{studentsPaid}</div>
          <div className="mt-1 text-xs text-slate-500">Distinct students in these payments</div>
        </div>
      </div>

      {/* Totals per class */}
      {classTotals.length && !query ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="font-semibold text-slate-900">Amount collected per class</div>
            <div className="text-xs text-slate-500">Click a class to see its payments. Based on each student&apos;s current class.</div>
          </div>
          <div className="divide-y divide-slate-100">
            {classTotals.map(([key, c]) => (
              <Link
                key={key}
                href={linkWith({ class_id: key })}
                className={`flex items-center justify-between px-6 py-3 text-sm hover:bg-slate-50 ${
                  classFilter === key ? "bg-emerald-50/60" : ""
                }`}
              >
                <span className="font-semibold text-slate-900">{c.label}</span>
                <span className="text-slate-700">
                  {c.count} payment{c.count === 1 ? "" : "s"} ·{" "}
                  <span className="font-semibold text-slate-900">NGN {money(c.total)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left">Date</th>
                <th className="px-3 py-3 text-left">Student</th>
                <th className="px-3 py-3 text-left">Class</th>
                <th className="px-3 py-3 text-left">Method</th>
                <th className="px-3 py-3 text-left">Reference</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? (
                filtered.slice(0, DISPLAY_LIMIT).map((p) => (
                  <tr
                    key={p.id}
                    className={`border-t border-slate-200 ${p.status === "void" ? "text-slate-400 line-through" : "text-slate-700"}`}
                  >
                    <td className="whitespace-nowrap px-6 py-3">{new Date(p.paid_at).toLocaleString()}</td>
                    <td className="px-3 py-3">
                      {p.student ? (
                        <span className="font-semibold text-slate-900">
                          {p.student.last_name} {p.student.first_name}
                        </span>
                      ) : (
                        <span className="text-amber-700">Not linked</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{p.cls ? classLabel(p.cls) : "—"}</td>
                    <td className="px-3 py-3">{p.method ?? "—"}</td>
                    <td className="max-w-[180px] truncate px-3 py-3" title={p.reference ?? ""}>
                      {p.reference ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      {p.direction === "outflow" ? "−" : ""}
                      {p.currency} {money(p.amount)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link className="text-xs font-semibold text-brand-green hover:underline" href={`/admin/finance/payments/${p.id}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-sm text-slate-600">
                    {isFiltered ? "No payments match these filters." : "No payments yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > DISPLAY_LIMIT ? (
          <div className="border-t border-slate-200 px-6 py-3 text-xs text-slate-500">
            Showing the latest {DISPLAY_LIMIT} of {filtered.length} payments. Totals above include all of them.
          </div>
        ) : null}
      </div>
    </div>
  );
}
