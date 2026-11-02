import { CircleAlert, Lock } from "lucide-react";
import { school } from "@/lib/school";
import type { FeeHold } from "@/lib/fee-hold";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PillLinks } from "../_components/portal-ui";
import { firstOrNull, type PortalReport } from "./_load";

type Ok = Extract<PortalReport, { kind: "ok" }>;

export function termLabel(p: Ok["latest"]) {
  return [firstOrNull(p.academic_years)?.name, firstOrNull(p.academic_terms)?.name].filter(Boolean).join(" · ");
}

/** Child and term pickers, shared by the report card and certificates pages. */
export function ReportPickers({ data, path }: { data: Ok; path: string }) {
  const { role, parentStudents, pubs, student, latest } = data;
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
      {pubs.length > 1 ? (
        <div className="print:hidden">
          <PillLinks
            label="Choose a term"
            items={pubs.map((p) => {
              const params = new URLSearchParams({ pub: p.id });
              if (role === "parent") params.set("student_id", student.id);
              return {
                key: p.id,
                href: `${path}?${params.toString()}`,
                label: `${firstOrNull(p.academic_years)?.name ?? ""} ${firstOrNull(p.academic_terms)?.name ?? "Term"}`.trim(),
                active: p.id === latest.id
              };
            })}
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
  const term = firstOrNull(data.latest.academic_terms)?.name ?? "term";
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
        {isParent ? <ButtonLink href="/portal/billing">Pay fees</ButtonLink> : null}
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
