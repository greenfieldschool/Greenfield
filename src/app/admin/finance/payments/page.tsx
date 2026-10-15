import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import UrlToast from "@/components/url-toast";
import { firstOrNull } from "@/lib/relations";
import { lagosEndOfDayIso, lagosStartOfDayIso } from "@/lib/lagos-dates";
import { classLabel, loadStudentsByClass } from "@/lib/student-classes";
import { fetchAllRows } from "@/lib/fetch-all";
import { Banknote, Filter, Pencil, Plus, Receipt, Search, UserX, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { FinanceStatusBadge, currencyPrefix, fmtDateTime } from "../_components/finance-ui";

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

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance", label: "Back to finance" }}
        eyebrow="Finance"
        title="Payments"
        description="Payments with the student and class they belong to. Click a payment to edit or delete it."
        actions={
          <>
            <ButtonLink href="/admin/finance/debtors" variant="secondary">
              <UserX className="h-4 w-4" aria-hidden="true" />
              Debtors by class
            </ButtonLink>
            <ButtonLink href="/admin/finance/payments/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Record payment
            </ButtonLink>
          </>
        }
      />

      {/* Filters (plain GET form so the URL can be bookmarked or shared) */}
      <Card>
        <CardBody>
          <form method="get" action="/admin/finance/payments" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <Field label="Class" htmlFor="pay-class">
              <select id="pay-class" className="gf-select" name="class_id" defaultValue={classFilter}>
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c)}
                  </option>
                ))}
                <option value={NO_CLASS}>No student / class</option>
              </select>
            </Field>
            <Field label="From" htmlFor="pay-from">
              <input id="pay-from" className="gf-input" type="date" name="from" defaultValue={fromDate} />
            </Field>
            <Field label="To" htmlFor="pay-to">
              <input id="pay-to" className="gf-input" type="date" name="to" defaultValue={toDate} />
            </Field>
            <Field label="Student or reference" htmlFor="pay-q">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="pay-q"
                  className="gf-input pl-9"
                  name="q"
                  defaultValue={str(sp.q)}
                  placeholder="Name, adm. no, reference…"
                />
              </div>
            </Field>
            <div className="flex gap-2">
              <button type="submit" className={buttonClasses({ className: "flex-1" })}>
                <Filter className="h-4 w-4" aria-hidden="true" />
                Filter
              </button>
              {isFiltered ? (
                <ButtonLink href="/admin/finance/payments" variant="secondary">
                  Clear
                </ButtonLink>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total collected"
          value={<span className="tabular-nums">₦{money(totalCollected)}</span>}
          hint={
            <>
              {classFilter
                ? classFilter === NO_CLASS
                  ? "Payments not linked to a student"
                  : classLabel(classById.get(classFilter))
                : "All classes"}
              {fromDate || toDate ? ` · ${fromDate || "start"} to ${toDate || "today"}` : ""}
            </>
          }
          icon={Banknote}
          tone="green"
        />
        <StatCard
          label="Payments"
          value={<span className="tabular-nums">{counted.length.toLocaleString("en-NG")}</span>}
          hint="Posted payments (void ones are excluded)"
          icon={Receipt}
          tone="blue"
        />
        <StatCard
          label="Students who paid"
          value={<span className="tabular-nums">{studentsPaid.toLocaleString("en-NG")}</span>}
          hint="Distinct students in these payments"
          icon={Users}
          tone="gold"
        />
      </div>

      {/* Totals per class */}
      {classTotals.length && !query ? (
        <Card>
          <CardHeader
            title="Amount collected per class"
            description="Click a class to see its payments. Based on each student's current class."
          />
          <div className="gf-table-wrap">
            <table className="gf-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th className="text-right">Payments</th>
                  <th className="text-right">Collected</th>
                </tr>
              </thead>
              <tbody>
                {classTotals.map(([key, c]) => (
                  <tr key={key} className={classFilter === key ? "bg-brand-green-50/60" : undefined}>
                    <td>
                      <Link href={linkWith({ class_id: key })} className="gf-link">
                        {c.label}
                      </Link>
                      {classFilter === key ? (
                        <Badge tone="green" className="ml-2">
                          Selected
                        </Badge>
                      ) : null}
                    </td>
                    <td className="text-right tabular-nums">
                      {c.count} payment{c.count === 1 ? "" : "s"}
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">₦{money(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Payment records"
          description={`${filtered.length.toLocaleString("en-NG")} payment${filtered.length === 1 ? "" : "s"}${isFiltered ? " match these filters" : ""}`}
        />
        {filtered.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[860px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, DISPLAY_LIMIT).map((p) => (
                  <tr key={p.id} className={p.status === "void" ? "text-slate-400 line-through" : undefined}>
                    <td className="whitespace-nowrap">{fmtDateTime(p.paid_at)}</td>
                    <td>
                      {p.student ? (
                        <span className="font-semibold text-slate-900">
                          {p.student.last_name} {p.student.first_name}
                        </span>
                      ) : (
                        <Badge tone="gold">Not linked</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{p.cls ? classLabel(p.cls) : "—"}</td>
                    <td className="capitalize">{p.method ?? "—"}</td>
                    <td className="max-w-[180px] truncate" title={p.reference ?? ""}>
                      {p.reference ?? "—"}
                    </td>
                    <td>
                      <FinanceStatusBadge status={p.status} />
                    </td>
                    <td
                      className={
                        "whitespace-nowrap text-right font-semibold tabular-nums " +
                        (p.status === "void" ? "" : p.direction === "outflow" ? "text-red-600" : "text-slate-900")
                      }
                    >
                      {p.direction === "outflow" ? "−" : ""}
                      {currencyPrefix(p.currency)}
                      {money(p.amount)}
                    </td>
                    <td className="text-right">
                      <Link
                        className={buttonClasses({ variant: "ghost", size: "sm" })}
                        href={`/admin/finance/payments/${p.id}`}
                        aria-label={`Edit payment${p.student ? ` from ${p.student.first_name} ${p.student.last_name}` : ""}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Wallet}
            title={isFiltered ? "No payments match these filters" : "No payments yet"}
            description={isFiltered ? "Try a different class, date range or search term." : "Recorded payments will appear here."}
            action={
              isFiltered ? (
                <ButtonLink href="/admin/finance/payments" variant="secondary" size="sm">
                  Clear filters
                </ButtonLink>
              ) : (
                <ButtonLink href="/admin/finance/payments/new" size="sm">
                  Record payment
                </ButtonLink>
              )
            }
          />
        )}
        {filtered.length > DISPLAY_LIMIT ? (
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">
            Showing the latest {DISPLAY_LIMIT} of {filtered.length} payments. Totals above include all of them.
          </div>
        ) : null}
      </Card>
    </div>
  );
}
