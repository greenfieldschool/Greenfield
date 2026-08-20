import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import AdminSessionsDebugLogger from "./AdminSessionsDebugLogger";
import UrlToast from "@/components/url-toast";

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

  try {
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

  async function createSession(formData: FormData) {
    "use server";

    const testId = String(formData.get("test_id") ?? "").trim();
    const classIdRaw = String(formData.get("class_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const startsAt = String(formData.get("starts_at") ?? "").trim();
    const endsAt = String(formData.get("ends_at") ?? "").trim();
    const status = String(formData.get("status") ?? "draft").trim() || "draft";
    const requiresSecretCode = String(formData.get("requires_secret_code") ?? "").trim() === "on";
    const secretCode = String(formData.get("secret_code") ?? "").trim();

    if (!testId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("exam_test_sessions").insert({
      test_id: testId,
      class_id: classIdRaw.length ? classIdRaw : null,
      academic_year_id: yearIdRaw.length ? yearIdRaw : null,
      academic_term_id: termIdRaw.length ? termIdRaw : null,
      starts_at: startsAt.length ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt.length ? new Date(endsAt).toISOString() : null,
      status,
      requires_secret_code: requiresSecretCode,
      secret_code: requiresSecretCode && secretCode.length ? secretCode : null
    });

    revalidatePath("/admin/exams/sessions");
    redirect(`/admin/exams/sessions?toast=${encodeURIComponent("Session scheduled")}&toast_type=success`);
  }

  return (
    <div className="space-y-6">
      {debug ? <AdminSessionsDebugLogger enabled={debug} loadErrorMsg={loadErrorMsg} sessions={sessionRows} /> : null}
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sessions</h1>
        <p className="mt-2 text-sm text-slate-600">Schedule test sessions for classes and validity windows.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/exams">
            Back to exams
          </Link>
        </div>
      </div>

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
            <label className="text-sm font-semibold text-slate-900">Starts at (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="starts_at"
              type="datetime-local"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Ends at (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="ends_at"
              type="datetime-local"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Status</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="status"
              defaultValue="draft"
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
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

      <div className="space-y-4">
        {/* Search filter controls */}
        <div className="flex justify-between items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <form method="GET" action="/admin/exams/sessions" className="flex items-center gap-2 w-full max-w-md">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search sessions by test name..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            />
            {search && (
              <Link
                href="/admin/exams/sessions"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 hover:text-slate-900"
              >
                Clear
              </Link>
            )}
            <button
              type="submit"
              className="rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 transition-all"
            >
              Search
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
            <div className="col-span-4">Test</div>
            <div className="col-span-3">Class</div>
            <div className="col-span-3">Window</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          <div className="divide-y divide-slate-100">
            {sessionRows.length ? (
              sessionRows.map((s) => {
                const test = testsById.get(s.test_id) ?? null;
                const cls = s.class_id ? (classesById.get(s.class_id) ?? null) : null;
                const windowLabel =
                  s.starts_at || s.ends_at
                    ? `${s.starts_at ? String(s.starts_at).slice(0, 16) : "—"} → ${s.ends_at ? String(s.ends_at).slice(0, 16) : "—"}`
                    : "—";
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
                    <div className="col-span-3 text-xs text-slate-600">{windowLabel}</div>
                    <div className="col-span-2 flex flex-col items-end gap-1">
                      <div className="text-[11px] font-semibold text-slate-500">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
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
                    href={`/admin/exams/sessions?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
                    href={`/admin/exams/sessions?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
                      href={`/admin/exams/sessions?page=${page - 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
                        href={`/admin/exams/sessions?page=${p}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
                      href={`/admin/exams/sessions?page=${page + 1}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
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
    </div>
  );
}
