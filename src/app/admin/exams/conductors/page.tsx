import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ProfileRow = { id: string; email: string | null; full_name: string | null };

type ConductorRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
};

type ConductorLinkRow = { conductor_id: string; user_id: string };

export default async function AdminExamConductorsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: conductorsData }, { data: profilesData }, { data: linksData }] = await Promise.all([
    supabase.from("exam_conductors").select("id, full_name, email, phone, active").order("full_name"),
    supabase.from("profiles").select("id, email, full_name").order("updated_at", { ascending: false }).limit(200),
    supabase.from("exam_conductor_user_links").select("conductor_id, user_id")
  ]);

  const conductors = (conductorsData ?? []) as ConductorRow[];
  const profiles = (profilesData ?? []) as ProfileRow[];
  const links = (linksData ?? []) as ConductorLinkRow[];

  const userById = new Map(profiles.map((p) => [p.id, p] as const));
  const userIdByConductorId = new Map(links.map((l) => [l.conductor_id, l.user_id] as const));

  async function createConductor(formData: FormData) {
    "use server";

    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!fullName) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("exam_conductors").insert({
      full_name: fullName,
      email: email.length ? email : null,
      phone: phone.length ? phone : null,
      active
    });

    revalidatePath("/admin/exams/conductors");
  }

  async function linkUser(formData: FormData) {
    "use server";

    const conductorId = String(formData.get("conductor_id") ?? "").trim();
    const userId = String(formData.get("user_id") ?? "").trim();

    if (!conductorId || !userId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("exam_conductor_user_links")
      .upsert({ conductor_id: conductorId, user_id: userId }, { onConflict: "user_id" });

    revalidatePath("/admin/exams/conductors");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Conductors</h1>
        <p className="mt-2 text-sm text-slate-600">Create conductors and link them to auth user accounts.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/exams">
            Back to exams
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New conductor</h2>
        <form action={createConductor} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Full name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="full_name"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Email</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="email"
              type="email"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Phone</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="phone"
              type="tel"
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
              Create conductor
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        {conductors.length ? (
          conductors.map((c) => {
            const linkedUserId = userIdByConductorId.get(c.id) ?? "";
            const linkedUser = linkedUserId.length ? userById.get(linkedUserId) ?? null : null;

            return (
              <div key={c.id} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Conductor</div>
                    <div className="mt-1 text-base font-semibold text-slate-900">{c.full_name}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {c.email ?? "—"} {c.phone ? ` • ${c.phone}` : ""}
                    </div>
                  </div>

                  <div className="grid w-full gap-2 lg:w-[420px]">
                    <div className="text-xs font-semibold text-slate-500">Linked user</div>
                    <div className="text-sm font-semibold text-slate-900">{linkedUser?.email ?? "—"}</div>
                    <form action={linkUser} className="mt-2 grid gap-2">
                      <input type="hidden" name="conductor_id" value={c.id} />
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                        name="user_id"
                        defaultValue={linkedUserId}
                      >
                        <option value="">Select user</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.email ?? p.id}
                          </option>
                        ))}
                      </select>
                      <button
                        className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
                        type="submit"
                      >
                        Link
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
            No conductors yet.
          </div>
        )}
      </div>
    </div>
  );
}
