import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type GuardianBalanceRow = {
  guardian_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  outstanding_total: number;
};

function toWhatsAppHref(phone: string, message: string) {
  const digits = phone.replace(/[^0-9+]/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${encodeURIComponent(digits)}?text=${text}`;
}

export default async function AdminFinanceDebtorsPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("finance_guardian_balances")
    .select("guardian_id, full_name, email, phone, outstanding_total")
    .gt("outstanding_total", 0)
    .order("outstanding_total", { ascending: false })
    .limit(200);

  const debtors = (data ?? []) as GuardianBalanceRow[];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Debtors</h1>
        <p className="mt-2 text-sm text-slate-600">Guardians with outstanding balances.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance">
            Back to finance
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
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
