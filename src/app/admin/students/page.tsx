import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SubmitButton from "@/components/submit-button";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string | null;
  level: string;
  class_id: string | null;
  status: string;
  date_of_birth: string | null;
};

function getStatusStyle(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "enrolled":
      return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
    case "applied":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "graduated":
      return "bg-purple-50 text-purple-700 ring-1 ring-purple-200";
    case "withdrawn":
      return "bg-red-50 text-red-700 ring-1 ring-red-200";
    case "transferred":
      return "bg-slate-50 text-slate-600 ring-1 ring-slate-200";
    default:
      return "bg-slate-50 text-slate-500 ring-1 ring-slate-200";
  }
}

function getLevelStyle(level: string) {
  switch (level) {
    case "creche":
      return "bg-pink-50 text-pink-700";
    case "primary":
      return "bg-sky-50 text-sky-700";
    case "secondary":
      return "bg-indigo-50 text-indigo-700";
    default:
      return "bg-slate-50 text-slate-600";
  }
}

function getInitials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    "bg-rose-100 text-rose-700",
    "bg-orange-100 text-orange-700",
    "bg-amber-100 text-amber-700",
    "bg-emerald-100 text-emerald-700",
    "bg-teal-100 text-teal-700",
    "bg-sky-100 text-sky-700",
    "bg-indigo-100 text-indigo-700",
    "bg-violet-100 text-violet-700",
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

