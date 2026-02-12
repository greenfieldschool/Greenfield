import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CategoryRow = { id: string; name: string };

type YearRow = { id: string; name: string };

type TermRow = { id: string; name: string };

export default async function AdminNewExpensePage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: categories }, { data: years }, { data: terms }] = await Promise.all([
    supabase.from("expense_categories").select("id, name").order("name", { ascending: true }),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false })
  ]);

  const categoryRows = (categories ?? []) as CategoryRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];

  async function createExpense(formData: FormData) {
    "use server";

    const categoryIdRaw = String(formData.get("category_id") ?? "").trim();
    const vendorName = String(formData.get("vendor_name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").trim() || "0");
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";
    const method = String(formData.get("method") ?? "").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const spentAtRaw = String(formData.get("spent_at") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();

    if (!Number.isFinite(amount) || amount <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("finance_expenses").insert({
      category_id: categoryIdRaw.length ? categoryIdRaw : null,
      vendor_name: vendorName.length ? vendorName : null,
      description: description.length ? description : null,
      amount,
      currency,
      method: method.length ? method : null,
      reference: reference.length ? reference : null,
      spent_at: spentAtRaw.length ? new Date(spentAtRaw).toISOString() : undefined,
      academic_year_id: yearIdRaw.length ? yearIdRaw : null,
      academic_term_id: termIdRaw.length ? termIdRaw : null
    });

    revalidatePath("/admin/finance/expenses");
    redirect("/admin/finance/expenses");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">New expense</h1>
        <p className="mt-2 text-sm text-slate-600">Record a school expense.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/expenses">
            Back to expenses
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <form action={createExpense} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Category (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="category_id"
              defaultValue=""
            >
              <option value="">—</option>
              {categoryRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Vendor (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="vendor_name"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Description (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="description"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Amount</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="amount"
              defaultValue="0"
              required
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Currency</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="currency"
              defaultValue="NGN"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Method (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="method"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Reference (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="reference"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Spent at (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="spent_at"
              type="datetime-local"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Academic year (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_year_id"
              defaultValue=""
            >
              <option value="">—</option>
              {yearRows.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Academic term (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_term_id"
              defaultValue=""
            >
              <option value="">—</option>
              {termRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
