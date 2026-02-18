import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string; academic_year_id: string };
type ClassRow = { id: string; level: string; name: string; active: boolean };

type ScheduleRow = {
  id: string;
  name: string;
  currency: string;
  active: boolean;
  academic_years: YearRow;
  academic_terms: TermRow | null;
  classes: ClassRow;
};

export default async function AdminFeeSchedulesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: years }, { data: terms }, { data: classes }, { data: schedules }] = await Promise.all([
    supabase.from("academic_years").select("id, name").order("starts_on", { ascending: false }),
    supabase.from("academic_terms").select("id, name, academic_year_id").order("starts_on", { ascending: false }),
    supabase.from("classes").select("id, level, name, active").eq("active", true).order("level").order("name"),
    supabase
      .from("fee_schedules")
      .select(
        "id, name, currency, active, academic_years(id, name), academic_terms(id, name, academic_year_id), classes(id, level, name, active)"
      )
      .order("created_at", { ascending: false })
      .limit(200)
  ]);

  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const classRows = (classes ?? []) as ClassRow[];
  const scheduleRows = (schedules ?? []) as unknown as ScheduleRow[];

  async function createSchedule(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const academicYearId = String(formData.get("academic_year_id") ?? "").trim();
    const academicTermIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!name || !academicYearId || !classId) return;

    const academicTermId = academicTermIdRaw.length ? academicTermIdRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("fee_schedules").insert({
      name,
      academic_year_id: academicYearId,
      academic_term_id: academicTermId,
      class_id: classId,
      currency,
      active
    });

    revalidatePath("/admin/finance/fees/schedules");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Fee schedules</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create schedules for a specific class, either per-term (choose a term) or annual (leave term blank).
        </p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/fees">
            Back to fee setup
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create schedule</h2>
        <form action={createSchedule} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="name"
              placeholder="2026 Term 1 - Year 1 Fees"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Academic year</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_year_id"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select year
              </option>
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
              <option value="">(annual)</option>
              {termRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Class</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="class_id"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select class
              </option>
              {classRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level} - {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Currency</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="currency"
              defaultValue="NGN"
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
              Create schedule
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-6">Schedule</div>
          <div className="col-span-3">Class</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-1">Open</div>
        </div>
        <div>
          {scheduleRows.length ? (
            scheduleRows.map((s) => (
              <div key={s.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-6">
                  <div className="font-semibold text-slate-900">{s.name}</div>
                  <div className="mt-1 text-xs text-slate-600">{s.academic_years?.name}</div>
                </div>
                <div className="col-span-3 text-slate-700">
                  {s.classes?.level} - {s.classes?.name}
                </div>
                <div className="col-span-2 text-slate-700">{s.academic_terms ? "Term" : "Annual"}</div>
                <div className="col-span-1">
                  <Link className="text-xs font-semibold text-brand-green hover:underline" href={`/admin/finance/fees/schedules/${s.id}`}>
                    Open
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No schedules yet.</div>
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
