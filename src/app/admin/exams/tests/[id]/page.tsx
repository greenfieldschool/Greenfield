import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Braces, ChevronDown, Clock, Copy, Eye, ListChecks, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import ConfirmActionButton from "@/components/confirm-action-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { formatDescriptionWithTargets, parseDescriptionAndTargets } from "@/lib/exam-targets";
import UrlToast from "@/components/url-toast";

type TestRow = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
};

type QuestionRow = {
  id: string;
  question_type: string;
  prompt: string;
  marks: number;
  options: unknown | null;
  active: boolean;
};

type SolutionRow = {
  question_id: string;
  correct_answer: unknown | null;
  explanation: string | null;
};

const questionTypes = [
  "mcq_single",
  "mcq_multi",
  "true_false",
  "fill_blank",
  "short_answer",
  "essay"
] as const;

const questionTypeTones: Record<string, BadgeTone> = {
  mcq_single: "blue",
  mcq_multi: "violet",
  true_false: "gold",
  fill_blank: "green",
  short_answer: "slate",
  essay: "slate"
};

function questionTypeLabel(t: string) {
  switch (t) {
    case "mcq_single":
      return "Multiple choice (single answer)";
    case "mcq_multi":
      return "Multiple choice (multiple answers)";
    case "true_false":
      return "True / False";
    case "fill_blank":
      return "Fill in the blank";
    case "short_answer":
      return "Short answer";
    case "essay":
      return "Essay";
    default:
      return t;
  }
}

function questionTypeShortLabel(t: string) {
  switch (t) {
    case "mcq_single":
      return "MCQ (Single)";
    case "mcq_multi":
      return "MCQ (Multi)";
    case "true_false":
      return "True / False";
    case "fill_blank":
      return "Fill Blank";
    case "short_answer":
      return "Short Answer";
    case "essay":
      return "Essay";
    default:
      return t;
  }
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function getMcqOptions(v: unknown): Array<{ key: string; label: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ key: string; label: string }> = [];
  for (const item of v) {
    const key = safeString((item as { key?: unknown })?.key).trim();
    const label = safeString((item as { label?: unknown })?.label).trim();
    if (key.length && label.length) out.push({ key, label });
  }
  return out;
}

function getCorrectMcqKeys(v: unknown): string[] {
  if (!v || typeof v !== "object") return [];
  const asObj = v as { value?: unknown; values?: unknown };
  const single = safeString(asObj.value).trim();
  const multi = Array.isArray(asObj.values) ? asObj.values.map((x) => safeString(x).trim()).filter(Boolean) : [];
  if (single.length) return [single];
  if (multi.length) return multi;
  return [];
}

function getCorrectBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (!v || typeof v !== "object") return null;
  const asObj = v as { value?: unknown };
  if (typeof asObj.value === "boolean") return asObj.value;
  return null;
}

function getCorrectFillBlank(v: unknown): string {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object") return "";
  const asObj = v as { value?: unknown };
  return safeString(asObj.value).trim();
}

// Send the admin back to the test editor with an error toast (usable from inline server actions).
function failTo(testId: string, message: string): never {
  redirect(`/admin/exams/tests/${testId}?toast=${encodeURIComponent(message)}&toast_type=error`);
}

const FROZEN_MESSAGE = "Students have already sat this test, so its questions are locked.";
const NO_DB_MESSAGE = "Database is not configured.";

async function checkTestFrozen(supabase: ReturnType<typeof getSupabaseServerClient>, testId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: sessionRows } = await supabase
    .from("exam_test_sessions")
    .select("id")
    .eq("test_id", testId);
  const sessionIds = sessionRows?.map((s) => s.id) ?? [];
  if (sessionIds.length > 0) {
    const { count } = await supabase
      .from("exam_attempts")
      .select("id", { count: "exact", head: true })
      .in("session_id", sessionIds);
    return (count ?? 0) > 0;
  }
  return false;
}

