import Link from "next/link";
import { getTeacherAccess, teachesSubject, teacherSubjectIds, teacherTestFilter } from "@/lib/teacher-access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Ban, BookOpen, CircleCheck, Clock, Copy, FileText, Info, Plus, Search, Trash2, X } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { Pagination } from "../_components/exam-ui";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { firstOrNull } from "@/lib/relations";
import { safeFilterTerm } from "@/lib/postgrest";
import {
  countByType,
  formatDescriptionWithTargets,
  groupCounts,
  hasTargets,
  parseDescriptionAndTargets,
  targetProgress,
  targetsFromCounts,
  type QuestionCounts
} from "@/lib/exam-targets";
import { fetchAllRows } from "@/lib/fetch-all";
import { failWithToast, NO_DB_MESSAGE } from "../_components/feedback";

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

  // Teachers only see the tests (and subjects) of the subjects they teach.
  const access = await getTeacherAccess(supabase);
  const testLimit = teacherTestFilter(access);
  const mySubjects = teacherSubjectIds(access);

  // 1. Fetch subjects for dropdown option list
  const { data: subjectsData } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("active", true)
    .order("name");
  const subjects = ((subjectsData ?? []) as SubjectRow[]).filter(
    (s) => !access.isTeacher || mySubjects === "all" || mySubjects.includes(s.id)
  );

  // 2. Fetch ALL tests to compute metrics
  let metricsQuery = supabase.from("exam_tests").select("id, active, subject_id, description");
  if (testLimit) metricsQuery = metricsQuery.or(testLimit);
  const { data: metricsTests } = await metricsQuery;
  const allTests = (metricsTests ?? []) as Array<{ id: string; active: boolean; subject_id: string | null; description: string | null }>;

  const totalTests = allTests.length;
  const activeCount = allTests.filter((t) => t.active).length;
  const inactiveCount = allTests.filter((t) => !t.active).length;
  const uniqueSubjectsCount = new Set(allTests.map((t) => t.subject_id).filter(Boolean)).size;

  // 3. Build filtered tests list query with exact count
  let testsQuery = supabase
    .from("exam_tests")
    .select("id, subject_id, name, description, duration_minutes, active, subjects(id, name)", { count: "exact" });

  if (testLimit) testsQuery = testsQuery.or(testLimit);
  if (query.length > 0) {
    const term = safeFilterTerm(query);
    if (term.length) testsQuery = testsQuery.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
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

  // Questions already set, per test and type — compared with the number planned.
  const questionRows = await fetchAllRows<{ test_id: string; question_type: string }>(() =>
    supabase.from("exam_questions").select("test_id, question_type").order("id", { ascending: true })
  );
  const typesByTest = new Map<string, string[]>();
  for (const q of questionRows) {
    const list = typesByTest.get(q.test_id) ?? [];
    list.push(q.question_type);
    typesByTest.set(q.test_id, list);
  }
  const countsByTest = new Map<string, QuestionCounts>(
    Array.from(typesByTest.entries()).map(([testId, types]) => [testId, countByType(types)] as const)
  );

  // Tests that already have questions but no planned numbers yet (older tests).
  const untargetedCount = allTests.filter(
    (t) => !hasTargets(parseDescriptionAndTargets(t.description).targets) && typesByTest.has(t.id)
  ).length;
  const totalCount = count ?? 0;
  const isFiltered = query.length > 0 || subjectFilter.length > 0 || statusFilter.length > 0;

  async function createTest(formData: FormData) {
    "use server";

    const subjectIdRaw = String(formData.get("subject_id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const durationMinutes = Number(String(formData.get("duration_minutes") ?? "60").trim() || "60");
    const active = String(formData.get("active") ?? "").trim() === "on";
    const objectiveCount = Math.max(0, Math.floor(Number(String(formData.get("objective_count") ?? "0").trim() || "0")));
    const theoryCount = Math.max(0, Math.floor(Number(String(formData.get("theory_count") ?? "0").trim() || "0")));

    if (!name) failWithToast("/admin/exams/tests", "Enter a test name.");
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) failWithToast("/admin/exams/tests", "Duration must be above 0 minutes.");

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast("/admin/exams/tests", NO_DB_MESSAGE);

    const teacherAccess = await getTeacherAccess(supabase);
    if (teacherAccess.isTeacher && !teachesSubject(teacherAccess, subjectIdRaw.length ? subjectIdRaw : null)) {
      failWithToast("/admin/exams/tests", "Choose a subject you teach. Ask an admin if it is missing from the list.");
    }

    // Number of questions is saved as question targets, tracked on the test page while questions are set.
    const targets: Record<string, number> = {};
    if (Number.isFinite(objectiveCount) && objectiveCount > 0) targets.objective = objectiveCount;
    if (Number.isFinite(theoryCount) && theoryCount > 0) targets.theory = theoryCount;
    const storedDescription = Object.keys(targets).length
      ? formatDescriptionWithTargets(description, targets)
      : description.length
        ? description
        : null;

    const { data: created, error } = await supabase
      .from("exam_tests")
      .insert({
        subject_id: subjectIdRaw.length ? subjectIdRaw : null,
        name,
        description: storedDescription,
        duration_minutes: durationMinutes,
        active
      })
      .select("id")
      .maybeSingle();

    revalidatePath("/admin/exams/tests");
    if (error || !created) {
      redirect(`/admin/exams/tests?toast=${encodeURIComponent(error?.message ?? "Could not create test")}&toast_type=error`);
    }
    redirect(`/admin/exams/tests/${created.id}?toast=${encodeURIComponent("Test created — now add the questions")}&toast_type=success`);
  }

  async function duplicateTest(formData: FormData) {
    "use server";

    const testId = String(formData.get("test_id") ?? "").trim();
    if (!testId) failWithToast("/admin/exams/tests", "Test not found.");

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast("/admin/exams/tests", NO_DB_MESSAGE);

    // 1. Fetch original test
    const { data: testData } = await supabase
      .from("exam_tests")
      .select("subject_id, name, description, duration_minutes")
      .eq("id", testId)
      .maybeSingle();

    if (!testData) failWithToast("/admin/exams/tests", "Test not found.");

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

    if (testErr || !newTest) failWithToast("/admin/exams/tests", testErr?.message ?? "Could not duplicate the test.");

    // 3. Fetch questions
    const { data: questions } = await supabase
      .from("exam_questions")
      .select("*")
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
            options: q.options,
            ...(q.image_url ? { image_url: q.image_url } : {})
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

  async function deleteTest(formData: FormData) {
    "use server";

    const testId = String(formData.get("test_id") ?? "").trim();
    if (!testId) failWithToast("/admin/exams/tests", "Test not found.");

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast("/admin/exams/tests", NO_DB_MESSAGE);

    // Deleting a test cascades to its sessions and attempts, so refuse when students have already sat it.
    const { data: sessions } = await supabase.from("exam_test_sessions").select("id").eq("test_id", testId);
    const sessionIds = (sessions ?? []).map((s) => s.id as string);

    if (sessionIds.length) {
      const { count: attemptCount } = await supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .in("session_id", sessionIds);

      if ((attemptCount ?? 0) > 0) {
        redirect(
          `/admin/exams/tests?toast=${encodeURIComponent(
            "This test has student attempts and cannot be deleted. Mark it inactive instead."
          )}&toast_type=error`
        );
      }
    }

    const { error } = await supabase.from("exam_tests").delete().eq("id", testId);
    if (error) {
      redirect(`/admin/exams/tests?toast=${encodeURIComponent(error.message)}&toast_type=error`);
    }

    revalidatePath("/admin/exams/tests");
    revalidatePath("/admin/exams/sessions");
    redirect(`/admin/exams/tests?toast=${encodeURIComponent("Test deleted")}&toast_type=success`);
  }

  // One click for older tests: use the questions already in each test as its planned numbers.
  async function setTargetsFromExistingQuestions() {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast("/admin/exams/tests", NO_DB_MESSAGE);

    const { data: tests } = await supabase.from("exam_tests").select("id, description");
    const rows = await fetchAllRows<{ test_id: string; question_type: string }>(() =>
      supabase.from("exam_questions").select("test_id, question_type").order("id", { ascending: true })
    );
    const byTest = new Map<string, string[]>();
    for (const q of rows) byTest.set(q.test_id, [...(byTest.get(q.test_id) ?? []), q.question_type]);

    let updated = 0;
    let failed = 0;
    for (const t of (tests ?? []) as Array<{ id: string; description: string | null }>) {
      const parsed = parseDescriptionAndTargets(t.description);
      const types = byTest.get(t.id);
      if (hasTargets(parsed.targets) || !types?.length) continue;
      const fromCounts = targetsFromCounts(countByType(types));
      if (!Object.keys(fromCounts).length) continue;
      const { error } = await supabase
        .from("exam_tests")
        .update({ description: formatDescriptionWithTargets(parsed.description, fromCounts) })
        .eq("id", t.id);
      if (error) failed += 1;
      else updated += 1;
    }

    revalidatePath("/admin/exams/tests");
    if (failed) {
      failWithToast("/admin/exams/tests", `Updated ${updated} test(s), but ${failed} could not be saved. Please try again.`);
    }
    redirect(
      `/admin/exams/tests?toast=${encodeURIComponent(
        updated ? `Planned numbers set for ${updated} test${updated === 1 ? "" : "s"} from their existing questions` : "No tests needed updating"
      )}&toast_type=success`
    );
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

  const pageSuffix = `${query ? `&q=${encodeURIComponent(query)}` : ""}${subjectFilter ? `&subject_id=${subjectFilter}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`;

  return (
    <div className="space-y-6">
      <UrlToast />

      <PageHeader
        back={{ href: "/admin/exams", label: "Back to exams" }}
        eyebrow="Exams"
        title="Tests"
        description={`${totalTests} test${totalTests !== 1 ? "s" : ""} total · ${activeCount} active`}
        actions={
          <a href="#new-test" className={buttonClasses({ variant: "primary" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New test
          </a>
        }
      />

      {untargetedCount > 0 ? (
        <Alert
          tone="info"
          title={`${untargetedCount} test${untargetedCount === 1 ? " has" : "s have"} questions but no planned numbers`}
          action={
            <form action={setTargetsFromExistingQuestions}>
              <ConfirmSubmitButton
                confirmMessage={`Use the questions already set as the planned objective / theory numbers for ${untargetedCount} test(s)? This only fills in tests that have no planned numbers yet.`}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                Use existing questions
              </ConfirmSubmitButton>
            </form>
          }
        >
          Older tests were set before planned numbers existed. One click fills in each test&apos;s objective and theory
          numbers from the questions it already has — you can still change them on each test.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total tests" value={totalTests} hint="All registered exam templates" icon={FileText} tone="slate" />
        <StatCard label="Active tests" value={activeCount} hint="Available to schedule in sessions" icon={CircleCheck} tone="green" />
        <StatCard label="Inactive" value={inactiveCount} hint="Draft or retired templates" icon={Ban} tone="gold" />
        <StatCard label="Subjects represented" value={uniqueSubjectsCount} hint="Active subject categories" icon={BookOpen} tone="violet" />
      </div>

      <Card>
        <CardBody>
          <form action={filterTests} className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <Field label="Search" htmlFor="filter-q">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    id="filter-q"
                    className="gf-input pl-9"
                    name="q"
                    placeholder="Test name or description..."
                    defaultValue={query}
                  />
                </div>
              </Field>
              <Field label="Subject" htmlFor="filter-subject">
                <select id="filter-subject" className="gf-select" name="subject_id" defaultValue={subjectFilter}>
                  <option value="">All subjects</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status" htmlFor="filter-status">
                <select id="filter-status" className="gf-select" name="status" defaultValue={statusFilter}>
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>

            <div className="flex shrink-0 gap-2">
              <SubmitButton variant="primary" pendingText="Filtering…">
                Filter
              </SubmitButton>
              {isFiltered ? (
                <a href="/admin/exams/tests" className={buttonClasses({ variant: "secondary" })}>
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
              {query ? <span>for &ldquo;<strong>{query}</strong>&rdquo;</span> : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <form action={createTest}>
        <FormSection
          id="new-test"
          title="New test"
          description="Set up the paper first, then add its questions on the next page."
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              Create test
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Test name" htmlFor="new-name" required className="sm:col-span-2">
              <input id="new-name" className="gf-input" name="name" placeholder="Mid-term examination" required />
            </Field>
            <Field
              label={access.isTeacher ? "Subject" : "Subject (optional)"}
              htmlFor="new-subject"
              required={access.isTeacher}
              hint={access.isTeacher ? "Only the subjects assigned to you are listed." : undefined}
            >
              <select id="new-subject" className="gf-select" name="subject_id" defaultValue="" required={access.isTeacher}>
                <option value="">{access.isTeacher ? "Select subject" : "—"}</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Duration (minutes)" htmlFor="new-duration" required>
              <input id="new-duration" className="gf-input" name="duration_minutes" type="number" min={1} defaultValue={60} required />
            </Field>
            <Field label="Number of objective questions" htmlFor="new-objective">
              <input id="new-objective" className="gf-input" name="objective_count" type="number" min={0} step={1} placeholder="e.g. 30" />
            </Field>
            <Field label="Number of theory questions" htmlFor="new-theory">
              <input
                id="new-theory"
                className="gf-input"
                name="theory_count"
                type="number"
                min={0}
                step={1}
                placeholder="e.g. 5 (leave empty if none)"
              />
            </Field>
            <Field label="Description" htmlFor="new-description" className="sm:col-span-2">
              <input id="new-description" className="gf-input" name="description" placeholder="(optional)" />
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input className="gf-checkbox" name="active" type="checkbox" defaultChecked />
                Active
              </label>
            </Field>
          </div>
        </FormSection>
      </form>

      <Card>
        <CardHeader title="All tests" description={`${totalCount} test${totalCount !== 1 ? "s" : ""}${isFiltered ? " match your filters" : ""}`} />
        {tests.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Subject</th>
                  <th>Duration / questions</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => {
                  const counts = countsByTest.get(t.id) ?? {};
                  const progress = targetProgress(parseDescriptionAndTargets(t.description).targets, counts);
                  const planned = progress.totalTarget;
                  const set = progress.totalSet;
                  const short = progress.remaining > 0;
                  const groups = groupCounts(counts);
                  const total = Object.values(counts).reduce((acc, n) => acc + n, 0);
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/admin/exams/tests/${t.id}`} className="font-semibold text-slate-900 hover:text-brand-green hover:underline">
                          {t.name}
                        </Link>
                      </td>
                      <td>{firstOrNull(t.subjects)?.name ?? "—"}</td>
                      <td>
                        <div className="inline-flex items-center gap-1.5 text-slate-700">
                          <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          {t.duration_minutes}m
                        </div>
                        <div className={`text-xs ${planned > 0 && short ? "font-semibold text-brand-gold-800" : "text-slate-500"}`}>
                          {planned > 0 ? `${set} / ${planned} questions` : `${total} question${total === 1 ? "" : "s"}`}
                        </div>
                        {total > 0 ? (
                          <div className="text-xs text-slate-500">
                            {groups.objective} objective · {groups.theory} theory
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Badge tone={t.active ? "green" : "slate"} dot>
                          {t.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          <form action={duplicateTest}>
                            <input type="hidden" name="test_id" value={t.id} />
                            <button
                              type="submit"
                              title="Duplicate entire test and questions"
                              aria-label={`Duplicate ${t.name}`}
                              className={buttonClasses({ variant: "secondary", size: "sm", className: "w-9 px-0" })}
                            >
                              <Copy className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </form>
                          <form action={deleteTest}>
                            <input type="hidden" name="test_id" value={t.id} />
                            <ConfirmSubmitButton
                              title="Delete test"
                              confirmMessage={`Delete "${t.name}" and all its questions? This cannot be undone.`}
                              className={buttonClasses({
                                variant: "secondary",
                                size: "sm",
                                className: "w-9 border-red-200 px-0 text-red-600 hover:border-red-300 hover:bg-red-50"
                              })}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">Delete {t.name}</span>
                            </ConfirmSubmitButton>
                          </form>
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
            icon={FileText}
            title="No tests match query."
            description={isFiltered ? "Try a different search or clear the filters." : "Create your first test using the form above."}
          />
        )}

        <Pagination
          basePath="/admin/exams/tests"
          suffix={pageSuffix}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          hasNext={offset + tests.length < totalCount}
        />
      </Card>
    </div>
  );
}
