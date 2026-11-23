import type { SupabaseClient } from "@supabase/supabase-js";
import { Logo } from "@/components/ui/logo";
import { school } from "@/lib/school";
import { formatLagosDate } from "@/lib/lagos-dates";

// The default letter the policy asks for when a payment in a plan is missed ("Fees and payment plans" >
// "Missed payments"). Shown to admins to print, and to the parent on the portal. Reads as the signed-in person,
// so RLS decides who can open it.

export type DefaultLetter = {
  chargeId: string;
  chargedAt: string;
  amount: number;
  seq: number;
  instalments: number;
  instalmentAmount: number;
  dueDate: string;
  dueSoFar: number;
  paid: number;
  agreedAt: string;
  invoiceNo: string | null;
  termName: string | null;
  pupilName: string;
  parentName: string;
};

const naira = (n: number) => `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string) => formatLagosDate(d.length === 10 ? `${d}T12:00:00Z` : d);

export async function loadDefaultLetter(supabase: SupabaseClient, chargeId: string): Promise<DefaultLetter | null> {
  const { data: charge } = await supabase
    .from("fee_plan_default_charges")
    .select("id, status, amount, decided_at, instalment_id, invoice_id")
    .eq("id", chargeId)
    .maybeSingle();
  if (!charge || charge.status !== "charged") return null;
  const [{ data: inst }, { data: inv }, { data: status }] = await Promise.all([
    supabase.from("fee_payment_plan_instalments").select("seq, amount, due_date, plan_id").eq("id", charge.instalment_id).maybeSingle(),
    supabase
      .from("finance_invoice_balances")
      .select("invoice_no, student_id, bill_to_guardian_id, academic_term_id, allocated_total")
      .eq("invoice_id", charge.invoice_id)
      .maybeSingle(),
    supabase.rpc("payment_plan_status", { p_invoice: charge.invoice_id })
  ]);
  if (!inst || !inv) return null;
  const [{ data: plan }, { data: pupil }, { data: parent }, { data: term }] = await Promise.all([
    supabase.from("fee_payment_plans").select("instalments, agreed_at").eq("id", inst.plan_id).maybeSingle(),
    inv.student_id ? supabase.from("students").select("first_name, last_name").eq("id", inv.student_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("guardians").select("full_name").eq("id", inv.bill_to_guardian_id).maybeSingle(),
    inv.academic_term_id ? supabase.from("academic_terms").select("name, academic_years(name)").eq("id", inv.academic_term_id).maybeSingle() : Promise.resolve({ data: null })
  ]);
  const row = ((status ?? []) as Array<{ instalment_id: string; due_so_far: number }>).find((r) => r.instalment_id === charge.instalment_id);
  const t = term as { name: string; academic_years: { name: string } | Array<{ name: string }> | null } | null;
  const year = t ? (Array.isArray(t.academic_years) ? t.academic_years[0]?.name : t.academic_years?.name) : null;
  return {
    chargeId: charge.id,
    chargedAt: charge.decided_at,
    amount: Number(charge.amount),
    seq: inst.seq,
    instalments: plan?.instalments ?? 0,
    instalmentAmount: Number(inst.amount),
    dueDate: inst.due_date,
    dueSoFar: Number(row?.due_so_far ?? inst.amount) + Number(charge.amount),
    paid: Number(inv.allocated_total ?? 0),
    agreedAt: plan?.agreed_at ?? charge.decided_at,
    invoiceNo: inv.invoice_no,
    termName: t ? `${t.name} term${year ? `, ${year}` : ""}` : null,
    pupilName: pupil ? `${pupil.first_name} ${pupil.last_name}` : "your child",
    parentName: (parent as { full_name: string } | null)?.full_name ?? "Parent"
  };
}

export function FeeDefaultLetter({ letter }: { letter: DefaultLetter }) {
  const owing = Math.max(0, letter.dueSoFar - letter.paid);
  return (
    <article className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-[15px] leading-relaxed text-slate-800 shadow-card sm:p-10 print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <Logo />
        <div className="text-sm text-slate-600 sm:text-right">
          <div>{school.address}</div>
          <div>
            {school.phone} · {school.email}
          </div>
        </div>
      </header>
      <p>{day(letter.chargedAt)}</p>
      <p>Dear {letter.parentName},</p>
      <p className="font-semibold">
        Missed school fees payment: {letter.pupilName}
        {letter.termName ? `, ${letter.termName}` : ""}
      </p>
      <p>
        On {day(letter.agreedAt)} you agreed a payment plan of {letter.instalments} payments for invoice {letter.invoiceNo ?? ""}. Payment {letter.seq},{" "}
        {naira(letter.instalmentAmount)}, was due on {day(letter.dueDate)} and had not been received in full.
      </p>
      <p>
        As set out in the school policy you accepted (Fees and payment plans, Missed payments), a default fee of {naira(letter.amount)} has been added to
        the invoice. This is the higher of ₦2,500 or 3% of the term&apos;s fees.
      </p>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          <tr>
            <td className="py-1.5">Due so far, with the default fee</td>
            <td className="py-1.5 text-right tabular-nums">{naira(letter.dueSoFar)}</td>
          </tr>
          <tr>
            <td className="py-1.5">Paid so far</td>
            <td className="py-1.5 text-right tabular-nums">{naira(letter.paid)}</td>
          </tr>
          <tr className="font-semibold">
            <td className="py-1.5">Please pay now</td>
            <td className="py-1.5 text-right tabular-nums">{naira(owing)}</td>
          </tr>
        </tbody>
      </table>
      <p>
        Please pay as soon as possible, using the payment details on the portal under Fees &amp; billing. If you have already paid, or need to talk about
        your plan, please contact the school office on {school.phone}. The remaining payments in your plan are still due on their dates.
      </p>
      <p>Thank you for your cooperation.</p>
      <div className="pt-6">
        <div className="h-10 w-48 border-b border-slate-400" aria-hidden="true" />
        <p className="mt-1 text-sm">For the Management, Greenfield School</p>
      </div>
    </article>
  );
}
