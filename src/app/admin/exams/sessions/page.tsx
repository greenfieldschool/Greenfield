import Link from "next/link";
import { getTeacherAccess, teacherTestFilter } from "@/lib/teacher-access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  CalendarDays,
  CircleCheck,
  ClipboardList,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Lock,
  Pencil,
  PencilLine,
  Plus,
  Search,
  Users,
  X
} from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { Pagination, SessionStatusBadge } from "../_components/exam-ui";
import AdminSessionsDebugLogger from "./AdminSessionsDebugLogger";
import UrlToast from "@/components/url-toast";
import { safeFilterTerm } from "@/lib/postgrest";
import { formatLagosDate, lagosEndOfDayIso, lagosStartOfDayIso, sessionVisibility } from "@/lib/lagos-dates";
import { failWithToast, NO_DB_MESSAGE } from "../_components/feedback";

type TestRow = { id: string; name: string };
type ClassRow = { id: string; level: string; name: string };
type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type SessionRow = {
  id: string;
  test_id: string;
  class_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  requires_secret_code: boolean;
  active: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("DatabaseTimeout")), ms))
  ]);
}

export default async function AdminExamSessionsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const debugRaw = sp.debug;
  const debugValue = Array.isArray(debugRaw) ? (debugRaw[0] ?? "") : (debugRaw ?? "");
  const debug = debugValue === "1" || debugValue === "true";

  const search = typeof sp.search === "string" ? sp.search.trim() : "";
  const classFilter = typeof sp.class_id === "string" ? sp.class_id.trim() : "";
  const statusFilter = typeof sp.status === "string" ? sp.status.trim() : "";
  const page = Number(sp.page ?? "1") || 1;
  const pageSize = 15;
  const offset = (page - 1) * pageSize;

  let totalCount = 0;
  let loadErrorMsg: string | null = null;

  let sessionRows: SessionRow[] = [];
  let testRows: TestRow[] = [];
  let classRows: ClassRow[] = [];
  let yearRows: YearRow[] = [];
  let termRows: TermRow[] = [];

  // Compute metrics (all sessions count)
  let totalSessionsCount = 0;
  let activeSessionsCount = 0;
  let draftSessionsCount = 0;
  let closedSessionsCount = 0;

  try {
    // 1. Get all tests & classes for mapping names and filter lists
    // Teachers only get the tests of the subjects they teach (their sessions are limited the same way by the database).
    const testLimit = teacherTestFilter(await getTeacherAccess(supabase));
    let testsQuery = supabase
      .from("exam_tests")
      .select("id, name")
      .eq("active", true);
    if (testLimit) testsQuery = testsQuery.or(testLimit);
    testsQuery = testsQuery
      .order("created_at", { ascending: false })
      .limit(500);
    const { data: testsData, error: testsError } = await withTimeout(Promise.resolve(testsQuery), 12000);
    if (testsError && !loadErrorMsg) {
      loadErrorMsg = String(testsError.message ?? "");
    }
    testRows = (testsData ?? []) as TestRow[];

    const classesQuery = supabase
      .from("classes")
      .select("id, level, name")
      .eq("active", true)
      .order("level")
      .order("name")
      .limit(500);
    const { data: classesData, error: classesError } = await withTimeout(Promise.resolve(classesQuery), 12000);
    if (classesError && !loadErrorMsg) {
      loadErrorMsg = String(classesError.message ?? "");
    }
    classRows = (classesData ?? []) as ClassRow[];

    const yearsQuery = supabase
      .from("academic_years")
      .select("id, name")
      .order("name", { ascending: false })
      .limit(50);
    const { data: yearsData, error: yearsError } = await withTimeout(Promise.resolve(yearsQuery), 12000);
    if (yearsError && !loadErrorMsg) {
      loadErrorMsg = String(yearsError.message ?? "");
    }
    yearRows = (yearsData ?? []) as YearRow[];

    const termsQuery = supabase
      .from("academic_terms")
      .select("id, name")
      .order("starts_on", { ascending: false })
      .limit(50);
    const { data: termsData, error: termsError } = await withTimeout(Promise.resolve(termsQuery), 12000);
    if (termsError && !loadErrorMsg) {
      loadErrorMsg = String(termsError.message ?? "");
    }
    termRows = (termsData ?? []) as TermRow[];

    // 2. Compute metrics (no filters applied)
    const { data: allSessions } = await supabase
      .from("exam_test_sessions")
      .select("id, status");
    if (allSessions) {
      totalSessionsCount = allSessions.length;
      activeSessionsCount = allSessions.filter((s) => s.status === "active").length;
      draftSessionsCount = allSessions.filter((s) => s.status === "draft").length;
      closedSessionsCount = allSessions.filter((s) => s.status === "closed").length;
    }

    // 3. Build paginated & filtered sessions query
    let matchTestIds: string[] = [];
    const isSearchActive = search.length > 0;

    if (isSearchActive) {
      const { data: matchedTests } = await supabase
        .from("exam_tests")
        .select("id")
        .ilike("name", `%${safeFilterTerm(search)}%`);
      matchTestIds = matchedTests?.map((t) => t.id) ?? [];
    }

    let sessionsQuery = supabase
      .from("exam_test_sessions")
      .select("id, test_id, class_id, starts_at, ends_at, status, requires_secret_code, active", { count: "exact" });

    if (isSearchActive) {
      if (matchTestIds.length > 0) {
        sessionsQuery = sessionsQuery.in("test_id", matchTestIds);
      } else {
        // Match nothing if query doesn't find tests
        sessionsQuery = sessionsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
      }
    }

    if (classFilter.length > 0) {
      sessionsQuery = sessionsQuery.eq("class_id", classFilter);
    }

    if (statusFilter.length > 0) {
      sessionsQuery = sessionsQuery.eq("status", statusFilter);
    }

    const { data: sessionsData, count, error: sessionsError } = await withTimeout(
      Promise.resolve(
        sessionsQuery
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1)
      ),
      12000
    );

    if (sessionsError) {
      loadErrorMsg = String(sessionsError.message ?? "");
    }
    sessionRows = ((sessionsData ?? []) as unknown as SessionRow[]) ?? [];
    totalCount = count ?? 0;

  } catch (e) {
    if (!loadErrorMsg) {
      loadErrorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  const testsById = new Map<string, TestRow>();
  for (const t of testRows) {
    if (t?.id) testsById.set(t.id, t);
  }
  const classesById = new Map<string, ClassRow>();
  for (const c of classRows) {
    if (c?.id) classesById.set(c.id, c);
  }

  const isFiltered = search.length > 0 || classFilter.length > 0 || statusFilter.length > 0;

  async function createSession(formData: FormData) {
    "use server";

    const testId = String(formData.get("test_id") ?? "").trim();
    const classIdRaw = String(formData.get("class_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "").trim();
    const endDate = String(formData.get("end_date") ?? "").trim();
    const status = String(formData.get("status") ?? "active").trim() || "active";
    const requiresSecretCode = String(formData.get("requires_secret_code") ?? "").trim() === "on";
    const secretCode = String(formData.get("secret_code") ?? "").trim();

    if (!testId) failWithToast("/admin/exams/sessions", "Select a test.");
    if (startDate && endDate && endDate < startDate) {
      redirect(`/admin/exams/sessions?toast=${encodeURIComponent("End date cannot be before the start date")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast("/admin/exams/sessions", NO_DB_MESSAGE);

    const { error: insertError } = await supabase.from("exam_test_sessions").insert({
      test_id: testId,
      class_id: classIdRaw.length ? classIdRaw : null,
      academic_year_id: yearIdRaw.length ? yearIdRaw : null,
      academic_term_id: termIdRaw.length ? termIdRaw : null,
      starts_at: startDate.length ? lagosStartOfDayIso(startDate) : null,
      ends_at: endDate.length ? lagosEndOfDayIso(endDate) : null,
      status,
      requires_secret_code: requiresSecretCode,
      secret_code: requiresSecretCode && secretCode.length ? secretCode : null
    });

    if (insertError) {
      redirect(
        `/admin/exams/sessions?toast=${encodeURIComponent(`Could not schedule the session: ${insertError.message}`)}&toast_type=error`
      );
    }

    revalidatePath("/admin/exams/sessions");
    redirect(`/admin/exams/sessions?toast=${encodeURIComponent("Session scheduled")}&toast_type=success`);
  }

  async function filterSessions(formData: FormData) {
    "use server";

    const q = String(formData.get("search") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    const params = new URLSearchParams();
    if (q.length) params.set("search", q);
    if (classId.length) params.set("class_id", classId);
    if (status.length) params.set("status", status);

    const queryString = params.toString();
    redirect(queryString.length ? `/admin/exams/sessions?${queryString}` : "/admin/exams/sessions");
  }

  const pageSuffix = `${search ? `&search=${encodeURIComponent(search)}` : ""}${classFilter ? `&class_id=${classFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`;

  return (
    <div className="space-y-6">
      {debug ? <AdminSessionsDebugLogger enabled={debug} loadErrorMsg={loadErrorMsg} sessions={sessionRows} /> : null}
      <UrlToast />

      <PageHeader
        back={{ href: "/admin/exams", label: "Back to exams" }}
        eyebrow="Exams"
        title="Sessions"
        description={`${totalSessionsCount} session${totalSessionsCount !== 1 ? "s" : ""} scheduled total · ${activeSessionsCount} active`}
        actions={
          <a href="#new-session" className={buttonClasses({ variant: "primary" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New session
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total sessions" value={totalSessionsCount} hint="All scheduled exam instances" icon={CalendarDays} tone="slate" />
        <StatCard label="Active" value={activeSessionsCount} hint="Currently live and open to students" icon={CircleCheck} tone="green" />
        <StatCard label="Draft" value={draftSessionsCount} hint="Unpublished planning templates" icon={PencilLine} tone="gold" />
        <StatCard label="Closed" value={closedSessionsCount} hint="Concluded exam papers" icon={Lock} tone="slate" />
      </div>

      <Card>
        <CardBody>
          <form action={filterSessions} className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <Field label="Search" htmlFor="filter-search">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    id="filter-search"
                    className="gf-input pl-9"
                    name="search"
                    placeholder="Search by test name..."
                    defaultValue={search}
                  />
                </div>
              </Field>
              <Field label="Class" htmlFor="filter-class">
                <select id="filter-class" className="gf-select" name="class_id" defaultValue={classFilter}>
                  <option value="">All classes</option>
                  {classRows.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.level} - {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status" htmlFor="filter-status">
                <select id="filter-status" className="gf-select" name="status" defaultValue={statusFilter}>
                  <option value="">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
            </div>

            <div className="flex shrink-0 gap-2">
              <SubmitButton variant="primary" pendingText="Filtering…">
                Filter
              </SubmitButton>
              {isFiltered ? (
                <a href="/admin/exams/sessions" className={buttonClasses({ variant: "secondary" })}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  Clear
                </a>
              ) : null}
            </div>
          </form>

          {isFiltered ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              Showing {totalCount} result{totalCount !== 1 ? "s" : ""}
              {search ? <span>for &ldquo;<strong>{search}</strong>&rdquo;</span> : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <form action={createSession}>
        <FormSection
          id="new-session"
          title="New session"
          description="Schedule a test for a class. Students see it between the start and end dates while it is active."
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              Create session
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Test" htmlFor="new-test" required>
              <select id="new-test" className="gf-select" name="test_id" defaultValue="" required>
                <option value="">Select test</option>
                {testRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Class (optional)" htmlFor="new-class">
              <select id="new-class" className="gf-select" name="class_id" defaultValue="">
                <option value="">—</option>
                {classRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic year (optional)" htmlFor="new-year">
              <select id="new-year" className="gf-select" name="academic_year_id" defaultValue="">
                <option value="">—</option>
                {yearRows.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic term (optional)" htmlFor="new-term">
              <select id="new-term" className="gf-select" name="academic_term_id" defaultValue="">
                <option value="">—</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date (optional)" htmlFor="new-start" hint="Students can see the exam from the start of this day.">
              <input id="new-start" className="gf-input" name="start_date" type="date" />
            </Field>
            <Field
              label="End date (optional)"
              htmlFor="new-end"
              hint={<>Open until the end of this day. The time allowed comes from the test&apos;s duration.</>}
            >
              <input id="new-end" className="gf-input" name="end_date" type="date" />
            </Field>
            <Field label="Status" htmlFor="new-status">
              <select id="new-status" className="gf-select" name="status" defaultValue="active">
                <option value="active">active (students can take it within the dates)</option>
                <option value="draft">draft (hidden from students)</option>
                <option value="closed">closed</option>
              </select>
            </Field>
            <Field label="Secret code (optional)" htmlFor="new-secret">
              <input id="new-secret" className="gf-input" name="secret_code" placeholder="Only if required" />
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <input className="gf-checkbox" name="requires_secret_code" type="checkbox" />
                Require secret code to start
              </label>
            </Field>
          </div>
        </FormSection>
      </form>

      {loadErrorMsg ? (
        <Alert tone="warning" title="Sessions temporarily unavailable">
          {loadErrorMsg}
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Scheduled sessions" description={`${totalCount} session${totalCount !== 1 ? "s" : ""}${isFiltered ? " match your filters" : ""}`} />
        {sessionRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Class</th>
                  <th>Dates / student access</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessionRows.map((s) => {
                  const test = testsById.get(s.test_id) ?? null;
                  const cls = s.class_id ? (classesById.get(s.class_id) ?? null) : null;
                  const windowLabel =
                    s.starts_at || s.ends_at
                      ? `${s.starts_at ? formatLagosDate(s.starts_at) : "Any time"} → ${s.ends_at ? formatLagosDate(s.ends_at) : "no end"}`
                      : "No date limit";
                  const visibility = sessionVisibility(s);
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/admin/exams/sessions/${s.id}`} className="font-semibold text-slate-900 hover:text-brand-green hover:underline">
                          {test?.name ?? s.test_id}
                        </Link>
                      </td>
                      <td>{cls ? `${cls.level} - ${cls.name}` : "—"}</td>
                      <td>
                        <div className="text-slate-700">{windowLabel}</div>
                        <div
                          className={`mt-1 inline-flex items-center gap-1.5 text-xs font-semibold ${
                            visibility.visible ? "text-brand-green-700" : "text-brand-gold-800"
                          }`}
                        >
                          {visibility.visible ? (
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {visibility.reason}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <SessionStatusBadge status={s.status} />
                          {s.requires_secret_code ? (
                            <Badge tone="violet">
                              <KeyRound className="h-3 w-3" aria-hidden="true" />
                              code
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={`/admin/exams/sessions/${s.id}`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                          </Link>
                          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={`/admin/exams/sessions/${s.id}/attempts`}>
                            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                            Attempts
                          </Link>
                          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={`/admin/exams/sessions/${s.id}/conductors`}>
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            Conductors
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No sessions match query."
            description={isFiltered ? "Try a different search or clear the filters." : "Schedule your first session using the form above."}
          />
        )}

        <Pagination
          basePath="/admin/exams/sessions"
          suffix={pageSuffix}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          hasNext={offset + sessionRows.length < totalCount}
        />
      </Card>
    </div>
  );
}
