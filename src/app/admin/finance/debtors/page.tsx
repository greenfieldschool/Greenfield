import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetch-all";
import { classLabel, loadStudentsByClass } from "@/lib/student-classes";

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

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Debtors</h1>
        <p className="mt-2 text-sm text-slate-600">Outstanding fees by class and by student, plus guardians who owe.</p>
        <div className="mt-4 flex gap-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance">
            Back to finance
          </Link>
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/payments">
            Payments by class
          </Link>
        </div>
      </div>

      {/* Per class */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="font-semibold text-slate-900">By class</div>
          <div className="text-xs text-slate-500">Invoiced, paid and outstanding per class. Click a class to list its debtors.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left">Class</th>
                <th className="px-3 py-3 text-right">Invoiced</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-3 py-3 text-right">Outstanding</th>
                <th className="px-6 py-3 text-right">Students owing</th>
              </tr>
            </thead>
            <tbody>
              {classRows.length ? (
                classRows.map(([key, c]) => (
                  <tr key={key} className={`border-t border-slate-200 ${classFilter === key ? "bg-emerald-50/60" : ""}`}>
                    <td className="px-6 py-3">
                      <Link className="font-semibold text-slate-900 hover:text-brand-green hover:underline" href={`/admin/finance/debtors?class_id=${key}`}>
                        {c.label}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-700">NGN {money(c.invoiced)}</td>
                    <td className="px-3 py-3 text-right text-slate-700">NGN {money(c.paid)}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${c.balance > 0 ? "text-red-700" : "text-emerald-700"}`}>
                      NGN {money(c.balance)}
                    </td>
                    <td className="px-6 py-3 text-right text-slate-700">{c.students}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-sm text-slate-600">
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per student */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold text-slate-900">
              Students owing{" "}
              {classFilter ? `— ${classFilter === NO_CLASS ? "no class" : classLabel(classById.get(classFilter))}` : ""}
            </div>
            <div className="text-xs text-slate-500">
              {visibleDebts.length} student{visibleDebts.length === 1 ? "" : "s"} · NGN {money(visibleTotal)} outstanding
            </div>
          </div>
          <form method="get" action="/admin/finance/debtors" className="flex gap-2">
            <select
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green/20"
              name="class_id"
              defaultValue={classFilter}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {classLabel(c)}
                </option>
              ))}
              <option value={NO_CLASS}>No student / class</option>
            </select>
            <button
              type="submit"
              className="rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
            >
              Show
            </button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left">Student</th>
                <th className="px-3 py-3 text-left">Class</th>
                <th className="px-3 py-3 text-left">Guardian</th>
                <th className="px-3 py-3 text-right">Outstanding</th>
                <th className="px-6 py-3 text-right">Follow up</th>
              </tr>
            </thead>
            <tbody>
              {visibleDebts.length ? (
                visibleDebts.map((d, i) => {
                  const guardian = d.guardianId ? guardianById.get(d.guardianId) : null;
                  const childName = d.student ? `${d.student.first_name} ${d.student.last_name}` : "your child";
                  const message = `Hello ${guardian?.full_name ?? ""}, this is a reminder that ${childName}'s school fees balance of NGN ${money(d.balance)} is outstanding. Please let us know when you can make payment. Thank you.`;
                  return (
                    <tr key={d.studentId ?? `g-${d.guardianId ?? i}`} className="border-t border-slate-200 text-slate-700">
                      <td className="px-6 py-3">
                        {d.student ? (
                          <Link className="font-semibold text-slate-900 hover:underline" href={`/admin/students/${d.student.id}`}>
                            {d.student.last_name} {d.student.first_name}
                          </Link>
                        ) : (
                          <span className="text-amber-700">Invoice not linked to a student</span>
                        )}
                      </td>
                      <td className="px-3 py-3">{d.cls ? classLabel(d.cls) : "—"}</td>
                      <td className="px-3 py-3">
                        <div>{guardian?.full_name ?? "—"}</div>
                        <div className="text-xs text-slate-500">{guardian?.phone ?? ""}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-red-700">NGN {money(d.balance)}</td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {d.student ? (
                            <Link
                              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                              href={`/admin/finance/payments/new?student_id=${d.student.id}`}
                            >
                              Record payment
                            </Link>
                          ) : null}
                          {guardian?.phone ? (
                            <a
                              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                              href={toWhatsAppHref(guardian.phone, message)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-sm text-slate-600">
                    No outstanding balances{classFilter ? " for this class" : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per guardian (original view) */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="font-semibold text-slate-900">By guardian</div>
          <div className="text-xs text-slate-500">Guardians with outstanding balances across all their children.</div>
        </div>
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-5">Guardian</div>
          <div className="col-span-3">Phone</div>
          <div className="col-span-2 text-right">Outstanding</div>
          <div className="col-span-2">Follow up</div>
        </div>
        <div>
          {debtors.length ? (
            debtors.map((d) => {
              const message = `Hello ${d.full_name}, this is a reminder about your outstanding school fees balance. Please let us know when you can make payment. Thank you.`;
              const hasPhone = Boolean(d.phone && d.phone.trim().length);

              return (
                <div
                  key={d.guardian_id}
                  className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700"
                >
                  <div className="col-span-5">
                    <div className="font-semibold text-slate-900">{d.full_name}</div>
                    <div className="mt-1 text-xs text-slate-600">{d.email ?? "—"}</div>
                  </div>
                  <div className="col-span-3">{d.phone ?? "—"}</div>
                  <div className="col-span-2 text-right font-semibold text-slate-900">
                    NGN {Number(d.outstanding_total ?? 0).toLocaleString()}
                  </div>
                  <div className="col-span-2">
                    {hasPhone ? (
                      <a
                        className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                        href={toWhatsAppHref(d.phone ?? "", message)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">No phone</span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No outstanding balances.</div>
          )}
        </div>
      </div>
    </div>
  );
}
