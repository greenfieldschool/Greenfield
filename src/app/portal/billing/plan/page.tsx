import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CalendarClock } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import UrlToast from "@/components/url-toast";
import { PolicyExcerpt } from "@/components/policies/policy-view";
import { POLICIES } from "@/lib/policies";
import { HELP } from "@/lib/portal-help";
import { PLAN_CHOICES, planError, type PreviewRow } from "@/lib/payment-plans";
import { PortalNotice, PortalPageHeader } from "../../_components/portal-ui";
import { PlanChooser } from "./plan-chooser";

// A parent chooses a payment plan for one invoice and agrees by typing their name (school policy "Fees and payment
// plans"). Allowed up to the first day of term; the database checks everything again (create_payment_plan).

const naira = (n: number | string) => `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

async function agreePlan(fd: FormData) {
  "use server";
  const invoice = String(fd.get("invoice_id") ?? "").trim();
  const here = `/portal/billing/plan?invoice=${encodeURIComponent(invoice)}`;
  const fail = (m: string): never => redirect(`${here}&toast=${encodeURIComponent(m)}&toast_type=error`);
  if (String(fd.get("agree") ?? "") !== "yes") fail("Tick the box to agree to the plan.");
  const supabase = getSupabaseServerClient();
  if (!supabase) fail("The school system is not available. Please try again later.");
  const { error } = await supabase!.rpc("create_payment_plan", {
    p_invoice: invoice,
    p_instalments: Number(fd.get("instalments")),
    p_agreed_name: String(fd.get("agreed_name") ?? ""),
    p_policy_version: POLICIES.families.version
  });
  if (error) fail(planError(error.message));
  revalidatePath("/portal/billing");
  redirect(`/portal/billing?toast=${encodeURIComponent("Payment plan agreed. Your payment dates are under the invoice.")}&toast_type=success`);
}

export default async function ChoosePlanPage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const { invoice } = await searchParams;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const back = { href: "/portal/billing", label: "Fees & billing" };
  if (!invoice) return <PortalNotice title="Pay in instalments" message="Choose an invoice on Fees & billing first." back={back} />;

  const [{ data: inv }, { data: existing }] = await Promise.all([
    supabase
      .from("finance_invoice_balances")
      .select("invoice_id, invoice_no, student_id, academic_term_id, balance, invoice_total, status")
      .eq("invoice_id", invoice)
      .maybeSingle(),
    supabase.from("fee_payment_plans").select("id").eq("invoice_id", invoice).eq("status", "active").maybeSingle()
  ]);
  if (!inv) return <PortalNotice title="Pay in instalments" message="We couldn't find that invoice on your account." back={back} />;
  if (existing) return <PortalNotice title="Pay in instalments" heading="You already have a plan" message="Your payment dates are shown under the invoice on Fees & billing." back={back} icon={CalendarClock} />;

  const [{ data: pupil }, { data: term }] = await Promise.all([
    inv.student_id ? supabase.from("students").select("first_name").eq("id", inv.student_id).maybeSingle() : Promise.resolve({ data: null }),
    inv.academic_term_id ? supabase.from("academic_terms").select("name, starts_on").eq("id", inv.academic_term_id).maybeSingle() : Promise.resolve({ data: null })
  ]);
  const starts = (term as { starts_on: string | null } | null)?.starts_on ?? null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  if (!starts || today > starts.slice(0, 10)) {
    return (
      <PortalNotice
        title="Pay in instalments"
        heading="Please contact the school office"
        message="Plans can be chosen here up to the first day of term. The office can still agree a plan with you on paper."
        back={back}
        icon={CalendarClock}
      />
    );
  }

  const previews = await Promise.all(
    PLAN_CHOICES.map(async (n) => {
      const { data, error } = await supabase.rpc("preview_payment_plan", { p_invoice: invoice, p_instalments: n });
      return { n, rows: (data ?? []) as PreviewRow[], error: error ? planError(error.message) : null };
    })
  );
  const err = previews.find((p) => p.error)?.error;
  const total = Number(inv.invoice_total ?? 0);
  const fee = Math.max(2500, Math.round(total * 0.03 * 100) / 100);
  const child = (pupil as { first_name: string } | null)?.first_name;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PortalPageHeader
        back={back}
        help={HELP.paymentPlans}
        title="Pay in instalments"
        description={`${child ? `${child}'s fees` : "Fees"}${term ? `, ${(term as { name: string }).name} term` : ""}: ${naira(total)} (invoice ${inv.invoice_no ?? ""}).`}
      />
      <div className="flex flex-wrap gap-x-5">
        <PolicyExcerpt policy="families" section="payment-plans" portal />
        <PolicyExcerpt policy="families" section="late-payment" portal />
      </div>

      {err ? (
        <Alert tone="warning">{err}</Alert>
      ) : (
        <PlanChooser action={agreePlan} invoiceId={invoice} previews={previews} fee={fee} />
      )}
    </div>
  );
}
