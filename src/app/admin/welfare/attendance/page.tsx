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
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";
import { addDays, mondayOf, weekRange } from "@/lib/welfare";
import { BackToScoreSheet, scoreSheetBack } from "../_ui";
import { cn } from "@/lib/cn";

type ClassRow = { id: string; level: string; name: string };
type StudentRow = { id: string; first_name: string; last_name: string; class_id: string | null };

type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type AttendanceRow = { student_id: string; date: string; status: string };

const statuses = ["present", "absent", "late", "excused"] as const;


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

type AttendanceFilters = { classId: string; date: string; q: string; yearId: string; termId: string; back: string | null };

function attendanceUrl(f: AttendanceFilters, toast?: { message: string; type: "success" | "error" }) {
  const params = new URLSearchParams();
  if (f.classId) params.set("class_id", f.classId);
  if (f.date) params.set("date", f.date);
  if (f.q) params.set("q", f.q);
  if (f.yearId) params.set("academic_year_id", f.yearId);
  if (f.termId) params.set("academic_term_id", f.termId);
  if (f.back) params.set("back", f.back);
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
    termId: String(formData.get("academic_term_id") ?? "").trim(),
    back: scoreSheetBack(String(formData.get("back") ?? ""))
  };
}

// Server actions live at module level so they cannot capture values from the page render.
// Saves the whole register at once: every pupil whose status differs from what was saved (unmarked pupils count as
// changed, so "Save register" marks the class).
async function saveRegister(formData: FormData) {
  "use server";

  const filters = filtersFrom(formData);
  if (!filters.classId || !filters.date) {
    redirect(attendanceUrl(filters, { message: "Choose a class and a date", type: "error" }));
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) redirect(attendanceUrl(filters, { message: "Database is not configured", type: "error" }));

  const rows: Array<Record<string, unknown>> = [];
  for (const [key, value] of Array.from(formData.entries())) {
    if (!key.startsWith("status:")) continue;
    const studentId = key.slice("status:".length);
    const status = String(value).trim();
    if (!statuses.includes(status as (typeof statuses)[number])) continue;
    if (status === String(formData.get(`orig:${studentId}`) ?? "").trim()) continue;
    rows.push({
      student_id: studentId,
      class_id: filters.classId,
      academic_year_id: filters.yearId.length ? filters.yearId : null,
      academic_term_id: filters.termId.length ? filters.termId : null,
      date: filters.date,
      status
    });
  }

  if (rows.length) {
    const { error } = await supabase.from("student_attendance").upsert(rows, { onConflict: "student_id,date" });
    if (error) redirect(attendanceUrl(filters, { message: error.message, type: "error" }));
  }
  revalidatePath("/admin/welfare/attendance");
  revalidatePath("/admin/welfare/scores");
  redirect(
    attendanceUrl(filters, {
      message: rows.length ? `Register saved: ${rows.length} pupil${rows.length === 1 ? "" : "s"} updated` : "Nothing had changed",
      type: "success"
    })
  );
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
  const back = scoreSheetBack(sp.back);

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

  // The school week around the chosen date: how many pupils are marked each day, so missing days stand out.
  const monday = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? mondayOf(selectedDate) : mondayOf(defaultDateStr);
  const weekDays = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const { data: weekData } =
    effectiveClassId && hasAnyClass
      ? await supabase.from("student_attendance").select("student_id, date").eq("class_id", effectiveClassId).gte("date", weekDays[0]).lte("date", weekDays[4])
      : { data: [] as unknown[] };
  const markedByDay = new Map<string, number>();
  for (const r of (weekData ?? []) as Array<{ student_id: string; date: string }>) {
    if (!classStudentIds.has(r.student_id)) continue;
    const d = String(r.date).slice(0, 10);
    markedByDay.set(d, (markedByDay.get(d) ?? 0) + 1);
  }
  const today = defaultDateStr;
  const dayLink = (d: string) =>
    attendanceUrl({ classId: effectiveClassId, date: d, q: "", yearId: selectedYearId, termId: selectedTermId, back });

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
        learn={LEARN.attendance}
        eyebrow="Welfare"
        title="Attendance"
        description="Take the register for a class each school day. The welfare score sheet works out Attendance and Punctuality from it."
        back={{ href: "/admin", label: "Back to admin" }}
      />

      <BackToScoreSheet href={back} what="the register for each day of the week" />

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
            {back ? <input type="hidden" name="back" value={back} /> : null}
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

      {/* The week */}
      {hasAnyClass && effectiveClassId ? (
        <nav aria-label="Days of this week" className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Week of {weekRange(monday)}</div>
          <ol className="grid grid-cols-5 gap-2">
            {weekDays.map((d) => {
              const marked = markedByDay.get(d) ?? 0;
              const full = totalClassStudents > 0 && marked >= totalClassStudents;
              const isSelected = d === selectedDate;
              const future = d > today;
              const label = new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
              return (
                <li key={d}>
                  <a
                    href={dayLink(d)}
                    aria-current={isSelected ? "date" : undefined}
                    className={cn(
                      "flex flex-col rounded-xl border px-2 py-2 text-center transition sm:px-3",
                      isSelected
                        ? "border-brand-green-500 bg-brand-green-50 ring-2 ring-brand-green-500/20"
                        : future
                          ? "border-dashed border-slate-200 bg-slate-50 text-slate-400"
                          : "border-slate-200 bg-white hover:border-brand-green-300"
                    )}
                  >
                    <span className="text-xs font-semibold text-slate-800">{label}</span>
                    <span className="text-[11px] text-slate-500">{Number(d.slice(8, 10))}</span>
                    <span
                      className={cn(
                        "mt-1 text-[11px] font-medium",
                        full ? "text-brand-green-700" : marked ? "text-brand-gold-800" : future ? "text-slate-400" : "text-red-700"
                      )}
                    >
                      {full ? "Taken" : marked ? `${marked}/${totalClassStudents}` : future ? "—" : "Not taken"}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      {/* Register */}
      <Card>
        <CardHeader
          title="Register"
          description={`${dateLabel ? `${dateLabel}. ` : ""}Everyone starts as Present: change the pupils who were absent, late or excused, then save the register once.`}
          action={
            students.length ? (
              <Badge tone={markedCount === students.length ? "green" : markedCount ? "gold" : "slate"} dot>
                {markedCount}/{students.length} saved
              </Badge>
            ) : null
          }
        />
        {students.length ? (
          <form action={saveRegister}>
            <input type="hidden" name="class_id" value={effectiveClassId} />
            <input type="hidden" name="date" value={selectedDate} />
            <input type="hidden" name="academic_year_id" value={selectedYearId} />
            <input type="hidden" name="academic_term_id" value={selectedTermId} />
            <input type="hidden" name="q" value={query} />
            {back ? <input type="hidden" name="back" value={back} /> : null}
            <ul className="divide-y divide-slate-100">
              {students.map((s) => {
                const currentStatus = statusByStudentId.get(s.id);
                return (
                  <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        {s.first_name} {s.last_name}
                      </div>
                      <div className="text-xs">
                        {currentStatus ? (
                          <span className="capitalize text-slate-500">Saved: {currentStatus}</span>
                        ) : (
                          <span className="font-medium text-brand-gold-800">Not saved yet</span>
                        )}
                      </div>
                    </div>
                    <input type="hidden" name={`orig:${s.id}`} value={currentStatus ?? ""} />
                    <fieldset className="grid grid-cols-4 rounded-xl border border-slate-200 bg-slate-50 p-0.5 sm:inline-flex">
                      <legend className="sr-only">
                        Status for {s.first_name} {s.last_name}
                      </legend>
                      {statuses.map((st) => (
                        <label key={st} className="cursor-pointer">
                          <input
                            type="radio"
                            name={`status:${s.id}`}
                            value={st}
                            defaultChecked={(currentStatus ?? "present") === st}
                            className="peer sr-only"
                          />
                          <span
                            className={`flex h-10 items-center justify-center rounded-lg px-2.5 text-xs font-semibold capitalize text-slate-600 transition hover:text-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-green-500/40 sm:h-8 ${statusChecked[st]}`}
                          >
                            {st}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  </li>
                );
              })}
            </ul>
            <div className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-b-2xl border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-slate-500">Saves every pupil above for {dateLabel || "this day"}. Pupils already saved keep their mark unless you change it.</p>
              <SubmitButton variant="primary" pendingText="Saving…">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Save register
                </span>
              </SubmitButton>
            </div>
          </form>
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
