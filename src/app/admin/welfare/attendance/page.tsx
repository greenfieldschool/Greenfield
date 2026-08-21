import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";

type ClassRow = { id: string; level: string; name: string };
type StudentRow = { id: string; first_name: string; last_name: string; class_id: string | null };

type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type AttendanceRow = { student_id: string; date: string; status: string };

const statuses = ["present", "absent", "late", "excused"] as const;

function getStatusStyle(status: string) {
  switch (status) {
    case "present":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "absent":
      return "bg-red-50 text-red-700 ring-1 ring-red-200";
    case "late":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "excused":
      return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
    default:
      return "bg-slate-50 text-slate-500 ring-1 ring-slate-200";
  }
}

export default async function AdminWelfareAttendancePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null as unknown };

  const role = (profile as { role?: string } | null)?.role ?? null;
  const isTeacher = role === "teacher";

  const [{ data: teacherClasses }, { data: classes }, { data: years }, { data: terms }] = await Promise.all([
    isTeacher && user
      ? supabase
          .from("teacher_class_assignments")
          .select("class_id, classes(id, level, name)")
          .eq("teacher_id", user.id)
          .eq("active", true)
      : Promise.resolve({ data: [] as unknown[] }),
    !isTeacher
      ? supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name")
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false })
  ]);

  const teacherClassRows = (teacherClasses ?? []) as Array<{ classes: ClassRow | null }>;
  const classRows = isTeacher
    ? teacherClassRows.map((r) => r.classes).filter((c): c is ClassRow => Boolean(c))
    : ((classes ?? []) as ClassRow[]);
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];

  const sp = (await searchParams) ?? {};
  const classIdRaw = sp.class_id;
  const dateRaw = sp.date;
  const academicYearIdRaw = sp.academic_year_id;
  const academicTermIdRaw = sp.academic_term_id;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";

  const selectedClassId = Array.isArray(classIdRaw) ? (classIdRaw[0] ?? "") : (classIdRaw ?? "");
  
  // Default to today's date if not chosen
  const defaultDateStr = new Date().toISOString().split("T")[0];
  const selectedDate = Array.isArray(dateRaw) ? (dateRaw[0] ?? "") : (dateRaw ?? defaultDateStr);
  
  const selectedYearId = Array.isArray(academicYearIdRaw)
    ? (academicYearIdRaw[0] ?? "")
    : (academicYearIdRaw ?? "");
  const selectedTermId = Array.isArray(academicTermIdRaw)
    ? (academicTermIdRaw[0] ?? "")
    : (academicTermIdRaw ?? "");

  const effectiveClassId = selectedClassId.length ? selectedClassId : classRows[0]?.id ?? "";

  const hasAnyClass = classRows.length > 0;

  // Build query for students with optional search
  let studentsQuery = supabase
    .from("students")
    .select("id, first_name, last_name, class_id")
    .eq("class_id", effectiveClassId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (query.length > 0) {
    studentsQuery = studentsQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`);
  }

  const [{ data: studentsData }, { data: attendanceData }] = await Promise.all([
    effectiveClassId && hasAnyClass
      ? studentsQuery
      : Promise.resolve({ data: [] as unknown[] }),
    effectiveClassId && hasAnyClass && selectedDate.length
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

  // Compute metrics for the loaded class/date
  const totalClassStudents = students.length;
  const presentCount = attendanceRows.filter((r) => r.status === "present").length;
  const absentCount = attendanceRows.filter((r) => r.status === "absent").length;
  const lateCount = attendanceRows.filter((r) => r.status === "late").length;
  const excusedCount = attendanceRows.filter((r) => r.status === "excused").length;

  const isFiltered = query.length > 0 || selectedClassId.length > 0 || selectedDate !== defaultDateStr;

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
    redirect(`/admin/welfare/attendance?class_id=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}&toast=${encodeURIComponent("Attendance saved")}&toast_type=success`);
  }

  async function filterAttendance(formData: FormData) {
    "use server";

    const classId = String(formData.get("class_id") ?? "").trim();
    const date = String(formData.get("date") ?? "").trim();
    const q = String(formData.get("q") ?? "").trim();
    const yearId = String(formData.get("academic_year_id") ?? "").trim();
    const termId = String(formData.get("academic_term_id") ?? "").trim();

    const params = new URLSearchParams();
    if (classId.length) params.set("class_id", classId);
    if (date.length) params.set("date", date);
    if (q.length) params.set("q", q);
    if (yearId.length) params.set("academic_year_id", yearId);
    if (termId.length) params.set("academic_term_id", termId);

    redirect(`/admin/welfare/attendance?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <UrlToast />

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Welfare</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="mt-1 text-sm text-slate-500">Record daily attendance by class group</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-all"
            href="/admin"
          >
            Back to admin
          </Link>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total class students */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Class Students</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{totalClassStudents}</div>
          <div className="mt-1 text-xs text-slate-500">Students in selected class</div>
        </div>

        {/* Present count */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Present Today</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-emerald-800">{presentCount}</div>
          <div className="mt-1 text-xs text-emerald-700">Marked present on {selectedDate}</div>
        </div>

        {/* Absent count */}
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-red-600">Absent</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
              <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-red-800">{absentCount}</div>
          <div className="mt-1 text-xs text-red-700">Marked absent today</div>
        </div>

        {/* Late/Excused count */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Late / Excused</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{lateCount + excusedCount}</div>
          <div className="mt-1 text-xs text-slate-500">{lateCount} late · {excusedCount} excused</div>
        </div>
      </div>

      {/* Filters form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {!hasAnyClass ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No classes are assigned to your account yet. Ask an admin to assign you to at least one class.
          </div>
        ) : null}
        <form action={filterAttendance} className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="text-xs font-semibold text-slate-500">Student Name</label>
              <div className="relative mt-1">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                  name="q"
                  placeholder="First or last name..."
                  defaultValue={query}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Class</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all font-medium text-slate-700"
                name="class_id"
                defaultValue={effectiveClassId}
                required
                disabled={!hasAnyClass}
              >
                {classRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Date</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                name="date"
                type="date"
                defaultValue={selectedDate}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Academic year</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
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
              <label className="text-xs font-semibold text-slate-500">Academic term</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
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
          </div>

          <div className="flex shrink-0 gap-2">
            <SubmitButton
              className="inline-flex items-center gap-2 rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 transition-all"
              pendingText="Loading…"
            >
              Filter
            </SubmitButton>
            {isFiltered ? (
              <a
                href="/admin/welfare/attendance"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </a>
            ) : null}
          </div>
        </form>
      </div>

      {/* Mark attendance Grid */}
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Mark attendance</h2>
        <p className="mt-2 text-sm text-slate-600">Select a status and save per student. Existing marks are preloaded.</p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid grid-cols-12 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
            <div className="col-span-5">Student</div>
            <div className="col-span-7">Mark</div>
          </div>
          {students.length ? (
            <div className="divide-y divide-slate-100">
              {students.map((s) => {
                const currentStatus = statusByStudentId.get(s.id);
                return (
                  <div key={s.id} className="grid grid-cols-12 gap-3 px-6 py-4 text-sm items-center hover:bg-slate-50/50">
                    <div className="col-span-5 flex items-center gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">
                          {s.first_name} {s.last_name}
                        </div>
                        {currentStatus && (
                          <div className="mt-1">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${getStatusStyle(currentStatus)}`}>
                              {currentStatus}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="col-span-7">
                      <form action={markAttendance} className="grid grid-cols-12 gap-2">
                        <input type="hidden" name="student_id" value={s.id} />
                        <input type="hidden" name="class_id" value={effectiveClassId} />
                        <input type="hidden" name="date" value={selectedDate} />
                        <input type="hidden" name="academic_year_id" value={selectedYearId} />
                        <input type="hidden" name="academic_term_id" value={selectedTermId} />
                        <div className="col-span-8">
                          <select
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                            name="status"
                            defaultValue={currentStatus ?? statuses[0]}
                          >
                            {statuses.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-4">
                          <SubmitButton
                            className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-3 py-2 text-xs font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                            pendingText="Saving…"
                          >
                            Save
                          </SubmitButton>
                        </div>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-sm text-slate-600">
              No students found matching your parameters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
