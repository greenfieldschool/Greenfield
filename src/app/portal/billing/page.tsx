import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import CopyReferenceButton from "./CopyReferenceButton";

type InvoiceBalanceRow = {
  invoice_id: string;
  invoice_no: string | null;
  issue_date: string;
  due_date: string | null;
  status: string;
  currency: string;
  invoice_total: number;
  allocated_total: number;
  balance: number;
};

type IntentRow = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};

type PaymentRow = {
  id: string;
  paid_at: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  provider: string | null;
  reference: string | null;
};

function asMoney(n: number) {
  return Number(n ?? 0).toLocaleString();
}

export default async function PortalBillingPage({
  searchParams
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as string | null | undefined;

  if (role !== "parent") {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Billing</h1>
        <p className="mt-2 text-sm text-slate-600">Billing is available for parent/guardian accounts.</p>
      </div>
    );
  }

  const { data: guardianLink } = await supabase
    .from("guardian_user_links")
    .select("guardian_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const guardianId = guardianLink?.guardian_id as string | undefined;

  if (!guardianId) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Billing</h1>
        <p className="mt-2 text-sm text-slate-600">No guardian record is linked to your account yet.</p>
      </div>
    );
  }

  const { data } = await supabase
    .from("finance_invoice_balances")
    .select("invoice_id, invoice_no, issue_date, due_date, status, currency, invoice_total, allocated_total, balance")
    .eq("bill_to_guardian_id", guardianId)
    .order("issue_date", { ascending: false })
    .limit(200);

  const invoices = (data ?? []) as InvoiceBalanceRow[];

  async function payNow(formData: FormData) {
    "use server";

    const invoiceId = String(formData.get("invoice_id") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").trim() || "0");
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";

    if (!invoiceId) return;
    if (!Number.isFinite(amount) || amount <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: guardianLink } = await supabase
      .from("guardian_user_links")
      .select("guardian_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const guardianId = guardianLink?.guardian_id as string | undefined;
    if (!guardianId) return;

    const reference = globalThis.crypto?.randomUUID
      ? `MP-${globalThis.crypto.randomUUID()}`
      : `MP-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const { error } = await supabase.from("finance_payment_intents").insert({
      provider: "moniepoint",
      reference,
      invoice_id: invoiceId,
      guardian_id: guardianId,
      amount,
      currency,
      status: "created"
    });

    if (error) return;

    revalidatePath("/portal/billing");

    redirect(`/portal/billing?ref=${encodeURIComponent(reference)}`);
  }

  const { data: recentIntents } = await supabase
    .from("finance_payment_intents")
    .select("id, reference, amount, currency, status, created_at")
    .eq("provider", "moniepoint")
    .eq("guardian_id", guardianId)
    .order("created_at", { ascending: false })
    .limit(20);

  const intentRows = (recentIntents ?? []) as IntentRow[];

  const { data: payments } = await supabase
    .from("finance_payment_transactions")
    .select("id, paid_at, amount, currency, status, method, provider, reference")
    .eq("guardian_id", guardianId)
    .order("paid_at", { ascending: false })
    .limit(50);

  const paymentRows = (payments ?? []) as PaymentRow[];

  const createdIntent = ref
    ? intentRows.find((r) => r.reference === ref) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Billing</h1>
        <p className="mt-2 text-sm text-slate-600">View your invoices and generate a Moniepoint payment reference.</p>
      </div>

      {ref ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Payment reference created</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{ref}</div>
          <p className="mt-2 text-sm text-slate-600">
            Use this as your Moniepoint <span className="font-semibold">merchantReference</span>.
            {createdIntent ? (
              <>
                {" "}
                Amount: {createdIntent.currency} {asMoney(createdIntent.amount)}.
              </>
            ) : null}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <CopyReferenceButton value={ref} />
            <Link className="text-xs font-semibold text-brand-green hover:underline" href="/portal/billing">
              Clear
            </Link>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Invoice</div>
          <div className="col-span-2">Issued</div>
          <div className="col-span-2">Due</div>
          <div className="col-span-2 text-right">Balance</div>
          <div className="col-span-2">Pay</div>
        </div>
        <div>
          {invoices.length ? (
            invoices.map((inv) => (
              <div
                key={inv.invoice_id}
                className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700"
              >
                <div className="col-span-4">
                  <div className="font-semibold text-slate-900">{inv.invoice_no ?? inv.invoice_id}</div>
                  <div className="mt-1 text-xs text-slate-600">{inv.status}</div>
                </div>
                <div className="col-span-2">{inv.issue_date}</div>
                <div className="col-span-2">{inv.due_date ?? "—"}</div>
                <div className="col-span-2 text-right font-semibold text-slate-900">
                  {inv.currency} {asMoney(inv.balance)}
                </div>
                <div className="col-span-2">
                  {inv.balance > 0 ? (
                    <form action={payNow}>
                      <input type="hidden" name="invoice_id" value={inv.invoice_id} />
                      <input type="hidden" name="amount" value={String(inv.balance)} />
                      <input type="hidden" name="currency" value={inv.currency} />
                      <button
                        className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
                        type="submit"
                      >
                        Pay now
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-500">Paid</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No invoices yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Payment history</h2>
        <p className="mt-1 text-sm text-slate-600">Your posted payments recorded against your account.</p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
            <div className="col-span-3">Date</div>
            <div className="col-span-3">Method</div>
            <div className="col-span-3">Reference</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Amount</div>
          </div>
          {paymentRows.length ? (
            paymentRows.map((p) => (
              <div key={p.id} className="grid grid-cols-12 border-t border-slate-200 px-4 py-3 text-sm">
                <div className="col-span-3 text-slate-700">{String(p.paid_at).slice(0, 10)}</div>
                <div className="col-span-3 text-slate-700">{p.method ?? p.provider ?? "—"}</div>
                <div className="col-span-3 font-semibold text-slate-900">{p.reference ?? "—"}</div>
                <div className="col-span-1 text-slate-700">{p.status}</div>
                <div className="col-span-2 text-right text-slate-700">
                  {p.currency} {asMoney(p.amount)}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-4 text-sm text-slate-600">No payments yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recent Moniepoint references</h2>
        <p className="mt-1 text-sm text-slate-600">
          These references are created when you click Pay now. The reference must be used as the Moniepoint
          <span className="font-semibold"> merchantReference</span>.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
            <div className="col-span-7">Reference</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3 text-right">Amount</div>
          </div>
          {intentRows.length ? (
            intentRows.map((pi) => (
              <div key={pi.id} className="grid grid-cols-12 border-t border-slate-200 px-4 py-3 text-sm">
                <div className="col-span-7 font-semibold text-slate-900">{pi.reference}</div>
                <div className="col-span-2 text-slate-700">{pi.status}</div>
                <div className="col-span-3 text-right text-slate-700">
                  {pi.currency} {asMoney(pi.amount)}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-4 text-sm text-slate-600">No references yet.</div>
          )}
        </div>

        <div className="mt-4 text-xs text-slate-500">
          If you want a true redirect-to-checkout experience, we’ll add the Moniepoint “initiate payment” call next and
          store the returned `checkout_url` in `finance_payment_intents`.
        </div>

        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/portal">
            Back to portal
          </Link>
        </div>
      </div>
    </div>
  );
}
