import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

    if (optionsRaw.length) {
      try {
        options = JSON.parse(optionsRaw);
      } catch {
        return;
      }
    }

    if (correctRaw.length) {
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
          correct_answer: correctRaw.length ? correctAnswer : null,
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
                    {t}
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
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create question
            </button>
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
                    <div className="text-xs font-semibold text-slate-600">{q.question_type}</div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">{q.id}</div>
                  </div>

                  <div className="col-span-12 sm:col-span-10">
                    <form action={updateQuestion} className="grid gap-3">
                      <input type="hidden" name="question_id" value={q.id} />

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
                        <div className="grid gap-3 sm:grid-cols-2">
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
                        <button
                          className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
                          type="submit"
                        >
                          Save question
                        </button>
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
