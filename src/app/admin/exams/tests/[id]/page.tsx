import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";

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

function parseDescriptionAndTargets(desc: string | null) {
  const text = desc || "";
  const match = text.match(/\|\|TARGETS:(.*?)\|\|/);
  if (match) {
    try {
      const targets = JSON.parse(match[1]);
      const cleanDesc = text.replace(/\|\|TARGETS:.*?\|\|/, "").trim();
      return { description: cleanDesc, targets: targets as Record<string, number> };
    } catch {
      // ignore
    }
  }
  return { description: text, targets: {} as Record<string, number> };
}

function formatDescriptionWithTargets(cleanDesc: string, targets: Record<string, number>) {
  const jsonStr = JSON.stringify(targets);
  return `${cleanDesc.trim()} ||TARGETS:${jsonStr}||`;
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

  const [{ data: testData }, { data: questionsData }, { data: solutionsData }] = await Promise.all([
    supabase.from("exam_tests").select("id, name, description, duration_minutes").eq("id", id).maybeSingle(),
    supabase
      .from("exam_questions")
      .select("id, question_type, prompt, marks, options, active")
      .eq("test_id", id)
      .order("created_at", { ascending: false })
    ,
    supabase
      .from("exam_question_solutions")
      .select("question_id, correct_answer, explanation")
  ]);

  const test = (testData ?? null) as TestRow | null;
  if (!test) return null;

  const questions = (questionsData ?? []) as QuestionRow[];
  const solutions = (solutionsData ?? []) as SolutionRow[];
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
    if (!supabase) return;

    if (await checkTestFrozen(supabase, id)) return;

    const { data: currentTest } = await supabase
      .from("exam_tests")
      .select("description")
      .eq("id", id)
      .maybeSingle();

    if (!currentTest) return;

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

  async function createQuestion(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    if (await checkTestFrozen(supabase, id)) return;

    const questionType = String(formData.get("question_type") ?? "").trim();
    const prompt = String(formData.get("prompt") ?? "").trim();
    const marks = Number(String(formData.get("marks") ?? "1").trim() || "1");

    if (!questionType || !prompt) return;
    if (!Number.isFinite(marks) || marks <= 0) return;

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
    if (!supabase) return;

    if (await checkTestFrozen(supabase, id)) return;

    const questionId = String(formData.get("question_id") ?? "").trim();
    const questionType = String(formData.get("question_type") ?? "").trim();
    const prompt = String(formData.get("prompt") ?? "").trim();
    const explanation = String(formData.get("explanation") ?? "").trim();
    const marks = Number(String(formData.get("marks") ?? "0").trim() || "0");
    const optionsRaw = String(formData.get("options") ?? "").trim();
    const correctRaw = String(formData.get("correct_answer") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!questionId) return;
    if (!prompt) return;
    if (!Number.isFinite(marks) || marks <= 0) return;

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
        if (!correctSingle.length) return;
        correctAnswer = { value: correctSingle };
      } else {
        if (!correctMulti.length) return;
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
      return;
    } else if (optionsRaw.length) {
      try {
        options = JSON.parse(optionsRaw);
      } catch {
        return;
      }
    }

    if ((correctAnswer === null || typeof correctAnswer === "undefined") && correctRaw.length) {
      try {
        correctAnswer = JSON.parse(correctRaw);
      } catch {
        return;
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
    if (!supabase) return;

    if (await checkTestFrozen(supabase, id)) {
      redirect(`/admin/exams/tests/${id}?error=cannot_delete_taken_question`);
    }

    const questionId = String(formData.get("question_id") ?? "").trim();
    if (!questionId) return;

    // Delete question cascades to Solutions automatically
    await supabase.from("exam_questions").delete().eq("id", questionId).eq("test_id", id);

    revalidatePath(`/admin/exams/tests/${id}`);
  }

  async function duplicateQuestion(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    if (await checkTestFrozen(supabase, id)) return;

    const questionId = String(formData.get("question_id") ?? "").trim();
    if (!questionId) return;

    // 1. Fetch original question
    const { data: qData } = await supabase
      .from("exam_questions")
      .select("question_type, prompt, marks, options")
      .eq("id", questionId)
      .maybeSingle();

    if (!qData) return;

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

    if (newQErr || !newQ) return;

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

  return (
    <div className="space-y-6">
      {isFrozen && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-amber-900">Exam record frozen</div>
            <p className="mt-1 text-sm opacity-90">
              This exam has already been administered to classes and has recorded student attempts. Questions have been locked to preserve the absolute integrity of historical exam records and grades.
            </p>
          </div>
        </div>
      )}

      {error === "cannot_delete_taken_question" ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-950 shadow-sm flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold">Cannot delete question</div>
            <p className="mt-1 text-sm opacity-90">
              Students have already taken this exam and submitted answers for this question. Deleting it would corrupt their grades. If you no longer want this question to be active, uncheck the <strong className="font-semibold">&quot;Active&quot;</strong> checkbox and save instead.
            </p>
          </div>
        </div>
      ) : null}

      {/* Main header block */}
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{test.name}</h1>
        {displayDescription && <p className="mt-1 text-sm text-slate-500">{displayDescription}</p>}
        <p className="mt-2 text-sm text-slate-600">Duration: {test.duration_minutes} minutes</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/exams/tests">
            Back to tests
          </Link>
          <span className="mx-2 text-slate-300">|</span>
          <Link className="text-sm font-semibold text-brand-green hover:underline" href={`/admin/exams/tests/${id}/preview`}>
            Preview
          </Link>
        </div>
      </div>

      {/* Live Targets and Tracker Panel */}
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Question Targets &amp; Quota</h2>
            <p className="text-xs text-slate-500 mt-0.5">Specify and track how many questions of each type you need to set.</p>
          </div>
          {totalTarget > 0 && (
            <div className={`rounded-xl px-4 py-2 text-sm font-semibold ${totalSet >= totalTarget ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-amber-50 text-amber-800 border border-amber-100'}`}>
              {totalSet < totalTarget ? (
                <span>
                  Quota remaining: {totalTarget - totalSet} question{totalTarget - totalSet > 1 ? 's' : ''} left to set (
                  {leftToSet.map(item => `${item.count} ${questionTypeLabel(item.type).split(' ')[0]}`).join(', ')}
                  )
                </span>
              ) : (
                <span>🎉 All targets met! You set {totalSet} / {totalTarget} questions.</span>
              )}
            </div>
          )}
        </div>

        {/* Progress Grid */}
        {totalTarget > 0 && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {questionTypes.map((type) => {
              const target = targets[type] ?? 0;
              if (target === 0) return null;
              const actual = actualCounts[type] ?? 0;
              const percent = Math.min(100, Math.round((actual / target) * 100));
              return (
                <div key={type} className="rounded-2xl border border-slate-100 p-4 bg-slate-50/50">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-600 truncate mr-2" title={questionTypeLabel(type)}>
                      {questionTypeLabel(type)}
                    </span>
                    <span className="text-slate-900 shrink-0">{actual} / {target}</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${percent === 100 ? 'bg-emerald-500' : percent > 50 ? 'bg-amber-500' : 'bg-brand-green'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Form to update targets (only if not frozen) */}
        {!isFrozen && (
          <details className="mt-6 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700 hover:text-brand-green">
              Configure Question Targets
            </summary>
            <form action={updateQuestionTargets} className="mt-4 grid gap-4 sm:grid-cols-3 md:grid-cols-6">
              {questionTypes.map((type) => (
                <div key={type}>
                  <label className="text-xs font-semibold text-slate-600 truncate block" title={questionTypeLabel(type)}>
                    {questionTypeLabel(type).split(' ')[0]}...
                  </label>
                  <input
                    type="number"
                    name={`target_${type}`}
                    min={0}
                    defaultValue={targets[type] ?? 0}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
              ))}
              <div className="sm:col-span-3 md:col-span-6 flex justify-end">
                <SubmitButton
                  className="rounded-xl bg-slate-900 text-white px-4 py-2 text-xs font-semibold hover:bg-slate-800 transition-all"
                  pendingText="Updating Targets..."
                >
                  Save Targets
                </SubmitButton>
              </div>
            </form>
          </details>
        )}
      </div>

      {!isFrozen && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add question</h2>
          <form action={createQuestion} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-900">Type</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="question_type"
                  defaultValue={questionTypes[0]}
                >
                  {questionTypes.map((t) => (
                    <option key={t} value={t}>
                      {questionTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Marks</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="marks"
                  type="number"
                  step="0.01"
                  min={0.01}
                  defaultValue={1}
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-900">Prompt</label>
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="prompt"
                rows={5}
                required
              />
            </div>

            <div>
              <SubmitButton
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white transition-all duration-150 hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                pendingText="Creating…"
              >
                Create question
              </SubmitButton>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-2">Type</div>
          <div className="col-span-8">{isFrozen ? "Question (Read-only)" : "Question"}</div>
          <div className="col-span-2">Actions</div>
        </div>
        <div>
          {questions.length ? (
            questions.map((q) => (
              <div key={q.id} className="border-t border-slate-200 px-6 py-4">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-2">
                    <div className="text-xs font-semibold text-slate-600">{questionTypeLabel(q.question_type)}</div>
                  </div>

                  <div className="col-span-12 sm:col-span-10">
                    <form action={updateQuestion} className="grid gap-3">
                      <input type="hidden" name="question_id" value={q.id} />
                      <input type="hidden" name="question_type" value={q.question_type} />

                      {(() => {
                        const sol = solutionByQuestionId.get(q.id) ?? null;
                        return (
                          <>
                            <input
                              type="hidden"
                              name="_sol_present"
                              value={sol ? "1" : "0"}
                            />
                          </>
                        );
                      })()}

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                          <label className="text-xs font-semibold text-slate-600">Prompt</label>
                          <textarea
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                            name="prompt"
                            defaultValue={q.prompt}
                            rows={3}
                            required
                            disabled={isFrozen}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Marks</label>
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                            name="marks"
                            type="number"
                            step="0.01"
                            min={0.01}
                            defaultValue={String(q.marks)}
                            required
                            disabled={isFrozen}
                          />
                          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <input className="h-4 w-4" name="active" type="checkbox" defaultChecked={q.active} disabled={isFrozen} />
                            Active
                          </label>
                        </div>
                      </div>

                      {q.question_type === "mcq_single" ||
                      q.question_type === "mcq_multi" ||
                      q.question_type === "true_false" ||
                      q.question_type === "fill_blank" ? (
                        <div className="grid gap-3">
                          {(() => {
                            const sol = solutionByQuestionId.get(q.id) ?? null;
                            const options = getMcqOptions(q.options);
                            const correctKeys = getCorrectMcqKeys(sol?.correct_answer ?? null);
                            const correctBool = getCorrectBoolean(sol?.correct_answer ?? null);
                            const correctBlank = getCorrectFillBlank(sol?.correct_answer ?? null);

                            const optionByKey = new Map(options.map((o) => [o.key, o.label] as const));

                            if (q.question_type === "mcq_single" || q.question_type === "mcq_multi") {
                              return (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="sm:col-span-2">
                                    <div className="text-xs font-semibold text-slate-600">Options</div>
                                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                                      <div>
                                        <label className="text-xs font-semibold text-slate-600">Option A</label>
                                        <input
                                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                                          name="option_a"
                                          defaultValue={optionByKey.get("A") ?? ""}
                                          placeholder="(optional)"
                                          disabled={isFrozen}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-semibold text-slate-600">Option B</label>
                                        <input
                                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                                          name="option_b"
                                          defaultValue={optionByKey.get("B") ?? ""}
                                          placeholder="(optional)"
                                          disabled={isFrozen}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-semibold text-slate-600">Option C</label>
                                        <input
                                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                                          name="option_c"
                                          defaultValue={optionByKey.get("C") ?? ""}
                                          placeholder="(optional)"
                                          disabled={isFrozen}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-semibold text-slate-600">Option D</label>
                                        <input
                                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                                          name="option_d"
                                          defaultValue={optionByKey.get("D") ?? ""}
                                          placeholder="(optional)"
                                          disabled={isFrozen}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="sm:col-span-2">
                                    <label className="text-xs font-semibold text-slate-600">Correct answer</label>
                                    {q.question_type === "mcq_single" ? (
                                      <select
                                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
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
                                    ) : (
                                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        {["A", "B", "C", "D"].map((k) => (
                                          <label key={k} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                            <input
                                              className="h-4 w-4"
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
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            if (q.question_type === "true_false") {
                              return (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="text-xs font-semibold text-slate-600">Correct answer</label>
                                    <select
                                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                                      name="correct_tf"
                                      defaultValue={correctBool === null ? "" : correctBool ? "true" : "false"}
                                      required
                                      disabled={isFrozen}
                                    >
                                      <option value="">—</option>
                                      <option value="true">True</option>
                                      <option value="false">False</option>
                                    </select>
                                  </div>
                                </div>
                              );
                            }

                            if (q.question_type === "fill_blank") {
                              return (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="sm:col-span-2">
                                    <label className="text-xs font-semibold text-slate-600">Correct answer</label>
                                    <input
                                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                                      name="correct_blank"
                                      defaultValue={correctBlank}
                                      placeholder="Type the exact answer"
                                      required
                                      disabled={isFrozen}
                                    />
                                  </div>
                                </div>
                              );
                            }

                            return null;
                          })()}

                          <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700">Advanced (JSON)</summary>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Options (JSON)</label>
                                <textarea
                                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                                  name="options"
                                  defaultValue={q.options ? JSON.stringify(q.options, null, 2) : ""}
                                  rows={6}
                                  placeholder='e.g. [{"key":"A","label":"Option A"}]'
                                  disabled={isFrozen}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Correct answer (JSON)</label>
                                <textarea
                                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                                  name="correct_answer"
                                  defaultValue={
                                    (solutionByQuestionId.get(q.id)?.correct_answer ?? null)
                                      ? JSON.stringify(solutionByQuestionId.get(q.id)?.correct_answer, null, 2)
                                      : ""
                                  }
                                  rows={6}
                                  placeholder='e.g. {"value":"A"}'
                                  disabled={isFrozen}
                                />
                              </div>
                            </div>
                          </details>
                        </div>
                      ) : null}

                      <div>
                        <label className="text-xs font-semibold text-slate-600">Explanation (optional)</label>
                        <textarea
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-500"
                          name="explanation"
                          defaultValue={solutionByQuestionId.get(q.id)?.explanation ?? ""}
                          rows={3}
                          placeholder="Shown after grading/release"
                          disabled={isFrozen}
                        />
                      </div>

                      {!isFrozen && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                          <button
                            formAction={deleteQuestion}
                            className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 active:scale-[0.98] transition-all"
                          >
                            Delete
                          </button>
                          <div className="flex items-center gap-3">
                            <button
                              formAction={duplicateQuestion}
                              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all"
                            >
                              Duplicate
                            </button>
                            <SubmitButton
                              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                              pendingText="Saving…"
                            >
                              Save question
                            </SubmitButton>
                          </div>
                        </div>
                      )}
                    </form>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No questions yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
