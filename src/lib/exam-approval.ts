// Approving exam questions (staff policy "Examination questions"; docs/migrations/20261124b_exam_hand_in_access_approval.sql).
// The database decides who may send, approve and change; these are the words and the checks shown on screen.

import type { BadgeTone } from "@/components/ui/badge";

export type ApprovalStatus = "draft" | "submitted" | "approved" | "returned";

export const APPROVAL: Record<ApprovalStatus, { label: string; tone: BadgeTone; help: string }> = {
  draft: { label: "Draft", tone: "slate", help: "Still being set. Send it for approval when the questions are ready." },
  submitted: { label: "Waiting for approval", tone: "gold", help: "Sent to the admins. They approve it or send it back with comments." },
  approved: { label: "Approved", tone: "green", help: "Approved. It can be opened to learners in a session." },
  returned: { label: "Sent back", tone: "red", help: "The admins asked for changes. Make them, then send it again." }
};

export function approvalOf(v: unknown): ApprovalStatus {
  return v === "submitted" || v === "approved" || v === "returned" ? v : "draft";
}

/** Friday of week 2 of a term (same as exam_questions_due() in the database), as yyyy-mm-dd. */
export function questionsDue(termStartsOn: string | null | undefined) {
  if (!termStartsOn) return null;
  const d = new Date(`${termStartsOn.slice(0, 10)}T12:00:00Z`);
  const isoDow = ((d.getUTCDay() + 6) % 7) + 1; // Mon 1 … Sun 7
  d.setUTCDate(d.getUTCDate() + ((5 - isoDow + 7) % 7) + 7);
  return d.toISOString().slice(0, 10);
}

const lagosDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(iso));

/** On time, late or overdue, for the deadline line. */
export function deadlineState(due: string | null, submittedAt: string | null | undefined, status: ApprovalStatus) {
  if (!due) return null;
  if (submittedAt && status !== "draft") return lagosDay(submittedAt) > due ? "late" : "on_time";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  return today > due ? "overdue" : "open";
}

/** The policy's paper format for a section, checked against the questions set. */
export function formatCheck(level: string | null | undefined, objective: number, theory: number) {
  if (level === "creche") {
    return { ok: false, text: "Crèche examinations are practical (letters, colours and similar). Check this paper is meant to be sat online." };
  }
  if (level === "primary") {
    const ok = objective === 30 && theory === 5;
    return { ok, text: ok ? "Matches the policy: 30 objective and 5 theory questions." : `The policy sets 30 objective and 5 theory questions for primary. This paper has ${objective} and ${theory}.` };
  }
  if (level === "secondary") {
    const ok = objective >= 50 && theory === 5;
    return {
      ok,
      text: ok
        ? "Matches the policy: 50 or more objective questions and 5 theory questions (learners answer 3)."
        : `The policy sets 50 or more objective questions and 5 theory questions (learners answer 3) for secondary. This paper has ${objective} and ${theory}.`
    };
  }
  return null;
}

/** For spotting repeated questions: lower case, no punctuation or extra spaces. */
export function normalisePrompt(p: string) {
  return p
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Why an admin takes approval back (same codes and words as exam_unapprove_reason_label() in 20261127_exam_unapprove.sql). */
export const UNAPPROVE_REASONS = [
  { value: "wrong_answer", label: "A correct answer is wrong or missing" },
  { value: "question_error", label: "A question or its options have a mistake" },
  { value: "format", label: "The paper doesn't follow the policy format" },
  { value: "repeated", label: "Questions repeat an earlier examination" },
  { value: "syllabus", label: "Not 20% past work and 80% this term's syllabus" },
  { value: "wrong_details", label: "Wrong subject, term or time allowed" },
  { value: "other", label: "Other" }
] as const;

export const APPROVAL_EVENT_LABEL: Record<string, string> = {
  submitted: "Sent for approval",
  approved: "Approved",
  returned: "Sent back",
  back_to_draft: "Back to draft",
  unapproved: "Approval taken back"
};
