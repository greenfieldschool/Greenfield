import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { firstOrNull } from "@/lib/relations";
import { safeFilterTerm } from "@/lib/postgrest";
import { CalendarCheck, CheckCircle2, Clock, Filter, Search, Users, X, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";

type ClassRow = { id: string; level: string; name: string };
type StudentRow = { id: string; first_name: string; last_name: string; class_id: string | null };

type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type AttendanceRow = { student_id: string; date: string; status: string };

const statuses = ["present", "absent", "late", "excused"] as const;

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "present":
      return "green";
    case "absent":
      return "red";
    case "late":
      return "gold";
    case "excused":
      return "blue";
    default:
      return "slate";
  }
}

// Selected-state colours for the status segmented control.
const statusChecked: Record<(typeof statuses)[number], string> = {
  present: "peer-checked:bg-brand-green peer-checked:text-white peer-checked:shadow-sm",
  absent: "peer-checked:bg-red-600 peer-checked:text-white peer-checked:shadow-sm",
  late: "peer-checked:bg-brand-gold peer-checked:text-brand-green-950 peer-checked:shadow-sm",
  excused: "peer-checked:bg-sky-600 peer-checked:text-white peer-checked:shadow-sm"
};

// Today's date in Lagos (UTC+1, no daylight saving), as YYYY-MM-DD.
function lagosToday() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

type AttendanceFilters = { classId: string; date: string; q: string; yearId: string; termId: string };

function attendanceUrl(f: AttendanceFilters, toast?: { message: string; type: "success" | "error" }) {
  const params = new URLSearchParams();
  if (f.classId) params.set("class_id", f.classId);
  if (f.date) params.set("date", f.date);
  if (f.q) params.set("q", f.q);
  if (f.yearId) params.set("academic_year_id", f.yearId);
  if (f.termId) params.set("academic_term_id", f.termId);
  if (toast) {
    params.set("toast", toast.message);
    params.set("toast_type", toast.type);
  }
  return `/admin/welfare/attendance?${params.toString()}`;
}

function filtersFrom(formData: FormData): AttendanceFilters {
  return {
    classId: String(formData.get("class_id") ?? "").trim(),
    date: String(formData.get("date") ?? "").trim(),
    q: String(formData.get("q") ?? "").trim(),
    yearId: String(formData.get("academic_year_id") ?? "").trim(),
    termId: String(formData.get("academic_term_id") ?? "").trim()
  };
}

