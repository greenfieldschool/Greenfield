import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type AttemptRow = {
  id: string;
  session_id: string;
  student_id: string;
  submitted_at: string | null;
  obtained_marks: number;
  max_marks: number;
  percent: number;
  exam_test_sessions: Array<{
    id: string;
    results_released_at: string | null;
    test_id: string;
    exam_tests: Array<{ id: string; name: string }>;
  }>;
};

type AnswerRow = {
  question_id: string;
  answer: unknown;
  is_correct: boolean | null;
  awarded_marks: number;
  exam_questions: Array<{ id: string; prompt: string; question_type: string; marks: number }>;
};

type SolutionRow = {
  question_id: string;
  correct_answer: unknown;
  explanation: string | null;
};

function asValue(v: unknown) {
  if (!v || typeof v !== "object") return "";
  const value = (v as { value?: unknown }).value;
  return typeof value === "string" ? value : "";
}

type StudentLinkRow = { student_id: string };

export default async function PortalExamResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: studentLink } = await supabase
    .from("student_user_links")
    .select("student_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const currentStudentId = (studentLink as StudentLinkRow | null)?.student_id ?? null;
  if (!currentStudentId) return null;

  const { data: attemptData } = await supabase
    .from("exam_attempts")
    .select(
      "id, session_id, student_id, submitted_at, obtained_marks, max_marks, percent, exam_test_sessions(id, results_released_at, test_id, exam_tests(id, name))"
    )
    .eq("id", id)
    .maybeSingle();

  const attempt = (attemptData ?? null) as unknown as AttemptRow | null;
  if (!attempt) return null;

  if (attempt.student_id !== currentStudentId) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Portal</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Unauthorized</h1>
          <p className="mt-2 text-sm text-slate-600">You do not have access to this result.</p>
          <div className="mt-4">
            <Link className="text-sm font-semibold text-brand-green hover:underline" href="/portal/exams/results">
              Back to results
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const session = (attempt.exam_test_sessions ?? [])[0] ?? null;
  const releasedAt = session?.results_released_at ?? null;

  if (!releasedAt) {
    return (
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Portal</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Result not released</h1>
          <p className="mt-2 text-sm text-slate-600">This result is not yet released by staff.</p>
          <div className="mt-4">
            <Link className="text-sm font-semibold text-brand-green hover:underline" href="/portal/exams/results">
              Back to results
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { data: answersData } = await supabase
    .from("exam_attempt_answers")
    .select("question_id, answer, is_correct, awarded_marks, exam_questions(id, prompt, question_type, marks)")
    .eq("attempt_id", id);

  const answers = (answersData ?? []) as unknown as AnswerRow[];
  const questionIds = answers.map((a) => a.question_id).filter((v) => typeof v === "string" && v.length);

  const { data: solutionsData } = questionIds.length
    ? await supabase
        .from("exam_question_solutions")
        .select("question_id, correct_answer, explanation")
        .in("question_id", questionIds)
    : { data: [] as unknown[] };

  const solutions = (solutionsData ?? []) as unknown as SolutionRow[];
  const solByQ = new Map(solutions.map((s) => [s.question_id, s] as const));

  const test = (session?.exam_tests ?? [])[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{test?.name ?? "Exam"} result</h1>
        <p className="mt-2 text-sm text-slate-600">Released: {releasedAt}</p>
        <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
          <div>
            <div className="text-xs font-semibold text-slate-500">Obtained</div>
            <div className="mt-1 font-semibold text-slate-900">{Number(attempt.obtained_marks ?? 0).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Max</div>
            <div className="mt-1 font-semibold text-slate-900">{Number(attempt.max_marks ?? 0).toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Percent</div>
            <div className="mt-1 font-semibold text-slate-900">{Number(attempt.percent ?? 0).toFixed(2)}%</div>
          </div>
        </div>

        <div className="mt-6">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/portal/exams/results">
            Back to results
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {answers.length ? (
          answers.map((a, idx) => {
            const q = (a.exam_questions ?? [])[0] ?? null;
            const sol = q ? solByQ.get(q.id) ?? null : null;

            const yourAnswer = asValue(a.answer);
            const correct = sol ? asValue(sol.correct_answer) : "";

            return (
              <div key={a.question_id} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">
                  Q{idx + 1} • {q?.question_type ?? "—"} • {q?.marks ?? 0} marks
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-900">{q?.prompt ?? "—"}</div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold text-slate-500">Your answer</div>
                    <div className="mt-1 font-semibold text-slate-900">{yourAnswer || "—"}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold text-slate-500">Correct</div>
                    <div className="mt-1 font-semibold text-slate-900">{correct || "—"}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold text-slate-500">Awarded</div>
                    <div className="mt-1 font-semibold text-slate-900">{Number(a.awarded_marks ?? 0).toFixed(2)}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">
                      {a.is_correct === true ? "Correct" : a.is_correct === false ? "Wrong" : "Marked"}
                    </div>
                  </div>
                </div>

                {sol?.explanation ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold text-slate-500">Explanation</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{sol.explanation}</div>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
            No answers found.
          </div>
        )}
      </div>
    </div>
  );
}
