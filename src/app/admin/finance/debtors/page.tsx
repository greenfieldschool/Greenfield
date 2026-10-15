import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetch-all";
import { classLabel, loadStudentsByClass } from "@/lib/student-classes";
import { AlertCircle, Banknote, CheckCircle2, FileText, MessageCircle, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";

type GuardianBalanceRow = {
  guardian_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  outstanding_total: number;
};

type InvoiceBalanceRow = {
  invoice_id: string;
  student_id: string | null;
  bill_to_guardian_id: string | null;
  status: string;
  invoice_total: number;
  allocated_total: number;
  balance: number;
};

type GuardianContact = { id: string; full_name: string; phone: string | null };

const NO_CLASS = "none";

function toWhatsAppHref(phone: string, message: string) {
  const digits = phone.replace(/[^0-9+]/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${encodeURIComponent(digits)}?text=${text}`;
}

function money(n: number) {
  return Number(n ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}

export default async function AdminFinanceDebtorsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const sp = (await searchParams) ?? {};
  const classFilterRaw = sp.class_id;
  const classFilter = (Array.isArray(classFilterRaw) ? classFilterRaw[0] : classFilterRaw)?.trim() ?? "";

  const [{ data }, invoices, { studentById, classById, classes }, guardians] = await Promise.all([
    supabase
      .from("finance_guardian_balances")
      .select("guardian_id, full_name, email, phone, outstanding_total")
      .gt("outstanding_total", 0)
      .order("outstanding_total", { ascending: false })
      .limit(200),
    fetchAllRows<InvoiceBalanceRow>(() =>
      supabase
        .from("finance_invoice_balances")
        .select("invoice_id, student_id, bill_to_guardian_id, status, invoice_total, allocated_total, balance")
        .neq("status", "void")
        .order("invoice_id", { ascending: true })
    ),
    loadStudentsByClass(supabase),
    fetchAllRows<GuardianContact>(() => supabase.from("guardians").select("id, full_name, phone").order("id"))
  ]);

  const debtors = (data ?? []) as GuardianBalanceRow[];
  const guardianById = new Map(guardians.map((g) => [g.id, g] as const));

  // Outstanding balance per student, then per class (student's current class).
  type StudentDebt = { studentId: string | null; guardianId: string | null; invoiced: number; paid: number; balance: number };
  const byStudent = new Map<string, StudentDebt>();
  for (const inv of invoices) {
    const key = inv.student_id ?? `guardian:${inv.bill_to_guardian_id ?? "unknown"}`;
    const entry = byStudent.get(key) ?? {
      studentId: inv.student_id,
      guardianId: inv.bill_to_guardian_id,
      invoiced: 0,
      paid: 0,
      balance: 0
    };
    entry.invoiced += Number(inv.invoice_total ?? 0);
    entry.paid += Number(inv.allocated_total ?? 0);
    entry.balance += Number(inv.balance ?? 0);
    byStudent.set(key, entry);
  }

  const studentDebts = Array.from(byStudent.values())
    .filter((d) => d.balance > 0)
    .map((d) => {
      const student = d.studentId ? (studentById.get(d.studentId) ?? null) : null;
      const cls = student?.class_id ? (classById.get(student.class_id) ?? null) : null;
      return { ...d, student, cls };
    });

  const classSummary = new Map<string, { label: string; students: number; balance: number; invoiced: number; paid: number }>();
  for (const d of Array.from(byStudent.values())) {
    const student = d.studentId ? studentById.get(d.studentId) : null;
    const cls = student?.class_id ? classById.get(student.class_id) : null;
    const key = cls?.id ?? NO_CLASS;
    const entry = classSummary.get(key) ?? {
      label: cls ? classLabel(cls) : "No student / class",
      students: 0,
      balance: 0,
      invoiced: 0,
      paid: 0
    };
    entry.invoiced += d.invoiced;
    entry.paid += d.paid;
    if (d.balance > 0) {
      entry.balance += d.balance;
      entry.students += 1;
    }
    classSummary.set(key, entry);
  }
  const classRows = Array.from(classSummary.entries()).sort((a, b) => b[1].balance - a[1].balance);

  const visibleDebts = studentDebts
    .filter((d) => !classFilter || (classFilter === NO_CLASS ? !d.cls : d.cls?.id === classFilter))
    .sort((a, b) => b.balance - a.balance);
  const visibleTotal = visibleDebts.reduce((acc, d) => acc + d.balance, 0);

  const totalOutstanding = classRows.reduce((acc, [, c]) => acc + c.balance, 0);
  const totalInvoiced = classRows.reduce((acc, [, c]) => acc + c.invoiced, 0);
  const totalPaid = classRows.reduce((acc, [, c]) => acc + c.paid, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/finance", label: "Back to finance" }}
        eyebrow="Finance"
        title="Debtors"
        description="Outstanding fees by class and by student, plus guardians who owe."
        actions={
          <ButtonLink href="/admin/finance/payments" variant="secondary">
            <Wallet className="h-4 w-4" aria-hidden="true" />
            Payments by class
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={<span className="tabular-nums">₦{money(totalOutstanding)}</span>}
          hint="Across all non-void invoices"
          icon={AlertCircle}
          tone="rose"
        />
        <StatCard
          label="Invoiced"
          value={<span className="tabular-nums">₦{money(totalInvoiced)}</span>}
          icon={FileText}
          tone="blue"
        />
        <StatCard label="Paid" value={<span className="tabular-nums">₦{money(totalPaid)}</span>} icon={Banknote} tone="green" />
        <StatCard
          label="Students owing"
          value={<span className="tabular-nums">{studentDebts.length.toLocaleString("en-NG")}</span>}
          hint={`${debtors.length} guardian${debtors.length === 1 ? "" : "s"} with a balance`}
          icon={Users}
          tone="gold"
        />
      </div>

      {/* Per class */}
      <Card>
        <CardHeader title="By class" description="Invoiced, paid and outstanding per class. Click a class to list its debtors." />
        {classRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Class</th>
                  <th className="text-right">Invoiced</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Outstanding</th>
                  <th className="text-right">Students owing</th>
                </tr>
              </thead>
              <tbody>
                {classRows.map(([key, c]) => (
                  <tr key={key} className={classFilter === key ? "bg-brand-green-50/60" : undefined}>
                    <td>
                      <Link className="gf-link" href={`/admin/finance/debtors?class_id=${key}`}>
                        {c.label}
                      </Link>
                      {classFilter === key ? (
                        <Badge tone="green" className="ml-2">
                          Selected
                        </Badge>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">₦{money(c.invoiced)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">₦{money(c.paid)}</td>
                    <td
                      className={`whitespace-nowrap text-right font-semibold tabular-nums ${
                        c.balance > 0 ? "text-red-700" : "text-brand-green-700"
                      }`}
                    >
                      ₦{money(c.balance)}
                    </td>
                    <td className="text-right tabular-nums">{c.students}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/80 text-sm font-semibold text-slate-900">
                  <td className="px-4 py-3 pl-5 sm:pl-6">Total</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">₦{money(totalInvoiced)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">₦{money(totalPaid)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-red-700">₦{money(totalOutstanding)}</td>
                  <td className="px-4 py-3 pr-5 text-right tabular-nums sm:pr-6">
                    {classRows.reduce((acc, [, c]) => acc + c.students, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState icon={FileText} title="No invoices yet" description="Class totals appear once invoices are issued." />
        )}
      </Card>

      {/* Per student */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              Students owing{" "}
              {classFilter ? `— ${classFilter === NO_CLASS ? "no class" : classLabel(classById.get(classFilter))}` : ""}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {visibleDebts.length} student{visibleDebts.length === 1 ? "" : "s"} ·{" "}
              <span className="tabular-nums">₦{money(visibleTotal)}</span> outstanding
            </p>
          </div>
          <form method="get" action="/admin/finance/debtors" className="flex gap-2">
            <label htmlFor="debtors-class" className="sr-only">
              Class
            </label>
            <select id="debtors-class" className="gf-select min-w-[180px] py-2" name="class_id" defaultValue={classFilter}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {classLabel(c)}
                </option>
              ))}
              <option value={NO_CLASS}>No student / class</option>
            </select>
            <button type="submit" className={buttonClasses({ size: "md" })}>
              Show
            </button>
          </form>
        </div>
        {visibleDebts.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Guardian</th>
                  <th className="text-right">Outstanding</th>
                  <th className="text-right">Follow up</th>
                </tr>
              </thead>
              <tbody>
                {visibleDebts.map((d, i) => {
                  const guardian = d.guardianId ? guardianById.get(d.guardianId) : null;
                  const childName = d.student ? `${d.student.first_name} ${d.student.last_name}` : "your child";
                  const message = `Hello ${guardian?.full_name ?? ""}, this is a reminder that ${childName}'s school fees balance of NGN ${money(d.balance)} is outstanding. Please let us know when you can make payment. Thank you.`;
                  return (
                    <tr key={d.studentId ?? `g-${d.guardianId ?? i}`}>
                      <td>
                        {d.student ? (
                          <Link className="gf-link" href={`/admin/students/${d.student.id}`}>
                            {d.student.last_name} {d.student.first_name}
                          </Link>
                        ) : (
                          <Badge tone="gold">Invoice not linked to a student</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{d.cls ? classLabel(d.cls) : "—"}</td>
                      <td>
                        <div className="text-slate-900">{guardian?.full_name ?? "—"}</div>
                        <div className="text-xs text-slate-500">{guardian?.phone ?? ""}</div>
                      </td>
                      <td className="whitespace-nowrap text-right font-semibold tabular-nums text-red-700">₦{money(d.balance)}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          {d.student ? (
                            <Link
                              className={buttonClasses({ variant: "secondary", size: "sm" })}
                              href={`/admin/finance/payments/new?student_id=${d.student.id}`}
                            >
                              <Wallet className="h-4 w-4" aria-hidden="true" />
                              Record payment
                            </Link>
                          ) : null}
                          {guardian?.phone ? (
                            <a
                              className={buttonClasses({ variant: "secondary", size: "sm" })}
                              href={toWhatsAppHref(guardian.phone, message)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MessageCircle className="h-4 w-4" aria-hidden="true" />
                              WhatsApp
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No outstanding balances"
            description={classFilter ? "Nobody in this class owes fees." : "Every invoiced student is fully paid."}
          />
        )}
      </Card>

      {/* Per guardian (original view) */}
      <Card>
        <CardHeader title="By guardian" description="Guardians with outstanding balances across all their children." />
        {debtors.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[680px]">
              <thead>
                <tr>
                  <th>Guardian</th>
                  <th>Phone</th>
                  <th className="text-right">Outstanding</th>
                  <th className="text-right">Follow up</th>
                </tr>
              </thead>
              <tbody>
                {debtors.map((d) => {
                  const message = `Hello ${d.full_name}, this is a reminder about your outstanding school fees balance. Please let us know when you can make payment. Thank you.`;
                  const hasPhone = Boolean(d.phone && d.phone.trim().length);

                  return (
                    <tr key={d.guardian_id}>
                      <td>
                        <div className="font-semibold text-slate-900">{d.full_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{d.email ?? "—"}</div>
                      </td>
                      <td className="whitespace-nowrap">{d.phone ?? "—"}</td>
                      <td className="whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                        ₦{Number(d.outstanding_total ?? 0).toLocaleString("en-NG")}
                      </td>
                      <td className="text-right">
                        {hasPhone ? (
                          <a
                            className={buttonClasses({ variant: "secondary", size: "sm" })}
                            href={toWhatsAppHref(d.phone ?? "", message)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MessageCircle className="h-4 w-4" aria-hidden="true" />
                            WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">No phone</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="No outstanding balances" description="No guardian currently owes fees." />
        )}
      </Card>
    </div>
  );
}
