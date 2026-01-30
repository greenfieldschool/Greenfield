import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type GuardianRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

export default async function AdminGuardiansPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("guardians")
    .select("id, full_name, email, phone")
    .order("full_name", { ascending: true });

  const guardians = (data ?? []) as GuardianRow[];

  async function createGuardian(formData: FormData) {
    "use server";

    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    if (!fullName) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("guardians").insert({
      full_name: fullName,
      email: email.length ? email : null,
      phone: phone.length ? phone : null
    });

    revalidatePath("/admin/guardians");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Admin</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Guardians</h1>
        <p className="mt-2 text-sm text-slate-600">Manage parents/guardians and link them to students.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add guardian</h2>
        <form action={createGuardian} className="mt-4 grid gap-4 sm:grid-cols-2">
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
          </div>
          <div className="sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create guardian
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-5">Name</div>
          <div className="col-span-4">Email</div>
          <div className="col-span-3">Phone</div>
        </div>
        <div>
          {guardians.length ? (
            guardians.map((g) => (
              <Link
                key={g.id}
                href={`/admin/guardians/${g.id}`}
                className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                <div className="col-span-5 font-semibold text-slate-900">{g.full_name}</div>
                <div className="col-span-4">{g.email ?? "—"}</div>
                <div className="col-span-3">{g.phone ?? "—"}</div>
              </Link>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No guardians yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
