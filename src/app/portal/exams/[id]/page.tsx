import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import LockOnBlurClient from "./LockOnBlurClient";
import ExamAnswersClient from "./ExamAnswersClient";

type SessionRow = {
  id: string;
  test_id: string;
  requires_secret_code: boolean;
  results_released_at: string | null;
  exam_tests: Array<{ id: string; name: string; duration_minutes: number }>;
};

type AttemptRow = {
  id: string;
  locked_at: string | null;
  status: string;
  lock_count: number;
  secret_code_verified: boolean;
  submitted_at: string | null;
  obtained_marks: number;
  max_marks: number;
  percent: number;
};

type StudentLinkRow = { student_id: string };

type QuestionRow = {
  id: string;
  question_type: string;
  prompt: string;
  marks: number;
  options: unknown | null;
};

type AnswerRow = { question_id: string; answer: unknown };

export default async function PortalExamRunnerPage({ params }: { params: Promise<{ id: string }> }) {
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

  const studentId = (studentLink as StudentLinkRow | null)?.student_id ?? null;
  if (!studentId) return null;

  const { data: sessionData } = await supabase
    .from("exam_test_sessions")
    .select("id, test_id, requires_secret_code, results_released_at, exam_tests(id, name, duration_minutes)")
    .eq("id", id)
    .maybeSingle();

  const session = (sessionData ?? null) as unknown as SessionRow | null;
  if (!session) return null;

  const test = (session.exam_tests ?? [])[0] ?? null;

  const { data: attemptData } = await supabase
    .from("exam_attempts")
    .select(
      "id, locked_at, status, lock_count, secret_code_verified, submitted_at, obtained_marks, max_marks, percent"
    )
    .eq("session_id", id)
    .eq("student_id", studentId)
    .maybeSingle();

  const attempt = (attemptData ?? null) as AttemptRow | null;

  async function startAttempt(formData: FormData) {
    "use server";

    const secretCode = String(formData.get("secret_code") ?? "").trim();

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const { data, error } = await supabase.rpc("start_exam_attempt", {
      session_uuid: id,
      secret_code_input: secretCode.length ? secretCode : null
    });

    if (error || !data) {
      redirect(`/portal/exams/${id}?e=${encodeURIComponent(error?.message ?? "Could not start")}`);
    }

    redirect(`/portal/exams/${id}`);
  }

  const { data: questionsData } = await supabase
    .from("exam_questions")
    .select("id, question_type, prompt, marks, options")
    .eq("test_id", session.test_id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(50);

  const questions = (questionsData ?? []) as QuestionRow[];

  const canRenderExam =
    !!attempt && (!session.requires_secret_code || attempt.secret_code_verified === true);

  const isSubmitted = !!attempt?.submitted_at || attempt?.status === "submitted" || attempt?.status === "graded";

  const isLocked = !!attempt?.locked_at || attempt?.status === "locked";

  const { data: answersData } = canRenderExam
    ? await supabase
        .from("exam_attempt_answers")
        .select("question_id, answer")
        .eq("attempt_id", attempt!.id)
    : { data: [] as unknown[] };

  const initialAnswers = (answersData ?? []) as AnswerRow[];

  async function submitAttempt() {
    "use server";

    if (!attempt) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.rpc("submit_exam_attempt", { attempt_uuid: attempt.id });
    redirect(`/portal/exams/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{test?.name ?? "Exam"}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Duration: {test?.duration_minutes ?? "—"} minutes • Attempt locks immediately on focus loss.
        </p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/portal/exams">
            Back to exams
          </Link>
        </div>
      </div>

      {isLocked ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-red-900 shadow-sm">
          <div className="text-sm font-semibold">Exam locked</div>
          <div className="mt-2 text-sm">
            You navigated away from the exam. Please call the conductor to unlock your exam.
          </div>
          <div className="mt-2 text-xs">Lock count: {attempt?.lock_count ?? 0}</div>
        </div>
      ) : !canRenderExam ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Start exam</div>
          <p className="mt-2 text-sm text-slate-600">
            {session.requires_secret_code
              ? "This session requires a secret code. Enter it to start."
              : "Start your exam session."}
          </p>

          <form action={startAttempt} className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="secret_code"
                placeholder={session.requires_secret_code ? "Enter secret code" : "(optional)"}
              />
            </div>
            <button
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Start
            </button>
          </form>
        </div>
      ) : isSubmitted ? (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Submission received</div>
            <p className="mt-2 text-sm text-slate-600">Your exam has been submitted. Answers are now read-only.</p>

            {session.results_released_at ? (
              <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-semibold text-slate-500">Obtained</div>
                  <div className="mt-1 font-semibold text-slate-900">{Number(attempt?.obtained_marks ?? 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Max</div>
                  <div className="mt-1 font-semibold text-slate-900">{Number(attempt?.max_marks ?? 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Percent</div>
                  <div className="mt-1 font-semibold text-slate-900">{Number(attempt?.percent ?? 0).toFixed(2)}%</div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Results are awaiting staff release.
              </div>
            )}
          </div>

          <ExamAnswersClient attemptId={attempt!.id} questions={questions} initialAnswers={initialAnswers} readOnly />
        </div>
      ) : (
        <>
          <LockOnBlurClient attemptId={attempt!.id} />

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Exam controls</div>
                <div className="mt-1 text-xs text-slate-600">Autosave is enabled.</div>
              </div>
              <form action={submitAttempt}>
                <button
                  className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                  type="submit"
                >
                  Submit exam
                </button>
              </form>
            </div>
          </div>

          <ExamAnswersClient attemptId={attempt!.id} questions={questions} initialAnswers={initialAnswers} />
        </>
      )}
    </div>
  );
}
