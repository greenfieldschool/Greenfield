import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ExpenseCategoryRow = {
  id: string;
  name: string;
  description: string | null;
};

export default async function AdminBudgetSectorsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.from("expense_categories").select("id, name, description").order("name");
  const sectors = (data ?? []) as ExpenseCategoryRow[];

  async function createSector(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!name) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("expense_categories").insert({
      name,
      description: description.length ? description : null
    });

    revalidatePath("/admin/finance/fees/budget-sectors");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Budget sectors</h1>
        <p className="mt-2 text-sm text-slate-600">
          Define budget sectors (expense categories) used to categorize expenses and optionally link fee components to a
          sector.
        </p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/fees">
            Back to fee setup
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add sector</h2>
        <form action={createSector} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="name"
              placeholder="Staff salaries"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Description</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="description"
              placeholder="(optional)"
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create sector
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Name</div>
          <div className="col-span-8">Description</div>
        </div>
        <div>
          {sectors.length ? (
            sectors.map((c) => (
              <div key={c.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-4 font-semibold text-slate-900">{c.name}</div>
                <div className="col-span-8 text-slate-700">{c.description ?? "—"}</div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No sectors yet.</div>
          )}
        </div>
      </div>

      <div>
        <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/fees">
          Back to fee setup
        </Link>
      </div>
    </div>
  );
}
