import Link from "next/link";
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

type McqOption = { key: string; label: string };

function parseMcqOptions(options: unknown): McqOption[] {
  if (!options) return [];

  if (Array.isArray(options)) {
    return options
      .map((o, idx) => {
        if (typeof o === "string") return { key: String(idx + 1), label: o };
        if (o && typeof o === "object") {
          const k = (o as { key?: unknown }).key;
          const l = (o as { label?: unknown }).label;
          const key = typeof k === "string" && k.length ? k : String(idx + 1);
          const label = typeof l === "string" ? l : JSON.stringify(o);
          return { key, label };
        }
        return { key: String(idx + 1), label: String(o) };
      })
      .filter((o) => o.label.length > 0);
  }

  if (typeof options === "object") {
    const maybeArr = (options as { options?: unknown }).options;
    if (Array.isArray(maybeArr)) return parseMcqOptions(maybeArr);
  }

  return [];
}

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

export default async function AdminExamTestPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: testData }, { data: questionsData }] = await Promise.all([
    supabase.from("exam_tests").select("id, name, duration_minutes").eq("id", id).maybeSingle(),
    supabase
      .from("exam_questions")
      .select("id, question_type, prompt, marks, options, active")
      .eq("test_id", id)
      .order("created_at", { ascending: true })
      .limit(200)
  ]);

  const test = (testData ?? null) as TestRow | null;
  if (!test) return null;

  const questions = (questionsData ?? []) as QuestionRow[];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Preview: {test.name}</h1>
        <p className="mt-2 text-sm text-slate-600">This is a read-only preview of how questions will appear to students.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href={`/admin/exams/tests/${id}`}>
            Back to editor
          </Link>
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/exams/tests">
            Back to tests
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Questions</div>
        <div className="mt-1 text-xs text-slate-600">Showing {questions.length} question(s).</div>

        <div className="mt-6 space-y-5">
          {questions.map((q, idx) => {
            const mcqOptions = q.question_type === "mcq_single" ? parseMcqOptions(q.options) : [];

            return (
              <div key={q.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-semibold text-slate-500">
                  Q{idx + 1} • {questionTypeLabel(q.question_type)} • {q.marks} mark(s)
                  {q.active ? "" : " • inactive"}
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-900">{q.prompt}</div>

                <div className="mt-4">
                  {q.question_type === "true_false" ? (
                    <select
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none"
                      disabled
                      defaultValue=""
                    >
                      <option value="">Select</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : q.question_type === "fill_blank" ? (
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none"
                      disabled
                      placeholder="Type your answer"
                    />
                  ) : q.question_type === "mcq_single" ? (
                    mcqOptions.length ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {mcqOptions.map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            disabled
                            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800"
                          >
                            <div className="text-xs font-semibold text-slate-500">{opt.key}</div>
                            <div className="mt-1 whitespace-pre-wrap">{opt.label}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-600">No options set yet.</div>
                    )
                  ) : (
                    <textarea
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none"
                      rows={4}
                      disabled
                      placeholder="Type your answer"
                    />
                  )}
                </div>
              </div>
            );
          })}

          {!questions.length ? <div className="text-sm text-slate-600">No questions yet.</div> : null}
        </div>
      </div>
    </div>
  );
}
