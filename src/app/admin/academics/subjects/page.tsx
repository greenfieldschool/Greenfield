import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SubjectRow = {
  id: string;
  name: string;
  level: string | null;
  active: boolean;
};

export default async function AdminSubjectsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.from("subjects").select("id, name, level, active").order("name");
  const subjects = (data ?? []) as SubjectRow[];

  async function createSubject(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const levelRaw = String(formData.get("level") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!name) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("subjects").insert({
      name,
      level: levelRaw.length ? levelRaw : null,
      active
    });

    revalidatePath("/admin/academics/subjects");
  }

  async function toggleActive(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "true";

    if (!id) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("subjects").update({ active: !active }).eq("id", id);
    revalidatePath("/admin/academics/subjects");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Academics</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Subjects</h1>
        <p className="mt-2 text-sm text-slate-600">Manage subjects offered by level.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add subject</h2>
        <form action={createSubject} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="name"
              placeholder="Mathematics"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Level (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="level"
              defaultValue=""
            >
              <option value="">(all)</option>
              <option value="creche">creche</option>
              <option value="primary">primary</option>
              <option value="secondary">secondary</option>
            </select>
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
              Create subject
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-6">Name</div>
          <div className="col-span-4">Level</div>
          <div className="col-span-2">Status</div>
        </div>
        <div>
          {subjects.length ? (
            subjects.map((s) => (
              <div key={s.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-6 font-semibold text-slate-900">{s.name}</div>
                <div className="col-span-4 text-slate-700">{s.level ?? "—"}</div>
                <div className="col-span-2">
                  <form action={toggleActive}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="active" value={String(s.active)} />
                    <button className="text-xs font-semibold text-brand-green hover:underline" type="submit">
                      {s.active ? "Active" : "Inactive"}
                    </button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No subjects yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
