import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string | null;
  level: string;
  classes: Array<{ id: string; level: string; name: string }>;
  status: string;
  date_of_birth: string | null;
};

export default async function AdminStudentsPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const [{ data }, { data: classesData }] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, first_name, last_name, admission_number, level, class_id, status, date_of_birth, classes(id, level, name)"
      )
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase.from("classes").select("id, level, name, active").eq("active", true).order("level").order("name")
  ]);

  const students = (data ?? []) as unknown as StudentRow[];
  const classOptions = (classesData ?? []) as Array<{ id: string; level: string; name: string }>;

  async function createStudent(formData: FormData) {
    "use server";

    const firstName = String(formData.get("first_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    const admissionNumber = String(formData.get("admission_number") ?? "").trim();
    const level = String(formData.get("level") ?? "").trim();
    const classIdRaw = String(formData.get("class_id") ?? "").trim();
    const status = String(formData.get("status") ?? "applied").trim();
    const dobRaw = String(formData.get("date_of_birth") ?? "").trim();

    if (!firstName || !lastName || !level) {
      return;
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const dateOfBirth = dobRaw.length ? dobRaw : null;
    const classId = classIdRaw.length ? classIdRaw : null;

    await supabase.from("students").insert({
      first_name: firstName,
      last_name: lastName,
      admission_number: admissionNumber.length ? admissionNumber : null,
      level,
      class_id: classId,
      status,
      date_of_birth: dateOfBirth
    });

    revalidatePath("/admin/students");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Admin</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Students</h1>
        <p className="mt-2 text-sm text-slate-600">Manage student records and lifecycle.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add student</h2>
        <form action={createStudent} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">First name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="first_name"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Last name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="last_name"
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Admission number</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="admission_number"
              placeholder="(optional)"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Level</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="level"
              required
              defaultValue="creche"
            >
              <option value="creche">creche</option>
              <option value="primary">primary</option>
              <option value="secondary">secondary</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Class (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="class_id"
              defaultValue=""
            >
              <option value="">(none)</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level} - {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Status</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="status"
              defaultValue="applied"
            >
              <option value="applied">applied</option>
              <option value="enrolled">enrolled</option>
              <option value="active">active</option>
              <option value="graduated">graduated</option>
              <option value="withdrawn">withdrawn</option>
              <option value="transferred">transferred</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Date of birth</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="date_of_birth"
              type="date"
            />
          </div>

          <div className="flex items-end">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create student
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-5">Name</div>
          <div className="col-span-2">Adm no</div>
          <div className="col-span-2">Level</div>
          <div className="col-span-2">Class</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-0">DOB</div>
        </div>
        <div>
          {students.length ? (
            students.map((s) => (
              <Link
                key={s.id}
                href={`/admin/students/${s.id}`}
                className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                <div className="col-span-5 font-semibold text-slate-900">
                  {s.first_name} {s.last_name}
                </div>
                <div className="col-span-2">{s.admission_number ?? "—"}</div>
                <div className="col-span-2">{s.level}</div>
                <div className="col-span-2">{(s.classes ?? [])[0]?.name ?? "—"}</div>
                <div className="col-span-1">{s.status}</div>
                <div className="col-span-0">{s.date_of_birth ?? "—"}</div>
              </Link>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No students yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
