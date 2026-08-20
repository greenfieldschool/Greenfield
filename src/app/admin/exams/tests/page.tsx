import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";

type SubjectRow = { id: string; name: string };

type TestRow = {
  id: string;
  subject_id: string | null;
  name: string;
  description: string | null;
  duration_minutes: number;
  active: boolean;
  subjects: Array<{ id: string; name: string }>;
};

export default async function AdminExamTestsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const subjectFilter = typeof sp.subject_id === "string" ? sp.subject_id.trim() : "";
  const statusFilter = typeof sp.status === "string" ? sp.status.trim() : "";
  const page = Number(sp.page ?? "1") || 1;
  const pageSize = 15;
  const offset = (page - 1) * pageSize;

  // 1. Fetch subjects for dropdown option list
  const { data: subjectsData } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("active", true)
    .order("name");
  const subjects = (subjectsData ?? []) as SubjectRow[];

  // 2. Fetch ALL tests to compute metrics
  const { data: metricsTests } = await supabase
    .from("exam_tests")
    .select("id, active, subject_id");
  const allTests = metricsTests ?? [];

  const totalTests = allTests.length;
  const activeCount = allTests.filter((t) => t.active).length;
  const inactiveCount = allTests.filter((t) => !t.active).length;
  const uniqueSubjectsCount = new Set(allTests.map((t) => t.subject_id).filter(Boolean)).size;

  // 3. Build filtered tests list query with exact count
  let testsQuery = supabase
    .from("exam_tests")
    .select("id, subject_id, name, description, duration_minutes, active, subjects(id, name)", { count: "exact" });

  if (query.length > 0) {
    testsQuery = testsQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
  }
  if (subjectFilter.length > 0) {
    testsQuery = testsQuery.eq("subject_id", subjectFilter);
  }
  if (statusFilter.length > 0) {
    testsQuery = testsQuery.eq("active", statusFilter === "active");
  }

  const { data: testsList, count } = await testsQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const tests = (testsList ?? []) as unknown as TestRow[];
  const totalCount = count ?? 0;
  const isFiltered = query.length > 0 || subjectFilter.length > 0 || statusFilter.length > 0;

  async function createTest(formData: FormData) {
    "use server";

    const subjectIdRaw = String(formData.get("subject_id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const durationMinutes = Number(String(formData.get("duration_minutes") ?? "60").trim() || "60");
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!name) return;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("exam_tests").insert({
      subject_id: subjectIdRaw.length ? subjectIdRaw : null,
      name,
      description: description.length ? description : null,
      duration_minutes: durationMinutes,
      active
    });

    revalidatePath("/admin/exams/tests");
    redirect(`/admin/exams/tests?toast=${encodeURIComponent("Test created")}&toast_type=success`);
  }

  async function duplicateTest(formData: FormData) {
    "use server";

    const testId = String(formData.get("test_id") ?? "").trim();
    if (!testId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    // 1. Fetch original test
    const { data: testData } = await supabase
      .from("exam_tests")
      .select("subject_id, name, description, duration_minutes")
      .eq("id", testId)
      .maybeSingle();

    if (!testData) return;

    // 2. Insert duplicated test
    const { data: newTest, error: testErr } = await supabase
      .from("exam_tests")
      .insert({
        subject_id: testData.subject_id,
        name: `${testData.name} (Copy)`,
        description: testData.description,
        duration_minutes: testData.duration_minutes,
        active: true
      })
      .select("id")
      .maybeSingle();

    if (testErr || !newTest) return;

    // 3. Fetch questions
    const { data: questions } = await supabase
      .from("exam_questions")
      .select("id, question_type, prompt, marks, options")
      .eq("test_id", testId);

    if (questions && questions.length > 0) {
      for (const q of questions) {
        const { data: newQ } = await supabase
          .from("exam_questions")
          .insert({
            test_id: newTest.id,
            question_type: q.question_type,
            prompt: q.prompt,
            marks: q.marks,
            options: q.options
          })
          .select("id")
          .maybeSingle();

        if (newQ) {
          const { data: sol } = await supabase
            .from("exam_question_solutions")
            .select("correct_answer, explanation")
            .eq("question_id", q.id)
            .maybeSingle();

          if (sol) {
            await supabase.from("exam_question_solutions").insert({
              question_id: newQ.id,
              correct_answer: sol.correct_answer,
              explanation: sol.explanation
            });
          }
        }
      }
    }

    revalidatePath("/admin/exams/tests");
    redirect(`/admin/exams/tests?toast=${encodeURIComponent("Test duplicated successfully")}&toast_type=success`);
  }

  async function filterTests(formData: FormData) {
    "use server";

    const q = String(formData.get("q") ?? "").trim();
    const subjectId = String(formData.get("subject_id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    const params = new URLSearchParams();
    if (q.length) params.set("q", q);
    if (subjectId.length) params.set("subject_id", subjectId);
    if (status.length) params.set("status", status);

    const queryString = params.toString();
    redirect(queryString.length ? `/admin/exams/tests?${queryString}` : "/admin/exams/tests");
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Admin</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Tests</h1>
          <p className="mt-1 text-sm text-slate-500">
            {totalTests} test{totalTests !== 1 ? "s" : ""} total · {activeCount} active
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
        {/* Total Tests */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Tests</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{totalTests}</div>
          <div className="mt-1 text-xs text-slate-500">All registered exam templates</div>
        </div>

        {/* Active Tests */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Active Tests</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-emerald-800">{activeCount}</div>
          <div className="mt-1 text-xs text-emerald-700">Available to schedule in sessions</div>
        </div>

        {/* Inactive Tests */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Inactive</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-slate-900">{inactiveCount}</div>
          <div className="mt-1 text-xs text-slate-500">Draft or retired templates</div>
        </div>

        {/* Subjects Linked */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Subjects Represented</div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
              <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold text-indigo-800">{uniqueSubjectsCount}</div>
          <div className="mt-1 text-xs text-slate-500">Active subject categories</div>
        </div>
      </div>

      {/* Filters form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form action={filterTests} className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Search</label>
              <div className="relative mt-1">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                  name="q"
                  placeholder="Test name or description..."
                  defaultValue={query}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Subject</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-green focus:bg-white focus:ring-2 focus:ring-brand-green/20 transition-all"
                name="subject_id"
                defaultValue={subjectFilter}
              >
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
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
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
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
                href="/admin/exams/tests"
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
            {query ? <span>for &ldquo;<strong>{query}</strong>&rdquo;</span> : null}
          </div>
        ) : null}
      </div>

      {/* Add New Test Form */}
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New test</h2>
        <form action={createTest} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Subject (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="subject_id"
              defaultValue=""
            >
              <option value="">—</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Duration (minutes)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="duration_minutes"
              type="number"
              min={1}
              defaultValue={60}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Test name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="name"
              placeholder="Mid-term examination"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Description</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="description"
              placeholder="(optional)"
            />
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input className="h-4 w-4" name="active" type="checkbox" defaultChecked />
              Active
            </label>
          </div>

          <div className="flex items-end sm:col-span-2">
            <SubmitButton
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              pendingText="Creating…"
            >
              Create test
            </SubmitButton>
          </div>
        </form>
      </div>

      {/* Tests Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-5">Test</div>
          <div className="col-span-3">Subject</div>
          <div className="col-span-2">Duration</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        <div className="divide-y divide-slate-200">
          {tests.length ? (
            tests.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-12 gap-0 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50/50 items-center"
              >
                <div className="col-span-5 font-semibold text-slate-900">
                  <Link href={`/admin/exams/tests/${t.id}`} className="hover:text-brand-green hover:underline">
                    {t.name}
                  </Link>
                </div>
                <div className="col-span-3">{(t.subjects ?? [])[0]?.name ?? "—"}</div>
                <div className="col-span-2">{t.duration_minutes}m</div>
                <div className="col-span-1">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${t.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                    {t.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="col-span-1 flex items-center justify-end gap-2">
                  <form action={duplicateTest}>
                    <input type="hidden" name="test_id" value={t.id} />
                    <button
                      type="submit"
                      title="Duplicate entire test and questions"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all shadow-sm"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                      </svg>
                    </button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No tests match query.</div>
          )}
        </div>

        {/* Pagination controls */}
        {totalCount > pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-1 justify-between sm:hidden">
              {page > 1 ? (
                <Link
                  href={`/admin/exams/tests?page=${page - 1}${query ? `&q=${encodeURIComponent(query)}` : ""}${subjectFilter ? `&subject_id=${subjectFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
                  className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Previous
                </Link>
              ) : (
                <span className="relative inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400">
                  Previous
                </span>
              )}
              {offset + tests.length < totalCount ? (
                <Link
                  href={`/admin/exams/tests?page=${page + 1}${query ? `&q=${encodeURIComponent(query)}` : ""}${subjectFilter ? `&subject_id=${subjectFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
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
                    href={`/admin/exams/tests?page=${page - 1}${query ? `&q=${encodeURIComponent(query)}` : ""}${subjectFilter ? `&subject_id=${subjectFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
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
                      href={`/admin/exams/tests?page=${p}${query ? `&q=${encodeURIComponent(query)}` : ""}${subjectFilter ? `&subject_id=${subjectFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
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
                {offset + tests.length < totalCount && (
                  <Link
                    href={`/admin/exams/tests?page=${page + 1}${query ? `&q=${encodeURIComponent(query)}` : ""}${subjectFilter ? `&subject_id=${subjectFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`}
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