// Server actions live at module level so they cannot capture values from the page render.
async function markAttendance(formData: FormData) {
  "use server";

  const filters = filtersFrom(formData);
  const studentId = String(formData.get("student_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!studentId || !filters.date || !status) {
    redirect(attendanceUrl(filters, { message: "Choose a student, date and status", type: "error" }));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) redirect(attendanceUrl(filters, { message: "Database is not configured", type: "error" }));

  const { error } = await supabase.from("student_attendance").upsert(
    {
      student_id: studentId,
      class_id: filters.classId.length ? filters.classId : null,
      academic_year_id: filters.yearId.length ? filters.yearId : null,
      academic_term_id: filters.termId.length ? filters.termId : null,
      date: filters.date,
      status
    },
    { onConflict: "student_id,date" }
  );

  revalidatePath("/admin/welfare/attendance");
  if (error) redirect(attendanceUrl(filters, { message: error.message, type: "error" }));
  redirect(attendanceUrl(filters, { message: "Attendance saved", type: "success" }));
}

async function filterAttendance(formData: FormData) {
  "use server";
  redirect(attendanceUrl(filtersFrom(formData)));
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

  const teacherClassRows = (teacherClasses ?? []) as Array<{ classes: ClassRow | ClassRow[] | null }>;
  const classRows = isTeacher
    ? teacherClassRows.map((r) => firstOrNull(r.classes)).filter((c): c is ClassRow => Boolean(c))
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
  const defaultDateStr = lagosToday();
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

  const safeQuery = safeFilterTerm(query);
  if (safeQuery.length > 0) {
    studentsQuery = studentsQuery.or(`first_name.ilike.%${safeQuery}%,last_name.ilike.%${safeQuery}%`);
  }

  const [{ data: studentsData }, { data: attendanceData }, { data: classStudentsData }] = await Promise.all([
    effectiveClassId && hasAnyClass
      ? studentsQuery
      : Promise.resolve({ data: [] as unknown[] }),
    effectiveClassId && hasAnyClass && selectedDate.length
      ? supabase
          .from("student_attendance")
          .select("student_id, date, status")
          .eq("class_id", effectiveClassId)
          .eq("date", selectedDate)
      : Promise.resolve({ data: [] as unknown[] }),
    // Whole class (ignores the search box) so the metric tiles all describe the same students.
    effectiveClassId && hasAnyClass
      ? supabase.from("students").select("id").eq("class_id", effectiveClassId)
      : Promise.resolve({ data: [] as unknown[] })
  ]);

  const students = (studentsData ?? []) as StudentRow[];
  const classStudentIds = new Set(((classStudentsData ?? []) as Array<{ id: string }>).map((r) => r.id));
  const attendanceRows = ((attendanceData ?? []) as AttendanceRow[]).filter((r) => classStudentIds.has(r.student_id));
  const statusByStudentId = new Map(attendanceRows.map((r) => [r.student_id, r.status] as const));

  // Compute metrics for the loaded class/date
  const totalClassStudents = classStudentIds.size;
  const presentCount = attendanceRows.filter((r) => r.status === "present").length;
  const absentCount = attendanceRows.filter((r) => r.status === "absent").length;
  const lateCount = attendanceRows.filter((r) => r.status === "late").length;
  const excusedCount = attendanceRows.filter((r) => r.status === "excused").length;

  const isFiltered = query.length > 0 || selectedClassId.length > 0 || selectedDate !== defaultDateStr;

  const dateLabel = selectedDate
    ? new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
      })
    : "";
  const markedCount = students.filter((s) => statusByStudentId.has(s.id)).length;

  return (
    <div className="space-y-6">
      <UrlToast />

      <PageHeader
        eyebrow="Welfare"
        title="Attendance"
        description="Record daily attendance by class group."
        back={{ href: "/admin", label: "Back to admin" }}
      />

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students in class"
          value={totalClassStudents}
          hint={`${totalClassStudents - attendanceRows.length} not yet marked on ${selectedDate}`}
          icon={Users}
          tone="slate"
        />
        <StatCard
          label="Present"
          value={presentCount}
          hint={`Of ${totalClassStudents} in class, on ${selectedDate}`}
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard label="Absent" value={absentCount} hint={`Of ${totalClassStudents} in class, on ${selectedDate}`} icon={XCircle} tone="rose" />
        <StatCard
          label="Late / excused"
          value={lateCount + excusedCount}
          hint={`${lateCount} late · ${excusedCount} excused (whole class)`}
          icon={Clock}
          tone="gold"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="space-y-4">
          {!hasAnyClass ? (
            <Alert tone="warning">
              No classes are assigned to your account yet. Ask an admin to assign you to at least one class.
            </Alert>
          ) : null}
          <form action={filterAttendance} className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label htmlFor="att-q" className="gf-label">
                  Student name
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input id="att-q" className="gf-input pl-9" name="q" placeholder="First or last name…" defaultValue={query} />
                </div>
              </div>
              <div>
                <label htmlFor="att-class" className="gf-label">
                  Class
                </label>
                <select
                  id="att-class"
                  className="gf-select"
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
                <label htmlFor="att-date" className="gf-label">
                  Date
                </label>
                <input id="att-date" className="gf-input" name="date" type="date" defaultValue={selectedDate} required />
              </div>
              <div>
                <label htmlFor="att-year" className="gf-label">
                  Academic year
                </label>
                <select id="att-year" className="gf-select" name="academic_year_id" defaultValue={selectedYearId}>
                  <option value="">—</option>
                  {yearRows.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="att-term" className="gf-label">
                  Academic term
                </label>
                <select id="att-term" className="gf-select" name="academic_term_id" defaultValue={selectedTermId}>
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
              <SubmitButton variant="primary" pendingText="Loading…">
                <span className="inline-flex items-center gap-2">
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  Filter
                </span>
              </SubmitButton>
              {isFiltered ? (
                <a href="/admin/welfare/attendance" className={buttonClasses({ variant: "secondary" })}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  Clear
                </a>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Register */}
      <Card>
        <CardHeader
          title="Mark attendance"
          description={`Choose a status and save per student. Existing marks are preloaded.${dateLabel ? ` Register for ${dateLabel}.` : ""}`}
          action={
            students.length ? (
              <Badge tone={markedCount === students.length ? "green" : markedCount ? "gold" : "slate"} dot>
                {markedCount}/{students.length} marked
              </Badge>
            ) : null
          }
        />
        {students.length ? (
          <div className="max-h-[75vh] overflow-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-30 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 sm:pl-6"
                  >
                    Student
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600"
                  >
                    Current
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 sm:pr-6"
                  >
                    Mark
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const currentStatus = statusByStudentId.get(s.id);
                  return (
                    <tr key={s.id} className="group">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-2.5 text-left font-semibold text-slate-900 group-hover:bg-slate-50 sm:pl-6"
                      >
                        {s.first_name} {s.last_name}
                      </th>
                      <td className="border-b border-slate-100 px-4 py-2.5 group-hover:bg-slate-50">
                        {currentStatus ? (
                          <Badge tone={statusTone(currentStatus)} dot className="capitalize">
                            {currentStatus}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Not marked</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2.5 group-hover:bg-slate-50 sm:pr-6">
                        <form action={markAttendance} className="flex items-center gap-2">
                          <input type="hidden" name="student_id" value={s.id} />
                          <input type="hidden" name="class_id" value={effectiveClassId} />
                          <input type="hidden" name="date" value={selectedDate} />
                          <input type="hidden" name="academic_year_id" value={selectedYearId} />
                          <input type="hidden" name="academic_term_id" value={selectedTermId} />
                          <input type="hidden" name="q" value={query} />
                          <fieldset className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                            <legend className="sr-only">
                              Status for {s.first_name} {s.last_name}
                            </legend>
                            {statuses.map((st) => (
                              <label key={st} className="cursor-pointer">
                                <input
                                  type="radio"
                                  name="status"
                                  value={st}
                                  defaultChecked={(currentStatus ?? statuses[0]) === st}
                                  className="peer sr-only"
                                />
                                <span
                                  className={`inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold capitalize text-slate-600 transition hover:text-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-green-500/40 ${statusChecked[st]}`}
                                >
                                  {st}
                                </span>
                              </label>
                            ))}
                          </fieldset>
                          <SubmitButton variant="primary" size="sm" pendingText="Saving…">
                            Save
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={CalendarCheck}
            title="No students found"
            description="No students found matching your parameters."
          />
        )}
      </Card>
    </div>
  );
}
