import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";

type TestRow = {
  id: string;
  name: string;
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

export default async function AdminExamTestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: testData }, { data: questionsData }, { data: solutionsData }] = await Promise.all([
    supabase.from("exam_tests").select("id, name, duration_minutes").eq("id", id).maybeSingle(),
    supabase
      .from("exam_questions")
      .select("id, question_type, prompt, marks, options, active")
      .eq("test_id", id)
      .order("created_at", { ascending: true })
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

  async function createQuestion(formData: FormData) {
    "use server";

    const questionType = String(formData.get("question_type") ?? "").trim();
    const prompt = String(formData.get("prompt") ?? "").trim();
    const marks = Number(String(formData.get("marks") ?? "1").trim() || "1");

    if (!questionType || !prompt) return;
    if (!Number.isFinite(marks) || marks <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

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

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

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

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{test.name}</h1>
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

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add question</h2>
        <form action={createQuestion} className="mt-4 grid gap-4">
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

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-2">Type</div>
          <div className="col-span-8">Question</div>
          <div className="col-span-2">Save</div>
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
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                            name="prompt"
                            defaultValue={q.prompt}
                            rows={3}
                            required
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">Marks</label>
                          <input
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                            name="marks"
                            type="number"
                            step="0.01"
                            min={0.01}
                            defaultValue={String(q.marks)}
                            required
                          />
                          <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <input className="h-4 w-4" name="active" type="checkbox" defaultChecked={q.active} />
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
                                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                                          name="option_a"
                                          defaultValue={optionByKey.get("A") ?? ""}
                                          placeholder="(optional)"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-semibold text-slate-600">Option B</label>
                                        <input
                                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                                          name="option_b"
                                          defaultValue={optionByKey.get("B") ?? ""}
                                          placeholder="(optional)"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-semibold text-slate-600">Option C</label>
                                        <input
                                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                                          name="option_c"
                                          defaultValue={optionByKey.get("C") ?? ""}
                                          placeholder="(optional)"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs font-semibold text-slate-600">Option D</label>
                                        <input
                                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                                          name="option_d"
                                          defaultValue={optionByKey.get("D") ?? ""}
                                          placeholder="(optional)"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="sm:col-span-2">
                                    <label className="text-xs font-semibold text-slate-600">Correct answer</label>
                                    {q.question_type === "mcq_single" ? (
                                      <select
                                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                                        name="correct_single"
                                        defaultValue={correctKeys[0] ?? ""}
                                        required
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
                                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                                      name="correct_tf"
                                      defaultValue={correctBool === null ? "" : correctBool ? "true" : "false"}
                                      required
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
                                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                                      name="correct_blank"
                                      defaultValue={correctBlank}
                                      placeholder="Type the exact answer"
                                      required
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
                                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-green"
                                  name="options"
                                  defaultValue={q.options ? JSON.stringify(q.options, null, 2) : ""}
                                  rows={6}
                                  placeholder='e.g. [{"key":"A","label":"Option A"}]'
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600">Correct answer (JSON)</label>
                                <textarea
                                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-xs outline-none focus:ring-2 focus:ring-brand-green"
                                  name="correct_answer"
                                  defaultValue={
                                    (solutionByQuestionId.get(q.id)?.correct_answer ?? null)
                                      ? JSON.stringify(solutionByQuestionId.get(q.id)?.correct_answer, null, 2)
                                      : ""
                                  }
                                  rows={6}
                                  placeholder='e.g. {"value":"A"}'
                                />
                              </div>
                            </div>
                          </details>
                        </div>
                      ) : null}

                      <div>
                        <label className="text-xs font-semibold text-slate-600">Explanation (optional)</label>
                        <textarea
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                          name="explanation"
                          defaultValue={solutionByQuestionId.get(q.id)?.explanation ?? ""}
                          rows={3}
                          placeholder="Shown after grading/release"
                        />
                      </div>

                      <div className="flex justify-end">
                        <SubmitButton
                          className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                          pendingText="Saving…"
                        >
                          Save question
                        </SubmitButton>
                      </div>
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
