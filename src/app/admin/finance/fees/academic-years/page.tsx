import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type AcademicYearRow = {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
};

type AcademicTermRow = {
  id: string;
  academic_year_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  academic_years?: { id: string; name: string } | null;
};

export default async function AdminAcademicYearsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: yearsData }, { data: termsData }] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id, name, starts_on, ends_on, is_active")
      .order("starts_on", { ascending: false })
      .order("name", { ascending: false }),
    supabase
      .from("academic_terms")
      .select("id, academic_year_id, name, starts_on, ends_on, is_active, academic_years(id, name)")
      .order("starts_on", { ascending: false })
      .order("name", { ascending: true })
      .limit(500)
  ]);

  const years = (yearsData ?? []) as AcademicYearRow[];
  const terms = (termsData ?? []) as unknown as AcademicTermRow[];

  async function createYear(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const startsOn = String(formData.get("starts_on") ?? "").trim();
    const endsOn = String(formData.get("ends_on") ?? "").trim();
    const isActive = String(formData.get("is_active") ?? "").trim() === "on";

    if (!name) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    if (isActive) {
      await supabase.from("academic_years").update({ is_active: false }).eq("is_active", true);
    }

    await supabase.from("academic_years").insert({
      name,
      starts_on: startsOn.length ? startsOn : null,
      ends_on: endsOn.length ? endsOn : null,
      is_active: isActive
    });

    revalidatePath("/admin/finance/fees/academic-years");
  }

  async function toggleYearActive(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "true";

    if (!id) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    if (!active) {
      await supabase.from("academic_years").update({ is_active: false }).eq("is_active", true);
      await supabase.from("academic_years").update({ is_active: true }).eq("id", id);
    } else {
      await supabase.from("academic_years").update({ is_active: false }).eq("id", id);
    }

    revalidatePath("/admin/finance/fees/academic-years");
  }

  async function createTerm(formData: FormData) {
    "use server";

    const academicYearId = String(formData.get("academic_year_id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const startsOn = String(formData.get("starts_on") ?? "").trim();
    const endsOn = String(formData.get("ends_on") ?? "").trim();
    const isActive = String(formData.get("is_active") ?? "").trim() === "on";

    if (!academicYearId || !name) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    if (isActive) {
      await supabase
        .from("academic_terms")
        .update({ is_active: false })
        .eq("academic_year_id", academicYearId)
        .eq("is_active", true);
    }

    await supabase.from("academic_terms").insert({
      academic_year_id: academicYearId,
      name,
      starts_on: startsOn.length ? startsOn : null,
      ends_on: endsOn.length ? endsOn : null,
      is_active: isActive
    });

    revalidatePath("/admin/finance/fees/academic-years");
  }

  async function toggleTermActive(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const academicYearId = String(formData.get("academic_year_id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "true";

    if (!id || !academicYearId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    if (!active) {
      await supabase
        .from("academic_terms")
        .update({ is_active: false })
        .eq("academic_year_id", academicYearId)
        .eq("is_active", true);
      await supabase.from("academic_terms").update({ is_active: true }).eq("id", id);
    } else {
      await supabase.from("academic_terms").update({ is_active: false }).eq("id", id);
    }

    revalidatePath("/admin/finance/fees/academic-years");
  }

  const activeYearId = years.find((y) => y.is_active)?.id ?? "";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Academic years & terms</h1>
        <p className="mt-2 text-sm text-slate-600">Define academic calendars used across exams, attendance, invoices, and fees.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add academic year</h2>
          <form action={createYear} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-900">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="name"
                placeholder="2025/2026"
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Starts on</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="starts_on"
                type="date"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Ends on</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="ends_on"
                type="date"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input className="h-4 w-4" name="is_active" type="checkbox" />
                Set as active
              </label>
            </div>
            <div className="flex items-end sm:col-span-2">
              <button
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                type="submit"
              >
                Create academic year
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add academic term</h2>
          <form action={createTerm} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-900">Academic year</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="academic_year_id"
                defaultValue={activeYearId}
                required
              >
                <option value="" disabled>
                  Select year
                </option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-slate-900">Term name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="name"
                placeholder="Term 1"
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Starts on</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="starts_on"
                type="date"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Ends on</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="ends_on"
                type="date"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input className="h-4 w-4" name="is_active" type="checkbox" />
                Set as active for selected year
              </label>
            </div>
            <div className="flex items-end sm:col-span-2">
              <button
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                type="submit"
              >
                Create academic term
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Academic year</div>
          <div className="col-span-3">Starts</div>
          <div className="col-span-3">Ends</div>
          <div className="col-span-2">Active</div>
        </div>
        <div>
          {years.length ? (
            years.map((y) => (
              <div key={y.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-4 font-semibold text-slate-900">{y.name}</div>
                <div className="col-span-3 text-slate-700">{y.starts_on ?? "—"}</div>
                <div className="col-span-3 text-slate-700">{y.ends_on ?? "—"}</div>
                <div className="col-span-2">
                  <form action={toggleYearActive}>
                    <input type="hidden" name="id" value={y.id} />
                    <input type="hidden" name="active" value={String(y.is_active)} />
                    <button className="text-xs font-semibold text-brand-green hover:underline" type="submit">
                      {y.is_active ? "Active" : "Set active"}
                    </button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No academic years yet.</div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-3">Year</div>
          <div className="col-span-3">Term</div>
          <div className="col-span-2">Starts</div>
          <div className="col-span-2">Ends</div>
          <div className="col-span-2">Active</div>
        </div>
        <div>
          {terms.length ? (
            terms.map((t) => (
              <div key={t.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-3 font-semibold text-slate-900">{t.academic_years?.name ?? "—"}</div>
                <div className="col-span-3 text-slate-700">{t.name}</div>
                <div className="col-span-2 text-slate-700">{t.starts_on ?? "—"}</div>
                <div className="col-span-2 text-slate-700">{t.ends_on ?? "—"}</div>
                <div className="col-span-2">
                  <form action={toggleTermActive}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="academic_year_id" value={t.academic_year_id} />
                    <input type="hidden" name="active" value={String(t.is_active)} />
                    <button className="text-xs font-semibold text-brand-green hover:underline" type="submit">
                      {t.is_active ? "Active" : "Set active"}
                    </button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No academic terms yet.</div>
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
