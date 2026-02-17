import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

    if (!answerId) return;
    if (!Number.isFinite(awarded) || awarded < 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

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
    if (!supabase) return;

    const { data: rows } = await supabase
      .from("exam_attempt_answers")
      .select("awarded_marks, exam_questions(marks)")
      .eq("attempt_id", attemptId);

    const parsed = (rows ?? []) as unknown as Array<{ awarded_marks: number; exam_questions: Array<{ marks: number }> }>;

    const obtained = parsed.reduce((acc, r) => acc + Number(r.awarded_marks ?? 0), 0);
    const max = parsed.reduce((acc, r) => acc + Number((r.exam_questions ?? [])[0]?.marks ?? 0), 0);
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
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Manual marking</h1>
        <p className="mt-2 text-sm text-slate-600">
          {student ? `${student.first_name} ${student.last_name}` : "Student"}
          {student?.admission_number ? ` • ${student.admission_number}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            href={`/admin/exams/sessions/${sessionId}/attempts`}
          >
            Back to attempts
          </Link>
          <form action={recalcTotals}>
            <button
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Recalculate totals
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
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
      </div>

      <div className="space-y-4">
        {answers.length ? (
          answers.map((a, idx) => {
            const q = (a.exam_questions ?? [])[0] ?? null;
            const maxMarks = Number(q?.marks ?? 0);

            return (
              <div key={a.id} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">
                  Q{idx + 1} • {q?.question_type ?? "—"} • Max {maxMarks}
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-900">{q?.prompt ?? "—"}</div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500">Student answer</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{asValue(a.answer) || "—"}</div>
                </div>

                <form action={markAnswer} className="mt-4 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="answer_id" value={a.id} />
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Awarded marks</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                      name="awarded_marks"
                      type="number"
                      step="0.01"
                      min={0}
                      max={String(maxMarks)}
                      defaultValue={String(a.awarded_marks ?? 0)}
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-600">Feedback (optional)</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                      name="feedback"
                      defaultValue={a.feedback ?? ""}
                      placeholder="(optional)"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      type="submit"
                    >
                      Save marking
                    </button>
                  </div>
                </form>
              </div>
            );
          })
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
            No answers found for this attempt.
          </div>
        )}
      </div>
    </div>
  );
}
