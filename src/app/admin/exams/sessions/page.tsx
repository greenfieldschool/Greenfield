import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import AdminSessionsDebugLogger from "./AdminSessionsDebugLogger";
import UrlToast from "@/components/url-toast";
import { formatLagosDate, lagosEndOfDayIso, lagosStartOfDayIso, sessionVisibility } from "@/lib/lagos-dates";

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
    const testsQuery = supabase
      .from("exam_tests")
      .select("id, name")
      .eq("active", true)
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
        .ilike("name", `%${search}%`);
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

    if (!testId) return;
    if (startDate && endDate && endDate < startDate) {
      redirect(`/admin/exams/sessions?toast=${encodeURIComponent("End date cannot be before the start date")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("exam_test_sessions").insert({
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

  return (
    <div className="space-y-6">
      {debug ? <AdminSessionsDebugLogger enabled={debug} loadErrorMsg={loadErrorMsg} sessions={sessionRows} /> : null}
      <UrlToast />

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Admin</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Sessions</h1>
          <p className="mt-1 text-sm text-slate-500">
            {totalSessionsCount} session{totalSessionsCount !== 1 ? "s" : ""} scheduled total · {activeSessionsCount} active
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-all"
            href="/admin/exams"
          >
            Back to exams
          </Link>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Sessions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Sessions</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{totalSessionsCount}</div>
          <div className="mt-1 text-xs text-slate-500">All scheduled exam instances</div>
        </div>

        {/* Active Sessions */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Active</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-emerald-800">{activeSessionsCount}</div>
          <div className="mt-1 text-xs text-emerald-700">Currently live and open to students</div>
        </div>

        {/* Draft Sessions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Draft</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{draftSessionsCount}</div>
          <div className="mt-1 text-xs text-slate-500">Unpublished planning templates</div>
        </div>

        {/* Closed Sessions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Closed</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{closedSessionsCount}</div>
          <div className="mt-1 text-xs text-slate-500">Concluded exam papers</div>
        </div>
      </div>

      {/* Filters form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form action={filterSessions} className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Search</label>
              <div className="relative mt-1">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                  name="search"
                  placeholder="Search by test name..."
                  defaultValue={search}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Class</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                name="class_id"
                defaultValue={classFilter}
              >
                <option value="">All classes</option>
                {classRows.map((c) => (
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
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <SubmitButton
              className="inline-flex items-center gap-2 rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 transition-all"
              pendingText="Filtering…"
            >
              Filter
            </SubmitButton>
            {isFiltered ? (
              <a
                href="/admin/exams/sessions"
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
            Showing {totalCount} result{totalCount !== 1 ? "s" : ""}
            {search ? <span>for &ldquo;<strong>{search}</strong>&rdquo;</span> : null}
          </div>
        ) : null}
      </div>

      {/* New Session setup form */}
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New session</h2>
        <form action={createSession} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Test</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="test_id"
              defaultValue=""
              required
            >
              <option value="">Select test</option>
              {testRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Class (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="class_id"
              defaultValue=""
            >
              <option value="">—</option>
              {classRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level} - {c.name}
                </option>
              ))}
            </select>
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
          <div>
            <label className="text-sm font-semibold text-slate-900">Start date (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="start_date"
              type="date"
            />
            <p className="mt-1 text-xs text-slate-500">Students can see the exam from the start of this day.</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">End date (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="end_date"
              type="date"
            />
            <p className="mt-1 text-xs text-slate-500">Open until the end of this day. The time allowed comes from the test&apos;s duration.</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Status</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="status"
              defaultValue="active"
            >
              <option value="active">active (students can take it within the dates)</option>
              <option value="draft">draft (hidden from students)</option>
              <option value="closed">closed</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Secret code (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="secret_code"
              placeholder="Only if required"
            />
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input className="h-4 w-4" name="requires_secret_code" type="checkbox" />
              Require secret code to start
            </label>
          </div>
          <div className="flex items-end sm:col-span-2">
            <SubmitButton
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              pendingText="Creating…"
            >
              Create session
            </SubmitButton>
          </div>
        </form>
      </div>

      {loadErrorMsg ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm">
          <div className="text-sm font-semibold">Sessions temporarily unavailable</div>
          <div className="mt-2 text-sm">{loadErrorMsg}</div>
        </div>
      ) : null}

      {/* Sessions Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Test</div>
          <div className="col-span-3">Class</div>
          <div className="col-span-3">Dates / student access</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <div className="divide-y divide-slate-100">
          {sessionRows.length ? (
            sessionRows.map((s) => {
              const test = testsById.get(s.test_id) ?? null;
              const cls = s.class_id ? (classesById.get(s.class_id) ?? null) : null;
              const windowLabel =
                s.starts_at || s.ends_at
                  ? `${s.starts_at ? formatLagosDate(s.starts_at) : "Any time"} → ${s.ends_at ? formatLagosDate(s.ends_at) : "no end"}`
                  : "No date limit";
              const visibility = sessionVisibility(s);
              return (
                <div
                  key={s.id}
                  className="grid grid-cols-12 gap-0 px-6 py-4 text-sm text-slate-700 items-center hover:bg-slate-50/50"
                >
                  <div className="col-span-4 font-semibold text-slate-900">
                    <Link href={`/admin/exams/sessions/${s.id}`} className="hover:text-brand-green hover:underline">
                      {test?.name ?? s.test_id}
                    </Link>
                  </div>
                  <div className="col-span-3">{cls ? `${cls.level} - ${cls.name}` : "—"}</div>
                  <div className="col-span-3 text-xs text-slate-600">
                    <div>{windowLabel}</div>
                    <div className={`mt-1 font-semibold ${visibility.visible ? "text-emerald-700" : "text-amber-700"}`}>
                      {visibility.visible ? "● " : "○ "}
                      {visibility.reason}
                    </div>
                  </div>
                  <div className="col-span-2 flex flex-col items-end gap-1">
                    <div className="text-[11px] font-semibold text-slate-500">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        s.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                        s.status === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {s.status}
                      </span>
                      {s.requires_secret_code ? " • code" : ""}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 mt-1">
                      <Link
                        className="text-xs font-semibold text-brand-green hover:underline"
                        href={`/admin/exams/sessions/${s.id}`}
                      >
                        Edit
                      </Link>
                      <span className="text-slate-300">|</span>
                      <Link className="text-xs font-semibold text-brand-green hover:underline" href={`/admin/exams/sessions/${s.id}/attempts`}>
                        Attempts
                      </Link>
                      <span className="text-slate-300">|</span>
                      <Link
                        className="text-xs font-semibold text-brand-green hover:underline"
                        href={`/admin/exams/sessions/${s.id}/conductors`}
                      >
                        Conductors
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No sessions match query.</div>
          )}
        </div>

        {/* Pagination controls */}
        {totalCount > pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-1 justify-between sm:hidden">
              {page > 1 ? (
                <Link
                  href={`/admin/exams/sessions?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}${classFilter ? `&class_id=${classFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
                  className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Previous
                </Link>
              ) : (
                <span className="relative inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400">
                  Previous
                </span>
              )}
              {offset + sessionRows.length < totalCount ? (
                <Link
                  href={`/admin/exams/sessions?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}${classFilter ? `&class_id=${classFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
                  className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Next
                </Link>
              ) : (
                <span className="relative ml-3 inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400">
                  Next
                </span>
              )}
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-700">
                  Showing <span className="font-semibold">{offset + 1}</span> to{" "}
                  <span className="font-semibold">{Math.min(offset + pageSize, totalCount)}</span> of{" "}
                  <span className="font-semibold">{totalCount}</span> results
                </p>
              </div>
              <div className="flex items-center gap-1">
                {page > 1 && (
                  <Link
                    href={`/admin/exams/sessions?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}${classFilter ? `&class_id=${classFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Previous
                  </Link>
                )}
                {Array.from({ length: Math.ceil(totalCount / pageSize) }).map((_, i) => {
                  const p = i + 1;
                  const isCurrent = p === page;
                  return (
                    <Link
                      key={p}
                      href={`/admin/exams/sessions?page=${p}${search ? `&search=${encodeURIComponent(search)}` : ""}${classFilter ? `&class_id=${classFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition-all ${
                        isCurrent
                          ? "border-brand-green bg-brand-green text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {p}
                    </Link>
                  );
                })}
                {offset + sessionRows.length < totalCount && (
                  <Link
                    href={`/admin/exams/sessions?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}${classFilter ? `&class_id=${classFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
