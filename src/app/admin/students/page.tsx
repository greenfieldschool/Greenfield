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

  // Build query dynamically with filters
  let studentQuery = supabase
    .from("students")
    .select("id, first_name, last_name, admission_number, level, class_id, status, date_of_birth");

  if (query.length > 0) {
    studentQuery = studentQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,admission_number.ilike.%${query}%`);
  }

  if (levelFilter.length > 0) {
    studentQuery = studentQuery.eq("level", levelFilter);
  }

  if (classFilter.length > 0) {
    studentQuery = studentQuery.eq("class_id", classFilter);
  }

  if (statusFilter.length > 0) {
    studentQuery = studentQuery.eq("status", statusFilter);
  }

  const { data: studentList } = await studentQuery
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const students = (studentList ?? []) as unknown as StudentRow[];

  // Fetch student-role profiles that have no valid student_user_link
  const { data: allStudentLinks } = await supabase
    .from("student_user_links")
    .select("user_id, student_id");
  const linkedUserIds = new Set((allStudentLinks ?? []).map((l: { user_id: string }) => l.user_id));

  // Student-role profiles not yet linked to any student record
  const { data: unlinkedStudentProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "student")
    .limit(100);

  const unlinkedStudentAccounts = ((unlinkedStudentProfiles ?? []) as Array<{ id: string; full_name: string | null }>)
    .filter((p) => !linkedUserIds.has(p.id));

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
      {/* Unlinked account diagnostic banner */}
      {unlinkedStudentAccounts.length > 0 && !query && !levelFilter && !classFilter && !statusFilter ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <div className="font-semibold text-amber-900">
                {unlinkedStudentAccounts.length} student portal account{unlinkedStudentAccounts.length !== 1 ? "s" : ""} not linked to a student record
              </div>
              <p className="mt-1 text-sm text-amber-800">
                These accounts can log in to the portal but will see &quot;no student record found&quot; because they are not connected to a student profile.
                Go to <a href="/admin/users?role=student" className="underline font-semibold">Admin → Users (filter: student)</a> to link them, or create a student record first via Applications.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unlinkedStudentAccounts.slice(0, 5).map((p) => (
                  <span key={p.id} className="inline-flex items-center rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                    {p.full_name ?? p.id}
                  </span>
                ))}
                {unlinkedStudentAccounts.length > 5 ? (
                  <span className="inline-flex items-center rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                    +{unlinkedStudentAccounts.length - 5} more
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* Header and Controls */}
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Admin</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Students</h1>
            <p className="mt-2 text-sm text-slate-600">
              Manage approved/enrolled students. Filter, search, and manage portal accounts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/students/applications/new"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
            >
              New application
            </Link>
            <Link
              href="/admin/students/applications"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              View applications
            </Link>
          </div>
        </div>

        {/* Filter controls */}
        <form action={filterStudents} className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Search</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="q"
                placeholder="Name or admission number..."
                defaultValue={query}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Level</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
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
              <label className="text-xs font-semibold text-slate-600">Class</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
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
              <label className="text-xs font-semibold text-slate-600">Status</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
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

          <div className="flex gap-2">
            <SubmitButton
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95"
              pendingText="Filtering…"
            >
              Filter
            </SubmitButton>
            {(query.length > 0 || levelFilter.length > 0 || classFilter.length > 0 || statusFilter.length > 0) ? (
              <a
                href="/admin/students"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear
              </a>
            ) : null}
          </div>
        </form>
      </div>

      {/* Student List Grid */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Name</div>
          <div className="col-span-3">Adm no</div>
          <div className="col-span-2">Level</div>
          <div className="col-span-2">Class</div>
          <div className="col-span-1">Status</div>
        </div>
        <div>
          {students.length ? (
            students.map((s) => (
              <Link
                key={s.id}
                href={`/admin/students/${s.id}`}
                className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                <div className="col-span-4 font-semibold text-slate-900">
                  {s.first_name} {s.last_name}
                </div>
                <div className="col-span-3">{s.admission_number ?? "—"}</div>
                <div className="col-span-2 capitalize">{s.level}</div>
                <div className="col-span-2">{(s.class_id ? classById.get(s.class_id)?.name : null) ?? "—"}</div>
                <div className="col-span-1 capitalize">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.status === "active" ? "bg-emerald-50 text-emerald-700" :
                    s.status === "enrolled" ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-700"
                  }`}>
                    {s.status}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600 text-center">No students matched your search criteria.</div>
          )}
        </div>
      </div>
    </div>
  );
}
