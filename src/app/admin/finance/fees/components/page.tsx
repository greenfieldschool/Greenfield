import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type RevenueCategoryRow = {
  id: string;
  name: string;
};

type ExpenseCategoryRow = {
  id: string;
  name: string;
};

type FeeComponentRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  revenue_categories: RevenueCategoryRow | null;
  expense_categories: ExpenseCategoryRow | null;
};

export default async function AdminFeeComponentsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: revenueCats }, { data: expenseCats }, { data: components }] = await Promise.all([
    supabase.from("revenue_categories").select("id, name").order("name"),
    supabase.from("expense_categories").select("id, name").order("name"),
    supabase
      .from("fee_components")
      .select(
        "id, name, description, active, revenue_categories(id, name), expense_categories(id, name)"
      )
      .order("name")
  ]);

  const revenueCategories = (revenueCats ?? []) as RevenueCategoryRow[];
  const expenseCategories = (expenseCats ?? []) as ExpenseCategoryRow[];
  const feeComponents = (components ?? []) as unknown as FeeComponentRow[];

  async function createComponent(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const revenueCategoryId = String(formData.get("revenue_category_id") ?? "").trim();
    const expenseCategoryId = String(formData.get("expense_category_id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!name) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("fee_components").insert({
      name,
      description: description.length ? description : null,
      revenue_category_id: revenueCategoryId.length ? revenueCategoryId : null,
      expense_category_id: expenseCategoryId.length ? expenseCategoryId : null,
      active
    });

    revalidatePath("/admin/finance/fees/components");
  }

  async function toggleActive(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "true";

    if (!id) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("fee_components").update({ active: !active }).eq("id", id);
    revalidatePath("/admin/finance/fees/components");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Fee components</h1>
        <p className="mt-2 text-sm text-slate-600">
          Define the breakdown items for school fees (Tuition, Books, Transport…) and map them to revenue categories.
          Optional: also map to an expense/budget category (sector).
        </p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/fees">
            Back to fee setup
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add fee component</h2>
        <form action={createComponent} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="name"
              placeholder="Tuition"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Revenue category</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="revenue_category_id"
              defaultValue=""
            >
              <option value="">(optional)</option>
              {revenueCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Budget sector (expense category)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="expense_category_id"
              defaultValue=""
            >
              <option value="">(optional)</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Description</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="description"
              placeholder="(optional)"
            />
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input className="h-4 w-4" name="active" type="checkbox" defaultChecked />
              Active
            </label>
          </div>

          <div className="flex items-end sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create component
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Name</div>
          <div className="col-span-3">Revenue category</div>
          <div className="col-span-3">Budget sector</div>
          <div className="col-span-2">Status</div>
        </div>
        <div>
          {feeComponents.length ? (
            feeComponents.map((c) => (
              <div key={c.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-4 font-semibold text-slate-900">{c.name}</div>
                <div className="col-span-3 text-slate-700">{c.revenue_categories?.name ?? "—"}</div>
                <div className="col-span-3 text-slate-700">{c.expense_categories?.name ?? "—"}</div>
                <div className="col-span-2">
                  <form action={toggleActive}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="active" value={String(c.active)} />
                    <button className="text-xs font-semibold text-brand-green hover:underline" type="submit">
                      {c.active ? "Active" : "Inactive"}
                    </button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No components yet.</div>
          )}
        </div>
      </div>

      <div>
        <a className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/fees">
          Back to fee setup
        </a>
      </div>
    </div>
  );
}
