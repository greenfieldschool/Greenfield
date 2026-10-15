import { notFound } from "next/navigation";
import { CheckCircle2, Hourglass, Lightbulb, MinusCircle, XCircle } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { PortalNotice, PortalPageHeader, ScoreRing, portalMessages } from "../../../_components/portal-ui";
import { marksLabel, questionTypeLabel } from "../../../_components/exam-labels";
import { Celebrate } from "@/components/motion/celebrate";

function cheer(p: number) {
  if (p >= 80) return "Excellent work!";
  if (p >= 70) return "Great job!";
  if (p >= 50) return "Good effort — keep going!";
  return "Keep practising — you've got this.";
}

function ResultNotice({ icon, title, message }: { icon: typeof Hourglass; title: string; message: string }) {
  return (
    <div className="space-y-6">
      <PortalPageHeader back={{ href: "/portal/exams/results", label: "Results" }} title={title} />
      <Card>
        <EmptyState
          icon={icon}
          title={title}
          description={message}
          action={
            <ButtonLink href="/portal/exams/results" variant="secondary">
              Back to results
            </ButtonLink>
          }
        />
      </Card>
    </div>
  );
}

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
  if (!currentStudentId)
    return (
      <PortalNotice
        back={{ href: "/portal/exams/results", label: "Results" }}
        title="Exam result"
        message={portalMessages.noStudent}
      />
    );

  const { data: attemptData } = await supabase
    .from("exam_attempts")
    .select(
      "id, session_id, student_id, submitted_at, obtained_marks, max_marks, percent, exam_test_sessions(id, results_released_at, test_id, exam_tests(id, name))"
    )
    .eq("id", id)
    .maybeSingle();

  const attempt = (attemptData ?? null) as unknown as AttemptRow | null;
  if (!attempt) notFound();

  if (attempt.student_id !== currentStudentId) {
    notFound();
  }

  const session = firstOrNull(attempt.exam_test_sessions);
  const releasedAt = session?.results_released_at ?? null;

  if (!releasedAt) {
    return (
      <ResultNotice
        icon={Hourglass}
        title="Result not released yet"
        message="Your teacher hasn't released this result yet. Check back soon."
      />
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

  const test = firstOrNull(session?.exam_tests);

  const percent = Number(attempt.percent ?? 0);
  const correctCount = answers.filter((a) => a.is_correct === true).length;
  const wrongCount = answers.filter((a) => a.is_correct === false).length;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        back={{ href: "/portal/exams/results", label: "Results" }}
        title={test?.name ?? "Exam result"}
        description={`Released ${formatLagosDate(releasedAt)}`}
      />

      <Card className="overflow-hidden">
        <div
          data-celebrate={percent}
          className="relative flex flex-col items-center gap-6 bg-gradient-to-br from-brand-green-50 via-white to-brand-gold-50/60 px-6 py-8 text-center sm:flex-row sm:px-10 sm:text-left"
        >
          <Celebrate percent={percent} />
          <ScoreRing percent={percent} label="score" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-2xl font-semibold text-slate-900">{cheer(percent)}</div>
            <p className="mt-1 text-sm text-slate-600">
              You scored{" "}
              <span className="font-semibold text-slate-900">
                {Number(attempt.obtained_marks ?? 0).toFixed(2)} out of {Number(attempt.max_marks ?? 0).toFixed(2)}
              </span>{" "}
              marks ({percent.toFixed(2)}%).
            </p>
            {answers.length ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Badge tone="green" dot>
                  {correctCount} correct
                </Badge>
                <Badge tone="red" dot>
                  {wrongCount} wrong
                </Badge>
                {answers.length - correctCount - wrongCount > 0 ? (
                  <Badge tone="slate" dot>
                    {answers.length - correctCount - wrongCount} marked by teacher
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <section aria-labelledby="review-heading" className="space-y-4">
        <h2 id="review-heading" className="text-base font-semibold text-slate-900">
          Review your answers
        </h2>
        {answers.length ? (
          answers.map((a, idx) => {
            const q = firstOrNull(a.exam_questions);
            const sol = q ? solByQ.get(q.id) ?? null : null;

            const yourAnswer = asValue(a.answer);
            const correct = sol ? asValue(sol.correct_answer) : "";
            const state = a.is_correct === true ? "correct" : a.is_correct === false ? "wrong" : "marked";

            return (
              <Card
                key={a.question_id}
                className={
                  "border-l-4 p-5 sm:p-6 " +
                  (state === "correct" ? "border-l-brand-green-500" : state === "wrong" ? "border-l-rose-400" : "border-l-slate-300")
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {questionTypeLabel(q?.question_type)} · {marksLabel(q?.marks)}
                    </span>
                  </div>
                  {state === "correct" ? (
                    <Badge tone="green">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Correct
                    </Badge>
                  ) : state === "wrong" ? (
                    <Badge tone="red">
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Not quite
                    </Badge>
                  ) : (
                    <Badge tone="slate">
                      <MinusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Marked
                    </Badge>
                  )}
                </div>

                <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-relaxed text-slate-900">{q?.prompt ?? "—"}</p>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div
                    className={
                      "rounded-xl px-4 py-3 " +
                      (state === "correct" ? "bg-brand-green-50" : state === "wrong" ? "bg-rose-50" : "bg-slate-50")
                    }
                  >
                    <div className="text-xs font-medium text-slate-500">Your answer</div>
                    <div className="mt-0.5 whitespace-pre-wrap font-semibold text-slate-900">{yourAnswer || "—"}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="text-xs font-medium text-slate-500">Correct answer</div>
                    <div className="mt-0.5 whitespace-pre-wrap font-semibold text-slate-900">{correct || "—"}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="text-xs font-medium text-slate-500">Marks awarded</div>
                    <div className="mt-0.5 font-semibold text-slate-900">
                      {Number(a.awarded_marks ?? 0).toFixed(2)}
                      <span className="font-normal text-slate-500"> / {Number(q?.marks ?? 0)}</span>
                    </div>
                  </div>
                </div>

                {sol?.explanation ? (
                  <div className="mt-4 flex gap-3 rounded-xl border border-brand-gold-200 bg-brand-gold-50/60 px-4 py-3">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold-700" aria-hidden="true" />
                    <div>
                      <div className="text-xs font-semibold text-brand-gold-800">Explanation</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{sol.explanation}</div>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })
        ) : (
          <Card>
            <EmptyState icon={MinusCircle} title="No answers found" />
          </Card>
        )}
      </section>
    </div>
  );
}
