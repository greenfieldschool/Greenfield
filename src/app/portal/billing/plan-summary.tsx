import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatLagosDate } from "@/lib/lagos-dates";
import { PLAN_STATE, type PlanRow } from "@/lib/payment-plans";

const day = (d: string) => formatLagosDate(`${d.slice(0, 10)}T12:00:00Z`);
const naira = (n: number | string) => `₦${Number(n).toLocaleString("en-NG")}`;

// Under an invoice on Fees & billing: the plan's payments, what is due next, and any default letter.
export function PortalPlanSummary({
  rows,
  paid,
  letters
}: {
  rows: PlanRow[];
  /** Money paid on the invoice so far. */
  paid: number;
  letters: Array<{ id: string; instalment_id: string }>;
}) {
  if (!rows.length) return null;
  const next = rows.find((r) => r.state !== "paid");
  const missed = rows.some((r) => r.state === "missed");
  const letterFor = new Map(letters.map((l) => [l.instalment_id, l.id]));
  // What to pay to be up to date: everything due up to the next payment, plus a default fee added for it (the
  // same figure as "Please pay now" in the default letter).
  // When several payments are missed, that is everything up to the last missed one.
  const target = [...rows].reverse().find((r) => r.state === "missed") ?? next;
  const owed = target
    ? Math.max(0, Number(target.due_so_far) + (target.default_status === "charged" ? Number(target.default_amount ?? 0) : 0) - paid)
    : 0;
  return (
    <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm" open={missed}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3.5 py-2.5">
        <CalendarClock className="h-4 w-4 shrink-0 text-brand-green-600" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-slate-800">
          {next
            ? `Payment plan: ${naira(owed)} ${missed ? "to pay now" : `due ${day(next.due_date)}`}`
            : "Payment plan: all payments made"}
        </span>
        {missed ? <Badge tone="red">Payment missed</Badge> : <Badge tone="green">On track</Badge>}
      </summary>
      <ol className="divide-y divide-slate-200/70 border-t border-slate-200">
        {rows.map((r) => {
          const s = PLAN_STATE[r.state];
          const letter = letterFor.get(r.instalment_id);
          return (
            <li key={r.instalment_id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <span>
                <span className="font-medium text-slate-900">{naira(r.amount)}</span>{" "}
                <span className="text-slate-500">
                  · {r.due_label.toLowerCase()} ({day(r.due_date)})
                </span>
                {r.default_status === "charged" ? (
                  <span className="block text-red-700">
                    Default fee {naira(r.default_amount ?? 0)} added.{" "}
                    {letter ? (
                      <Link href={`/portal/billing/letter/${letter}`} className="font-semibold underline">
                        Read the letter
                      </Link>
                    ) : null}
                  </span>
                ) : null}
              </span>
              <Badge tone={s.tone}>{s.label}</Badge>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
