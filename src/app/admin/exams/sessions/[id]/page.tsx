import Link from "next/link";
import { getTeacherAccess, teacherTestFilter } from "@/lib/teacher-access";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CalendarX, ClipboardList, ListChecks, Pencil, Users } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { lagosEndOfDayIso, lagosStartOfDayIso, sessionVisibility, toLagosDateInput } from "@/lib/lagos-dates";
import UrlToast from "@/components/url-toast";
import { failWithToast, NO_DB_MESSAGE } from "../../_components/feedback";
import {
  countByType,
  formatDescriptionWithTargets,
  groupCounts,
  hasTargets,
  parseDescriptionAndTargets,
  targetProgress
} from "@/lib/exam-targets";

type SessionRow = {
  id: string;
  test_id: string;
  class_id: string | null;
  academic_year_id: string | null;
  academic_term_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  requires_secret_code: boolean;
  secret_code: string | null;
  active: boolean;
};

type TestRow = { id: string; name: string };

type ClassRow = { id: string; level: string; name: string };

type YearRow = { id: string; name: string };

type TermRow = { id: string; name: string };

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("DatabaseTimeout")), ms))
  ]);
}


export default async function AdminExamSessionEditPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  // Teachers only get the tests of the subjects they teach.
  const testLimit = teacherTestFilter(await getTeacherAccess(supabase));

  let loadErrorMsg: string | null = null;
  let sessionData: unknown = null;
  let tests: unknown = null;
  let classes: unknown = null;
  let years: unknown = null;
  let terms: unknown = null;

  try {
    const result = await withTimeout(
      Promise.all([
        supabase
          .from("exam_test_sessions")
          .select(
            "id, test_id, class_id, academic_year_id, academic_term_id, starts_at, ends_at, status, requires_secret_code, secret_code, active"
          )
          .eq("id", id)
          .maybeSingle(),
        (() => {
          const q = supabase.from("exam_tests").select("id, name").eq("active", true);
          return (testLimit ? q.or(testLimit) : q).order("created_at", { ascending: false });
        })(),
        supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
        supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
        supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false })
      ]),
      6000
    );

    sessionData = (result[0] as { data?: unknown })?.data ?? null;
    tests = (result[1] as { data?: unknown })?.data ?? null;
    classes = (result[2] as { data?: unknown })?.data ?? null;
    years = (result[3] as { data?: unknown })?.data ?? null;
    terms = (result[4] as { data?: unknown })?.data ?? null;
  } catch (e) {
    loadErrorMsg = e instanceof Error ? e.message : String(e);
  }

  if (loadErrorMsg) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: "/admin/exams/sessions", label: "Back to sessions" }} eyebrow="Exams" title="Edit session" />
        <Alert tone="warning" title="Session editor temporarily unavailable">
          {loadErrorMsg}
        </Alert>
      </div>
    );
  }

  const session = (sessionData ?? null) as unknown as SessionRow | null;
  if (!session) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: "/admin/exams/sessions", label: "Back to sessions" }} eyebrow="Exams" title="Session not found" />
        <Card>
          <EmptyState
            icon={CalendarX}
            title="Session not found"
            description="It may have been deleted. Go back to the sessions list to pick another one."
          />
        </Card>
      </div>
    );
  }

  const testRows = (tests ?? []) as Array<TestRow & { inactive?: boolean }>;
  const classRows = (classes ?? []) as Array<ClassRow & { inactive?: boolean }>;
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];

  // The lists above only hold active tests/classes. Keep the session's current ones selectable
  // (marked inactive) so saving never silently switches them.
  if (session.test_id && !testRows.some((t) => t.id === session.test_id)) {
    const { data: currentTest } = await supabase.from("exam_tests").select("id, name").eq("id", session.test_id).maybeSingle();
    testRows.unshift({
      id: session.test_id,
      name: (currentTest as TestRow | null)?.name ?? "Current test",
      inactive: true
    });
  }
  if (session.class_id && !classRows.some((c) => c.id === session.class_id)) {
    const { data: currentClass } = await supabase.from("classes").select("id, level, name").eq("id", session.class_id).maybeSingle();
    const cls = currentClass as ClassRow | null;
    classRows.unshift({ id: session.class_id, level: cls?.level ?? "", name: cls?.name ?? "Current class", inactive: true });
  }
  if (session.academic_year_id && !yearRows.some((y) => y.id === session.academic_year_id)) {
    yearRows.unshift({ id: session.academic_year_id, name: "Current year" });
  }
  if (session.academic_term_id && !termRows.some((t) => t.id === session.academic_term_id)) {
    termRows.unshift({ id: session.academic_term_id, name: "Current term" });
  }

  // Number of questions planned for the session's test (stored as the test's targets), next to how
  // many are already set, so it can be changed for sessions that were created before targets existed.
  const [{ data: sessionTestData }, { data: sessionQuestionsData }] = await Promise.all([
    supabase.from("exam_tests").select("id, name, description").eq("id", session.test_id).maybeSingle(),
    supabase.from("exam_questions").select("question_type").eq("test_id", session.test_id)
  ]);
  const sessionTest = sessionTestData as { id: string; name: string; description: string | null } | null;
  const { targets } = parseDescriptionAndTargets(sessionTest?.description ?? null);
  const setCounts = countByType(((sessionQuestionsData ?? []) as Array<{ question_type: string }>).map((q) => q.question_type));
  const setGroups = groupCounts(setCounts);
  const progress = targetProgress(targets, setCounts);
  const perTypeMode = hasTargets(targets) && !(targets.objective > 0 || targets.theory > 0);
  const plannedGroups = perTypeMode ? groupCounts(targets) : { objective: targets.objective ?? 0, theory: targets.theory ?? 0 };

  async function updateQuestionNumbers(formData: FormData) {
    "use server";

    const path = `/admin/exams/sessions/${id}`;
    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(path, NO_DB_MESSAGE);

    // Use the session's saved test, not the (possibly changed, unsaved) select in the other form.
    const { data: current } = await supabase.from("exam_test_sessions").select("test_id").eq("id", id).maybeSingle();
    const testId = (current as { test_id: string } | null)?.test_id;
    if (!testId) failWithToast(path, "Session not found.");

    const objective = Math.max(0, Math.floor(Number(formData.get("target_objective") ?? "0") || 0));
    const theory = Math.max(0, Math.floor(Number(formData.get("target_theory") ?? "0") || 0));

    const { data: test } = await supabase.from("exam_tests").select("description").eq("id", testId).maybeSingle();
    if (!test) failWithToast(path, "Test not found.");

    const newTargets: Record<string, number> = {};
    if (objective > 0) newTargets.objective = objective;
    if (theory > 0) newTargets.theory = theory;
    const { description: cleanDesc } = parseDescriptionAndTargets((test as { description: string | null }).description);

    const { error: updateError } = await supabase
      .from("exam_tests")
      .update({ description: formatDescriptionWithTargets(cleanDesc, newTargets) })
      .eq("id", testId);
    if (updateError) failWithToast(path, `Could not save the number of questions: ${updateError.message}`);

    revalidatePath(path);
    revalidatePath(`/admin/exams/tests/${testId}`);
    revalidatePath("/admin/exams/tests");
    redirect(`${path}?toast=${encodeURIComponent("Number of questions saved")}&toast_type=success`);
  }

  async function updateSession(formData: FormData) {
    "use server";

    const testId = asString(formData.get("test_id")).trim();
    const classIdRaw = asString(formData.get("class_id")).trim();
    const yearIdRaw = asString(formData.get("academic_year_id")).trim();
    const termIdRaw = asString(formData.get("academic_term_id")).trim();
    const startDate = asString(formData.get("start_date")).trim();
    const endDate = asString(formData.get("end_date")).trim();
    const status = asString(formData.get("status")).trim() || "draft";
    const isActive = asString(formData.get("active")).trim() === "on";
    const requiresSecretCode = asString(formData.get("requires_secret_code")).trim() === "on";
    const secretCode = asString(formData.get("secret_code")).trim();

    if (!testId) failWithToast(`/admin/exams/sessions/${id}`, "Select a test.");
    if (startDate && endDate && endDate < startDate) {
      redirect(`/admin/exams/sessions/${id}?toast=${encodeURIComponent("End date cannot be before the start date")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(`/admin/exams/sessions/${id}`, NO_DB_MESSAGE);

    await supabase
      .from("exam_test_sessions")
      .update({
        test_id: testId,
        class_id: classIdRaw.length ? classIdRaw : null,
        academic_year_id: yearIdRaw.length ? yearIdRaw : null,
        academic_term_id: termIdRaw.length ? termIdRaw : null,
        starts_at: startDate.length ? lagosStartOfDayIso(startDate) : null,
        ends_at: endDate.length ? lagosEndOfDayIso(endDate) : null,
        status,
        active: isActive,
        requires_secret_code: requiresSecretCode,
        secret_code: requiresSecretCode && secretCode.length ? secretCode : null
      })
      .eq("id", id);

    revalidatePath("/admin/exams/sessions");
    revalidatePath(`/admin/exams/sessions/${id}`);
    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
    revalidatePath(`/admin/exams/sessions/${id}/conductors`);
    revalidatePath("/portal/exams");
    redirect(`/admin/exams/sessions/${id}?toast=${encodeURIComponent("Session saved")}&toast_type=success`);
  }

  const visibility = sessionVisibility(session);

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/exams/sessions", label: "Back to sessions" }}
        eyebrow="Exams"
        title="Edit session"
        description="Update the class, dates, and access settings for this session."
        actions={
          <>
            <Link className={buttonClasses({ variant: "secondary" })} href={`/admin/exams/sessions/${id}/attempts`}>
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Attempts &amp; results release
            </Link>
            <Link className={buttonClasses({ variant: "secondary" })} href={`/admin/exams/sessions/${id}/conductors`}>
              <Users className="h-4 w-4" aria-hidden="true" />
              Conductors
            </Link>
          </>
        }
      />

      <Alert tone={visibility.visible ? "success" : "warning"} title={<>Student access: {visibility.reason}</>}>
        {visibility.visible
          ? "Only students in the selected class, or every class if none is selected."
          : "Students cannot see this session right now."}
      </Alert>

      <form action={updateSession}>
        <FormSection
          title="Session settings"
          description="Which test, who sits it, and when."
          footer={
            <SubmitButton variant="primary" pendingText="Saving…">
              Save changes
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Test" htmlFor="session-test" required>
              <select id="session-test" className="gf-select" name="test_id" defaultValue={session.test_id} required>
                {testRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.inactive ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Class (optional)" htmlFor="session-class">
              <select id="session-class" className="gf-select" name="class_id" defaultValue={session.class_id ?? ""}>
                <option value="">—</option>
                {classRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                    {c.inactive ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Academic year (optional)" htmlFor="session-year">
              <select id="session-year" className="gf-select" name="academic_year_id" defaultValue={session.academic_year_id ?? ""}>
                <option value="">—</option>
                {yearRows.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Academic term (optional)" htmlFor="session-term">
              <select id="session-term" className="gf-select" name="academic_term_id" defaultValue={session.academic_term_id ?? ""}>
                <option value="">—</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Start date (optional)" htmlFor="session-start" hint="Students can see the exam from the start of this day.">
              <input
                id="session-start"
                className="gf-input"
                name="start_date"
                type="date"
                defaultValue={toLagosDateInput(session.starts_at)}
              />
            </Field>

            <Field
              label="End date (optional)"
              htmlFor="session-end"
              hint={<>Open until the end of this day. The time allowed comes from the test&apos;s duration.</>}
            >
              <input id="session-end" className="gf-input" name="end_date" type="date" defaultValue={toLagosDateInput(session.ends_at)} />
            </Field>

            <Field label="Status" htmlFor="session-status">
              <select id="session-status" className="gf-select" name="status" defaultValue={session.status}>
                <option value="active">active (students can take it within the dates)</option>
                <option value="draft">draft (hidden from students)</option>
                <option value="closed">closed</option>
              </select>
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input className="gf-checkbox" name="active" type="checkbox" defaultChecked={session.active} />
                Active
              </label>
            </Field>

            <Field label="Secret code (optional)" htmlFor="session-secret">
              <input
                id="session-secret"
                className="gf-input"
                name="secret_code"
                placeholder="Only if required"
                defaultValue={session.secret_code ?? ""}
              />
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  className="gf-checkbox"
                  name="requires_secret_code"
                  type="checkbox"
                  defaultChecked={session.requires_secret_code}
                />
                Require secret code to start
              </label>
            </Field>
          </div>
        </FormSection>
      </form>

      <form action={updateQuestionNumbers}>
        <FormSection
          title="Number of questions"
          description={
            <>
              How many questions <strong className="font-semibold text-slate-700">{sessionTest?.name ?? "this test"}</strong> should
              have. This is saved on the test, so every session using it shows the same numbers.
            </>
          }
          footer={
            <>
              <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={`/admin/exams/tests/${session.test_id}`}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Open test questions
              </Link>
              <SubmitButton variant="primary" pendingText="Saving…">
                Save number of questions
              </SubmitButton>
            </>
          }
        >
          <div className="space-y-4">
            <Alert
              tone={progress.totalTarget > 0 ? (progress.met ? "success" : "warning") : "info"}
              title={
                <>
                  <ListChecks className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden="true" />
                  {progress.totalTarget > 0
                    ? `${progress.totalSet} / ${progress.totalTarget} questions set`
                    : `${setGroups.objective + setGroups.theory} question${setGroups.objective + setGroups.theory === 1 ? "" : "s"} set, no number planned yet`}
                </>
              }
            >
              Already set: {setGroups.objective} objective and {setGroups.theory} theory.
              {progress.totalTarget > 0 && !progress.met ? ` ${progress.remaining} still to set.` : ""}
            </Alert>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Objective questions"
                htmlFor="session-target-objective"
                hint="Multiple choice, true / false and fill in the blank."
              >
                <input
                  id="session-target-objective"
                  className="gf-input"
                  name="target_objective"
                  type="number"
                  min={0}
                  defaultValue={hasTargets(targets) ? plannedGroups.objective : setGroups.objective}
                />
              </Field>
              <Field label="Theory questions" htmlFor="session-target-theory" hint="Short answer and essay questions.">
                <input
                  id="session-target-theory"
                  className="gf-input"
                  name="target_theory"
                  type="number"
                  min={0}
                  defaultValue={hasTargets(targets) ? plannedGroups.theory : setGroups.theory}
                />
              </Field>
            </div>
            {perTypeMode ? (
              <p className="text-xs text-slate-500">
                This test currently plans its questions by type. Saving here replaces that with the two totals above.
              </p>
            ) : null}
          </div>
        </FormSection>
      </form>
    </div>
  );
}
