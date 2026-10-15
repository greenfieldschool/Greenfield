import Link from "next/link";
import { AlertTriangle, ChevronRight, FileText, Layers, Plus, Search, UserCheck, Users, X } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/form-section";
import { formatLagosDate } from "@/lib/lagos-dates";
import { safeFilterTerm } from "@/lib/postgrest";

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

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
      return "green";
    case "enrolled":
      return "blue";
    case "applied":
      return "gold";
    case "graduated":
      return "violet";
    case "withdrawn":
      return "red";
    default:
      return "slate";
  }
}

function levelTone(level: string): BadgeTone {
  switch (level) {
    case "creche":
      return "gold";
    case "primary":
      return "blue";
    case "secondary":
      return "violet";
    default:
      return "slate";
  }
}

function capitalize(v: string) {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
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

  const searchTerm = safeFilterTerm(query);
  if (searchTerm.length > 0) {
    studentQuery = studentQuery.or(
      `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,admission_number.ilike.%${searchTerm}%`
    );
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

  const unlinkedCount = unlinkedStudentAccounts.length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Students"
        description={`${totalStudents} student${totalStudents !== 1 ? "s" : ""} total · ${activeCount + enrolledCount} active/enrolled`}
        actions={
          <>
            <ButtonLink href="/admin/students/applications" variant="secondary">
              <FileText className="h-4 w-4" aria-hidden="true" />
              View applications
            </ButtonLink>
            <ButtonLink href="/admin/students/applications/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New application
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total" value={totalStudents} hint="All enrolled students" icon={Users} tone="slate" />
        <StatCard
          label="Active"
          value={activeCount}
          hint={`${enrolledCount} enrolled · ${appliedCount} applied`}
          icon={UserCheck}
          tone="green"
        />
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-medium text-slate-500">By level</div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Layers className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
          </div>
          <dl className="mt-2 space-y-1.5 text-sm">
            {[
              { label: "Creche", value: crecheCount },
              { label: "Primary", value: primaryCount },
              { label: "Secondary", value: secondaryCount }
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <dt className="text-slate-600">{r.label}</dt>
                <dd className="font-semibold text-slate-900">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {unlinkedCount > 0 ? (
          <StatCard
            label="Portal"
            value={unlinkedCount}
            hint={`Unlinked portal account${unlinkedCount !== 1 ? "s" : ""} — fix now`}
            icon={AlertTriangle}
            tone="gold"
            href="/admin/users?role=student"
          />
        ) : (
          <StatCard label="Portal" value="—" hint="All portal accounts linked" icon={AlertTriangle} tone="slate" />
        )}
      </div>

      <Card>
        <CardBody>
          <form action={filterStudents} className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Search" htmlFor="students-q">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="students-q"
                    className="gf-input pl-9"
                    name="q"
                    placeholder="Name or admission no..."
                    defaultValue={query}
                  />
                </div>
              </Field>
              <Field label="Level" htmlFor="students-level">
                <select id="students-level" className="gf-select" name="level" defaultValue={levelFilter}>
                  <option value="">All levels</option>
                  <option value="creche">Creche</option>
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                </select>
              </Field>
              <Field label="Class" htmlFor="students-class">
                <select id="students-class" className="gf-select" name="class_id" defaultValue={classFilter}>
                  <option value="">All classes</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.level} - {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status" htmlFor="students-status">
                <select id="students-status" className="gf-select" name="status" defaultValue={statusFilter}>
                  <option value="">All statuses</option>
                  <option value="applied">Applied</option>
                  <option value="enrolled">Enrolled</option>
                  <option value="active">Active</option>
                  <option value="graduated">Graduated</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="transferred">Transferred</option>
                </select>
              </Field>
            </div>

            <div className="flex shrink-0 gap-2">
              <SubmitButton variant="primary" pendingText="Filtering…">
                Filter
              </SubmitButton>
              {isFiltered ? (
                <ButtonLink href="/admin/students" variant="secondary">
                  <X className="h-4 w-4" aria-hidden="true" />
                  Clear
                </ButtonLink>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Student list"
          description={
            isFiltered ? (
              <>
                Showing {students.length} result{students.length !== 1 ? "s" : ""}
                {query ? (
                  <>
                    {" "}
                    for &ldquo;<strong className="font-semibold text-slate-700">{query}</strong>&rdquo;
                  </>
                ) : null}
              </>
            ) : (
              `Showing ${students.length} of ${totalStudents} student${totalStudents !== 1 ? "s" : ""}`
            )
          }
        />

        {students.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Adm. no</th>
                  <th>Level</th>
                  <th>Class</th>
                  <th>Status</th>
                  <th className="w-10">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const cls = s.class_id ? classById.get(s.class_id) : null;
                  const href = `/admin/students/${s.id}`;
                  return (
                    <tr key={s.id} className="group">
                      <td>
                        <Link href={href} className="flex items-center gap-3">
                          <Avatar name={`${s.first_name} ${s.last_name}`} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900 transition group-hover:text-brand-green">
                              {s.first_name} {s.last_name}
                            </span>
                            {s.date_of_birth ? (
                              <span className="block text-xs text-slate-500">Born {formatLagosDate(s.date_of_birth)}</span>
                            ) : null}
                          </span>
                        </Link>
                      </td>
                      <td>
                        {s.admission_number ? (
                          <span className="font-mono text-xs font-medium text-slate-600">{s.admission_number}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={levelTone(s.level)}>{capitalize(s.level)}</Badge>
                      </td>
                      <td>{cls ? cls.name : <span className="text-slate-400">No class</span>}</td>
                      <td>
                        <Badge tone={statusTone(s.status)} dot>
                          {capitalize(s.status)}
                        </Badge>
                      </td>
                      <td className="text-right">
                        <Link
                          href={href}
                          aria-label={`Open ${s.first_name} ${s.last_name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-green"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={isFiltered ? "No students match your filters" : "No students yet"}
            description={isFiltered ? "Try clearing filters or adjusting your search." : "Create a new application to get started."}
            action={
              isFiltered ? (
                <ButtonLink href="/admin/students" variant="secondary" size="sm">
                  Clear all filters
                </ButtonLink>
              ) : (
                <ButtonLink href="/admin/students/applications/new" size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New application
                </ButtonLink>
              )
            }
          />
        )}
      </Card>
    </div>
  );
}
