import { Card } from "@/components/ui/card";
import SubmitButton from "@/components/submit-button";
import { formatLagosDate } from "@/lib/lagos-dates";
import type { PreviewRow } from "@/lib/payment-plans";

const day = (d: string) => formatLagosDate(`${d.slice(0, 10)}T12:00:00Z`);
const naira = (n: number | string) => `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// The plan choices and the agreement, for a parent on the portal (page.tsx loads the data and saves).
export function PlanChooser({
  action,
  invoiceId,
  previews,
  fee
}: {
  action: (fd: FormData) => Promise<void>;
  invoiceId: string;
  previews: Array<{ n: number; rows: PreviewRow[] }>;
  /** The default fee for one missed payment on this invoice. */
  fee: number;
}) {
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold text-slate-900">Choose how many payments</legend>
        {previews.map((p, i) => (
          <label
            key={p.n}
            className="block cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-card has-[:checked]:border-brand-green has-[:checked]:ring-2 has-[:checked]:ring-brand-green/20"
          >
            <span className="flex items-center gap-3">
              <input type="radio" name="instalments" value={p.n} defaultChecked={i === 1} required className="h-5 w-5" />
              <span className="font-semibold text-slate-900">{p.n} payments</span>
            </span>
            <ol className="mt-2 space-y-1 pl-8 text-sm text-slate-700">
              {p.rows.map((r) => (
                <li key={r.seq} className="flex justify-between gap-3">
                  <span>
                    {r.label} ({day(r.due_date)})
                  </span>
                  <span className="font-medium tabular-nums">{naira(r.amount)}</span>
                </li>
              ))}
            </ol>
          </label>
        ))}
      </fieldset>

      <Card className="space-y-4 p-4 sm:p-5">
        <div>
          <label className="gf-label" htmlFor="agreed_name">
            Type your full name to agree
          </label>
          <input id="agreed_name" name="agreed_name" className="gf-input" required minLength={3} autoComplete="name" />
        </div>
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="agree" value="yes" required className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            I agree to pay on these dates. If a payment is missed, the school adds a default fee of {naira(fee)} for each missed payment and sends me a
            letter, as set out in the school policy.
          </span>
        </label>
        <SubmitButton size="lg" pendingText="Saving…">
          Agree to this plan
        </SubmitButton>
        <p className="text-xs text-slate-500">
          This is your School Fees Payment Agreement. The school keeps your name, the date and the policy version. To change it later, contact the office.
        </p>
      </Card>
    </form>
  );
}
