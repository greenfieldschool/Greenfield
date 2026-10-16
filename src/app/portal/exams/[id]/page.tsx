import { redirect } from "next/navigation";
import { CheckCircle2, Clock, EyeOff, FileQuestion, Hourglass, Lock, PlayCircle, Save, Wifi } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import LockOnBlurClient from "./LockOnBlurClient";
import ExamAnswersClient from "./ExamAnswersClient";
import SubmitExamButton from "./SubmitExamButton";
import { firstOrNull } from "@/lib/relations";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import SubmitButton from "@/components/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { PortalNotice, PortalPageHeader, portalMessages } from "../../_components/portal-ui";

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
  image_url?: string | null;
};

type AnswerRow = { question_id: string; answer: unknown };

export default async function PortalExamRunnerPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const startErrorRaw = Array.isArray(sp.e) ? sp.e[0] : sp.e;
  const startError = typeof startErrorRaw === "string" && startErrorRaw.trim().length ? startErrorRaw.trim().slice(0, 300) : null;
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
  if (!studentId)
    return <PortalNotice back={{ href: "/portal/exams", label: "Exams" }} title="Exam" message={portalMessages.noStudent} />;

  const { data: sessionData } = await supabase
    .from("exam_test_sessions")
    .select("id, test_id, requires_secret_code, results_released_at, exam_tests(id, name, duration_minutes)")
    .eq("id", id)
    .maybeSingle();

  const session = (sessionData ?? null) as unknown as SessionRow | null;
  if (!session)
    return (
      <PortalNotice
        back={{ href: "/portal/exams", label: "Exams" }}
        title="Exam"
        heading="This exam isn't available"
        message="It may have closed, not opened yet, or not be set for your class. Check the exams list or ask your teacher."
        icon={FileQuestion}
        action={
          <ButtonLink href="/portal/exams" variant="secondary">
            Back to exams
          </ButtonLink>
        }
      />
    );

  const test = firstOrNull(session.exam_tests);

  const { data: attemptData } = await supabase
    .from("exam_attempts")
    .select(
      "id, locked_at, status, lock_count, secret_code_verified, submitted_at, obtained_marks, max_marks, percent"
    )
    .eq("session_id", id)
    .eq("student_id", studentId)
    .maybeSingle();

  const attempt = (attemptData ?? null) as AttemptRow | null;

  const attemptId = typeof attempt?.id === "string" && attempt.id.length ? attempt.id : null;

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
    // "*" so exams still load before the image_url column migration has been run.
    .select("*")
    .eq("test_id", session.test_id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(500);

  // Only the fields the exam screen needs are passed on to the browser.
  const questions: QuestionRow[] = ((questionsData ?? []) as QuestionRow[]).map((q) => ({
    id: q.id,
    question_type: q.question_type,
    prompt: q.prompt,
    marks: q.marks,
    options: q.options,
    image_url: q.image_url ?? null
  }));

  const canRenderExam =
    !!attemptId && (!session.requires_secret_code || attempt?.secret_code_verified === true);

  const isSubmitted = !!attempt?.submitted_at || attempt?.status === "submitted" || attempt?.status === "graded";

  const isLocked = !!attempt?.locked_at || attempt?.status === "locked";

  const { data: answersData } = canRenderExam
    ? await supabase.from("exam_attempt_answers").select("question_id, answer").eq("attempt_id", attemptId)
    : { data: [] as unknown[] };

  const initialAnswers = (answersData ?? []) as AnswerRow[];

  async function submitAttempt() {
    "use server";

    if (!attemptId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.rpc("submit_exam_attempt", { attempt_uuid: attemptId });
    redirect(`/portal/exams/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PortalPageHeader
        back={{ href: "/portal/exams", label: "Exams" }}
        title={test?.name ?? "Exam"}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
              {test?.duration_minutes ?? "—"} minutes
            </span>
            {questions.length ? (
              <span>
                {questions.length} question{questions.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        }
      />

      {isLocked ? (
        <Card className="border-red-200">
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Lock className="h-8 w-8" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-2xl font-semibold text-slate-900">Your exam is locked</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              You left the exam page, so it was locked to keep things fair. Please raise your hand and ask the exam
              supervisor to unlock it.
            </p>
            <p className="mt-3 text-xs text-slate-400">Times locked: {attempt?.lock_count ?? 0}</p>
          </div>
        </Card>
      ) : !canRenderExam ? (
        <Card>
          <CardBody className="space-y-6">
            <div>
              <h2 className="font-display text-2xl font-semibold text-slate-900">Ready to begin?</h2>
              <p className="mt-1 text-sm text-slate-600">Read these before you start.</p>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="pt-2">
                  <span className="font-semibold text-slate-900">Stay on this page.</span> Switching apps, tabs or
                  windows locks your exam straight away.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                  <Save className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="pt-2">Your answers save automatically as you go.</span>
              </li>
              <li className="flex gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <Wifi className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="pt-2">Make sure you have a good connection and enough time.</span>
              </li>
            </ul>

            <form action={startAttempt} className="space-y-4 border-t border-slate-100 pt-6">
              {startError ? (
                <Alert tone="danger" title="We couldn't start your exam">
                  {startError}
                </Alert>
              ) : null}
              <Field
                label={session.requires_secret_code ? "Exam code" : "Exam code (optional)"}
                htmlFor="exam-secret-code"
                hint={session.requires_secret_code ? "Your supervisor will give you this code." : undefined}
              >
                <input
                  id="exam-secret-code"
                  className="gf-input h-12 text-base tracking-widest"
                  name="secret_code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={session.requires_secret_code ? "Enter the code" : "Leave blank if you have none"}
                />
              </Field>
              <SubmitButton variant="primary" size="lg" pendingText="Starting…">
                <span className="inline-flex items-center gap-2">
                  <PlayCircle className="h-5 w-5" aria-hidden="true" />
                  Start exam
                </span>
              </SubmitButton>
            </form>
          </CardBody>
        </Card>
      ) : isSubmitted ? (
        <div className="space-y-6">
          <Alert tone="success" title="Submission received">
            Well done for finishing! Your answers are saved and can no longer be changed.
          </Alert>

          {session.results_released_at ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Marks obtained" value={Number(attempt?.obtained_marks ?? 0).toFixed(2)} icon={CheckCircle2} tone="green" />
              <StatCard label="Out of" value={Number(attempt?.max_marks ?? 0).toFixed(2)} tone="slate" />
              <StatCard label="Score" value={`${Number(attempt?.percent ?? 0).toFixed(2)}%`} tone="gold" />
            </div>
          ) : (
            <Alert tone="info" title="Results coming soon">
              Your teacher will release the results once marking is done.
            </Alert>
          )}

          {attemptId ? (
            <ExamAnswersClient attemptId={attemptId} questions={questions} initialAnswers={initialAnswers} readOnly />
          ) : null}
        </div>
      ) : (
        <>
          {attemptId ? <LockOnBlurClient attemptId={attemptId} /> : null}

          <Alert tone="warning">
            <span className="font-semibold">Stay on this page</span> until you submit. Leaving it will lock your exam.
          </Alert>

          {attemptId ? <ExamAnswersClient attemptId={attemptId} questions={questions} initialAnswers={initialAnswers} /> : null}

          <Card className="border-brand-green-200">
            <form action={submitAttempt}>
              <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                    <Hourglass className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="font-semibold text-slate-900">Finished?</div>
                    <div className="mt-0.5 text-sm text-slate-600">Check your answers, then submit when you&apos;re ready.</div>
                  </div>
                </div>
                <SubmitExamButton />
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
