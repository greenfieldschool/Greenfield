import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Calculator, CircleCheck, FileQuestion, Percent, Target } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatLagosDate } from "@/lib/lagos-dates";
import { firstOrNull } from "@/lib/relations";
import { failWithToast, NO_DB_MESSAGE } from "../../../../_components/feedback";

type AttemptRow = {
  id: string;
  session_id: string;
  student_id: string;
  submitted_at: string | null;
  obtained_marks: number;
  max_marks: number;
  percent: number;
};

type StudentRow = { id: string; first_name: string; last_name: string; admission_number: string | null };

type AnswerRow = {
  id: string;
  question_id: string;
  answer: unknown;
  awarded_marks: number;
  feedback: string | null;
  is_correct: boolean | null;
  exam_questions: Array<{ id: string; question_type: string; prompt: string; marks: number }>;
};

function asValue(v: unknown) {
  if (!v || typeof v !== "object") return "";
  const value = (v as { value?: unknown }).value;
  return typeof value === "string" ? value : "";
}

export default async function AdminExamAttemptMarkingPage({
  params
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id: sessionId, attemptId } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: attemptData } = await supabase
    .from("exam_attempts")
    .select("id, session_id, student_id, submitted_at, obtained_marks, max_marks, percent")
    .eq("id", attemptId)
    .eq("session_id", sessionId)
    .maybeSingle();

  const attempt = (attemptData ?? null) as AttemptRow | null;
  if (!attempt) return null;

  const { data: studentData } = await supabase
    .from("students")
    .select("id, first_name, last_name, admission_number")
    .eq("id", attempt.student_id)
    .maybeSingle();

  const student = (studentData ?? null) as StudentRow | null;

  const { data: answersData } = await supabase
    .from("exam_attempt_answers")
    .select("id, question_id, answer, awarded_marks, feedback, is_correct, exam_questions(id, question_type, prompt, marks)")
    .eq("attempt_id", attemptId)
    .order("created_at", { ascending: true });

  const answers = (answersData ?? []) as unknown as AnswerRow[];

  async function markAnswer(formData: FormData) {
    "use server";

    const answerId = String(formData.get("answer_id") ?? "").trim();
    const awarded = Number(String(formData.get("awarded_marks") ?? "0").trim() || "0");
    const feedback = String(formData.get("feedback") ?? "").trim();

    if (!answerId) failWithToast(`/admin/exams/sessions/${sessionId}/attempts/${attemptId}`, "Answer not found.");
    if (!Number.isFinite(awarded) || awarded < 0) failWithToast(`/admin/exams/sessions/${sessionId}/attempts/${attemptId}`, "Awarded marks must be 0 or more.");

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(`/admin/exams/sessions/${sessionId}/attempts/${attemptId}`, NO_DB_MESSAGE);

    await supabase
      .from("exam_attempt_answers")
      .update({
        awarded_marks: awarded,
        feedback: feedback.length ? feedback : null,
        marked_at: new Date().toISOString()
      })
      .eq("id", answerId)
      .eq("attempt_id", attemptId);

    revalidatePath(`/admin/exams/sessions/${sessionId}/attempts/${attemptId}`);
    revalidatePath(`/admin/exams/sessions/${sessionId}/attempts`);
  }

  async function recalcTotals() {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(`/admin/exams/sessions/${sessionId}/attempts/${attemptId}`, NO_DB_MESSAGE);

    const { data: rows } = await supabase
      .from("exam_attempt_answers")
      .select("awarded_marks, exam_questions(marks)")
      .eq("attempt_id", attemptId);

    const parsed = (rows ?? []) as unknown as Array<{ awarded_marks: number; exam_questions: Array<{ marks: number }> }>;

    const obtained = parsed.reduce((acc, r) => acc + Number(r.awarded_marks ?? 0), 0);
    const max = parsed.reduce((acc, r) => acc + Number(firstOrNull(r.exam_questions)?.marks ?? 0), 0);
    const percent = max > 0 ? (obtained / max) * 100 : 0;

    await supabase
      .from("exam_attempts")
      .update({ obtained_marks: obtained, max_marks: max, percent, status: "graded", graded_at: new Date().toISOString() })
      .eq("id", attemptId);

    revalidatePath(`/admin/exams/sessions/${sessionId}/attempts/${attemptId}`);
    revalidatePath(`/admin/exams/sessions/${sessionId}/attempts`);
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: `/admin/exams/sessions/${sessionId}/attempts`, label: "Back to attempts" }}
        eyebrow="Exams"
        title="Manual marking"
        description={
          <>
            {student ? `${student.first_name} ${student.last_name}` : "Student"}
            {student?.admission_number ? ` • ${student.admission_number}` : ""}
          </>
        }
        actions={
          <form action={recalcTotals}>
            <SubmitButton variant="primary" pendingText="Recalculating…">
              <Calculator className="h-4 w-4" aria-hidden="true" />
              Recalculate totals
            </SubmitButton>
          </form>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Obtained" value={Number(attempt.obtained_marks ?? 0).toFixed(2)} icon={CircleCheck} tone="green" />
        <StatCard label="Max" value={Number(attempt.max_marks ?? 0).toFixed(2)} icon={Target} tone="slate" />
        <StatCard
          label="Percent"
          value={`${Number(attempt.percent ?? 0).toFixed(2)}%`}
          hint={attempt.submitted_at ? `Submitted ${formatLagosDate(attempt.submitted_at)}` : "Not submitted yet"}
          icon={Percent}
          tone="violet"
        />
      </div>

      <div className="space-y-4">
        {answers.length ? (
          answers.map((a, idx) => {
            const q = firstOrNull(a.exam_questions);
            const maxMarks = Number(q?.marks ?? 0);
            const fid = `answer-${a.id}`;

            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5 sm:px-6">
                  <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg bg-brand-green-50 px-2 text-xs font-bold text-brand-green-700">
                    Q{idx + 1}
                  </span>
                  <Badge tone="blue">{q?.question_type ?? "—"}</Badge>
                  <Badge tone="slate">Max {maxMarks}</Badge>
                  {a.is_correct === true ? <Badge tone="green">Correct</Badge> : null}
                  {a.is_correct === false ? <Badge tone="red">Incorrect</Badge> : null}
                </div>
                <CardBody className="space-y-4">
                  <div className="whitespace-pre-wrap text-sm font-semibold text-slate-900">{q?.prompt ?? "—"}</div>

                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                    <div className="text-xs font-semibold text-slate-500">Student answer</div>
                    <div className="mt-1.5 whitespace-pre-wrap text-sm text-slate-900">{asValue(a.answer) || "—"}</div>
                  </div>

                  <form action={markAnswer} className="grid gap-4 sm:grid-cols-3">
                    <input type="hidden" name="answer_id" value={a.id} />
                    <Field label="Awarded marks" htmlFor={`${fid}-marks`} hint={`Out of ${maxMarks}`}>
                      <input
                        id={`${fid}-marks`}
                        className="gf-input"
                        name="awarded_marks"
                        type="number"
                        step="0.01"
                        min={0}
                        max={String(maxMarks)}
                        defaultValue={String(a.awarded_marks ?? 0)}
                        required
                      />
                    </Field>
                    <Field label="Feedback (optional)" htmlFor={`${fid}-feedback`} className="sm:col-span-2">
                      <input
                        id={`${fid}-feedback`}
                        className="gf-input"
                        name="feedback"
                        defaultValue={a.feedback ?? ""}
                        placeholder="(optional)"
                      />
                    </Field>
                    <div className="flex justify-end sm:col-span-3">
                      <SubmitButton variant="secondary" pendingText="Saving…" showSpinner={false}>
                        Save marking
                      </SubmitButton>
                    </div>
                  </form>
                </CardBody>
              </Card>
            );
          })
        ) : (
          <Card>
            <EmptyState icon={FileQuestion} title="No answers found for this attempt." />
          </Card>
        )}
      </div>
    </div>
  );
}
