import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentRow = { id: string; first_name: string; last_name: string };
type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type DisciplineRow = {
  id: string;
  student_id: string;
  category: string | null;
  description: string;
  severity: number;
  occurred_at: string;
};

export default async function AdminWelfareDisciplinePage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: studentsData }, { data: years }, { data: terms }, { data: records }] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, last_name")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(500),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false }),
    supabase
      .from("welfare_discipline_records")
      .select("id, student_id, category, description, severity, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(200)
  ]);

  const students = (studentsData ?? []) as StudentRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const disciplineRows = (records ?? []) as DisciplineRow[];

  const studentById = new Map(students.map((s) => [s.id, s] as const));

  async function createRecord(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const severity = Number(String(formData.get("severity") ?? "1").trim() || "1");

    if (!studentId || !description) return;
    if (!Number.isFinite(severity) || severity < 1 || severity > 5) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("welfare_discipline_records").insert({
      student_id: studentId,
      academic_year_id: yearIdRaw.length ? yearIdRaw : null,
      academic_term_id: termIdRaw.length ? termIdRaw : null,
      category: category.length ? category : null,
      description,
      severity
    });

    revalidatePath("/admin/welfare/discipline");
  }

  async function deleteRecord(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("welfare_discipline_records").delete().eq("id", id);
    revalidatePath("/admin/welfare/discipline");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Welfare</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Discipline</h1>
        <p className="mt-2 text-sm text-slate-600">Record discipline cases and sanctions.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New record</h2>
        <form action={createRecord} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Student</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="student_id"
              defaultValue=""
              required
            >
              <option value="">Select student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Category (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="category"
              placeholder="Late-coming, Fighting..."
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
            <label className="text-sm font-semibold text-slate-900">Description</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="description"
              rows={4}
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Severity (1-5)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="severity"
              type="number"
              min={1}
              max={5}
              defaultValue={1}
              required
            />
          </div>

          <div className="flex items-end">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create record
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Student</div>
          <div className="col-span-3">Category</div>
          <div className="col-span-1">Sev</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-1">Notes</div>
          <div className="col-span-1">Delete</div>
        </div>
        <div>
          {disciplineRows.length ? (
            disciplineRows.map((r) => {
              const s = studentById.get(r.student_id) ?? null;
              return (
                <div key={r.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                  <div className="col-span-4 font-semibold text-slate-900">
                    {s ? `${s.first_name} ${s.last_name}` : r.student_id}
                  </div>
                  <div className="col-span-3 text-slate-700">{r.category ?? "—"}</div>
                  <div className="col-span-1 text-slate-700">{r.severity}</div>
                  <div className="col-span-2 text-slate-700">{String(r.occurred_at).slice(0, 10)}</div>
                  <div className="col-span-1 text-slate-700 truncate" title={r.description}>
                    {r.description}
                  </div>
                  <div className="col-span-1">
                    <form action={deleteRecord}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs font-semibold text-red-600 hover:underline" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No discipline records yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