export default async function AdminStudentsPage({
  searchParams
}: {
  searchParams: { q?: string; level?: string; class_id?: string; status?: string };
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const query = (searchParams.q ?? "").trim();
  const levelFilter = (searchParams.level ?? "").trim();
  const classFilter = (searchParams.class_id ?? "").trim();
  const statusFilter = (searchParams.status ?? "").trim();

  // Fetch all active classes for filter dropdown options
  const { data: classesData } = await supabase
    .from("classes")
    .select("id, level, name, active")
    .eq("active", true)
    .order("level")
    .order("name");

  const classOptions = (classesData ?? []) as Array<{ id: string; level: string; name: string }>;
  const classById = new Map(classOptions.map((c) => [c.id, c] as const));

  // Fetch ALL students for metrics (no filters)
  const { data: allStudentsData } = await supabase
    .from("students")
    .select("id, level, status");
  const allStudents = (allStudentsData ?? []) as Array<{ id: string; level: string; status: string }>;

  // Compute metrics
  const totalStudents = allStudents.length;
  const activeCount = allStudents.filter((s) => s.status === "active").length;
  const enrolledCount = allStudents.filter((s) => s.status === "enrolled").length;
  const appliedCount = allStudents.filter((s) => s.status === "applied").length;
  const crecheCount = allStudents.filter((s) => s.level === "creche").length;
  const primaryCount = allStudents.filter((s) => s.level === "primary").length;
  const secondaryCount = allStudents.filter((s) => s.level === "secondary").length;

  // Build filtered query
  let studentQuery = supabase
    .from("students")
    .select("id, first_name, last_name, admission_number, level, class_id, status, date_of_birth");

  if (query.length > 0) {
    studentQuery = studentQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,admission_number.ilike.%${query}%`);
  }
  if (levelFilter.length > 0) studentQuery = studentQuery.eq("level", levelFilter);
  if (classFilter.length > 0) studentQuery = studentQuery.eq("class_id", classFilter);
  if (statusFilter.length > 0) studentQuery = studentQuery.eq("status", statusFilter);

  const { data: studentList } = await studentQuery
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const students = (studentList ?? []) as unknown as StudentRow[];

  // Unlinked portal accounts
  const { data: allStudentLinks } = await supabase
    .from("student_user_links")
    .select("user_id, student_id");
  const linkedUserIds = new Set((allStudentLinks ?? []).map((l: { user_id: string }) => l.user_id));

  const { data: unlinkedStudentProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "student")
    .limit(100);

  const unlinkedStudentAccounts = ((unlinkedStudentProfiles ?? []) as Array<{ id: string; full_name: string | null }>)
    .filter((p) => !linkedUserIds.has(p.id));

  const isFiltered = query.length > 0 || levelFilter.length > 0 || classFilter.length > 0 || statusFilter.length > 0;

  async function filterStudents(formData: FormData) {
    "use server";

    const q = String(formData.get("q") ?? "").trim();
    const level = String(formData.get("level") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    const params = new URLSearchParams();
    if (q.length) params.set("q", q);
    if (level.length) params.set("level", level);
    if (classId.length) params.set("class_id", classId);
    if (status.length) params.set("status", status);

    const queryString = params.toString();
    redirect(queryString.length ? `/admin/students?${queryString}` : "/admin/students");
  }

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Admin</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Students</h1>
          <p className="mt-1 text-sm text-slate-500">
            {totalStudents} student{totalStudents !== 1 ? "s" : ""} total · {activeCount + enrolledCount} active/enrolled
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href="/admin/students/applications/new"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-95 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New application
          </Link>
          <Link
            href="/admin/students/applications"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-all"
          >
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View applications
          </Link>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{totalStudents}</div>
          <div className="mt-1 text-xs text-slate-500">All enrolled students</div>
        </div>

        {/* Active/Enrolled */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Active</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-emerald-800">{activeCount}</div>
          <div className="mt-1 text-xs text-emerald-700">{enrolledCount} enrolled · {appliedCount} applied</div>
        </div>

        {/* By Level */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">By Level</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
              <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-pink-600 font-medium">Creche</span>
              <span className="font-bold text-slate-800">{crecheCount}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-sky-600 font-medium">Primary</span>
              <span className="font-bold text-slate-800">{primaryCount}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-indigo-600 font-medium">Secondary</span>
              <span className="font-bold text-slate-800">{secondaryCount}</span>
            </div>
          </div>
        </div>

        {/* Portal Alerts */}
        <div className={`rounded-2xl border p-5 shadow-sm ${unlinkedStudentAccounts.length > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center justify-between">
            <div className={`text-xs font-semibold uppercase tracking-wide ${unlinkedStudentAccounts.length > 0 ? "text-amber-600" : "text-slate-400"}`}>
              Portal
            </div>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${unlinkedStudentAccounts.length > 0 ? "bg-amber-100" : "bg-slate-100"}`}>
              <svg className={`h-4 w-4 ${unlinkedStudentAccounts.length > 0 ? "text-amber-600" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          {unlinkedStudentAccounts.length > 0 ? (
            <>
              <div className="mt-3 text-3xl font-bold text-amber-800">{unlinkedStudentAccounts.length}</div>
              <div className="mt-1 text-xs text-amber-700">
                Unlinked portal account{unlinkedStudentAccounts.length !== 1 ? "s" : ""} —{" "}
                <a href="/admin/users?role=student" className="underline font-semibold">Fix now</a>
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 text-3xl font-bold text-slate-400">—</div>
              <div className="mt-1 text-xs text-slate-400">All portal accounts linked</div>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form action={filterStudents} className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">Search</label>
              <div className="relative mt-1">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                  name="q"
                  placeholder="Name or admission no..."
                  defaultValue={query}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Level</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                name="level"
                defaultValue={levelFilter}
              >
                <option value="">All levels</option>
                <option value="creche">Creche</option>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Class</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                name="class_id"
                defaultValue={classFilter}
              >
                <option value="">All classes</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Status</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                name="status"
                defaultValue={statusFilter}
              >
                <option value="">All statuses</option>
                <option value="applied">Applied</option>
                <option value="enrolled">Enrolled</option>
                <option value="active">Active</option>
                <option value="graduated">Graduated</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="transferred">Transferred</option>
              </select>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <SubmitButton
              className="inline-flex items-center gap-2 rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 transition-all"
              pendingText="Filtering…"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              Filter
            </SubmitButton>
            {isFiltered ? (
              <a
                href="/admin/students"
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

        {isFiltered ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Showing {students.length} result{students.length !== 1 ? "s" : ""}
            {query ? <span>for &ldquo;<strong>{query}</strong>&rdquo;</span> : null}
          </div>
        ) : null}
      </div>

      {/* Student Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Table header */}
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-3">
          <div className="grid grid-cols-12 text-xs font-bold uppercase tracking-wider text-slate-400">
            <div className="col-span-5">Student</div>
            <div className="col-span-2 hidden sm:block">Adm. No</div>
            <div className="col-span-2 hidden md:block">Level · Class</div>
            <div className="col-span-3 text-right md:col-span-3">Status</div>
          </div>
        </div>

        {students.length ? (
          <div className="divide-y divide-slate-100">
            {students.map((s) => {
              const cls = s.class_id ? classById.get(s.class_id) : null;
              const initials = getInitials(s.first_name, s.last_name);
              const avatarColor = getAvatarColor(s.last_name);
              return (
                <Link
                  key={s.id}
                  href={`/admin/students/${s.id}`}
                  className="group grid grid-cols-12 items-center px-6 py-4 text-sm hover:bg-slate-50 transition-colors"
                >
                  {/* Name + avatar */}
                  <div className="col-span-5 flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${avatarColor}`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900 group-hover:text-brand-green transition-colors">
                        {s.first_name} {s.last_name}
                      </div>
                      {s.date_of_birth ? (
                        <div className="mt-0.5 text-xs text-slate-400">{s.date_of_birth}</div>
                      ) : null}
                    </div>
                  </div>

                  {/* Admission number */}
                  <div className="col-span-2 hidden sm:block">
                    {s.admission_number ? (
                      <span className="font-mono text-xs font-medium text-slate-600">{s.admission_number}</span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>

                  {/* Level · Class */}
                  <div className="col-span-2 hidden items-center gap-1.5 md:flex">
                    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold capitalize ${getLevelStyle(s.level)}`}>
                      {s.level}
                    </span>
                    {cls ? (
                      <span className="text-xs text-slate-500">{cls.name}</span>
                    ) : (
                      <span className="text-xs text-slate-300">No class</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-span-7 flex justify-end gap-2 sm:col-span-3 md:col-span-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${getStatusStyle(s.status)}`}>
                      {s.status}
                    </span>
                    <svg className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-800">
              {isFiltered ? "No students match your filters" : "No students yet"}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {isFiltered
                ? "Try clearing filters or adjusting your search."
                : "Create a new application to get started."}
            </p>
            {isFiltered ? (
              <a
                href="/admin/students"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear all filters
              </a>
            ) : (
              <Link
                href="/admin/students/applications/new"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New application
              </Link>
            )}
          </div>
        )}

        {/* Footer count */}
        {students.length > 0 ? (
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-400">
            Showing {students.length} of {totalStudents} student{totalStudents !== 1 ? "s" : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}
