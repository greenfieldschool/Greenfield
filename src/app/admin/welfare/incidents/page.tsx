import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentRow = { id: string; first_name: string; last_name: string; class_id: string | null };
type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type IncidentRow = {
  id: string;
  student_id: string;
  incident_type: string;
  description: string;
  severity: number;
  resolved: boolean;
  occurred_at: string;
};

export default async function AdminWelfareIncidentsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: studentsData }, { data: years }, { data: terms }, { data: incidents }] = await Promise.all([
    supabase
      .from("students")
      .select("id, first_name, last_name, class_id")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(500),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false }),
    supabase
      .from("welfare_incidents")
      .select("id, student_id, incident_type, description, severity, resolved, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(200)
  ]);

  const students = (studentsData ?? []) as StudentRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const incidentRows = (incidents ?? []) as IncidentRow[];

  const studentById = new Map(students.map((s) => [s.id, s] as const));

  async function createIncident(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const incidentType = String(formData.get("incident_type") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const severity = Number(String(formData.get("severity") ?? "1").trim() || "1");

    if (!studentId || !incidentType || !description) return;
    if (!Number.isFinite(severity) || severity < 1 || severity > 5) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("welfare_incidents").insert({
      student_id: studentId,
      academic_year_id: yearIdRaw.length ? yearIdRaw : null,
      academic_term_id: termIdRaw.length ? termIdRaw : null,
      incident_type: incidentType,
      description,
      severity
    });

    revalidatePath("/admin/welfare/incidents");
  }

  async function toggleResolved(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const resolved = String(formData.get("resolved") ?? "").trim() === "true";
    if (!id) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("welfare_incidents").update({ resolved: !resolved }).eq("id", id);
    revalidatePath("/admin/welfare/incidents");
  }

  async function deleteIncident(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("welfare_incidents").delete().eq("id", id);
    revalidatePath("/admin/welfare/incidents");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Welfare</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Incidents / Health</h1>
        <p className="mt-2 text-sm text-slate-600">Record welfare incidents and health notes.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New incident</h2>
        <form action={createIncident} className="mt-4 grid gap-4 sm:grid-cols-2">
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
            <label className="text-sm font-semibold text-slate-900">Incident type</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="incident_type"
              placeholder="Sickness, Injury, Misconduct..."
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
              Create incident
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Student</div>
          <div className="col-span-3">Type</div>
          <div className="col-span-1">Sev</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1">Delete</div>
        </div>
        <div>
          {incidentRows.length ? (
            incidentRows.map((i) => {
              const s = studentById.get(i.student_id) ?? null;
              return (
                <div key={i.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                  <div className="col-span-4 font-semibold text-slate-900">
                    {s ? `${s.first_name} ${s.last_name}` : i.student_id}
                  </div>
                  <div className="col-span-3 text-slate-700">{i.incident_type}</div>
                  <div className="col-span-1 text-slate-700">{i.severity}</div>
                  <div className="col-span-2 text-slate-700">{String(i.occurred_at).slice(0, 10)}</div>
                  <div className="col-span-1">
                    <form action={toggleResolved}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="resolved" value={String(i.resolved)} />
                      <button className="text-xs font-semibold text-brand-green hover:underline" type="submit">
                        {i.resolved ? "Resolved" : "Open"}
                      </button>
                    </form>
                  </div>
                  <div className="col-span-1">
                    <form action={deleteIncident}>
                      <input type="hidden" name="id" value={i.id} />
                      <button className="text-xs font-semibold text-red-600 hover:underline" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No incidents yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
