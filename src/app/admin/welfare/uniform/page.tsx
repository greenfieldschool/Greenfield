import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentRow = { id: string; first_name: string; last_name: string };
type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type UniformRow = {
  id: string;
  student_id: string;
  date: string;
  ok: boolean;
  notes: string | null;
};

export default async function AdminWelfareUniformPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: studentsData }, { data: years }, { data: terms }, { data: checks }] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, last_name")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(500),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false }),
    supabase
      .from("student_uniform_checks")
      .select("id, student_id, date, ok, notes")
      .order("date", { ascending: false })
      .limit(200)
  ]);

  const students = (studentsData ?? []) as StudentRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const uniformRows = (checks ?? []) as UniformRow[];

  const studentById = new Map(students.map((s) => [s.id, s] as const));

  async function upsertCheck(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const date = String(formData.get("date") ?? "").trim();
    const ok = String(formData.get("ok") ?? "").trim() === "true";
    const notes = String(formData.get("notes") ?? "").trim();

    if (!studentId || !date) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("student_uniform_checks")
      .upsert(
        {
          student_id: studentId,
          academic_year_id: yearIdRaw.length ? yearIdRaw : null,
          academic_term_id: termIdRaw.length ? termIdRaw : null,
          date,
          ok,
          notes: notes.length ? notes : null
        },
        { onConflict: "student_id,date" }
      );

    revalidatePath("/admin/welfare/uniform");
  }

  async function deleteCheck(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("student_uniform_checks").delete().eq("id", id);
    revalidatePath("/admin/welfare/uniform");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Welfare</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Uniform checks</h1>
        <p className="mt-2 text-sm text-slate-600">Record dressing/uniform compliance.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New check</h2>
        <form action={upsertCheck} className="mt-4 grid gap-4 sm:grid-cols-2">
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
            <label className="text-sm font-semibold text-slate-900">Date</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="date"
              type="date"
              required
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
          <div>
            <label className="text-sm font-semibold text-slate-900">OK?</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="ok"
              defaultValue="true"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Notes (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="notes"
              placeholder="(optional)"
            />
          </div>

          <div className="flex items-end sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Save check
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Student</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-2">OK</div>
          <div className="col-span-3">Notes</div>
          <div className="col-span-1">Delete</div>
        </div>
        <div>
          {uniformRows.length ? (
            uniformRows.map((u) => {
              const s = studentById.get(u.student_id) ?? null;
              return (
                <div key={u.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                  <div className="col-span-4 font-semibold text-slate-900">
                    {s ? `${s.first_name} ${s.last_name}` : u.student_id}
                  </div>
                  <div className="col-span-2 text-slate-700">{u.date}</div>
                  <div className="col-span-2 text-slate-700">{u.ok ? "Yes" : "No"}</div>
                  <div className="col-span-3 text-slate-700 truncate" title={u.notes ?? ""}>
                    {u.notes ?? "—"}
                  </div>
                  <div className="col-span-1">
                    <form action={deleteCheck}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-xs font-semibold text-red-600 hover:underline" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No uniform checks yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
