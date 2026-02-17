import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ClassRow = { id: string; level: string; name: string };
type StudentRow = { id: string; first_name: string; last_name: string; class_id: string | null };

type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type AttendanceRow = { student_id: string; date: string; status: string };

const statuses = ["present", "absent", "late", "excused"] as const;

export default async function AdminWelfareAttendancePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: classes }, { data: years }, { data: terms }] = await Promise.all([
    supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false })
  ]);

  const classRows = (classes ?? []) as ClassRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];

  const sp = (await searchParams) ?? {};
  const classIdRaw = sp.class_id;
  const dateRaw = sp.date;
  const academicYearIdRaw = sp.academic_year_id;
  const academicTermIdRaw = sp.academic_term_id;

  const selectedClassId = Array.isArray(classIdRaw) ? (classIdRaw[0] ?? "") : (classIdRaw ?? "");
  const selectedDate = Array.isArray(dateRaw) ? (dateRaw[0] ?? "") : (dateRaw ?? "");
  const selectedYearId = Array.isArray(academicYearIdRaw)
    ? (academicYearIdRaw[0] ?? "")
    : (academicYearIdRaw ?? "");
  const selectedTermId = Array.isArray(academicTermIdRaw)
    ? (academicTermIdRaw[0] ?? "")
    : (academicTermIdRaw ?? "");

  const effectiveClassId = selectedClassId.length ? selectedClassId : classRows[0]?.id ?? "";

  const [{ data: studentsData }, { data: attendanceData }] = await Promise.all([
    effectiveClassId
      ? supabase
          .from("students")
          .select("id, first_name, last_name, class_id")
          .eq("class_id", effectiveClassId)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    effectiveClassId && selectedDate.length
      ? supabase
          .from("student_attendance")
          .select("student_id, date, status")
          .eq("class_id", effectiveClassId)
          .eq("date", selectedDate)
      : Promise.resolve({ data: [] as unknown[] })
  ]);

  const students = (studentsData ?? []) as StudentRow[];
  const attendanceRows = (attendanceData ?? []) as AttendanceRow[];
  const statusByStudentId = new Map(attendanceRows.map((r) => [r.student_id, r.status] as const));

  async function markAttendance(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const date = String(formData.get("date") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    if (!studentId || !date || !status) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("student_attendance")
      .upsert(
        {
          student_id: studentId,
          class_id: classId.length ? classId : null,
          academic_year_id: yearIdRaw.length ? yearIdRaw : null,
          academic_term_id: termIdRaw.length ? termIdRaw : null,
          date,
          status
        },
        { onConflict: "student_id,date" }
      );

    revalidatePath("/admin/welfare/attendance");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Welfare</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Attendance</h1>
        <p className="mt-2 text-sm text-slate-600">Attendance entry by class and date.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin">
            Back to admin
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
        <form method="get" className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Class</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="class_id"
              defaultValue={effectiveClassId}
              required
            >
              {classRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level} - {c.name}
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
              defaultValue={selectedDate}
              required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Academic year (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_year_id"
              defaultValue={selectedYearId}
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
              defaultValue={selectedTermId}
            >
              <option value="">—</option>
              {termRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Load
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Mark attendance</h2>
        <p className="mt-2 text-sm text-slate-600">Select a status and save per student. Existing marks are preloaded.</p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-12 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
            <div className="col-span-5">Student</div>
            <div className="col-span-7">Mark</div>
          </div>
          {students.length ? (
            students.map((s) => (
              <div key={s.id} className="grid grid-cols-12 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-5 font-semibold text-slate-900">
                  {s.first_name} {s.last_name}
                </div>
                <div className="col-span-7">
                  <form action={markAttendance} className="grid grid-cols-12 gap-3">
                    <input type="hidden" name="student_id" value={s.id} />
                    <input type="hidden" name="class_id" value={effectiveClassId} />
                    <div className="col-span-4">
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                        name="date"
                        type="date"
                        defaultValue={selectedDate}
                        required
                      />
                    </div>
                    <div className="col-span-4">
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                        name="academic_year_id"
                        defaultValue={selectedYearId}
                      >
                        <option value="">Year</option>
                        {yearRows.map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                        name="academic_term_id"
                        defaultValue={selectedTermId}
                      >
                        <option value="">Term</option>
                        {termRows.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-8">
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                        name="status"
                        defaultValue={statusByStudentId.get(s.id) ?? statuses[0]}
                      >
                        {statuses.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <button
                        className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
                        type="submit"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-6 text-sm text-slate-600">No students found in the default class.</div>
          )}
        </div>
      </div>
    </div>
  );
}
