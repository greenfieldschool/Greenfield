import { CircleAlert, Lock } from "lucide-react";
import { school } from "@/lib/school";
import { HELP, helpHref } from "@/lib/portal-help";
import type { FeeHold } from "@/lib/fee-hold";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PillLinks } from "../_components/portal-ui";
import { termParams, type PortalReport, type ReportTerm } from "./_load";

type Ok = Extract<PortalReport, { kind: "ok" }>;

export function termLabel(t: ReportTerm) {
  return [t.yearName, t.termName].filter(Boolean).join(" · ");
}

/** A school year as the pupil lived it: the year and the class they were in (two groups if they moved mid-year). */
function yearKey(t: ReportTerm) {
  return `${t.yearName ?? ""}|${t.className ?? ""}`;
}

/**
 * Child and term pickers, shared by the report card and certificates pages. With more than one school year, a year
 * row (e.g. "2025/2026 · JSS 1A") comes first and the term row shows that year's terms, so years of report cards
 * stay two short rows on a phone.
 */
export function ReportPickers({ data, path }: { data: Ok; path: string }) {
  const { role, parentStudents, terms, student, latest } = data;
  const childId = role === "parent" ? student.id : null;
  const years: Array<{ key: string; label: string; newest: ReportTerm }> = [];
  for (const t of terms) {
    const key = yearKey(t);
    if (!years.some((y) => y.key === key)) {
      years.push({ key, label: [t.yearName, t.className].filter(Boolean).join(" · ") || "Earlier", newest: t });
    }
  }
  const activeYear = yearKey(latest);
  const yearTerms = years.length > 1 ? terms.filter((t) => yearKey(t) === activeYear) : terms;
  return (
    <>
      {role === "parent" && parentStudents.length > 1 ? (
        <div className="print:hidden">
          <PillLinks
            label="Choose a child"
            items={parentStudents.map((st) => ({
              key: st.id,
              href: `${path}?student_id=${st.id}`,
              label: `${st.first_name} ${st.last_name}`,
              active: st.id === student.id
            }))}
          />
        </div>
      ) : null}
      {years.length > 1 ? (
        <div className="print:hidden">
          <PillLinks
            label="Choose a school year"
            items={years.map((y) => ({
              key: y.key,
              href: `${path}?${termParams(y.newest, childId).toString()}`,
              label: y.label,
              active: y.key === activeYear
            }))}
          />
        </div>
      ) : null}
      {yearTerms.length > 1 ? (
        <div className="print:hidden">
          <PillLinks
            label="Choose a term"
            items={yearTerms.map((t) => ({
              key: t.key,
              href: `${path}?${termParams(t, childId).toString()}`,
              label: years.length > 1 ? t.termName : `${t.yearName ?? ""} ${t.termName}`.trim(),
              active: t.key === latest.key
            }))}
          />
        </div>
      ) : null}
    </>
  );
}

function money(currency: string, amount: number) {
  const n = amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "NGN" ? `₦${n}` : `${currency} ${n}`;
}

/** Shown instead of the report card (or certificates) while fees are unpaid, or when fees couldn't be checked. */
export function FeeHoldNotice({ data, what }: { data: Ok; what: "report card" | "certificates" }) {
  const hold = data.hold as Exclude<FeeHold, { status: "clear" }>;
  const term = data.latest.termName || "term";
  const isParent = data.role === "parent";
  const owner = isParent ? `${data.student.first_name}'s` : "Your";

  if (hold.status === "unknown") {
    return (
      <Card className="p-6 text-center sm:p-8">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <CircleAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-slate-900">We couldn&apos;t open the {what} just now</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
          Please reload the page in a moment. If it keeps happening, call the school office on {school.phone}.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-center gap-3 bg-brand-gold-50 px-6 py-7 text-center sm:px-10">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-gold-700 shadow-sm">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-bold text-slate-900">
          {owner} {term} {what} {what === "certificates" ? "are" : "is"} ready
        </h2>
        <p className="max-w-md text-sm text-slate-700">
          {isParent
            ? `It will open here as soon as the school fees are paid. Outstanding: ${money(hold.currency, hold.outstanding)} on ${hold.invoices} invoice${hold.invoices === 1 ? "" : "s"}.`
            : "It will open here once your school fees are settled. Please speak to your parent or guardian."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {isParent ? <ButtonLink href="/portal/billing">Pay fees</ButtonLink> : null}
          <a href={helpHref(HELP.reportHeld)} className="text-sm font-semibold text-brand-green-700 hover:underline">
            Why is it locked?
          </a>
        </div>
      </div>
      {isParent ? (
        <p className="border-t border-brand-gold-100 px-6 py-3 text-center text-xs text-slate-600">
          Paid by bank transfer? It can take a little while for the school to record it. If it has been more than two working days, call
          the school office on {school.phone}.
        </p>
      ) : null}
    </Card>
  );
}
