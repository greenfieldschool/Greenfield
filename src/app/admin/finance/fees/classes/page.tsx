import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ClassRow = {
  id: string;
  level: string;
  name: string;
  active: boolean;
};

export default async function AdminFeeClassesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.from("classes").select("id, level, name, active").order("level").order("name");
  const classes = (data ?? []) as ClassRow[];

  async function createClass(formData: FormData) {
    "use server";

    const level = String(formData.get("level") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!level || !name) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("classes").insert({ level, name, active });
    revalidatePath("/admin/finance/fees/classes");
  }

  async function toggleActive(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "true";

    if (!id) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("classes").update({ active: !active }).eq("id", id);
    revalidatePath("/admin/finance/fees/classes");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Classes</h1>
        <p className="mt-2 text-sm text-slate-600">Create class names like Year 1…5, JSS1…SS3, Creche, Nursery.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add class</h2>
        <form action={createClass} className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-sm font-semibold text-slate-900">Level</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="level"
              required
              defaultValue="primary"
            >
              <option value="creche">creche</option>
              <option value="primary">primary</option>
              <option value="secondary">secondary</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Class name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="name"
              placeholder="Year 1"
              required
            />
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input className="h-4 w-4" name="active" type="checkbox" defaultChecked />
              Active
            </label>
          </div>

          <div className="flex items-end sm:col-span-3">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create class
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-3">Level</div>
          <div className="col-span-7">Name</div>
          <div className="col-span-2">Status</div>
        </div>
        <div>
          {classes.length ? (
            classes.map((c) => (
              <div key={c.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-3 text-slate-700">{c.level}</div>
                <div className="col-span-7 font-semibold text-slate-900">{c.name}</div>
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
            <div className="px-6 py-8 text-sm text-slate-600">No classes yet.</div>
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
