import { AlertTriangle, CheckCircle2, CircleAlert, History, Send, ShieldCheck } from "lucide-react";
import type { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { formatLagosDate, formatLagosDateTime } from "@/lib/lagos-dates";
import { OBJECTIVE_TYPES, THEORY_TYPES } from "@/lib/exam-targets";
import { APPROVAL, approvalOf, deadlineState, formatCheck, normalisePrompt, questionsDue } from "@/lib/exam-approval";
import { reviewTestAction, setTestOwnerAction, setTestTermAction, submitTestAction } from "./approval-actions";

// The approval step for one test, at the top of its page: status, term and deadline, the checks the policy asks
// for (format, answers set, repeats from earlier papers), then Send for approval (teacher) or Approve / Send back
// (admin), and the history.

type Supabase = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

type TestLike = {
  id: string;
  subject_id: string | null;
  created_by?: string | null;
  approval_status?: string | null;
  academic_term_id?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
};

/** number = the question's number on the test page (Q1 is the first set), the order learners see them in. */
type Q = { id: string; prompt: string; question_type: string; active: boolean; number: number };

const day = (d: string) => formatLagosDate(`${d.slice(0, 10)}T12:00:00Z`);

export async function ApprovalPanel({
  supabase,
  test,
  questions,
  answeredIds,
  isAdmin,
  canSend
}: {
  supabase: Supabase;
  test: TestLike;
  questions: Q[];
  answeredIds: Set<string>;
  isAdmin: boolean;
  canSend: boolean;
}) {
  if (test.approval_status === undefined) {
    return (
      <Alert tone="info" title="Question approval isn't switched on yet">
        It needs the 24 November 2026 database update. Until then, tests can be scheduled without approval.
      </Alert>
    );
  }
  const status = approvalOf(test.approval_status);
  const s = APPROVAL[status];

  const [{ data: terms }, { data: subject }, { data: events }, { data: others }, { data: teachers }] = await Promise.all([
    supabase.from("academic_terms").select("id, name, starts_on, academic_years(name)").order("starts_on", { ascending: false }).limit(9),
    test.subject_id ? supabase.from("subjects").select("level, name").eq("id", test.subject_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("exam_test_events").select("id, action, note, done_at, done_by_name").eq("test_id", test.id).order("done_at", { ascending: false }).limit(20),
    test.subject_id
      ? supabase.from("exam_tests").select("id, name, exam_questions(prompt, created_at)").eq("subject_id", test.subject_id).neq("id", test.id).limit(60)
      : Promise.resolve({ data: [] }),
    isAdmin
      ? supabase.from("profiles").select("id, full_name, email").eq("role", "teacher").order("full_name")
      : Promise.resolve({ data: [] })
  ]);
  const teacherRows = (teachers ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
  const owner = teacherRows.find((t) => t.id === test.created_by) ?? null;

  type Term = { id: string; name: string; starts_on: string | null; academic_years: { name: string } | Array<{ name: string }> | null };
  const termRows = (terms ?? []) as Term[];
  const termName = (t: Term) => {
    const y = Array.isArray(t.academic_years) ? t.academic_years[0]?.name : t.academic_years?.name;
    return `${t.name} term${y ? ` ${y}` : ""}`;
  };
  const term = termRows.find((t) => t.id === test.academic_term_id) ?? null;
  const due = questionsDue(term?.starts_on);
  const deadline = deadlineState(due, test.submitted_at, status);

  const live = questions.filter((q) => q.active);
  const objective = live.filter((q) => (OBJECTIVE_TYPES as readonly string[]).includes(q.question_type)).length;
  const theory = live.filter((q) => (THEORY_TYPES as readonly string[]).includes(q.question_type)).length;
  const format = formatCheck((subject as { level: string | null } | null)?.level, objective, theory);
  const missing = live
    .filter((q) => (OBJECTIVE_TYPES as readonly string[]).includes(q.question_type) && !answeredIds.has(q.id))
    .sort((a, b) => a.number - b.number);
  const noAnswer = missing.length;
  const qList = (nums: number[]) => {
    const parts = nums.map((n) => `Q${n}`);
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
  };

  // Possible repeats: the same wording (ignoring case and punctuation) in another paper of this subject, with the
  // question's number in that paper. Teachers only compare with their own papers; admins with every paper.
  const earlier = new Map<string, { test: string; number: number }>();
  for (const t of (others ?? []) as Array<{ name: string; exam_questions: Array<{ prompt: string; created_at: string }> | null }>) {
    const qs = [...(t.exam_questions ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    qs.forEach((eq, i) => {
      const k = normalisePrompt(eq.prompt ?? "");
      if (k.length >= 12 && !earlier.has(k)) earlier.set(k, { test: t.name, number: i + 1 });
    });
  }
  const repeats = live
    .map((q) => ({ q, from: earlier.get(normalisePrompt(q.prompt)) }))
    .filter((r): r is { q: Q; from: { test: string; number: number } } => !!r.from)
    .sort((a, b) => a.q.number - b.q.number);

  const ev = (events ?? []) as Array<{ id: string; action: string; note: string | null; done_at: string; done_by_name: string | null }>;
  const returnedBy = ev.find((e) => e.action === "returned");
  const approvedBy = ev.find((e) => e.action === "approved");

  const check = (ok: boolean, text: string, key: string) => (
    <li key={key} className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-600" aria-hidden="true" />
      ) : (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      )}
      <span>{text}</span>
    </li>
  );

  return (
    <Card id="approval" className="scroll-mt-24">
      <CardHeader
        title="Approval"
        description={s.help}
        action={<Badge tone={s.tone}>{s.label}</Badge>}
      />
      <CardBody className="space-y-5">
        {status === "returned" && test.review_note ? (
          <Alert tone="warning" title={`Changes asked for${returnedBy?.done_by_name ? ` by ${returnedBy.done_by_name}` : ""}`}>
            {test.review_note}
          </Alert>
        ) : null}
        {status === "approved" && approvedBy ? (
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <ShieldCheck className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
            Approved by {approvedBy.done_by_name ?? "an admin"}, {formatLagosDateTime(approvedBy.done_at)}. Changing the questions, the time or the subject needs
            approval again.
          </p>
        ) : null}

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {term ? (
              <>
                <span className="font-semibold text-slate-900">For {termName(term)}</span>
                {due ? <span className="text-slate-600"> · questions due {day(due)} (Friday of week 2)</span> : null}{" "}
                {deadline === "late" ? <Badge tone="red">Sent late</Badge> : null}
                {deadline === "on_time" ? <Badge tone="green">Sent on time</Badge> : null}
                {deadline === "overdue" ? <Badge tone="red">Overdue</Badge> : null}
              </>
            ) : (
              <span className="text-slate-700">Choose the term this paper is for. It sets the deadline: Friday of week 2.</span>
            )}
          </div>
          {canSend && status !== "approved" && status !== "submitted" ? (
            <form action={setTestTermAction} className="flex items-center gap-2">
              <input type="hidden" name="test_id" value={test.id} />
              <label className="sr-only" htmlFor="test-term">
                Term
              </label>
              <select id="test-term" name="academic_term_id" className="gf-select" defaultValue={test.academic_term_id ?? ""} required>
                <option value="" disabled>
                  Choose a term
                </option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {termName(t)}
                  </option>
                ))}
              </select>
              <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                Save
              </SubmitButton>
            </form>
          ) : null}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Checks</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            {check(live.length > 0, live.length ? `${live.length} question${live.length === 1 ? "" : "s"} set (${objective} objective, ${theory} theory).` : "No questions yet.", "count")}
            {format ? check(format.ok, format.text, "format") : null}
            {check(
              noAnswer === 0,
              noAnswer
                ? `${qList(missing.map((q) => q.number))} ${noAnswer === 1 ? "has" : "have"} no correct answer set, so ${noAnswer === 1 ? "it" : "they"} can't be marked. Open ${noAnswer === 1 ? "it" : "each one"} below and choose the answer.`
                : "Every objective question has its correct answer.",
              "answers"
            )}
            {check(
              repeats.length === 0,
              repeats.length
                ? `${qList(repeats.map((x) => x.q.number))} ${repeats.length === 1 ? "is" : "are"} worded like a question in another paper. Check ${repeats.length === 1 ? "it" : "them"}: repeating an earlier examination's questions is against the policy, but two classes studying the same topic can have similar questions.`
                : "No questions repeated from earlier papers of this subject.",
              "repeats"
            )}
          </ul>
          {repeats.length ? (
            <details className="mt-2 rounded-xl border border-amber-200 bg-amber-50/50 text-sm">
              <summary className="flex min-h-[40px] cursor-pointer items-center px-3 font-semibold text-amber-900">Which questions, and where</summary>
              <ul className="space-y-1 border-t border-amber-200 px-3 py-2 text-slate-700">
                {repeats.map((r) => (
                  <li key={r.q.id}>
                    <span className="font-semibold">Q{r.q.number}</span> is like <span className="font-semibold">Q{r.from.number}</span> in{" "}
                    &ldquo;{r.from.test}&rdquo;: &ldquo;{r.q.prompt.slice(0, 140)}&rdquo;
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        {canSend && (status === "draft" || status === "returned") ? (
          <form action={submitTestAction} className="space-y-3 border-t border-slate-100 pt-4">
            <input type="hidden" name="test_id" value={test.id} />
            <div>
              <label className="gf-label" htmlFor="submit-note">
                Note for the admins <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input id="submit-note" name="note" className="gf-input" maxLength={500} placeholder="e.g. Corrected question 4 as asked" />
            </div>
            <SubmitButton variant="primary" pendingText="Sending…">
              <span className="inline-flex items-center gap-1.5">
                <Send className="h-4 w-4" aria-hidden="true" />
                Send for approval
              </span>
            </SubmitButton>
            {!term ? <p className="gf-hint">Choose the term first.</p> : null}
          </form>
        ) : null}

        {isAdmin && status !== "approved" ? (
          <form action={reviewTestAction} className="space-y-3 border-t border-slate-100 pt-4">
            <input type="hidden" name="test_id" value={test.id} />
            <h3 className="text-sm font-semibold text-slate-900">{status === "submitted" ? "Review these questions" : "Approve without waiting for the teacher"}</h3>
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" name="split_checked" value="yes" className="mt-0.5 h-4 w-4" />
              <span>I checked the questions are about 20% from past work and 80% from this term&apos;s syllabus.</span>
            </label>
            <div>
              <label className="gf-label" htmlFor="review-note">
                Comments for the teacher <span className="font-normal text-slate-500">(needed to send back)</span>
              </label>
              <textarea id="review-note" name="note" rows={3} className="gf-input" maxLength={2000} />
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="primary" name="decision" value="approve" pendingText="Saving…">
                Approve
              </SubmitButton>
              <SubmitButton variant="secondary" name="decision" value="return" pendingText="Saving…">
                Send back with comments
              </SubmitButton>
            </div>
            {!format?.ok || noAnswer || repeats.length ? (
              <p className="flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Some checks above need a look before you approve.
              </p>
            ) : null}
          </form>
        ) : null}

        {isAdmin ? (
          <form action={setTestOwnerAction} className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
            <input type="hidden" name="test_id" value={test.id} />
            <div className="min-w-0 flex-1">
              <label className="gf-label" htmlFor="test-owner">
                Teacher who owns this paper
              </label>
              <select id="test-owner" name="owner" className="gf-select" defaultValue={owner?.id ?? ""} required>
                <option value="" disabled>
                  {test.created_by ? "Set by an admin" : "No teacher yet"}
                </option>
                {teacherRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name || t.email}
                  </option>
                ))}
              </select>
              <p className="gf-hint">Each teacher&apos;s papers are private. Hand it over to let another teacher work on it.</p>
            </div>
            <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
              Hand over
            </SubmitButton>
          </form>
        ) : null}

        {ev.length ? (
          <details className="border-t border-slate-100 pt-3 text-sm">
            <summary className="flex min-h-[40px] cursor-pointer items-center gap-2 font-semibold text-slate-700">
              <History className="h-4 w-4" aria-hidden="true" />
              History
            </summary>
            <ol className="mt-1 space-y-1 text-slate-600">
              {ev.map((e) => (
                <li key={e.id}>
                  {formatLagosDateTime(e.done_at)}: {e.action === "submitted" ? "Sent for approval" : e.action === "approved" ? "Approved" : e.action === "returned" ? "Sent back" : "Back to draft"}
                  {e.done_by_name ? ` by ${e.done_by_name}` : ""}
                  {e.note ? ` (${e.note})` : ""}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}