export default async function AdminExamTestDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  // Check if test is frozen (taken by students)
  const isFrozen = await checkTestFrozen(supabase, id);

  const [{ data: testData }, { data: questionsData }] = await Promise.all([
    supabase.from("exam_tests").select("id, name, description, duration_minutes").eq("id", id).maybeSingle(),
    supabase
      .from("exam_questions")
      .select("id, question_type, prompt, marks, options, active")
      .eq("test_id", id)
      .order("created_at", { ascending: false })
  ]);

  const test = (testData ?? null) as TestRow | null;
  if (!test) return null;

  const questions = (questionsData ?? []) as QuestionRow[];

  // Only this test's solutions.
  const questionIds = questions.map((q) => q.id);
  let solutions: SolutionRow[] = [];
  if (questionIds.length) {
    const { data: solutionsData } = await supabase
      .from("exam_question_solutions")
      .select("question_id, correct_answer, explanation")
      .in("question_id", questionIds);
    solutions = (solutionsData ?? []) as SolutionRow[];
  }
  const solutionByQuestionId = new Map(solutions.map((s) => [s.question_id, s] as const));

  // Parse description and targets
  const { description: displayDescription, targets } = parseDescriptionAndTargets(test.description);

  // Compute stats
  const actualCounts: Record<string, number> = {};
  for (const type of questionTypes) {
    actualCounts[type] = 0;
  }
  for (const q of questions) {
    if (q.question_type in actualCounts) {
      actualCounts[q.question_type]++;
    }
  }

  let totalTarget = 0;
  let totalSet = 0;
  const leftToSet: Array<{ type: string; count: number }> = [];

  for (const type of questionTypes) {
    const target = targets[type] ?? 0;
    const actual = actualCounts[type] ?? 0;
    totalTarget += target;
    totalSet += actual;
    if (target > actual) {
      leftToSet.push({ type, count: target - actual });
    }
  }

  async function updateQuestionTargets(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) failTo(id, NO_DB_MESSAGE);

    if (await checkTestFrozen(supabase, id)) failTo(id, FROZEN_MESSAGE);

    const { data: currentTest } = await supabase
      .from("exam_tests")
      .select("description")
      .eq("id", id)
      .maybeSingle();

    if (!currentTest) failTo(id, "Test not found.");

    const { description: cleanDesc } = parseDescriptionAndTargets(currentTest.description);

    const newTargets: Record<string, number> = {};
    for (const type of questionTypes) {
      const val = Number(formData.get(`target_${type}`) ?? "0");
      if (val > 0) {
        newTargets[type] = val;
      }
    }

    const updatedDesc = formatDescriptionWithTargets(cleanDesc, newTargets);

    await supabase
      .from("exam_tests")
      .update({ description: updatedDesc })
      .eq("id", id);

    revalidatePath(`/admin/exams/tests/${id}`);
  }

  async function updateTestDetails(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const durationMinutes = Number(String(formData.get("duration_minutes") ?? "").trim());
    if (!name || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      redirect(`/admin/exams/tests/${id}?toast=${encodeURIComponent("Enter a name and a duration above 0")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) failTo(id, NO_DB_MESSAGE);

    await supabase
      .from("exam_tests")
      .update({ name, duration_minutes: Math.round(durationMinutes) })
      .eq("id", id);

    revalidatePath(`/admin/exams/tests/${id}`);
    revalidatePath("/admin/exams/tests");
    revalidatePath("/portal/exams");
    redirect(`/admin/exams/tests/${id}?toast=${encodeURIComponent("Test details saved")}&toast_type=success`);
  }

  async function createQuestion(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) failTo(id, NO_DB_MESSAGE);

    if (await checkTestFrozen(supabase, id)) failTo(id, FROZEN_MESSAGE);

    const questionType = String(formData.get("question_type") ?? "").trim();
    const prompt = String(formData.get("prompt") ?? "").trim();
    const marks = Number(String(formData.get("marks") ?? "1").trim() || "1");

    if (!questionType || !prompt) failTo(id, "Choose a question type and enter the prompt.");
    if (!Number.isFinite(marks) || marks <= 0) failTo(id, "Marks must be above 0.");

    await supabase.from("exam_questions").insert({
      test_id: id,
      question_type: questionType,
      prompt,
      marks
    });

    revalidatePath(`/admin/exams/tests/${id}`);
  }

  async function updateQuestion(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) failTo(id, NO_DB_MESSAGE);

    if (await checkTestFrozen(supabase, id)) failTo(id, FROZEN_MESSAGE);

    const questionId = String(formData.get("question_id") ?? "").trim();
    const questionType = String(formData.get("question_type") ?? "").trim();
    const prompt = String(formData.get("prompt") ?? "").trim();
    const explanation = String(formData.get("explanation") ?? "").trim();
    const marks = Number(String(formData.get("marks") ?? "0").trim() || "0");
    const optionsRaw = String(formData.get("options") ?? "").trim();
    const correctRaw = String(formData.get("correct_answer") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!questionId) failTo(id, "Question not found.");
    if (!prompt) failTo(id, "Enter the question prompt.");
    if (!Number.isFinite(marks) || marks <= 0) failTo(id, "Marks must be above 0.");

    let options: unknown = null;
    let correctAnswer: unknown = null;

    const optionA = String(formData.get("option_a") ?? "").trim();
    const optionB = String(formData.get("option_b") ?? "").trim();
    const optionC = String(formData.get("option_c") ?? "").trim();
    const optionD = String(formData.get("option_d") ?? "").trim();

    const correctSingle = String(formData.get("correct_single") ?? "").trim();
    const correctMulti = formData.getAll("correct_multi").map((v) => String(v ?? "").trim()).filter(Boolean);
    const correctTf = String(formData.get("correct_tf") ?? "").trim();
    const correctBlank = String(formData.get("correct_blank") ?? "").trim();

    const hasGuidedMcq = optionA.length || optionB.length || optionC.length || optionD.length;
    if ((questionType === "mcq_single" || questionType === "mcq_multi") && hasGuidedMcq) {
      const o: Array<{ key: string; label: string }> = [];
      if (optionA.length) o.push({ key: "A", label: optionA });
      if (optionB.length) o.push({ key: "B", label: optionB });
      if (optionC.length) o.push({ key: "C", label: optionC });
      if (optionD.length) o.push({ key: "D", label: optionD });
      options = o.length ? o : null;

      if (questionType === "mcq_single") {
        if (!correctSingle.length) failTo(id, "Choose the correct option.");
        correctAnswer = { value: correctSingle };
      } else {
        if (!correctMulti.length) failTo(id, "Tick at least one correct option.");
        correctAnswer = { values: correctMulti };
      }
    } else if (questionType === "true_false" && (correctTf === "true" || correctTf === "false")) {
      options = [
        { key: "true", label: "True" },
        { key: "false", label: "False" }
      ];
      correctAnswer = { value: correctTf === "true" };
    } else if (questionType === "fill_blank" && correctBlank.length) {
      correctAnswer = { value: correctBlank };
    } else if (questionType === "true_false" || questionType === "fill_blank") {
      failTo(id, "Set the correct answer.");
    } else if (optionsRaw.length) {
      try {
        options = JSON.parse(optionsRaw);
      } catch {
        failTo(id, "Options (JSON) is not valid JSON.");
      }
    }

    if ((correctAnswer === null || typeof correctAnswer === "undefined") && correctRaw.length) {
      try {
        correctAnswer = JSON.parse(correctRaw);
      } catch {
        failTo(id, "Correct answer (JSON) is not valid JSON.");
      }
    }

    await supabase
      .from("exam_questions")
      .update({
        prompt,
        marks,
        options,
        active
      })
      .eq("id", questionId)
      .eq("test_id", id);

    await supabase
      .from("exam_question_solutions")
      .upsert(
        {
          question_id: questionId,
          correct_answer: correctAnswer ?? null,
          explanation: explanation.length ? explanation : null
        },
        { onConflict: "question_id" }
      );

    revalidatePath(`/admin/exams/tests/${id}`);
  }

  async function deleteQuestion(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) failTo(id, NO_DB_MESSAGE);

    if (await checkTestFrozen(supabase, id)) {
      redirect(`/admin/exams/tests/${id}?error=cannot_delete_taken_question`);
    }

    const questionId = String(formData.get("question_id") ?? "").trim();
    if (!questionId) failTo(id, "Question not found.");

    // Delete question cascades to Solutions automatically
    await supabase.from("exam_questions").delete().eq("id", questionId).eq("test_id", id);

    revalidatePath(`/admin/exams/tests/${id}`);
  }

  async function duplicateQuestion(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) failTo(id, NO_DB_MESSAGE);

    if (await checkTestFrozen(supabase, id)) failTo(id, FROZEN_MESSAGE);

    const questionId = String(formData.get("question_id") ?? "").trim();
    if (!questionId) failTo(id, "Question not found.");

    // 1. Fetch original question
    const { data: qData } = await supabase
      .from("exam_questions")
      .select("question_type, prompt, marks, options")
      .eq("id", questionId)
      .maybeSingle();

    if (!qData) failTo(id, "Question not found.");

    // 2. Insert duplicated question
    const { data: newQ, error: newQErr } = await supabase
      .from("exam_questions")
      .insert({
        test_id: id,
        question_type: qData.question_type,
        prompt: `${qData.prompt} (Copy)`,
        marks: qData.marks,
        options: qData.options
      })
      .select("id")
      .maybeSingle();

    if (newQErr || !newQ) failTo(id, newQErr?.message ?? "Could not duplicate the question.");

    // 3. Fetch original solution
    const { data: solData } = await supabase
      .from("exam_question_solutions")
      .select("correct_answer, explanation")
      .eq("question_id", questionId)
      .maybeSingle();

    // 4. Insert duplicated solution if exists
    if (solData) {
      await supabase.from("exam_question_solutions").insert({
        question_id: newQ.id,
        correct_answer: solData.correct_answer,
        explanation: solData.explanation
      });
    }

    revalidatePath(`/admin/exams/tests/${id}`);
  }

  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  const overallPercent = totalTarget > 0 ? Math.min(100, Math.round((totalSet / totalTarget) * 100)) : 0;

  return (
    <div className="space-y-6">
      <UrlToast />

      <PageHeader
        back={{ href: "/admin/exams/tests", label: "Back to tests" }}
        eyebrow="Exams"
        title={test.name}
        description={displayDescription || undefined}
        actions={
          <Link href={`/admin/exams/tests/${id}/preview`} className={buttonClasses({ variant: "secondary" })}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            Preview
          </Link>
        }
      />

      {isFrozen && (
        <Alert tone="warning" title="Exam record frozen">
          This exam has already been administered to classes and has recorded student attempts. Questions have been locked to
          preserve the absolute integrity of historical exam records and grades.
        </Alert>
      )}

      {error === "cannot_delete_taken_question" ? (
        <Alert tone="danger" title="Cannot delete question">
          Students have already taken this exam and submitted answers for this question. Deleting it would corrupt their grades.
          If you no longer want this question to be active, uncheck the <strong className="font-semibold">&quot;Active&quot;</strong>{" "}
          checkbox and save instead.
        </Alert>
      ) : null}

      {/* Test details */}
      <Card>
        <CardHeader
          title="Test details"
          description="Name and time allowed for this paper."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge tone="blue">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Duration: {test.duration_minutes} minutes
              </Badge>
              <Badge tone="slate">
                {questions.length} question{questions.length === 1 ? "" : "s"} · {totalMarks} mark{totalMarks === 1 ? "" : "s"}
              </Badge>
            </div>
          }
        />
        <CardBody>
          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand-green-700 hover:text-brand-green [&::-webkit-details-marker]:hidden">
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit test name and duration
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <form action={updateTestDetails} className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Test name" htmlFor="test-name" className="sm:col-span-2">
                <input id="test-name" className="gf-input" name="name" defaultValue={test.name} required />
              </Field>
              <Field label="Duration (minutes)" htmlFor="test-duration">
                <input
                  id="test-duration"
                  className="gf-input"
                  name="duration_minutes"
                  type="number"
                  min={1}
                  defaultValue={test.duration_minutes}
                  required
                />
              </Field>
              <div className="flex justify-end sm:col-span-3">
                <SubmitButton variant="primary" size="sm" pendingText="Saving…">
                  Save details
                </SubmitButton>
              </div>
            </form>
          </details>
        </CardBody>
      </Card>

      {/* Question targets tracker */}
      <Card>
        <CardHeader
          title="Question targets"
          description="Specify and track how many questions of each type you need to set."
          action={
            totalTarget > 0 ? (
              <Badge tone={totalSet >= totalTarget ? "green" : "gold"}>
                {totalSet} / {totalTarget} set
              </Badge>
            ) : null
          }
        />
        <CardBody className="space-y-5">
          {totalTarget > 0 ? (
            <>
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">Overall progress</span>
                  <span className="font-semibold text-slate-900">{overallPercent}%</span>
                </div>
                <div
                  className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={overallPercent}
                  aria-label="Overall question target progress"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${overallPercent === 100 ? "bg-brand-green-500" : "bg-brand-gold"}`}
                    style={{ width: `${overallPercent}%` }}
                  />
                </div>
              </div>

              {totalSet < totalTarget ? (
                <Alert tone="warning">
                  Quota remaining: {totalTarget - totalSet} question{totalTarget - totalSet > 1 ? "s" : ""} left to set (
                  {leftToSet.map((item) => `${item.count} ${questionTypeShortLabel(item.type)}`).join(", ")})
                </Alert>
              ) : (
                <Alert tone="success">
                  All targets met! You set {totalSet} / {totalTarget} questions.
                </Alert>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {questionTypes.map((type) => {
                  const target = targets[type] ?? 0;
                  if (target === 0) return null;
                  const actual = actualCounts[type] ?? 0;
                  const percent = Math.min(100, Math.round((actual / target) * 100));
                  return (
                    <div key={type} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-slate-700" title={questionTypeLabel(type)}>
                          {questionTypeLabel(type)}
                        </span>
                        <span className="shrink-0 font-semibold text-slate-900">
                          {actual} / {target}
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            percent === 100 ? "bg-brand-green-500" : percent > 50 ? "bg-brand-gold" : "bg-brand-green-300"
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No targets set yet. Add how many questions of each type this paper needs.</p>
          )}

          {!isFrozen && (
            <details className="group border-t border-slate-100 pt-4">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand-green-700 hover:text-brand-green [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Configure question targets
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <form action={updateQuestionTargets} className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {questionTypes.map((type) => (
                  <div key={type}>
                    <label htmlFor={`target-${type}`} className="gf-label whitespace-nowrap" title={questionTypeLabel(type)}>
                      {questionTypeShortLabel(type)}
                    </label>
                    <input
                      id={`target-${type}`}
                      type="number"
                      name={`target_${type}`}
                      min={0}
                      defaultValue={targets[type] ?? 0}
                      className="gf-input"
                    />
                  </div>
                ))}
                <div className="col-span-2 flex justify-end sm:col-span-3 lg:col-span-6">
                  <SubmitButton variant="primary" size="sm" pendingText="Updating Targets...">
                    Save targets
                  </SubmitButton>
                </div>
              </form>
            </details>
          )}
        </CardBody>
      </Card>

      {!isFrozen && (
        <form action={createQuestion}>
          <FormSection
            title="Add question"
            description="Create the question here, then set its options and correct answer in the list below."
            footer={
              <SubmitButton variant="primary" pendingText="Creating…">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create question
              </SubmitButton>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="new-question-type">
                <select id="new-question-type" className="gf-select" name="question_type" defaultValue={questionTypes[0]}>
                  {questionTypes.map((t) => (
                    <option key={t} value={t}>
                      {questionTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Marks" htmlFor="new-question-marks" required>
                <input
                  id="new-question-marks"
                  className="gf-input"
                  name="marks"
                  type="number"
                  step="0.01"
                  min={0.01}
                  defaultValue={1}
                  required
                />
              </Field>
              <Field label="Prompt" htmlFor="new-question-prompt" required className="sm:col-span-2">
                <textarea id="new-question-prompt" className="gf-input" name="prompt" rows={5} required />
              </Field>
            </div>
          </FormSection>
        </form>
      )}

      {/* Existing questions */}
      <section aria-labelledby="questions-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="questions-heading" className="text-base font-semibold text-slate-900">
            {isFrozen ? "Questions (read-only)" : "Questions"}
          </h2>
          <span className="text-sm text-slate-500">
            {questions.length} question{questions.length === 1 ? "" : "s"}
          </span>
        </div>

        {questions.length ? (
          questions.map((q, index) => {
            const sol = solutionByQuestionId.get(q.id) ?? null;
            const number = questions.length - index;
            const fid = `q-${q.id}`;
            return (
              <Card key={q.id} className={q.active ? undefined : "opacity-90"}>
                <form action={updateQuestion}>
                  <input type="hidden" name="question_id" value={q.id} />
                  <input type="hidden" name="question_type" value={q.question_type} />
                  <input type="hidden" name="_sol_present" value={sol ? "1" : "0"} />

                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5 sm:px-6">
                    <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg bg-brand-green-50 px-2 text-xs font-bold text-brand-green-700">
                      Q{number}
                    </span>
                    <Badge tone={questionTypeTones[q.question_type] ?? "slate"}>{questionTypeLabel(q.question_type)}</Badge>
                    <Badge tone="slate">
                      {q.marks} mark{Number(q.marks) === 1 ? "" : "s"}
                    </Badge>
                    {!q.active ? <Badge tone="red">Inactive</Badge> : null}
                  </div>

                  <div className="grid gap-4 px-5 py-5 sm:px-6">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Prompt" htmlFor={`${fid}-prompt`} className="sm:col-span-2">
                        <textarea
                          id={`${fid}-prompt`}
                          className="gf-input"
                          name="prompt"
                          defaultValue={q.prompt}
                          rows={3}
                          required
                          disabled={isFrozen}
                        />
                      </Field>
                      <Field label="Marks" htmlFor={`${fid}-marks`}>
                        <input
                          id={`${fid}-marks`}
                          className="gf-input"
                          name="marks"
                          type="number"
                          step="0.01"
                          min={0.01}
                          defaultValue={String(q.marks)}
                          required
                          disabled={isFrozen}
                        />
                        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                          <input className="gf-checkbox" name="active" type="checkbox" defaultChecked={q.active} disabled={isFrozen} />
                          Active
                        </label>
                      </Field>
                    </div>

                    {q.question_type === "mcq_single" ||
                    q.question_type === "mcq_multi" ||
                    q.question_type === "true_false" ||
                    q.question_type === "fill_blank" ? (
                      <div className="grid gap-4">
                        {(() => {
                          const options = getMcqOptions(q.options);
                          const correctKeys = getCorrectMcqKeys(sol?.correct_answer ?? null);
                          const correctBool = getCorrectBoolean(sol?.correct_answer ?? null);
                          const correctBlank = getCorrectFillBlank(sol?.correct_answer ?? null);

                          const optionByKey = new Map(options.map((o) => [o.key, o.label] as const));

                          if (q.question_type === "mcq_single" || q.question_type === "mcq_multi") {
                            return (
                              <div className="grid gap-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">Options</div>
                                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    {(["A", "B", "C", "D"] as const).map((k) => (
                                      <div key={k}>
                                        <label htmlFor={`${fid}-option-${k}`} className="gf-label">
                                          Option {k}
                                        </label>
                                        <input
                                          id={`${fid}-option-${k}`}
                                          className="gf-input"
                                          name={`option_${k.toLowerCase()}`}
                                          defaultValue={optionByKey.get(k) ?? ""}
                                          placeholder="(optional)"
                                          disabled={isFrozen}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  {q.question_type === "mcq_single" ? (
                                    <Field label="Correct answer" htmlFor={`${fid}-correct`} className="sm:max-w-xs">
                                      <select
                                        id={`${fid}-correct`}
                                        className="gf-select"
                                        name="correct_single"
                                        defaultValue={correctKeys[0] ?? ""}
                                        required
                                        disabled={isFrozen}
                                      >
                                        <option value="">—</option>
                                        {["A", "B", "C", "D"].map((k) => (
                                          <option key={k} value={k}>
                                            {k}
                                          </option>
                                        ))}
                                      </select>
                                    </Field>
                                  ) : (
                                    <fieldset>
                                      <legend className="gf-label">Correct answer</legend>
                                      <div className="flex flex-wrap gap-2">
                                        {["A", "B", "C", "D"].map((k) => (
                                          <label
                                            key={k}
                                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                          >
                                            <input
                                              className="gf-checkbox"
                                              type="checkbox"
                                              name="correct_multi"
                                              value={k}
                                              defaultChecked={correctKeys.includes(k)}
                                              disabled={isFrozen}
                                            />
                                            {k}
                                          </label>
                                        ))}
                                      </div>
                                    </fieldset>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          if (q.question_type === "true_false") {
                            return (
                              <Field label="Correct answer" htmlFor={`${fid}-correct`} className="sm:max-w-xs">
                                <select
                                  id={`${fid}-correct`}
                                  className="gf-select"
                                  name="correct_tf"
                                  defaultValue={correctBool === null ? "" : correctBool ? "true" : "false"}
                                  required
                                  disabled={isFrozen}
                                >
                                  <option value="">—</option>
                                  <option value="true">True</option>
                                  <option value="false">False</option>
                                </select>
                              </Field>
                            );
                          }

                          if (q.question_type === "fill_blank") {
                            return (
                              <Field label="Correct answer" htmlFor={`${fid}-correct`}>
                                <input
                                  id={`${fid}-correct`}
                                  className="gf-input"
                                  name="correct_blank"
                                  defaultValue={correctBlank}
                                  placeholder="Type the exact answer"
                                  required
                                  disabled={isFrozen}
                                />
                              </Field>
                            );
                          }

                          return null;
                        })()}

                        <details className="group rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
                            <Braces className="h-3.5 w-3.5" aria-hidden="true" />
                            Advanced (JSON)
                            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true" />
                          </summary>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <Field label="Options (JSON)" htmlFor={`${fid}-options-json`}>
                              <textarea
                                id={`${fid}-options-json`}
                                className="gf-input font-mono text-xs"
                                name="options"
                                defaultValue={q.options ? JSON.stringify(q.options, null, 2) : ""}
                                rows={6}
                                placeholder='e.g. [{"key":"A","label":"Option A"}]'
                                disabled={isFrozen}
                              />
                            </Field>
                            <Field label="Correct answer (JSON)" htmlFor={`${fid}-correct-json`}>
                              <textarea
                                id={`${fid}-correct-json`}
                                className="gf-input font-mono text-xs"
                                name="correct_answer"
                                defaultValue={(sol?.correct_answer ?? null) ? JSON.stringify(sol?.correct_answer, null, 2) : ""}
                                rows={6}
                                placeholder='e.g. {"value":"A"}'
                                disabled={isFrozen}
                              />
                            </Field>
                          </div>
                        </details>
                      </div>
                    ) : null}

                    <Field label="Explanation (optional)" htmlFor={`${fid}-explanation`}>
                      <textarea
                        id={`${fid}-explanation`}
                        className="gf-input"
                        name="explanation"
                        defaultValue={sol?.explanation ?? ""}
                        rows={3}
                        placeholder="Shown after grading/release"
                        disabled={isFrozen}
                      />
                    </Field>
                  </div>

                  {!isFrozen && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">
                      <ConfirmActionButton
                        formAction={deleteQuestion}
                        confirmMessage="Delete this question? This cannot be undone."
                        className={buttonClasses({
                          variant: "ghost",
                          size: "sm",
                          className: "text-red-600 hover:bg-red-50 hover:text-red-700"
                        })}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Delete
                      </ConfirmActionButton>
                      <div className="flex items-center gap-2">
                        <button formAction={duplicateQuestion} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          Duplicate
                        </button>
                        <SubmitButton variant="primary" size="sm" pendingText="Saving…">
                          Save question
                        </SubmitButton>
                      </div>
                    </div>
                  )}
                </form>
              </Card>
            );
          })
        ) : (
          <Card>
            <EmptyState
              icon={ListChecks}
              title="No questions yet."
              description={isFrozen ? undefined : "Use the form above to add the first question to this test."}
            />
          </Card>
        )}
      </section>
    </div>
  );
}
