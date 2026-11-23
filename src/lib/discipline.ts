// The discipline ladder (school policy "When a rule is broken"). The database decides which time and step a case
// is (record_discipline_case in docs/migrations/20261123_discipline_ladder.sql); these are the words for the codes
// it stores. Keep them in step with the check constraints there and with the policy text in lib/policies/families.ts.

export type Ladder = "steps" | "useful_work_first" | "committee";

export type DisciplineRule = {
  id: string;
  name: string;
  description: string | null;
  ladder: Ladder;
  active: boolean;
  position: number;
};

export const CORRECTIONS = {
  read_and_warn: "Read the rule three times, then a firm warning",
  useful_work: "30 minutes of useful work",
  supervised_reflection: "Supervised reflection time with a member of staff",
  lose_break: "Lost break time",
  spoken_promise: "A spoken promise",
  three_days_counselling_statement: "30 minutes of useful work on 3 days in a row, counselling and a written statement"
} as const;
export type CorrectionCode = keyof typeof CORRECTIONS;

/** The corrections the policy allows for a step. Step 4 has none: the disciplinary committee decides. */
export function correctionsFor(step: number, ladder: Ladder): CorrectionCode[] {
  if (step === 1) return ladder === "useful_work_first" ? ["useful_work"] : ["read_and_warn"];
  if (step === 2) return ["useful_work", "supervised_reflection", "lose_break", "spoken_promise"];
  if (step === 3) return ["three_days_counselling_statement"];
  return [];
}

/** Which step a case would be, given how many times the pupil has broken the rule before. */
export function stepFor(before: number, ladder: Ladder) {
  return ladder === "committee" ? 4 : Math.min(before + 1, 4);
}

export function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

/** What each step means, in the policy's words, shortened. */
export const STEP_MEANING: Record<number, string> = {
  1: "New to the rule",
  2: "Broke it again after being corrected",
  3: "Refusing correction",
  4: "For the disciplinary committee"
};

export const LADDER_LABELS: Record<Ladder, string> = {
  steps: "Usual ladder",
  useful_work_first: "Useful work from the 1st time",
  committee: "Straight to the disciplinary committee"
};

export const COMMITTEE_OUTCOMES = {
  environment_team: "Extra time with the school's environment team (supervised, outside lesson time)",
  counsellor: "Referral to the school counsellor (outside support only with the parent's agreement)",
  other: "Another measure decided by the committee"
} as const;
export type CommitteeOutcome = keyof typeof COMMITTEE_OUTCOMES;

export const WITHDRAW_REASONS = {
  recorded_in_error: "Recorded in error",
  wrong_pupil: "Recorded for the wrong pupil",
  duplicate: "Recorded twice",
  other: "Another reason (say why)"
} as const;

/** Database errors are already written for staff; anything else gets a plain message. */
export function disciplineError(message: string) {
  if (/does not exist|schema cache|could not find the function/i.test(message)) {
    return "The discipline ladder isn't set up yet. An admin needs to run the 23 November 2026 database update.";
  }
  if (/permission denied|row-level security/i.test(message)) return "You don't have permission to do that.";
  return message.replace(/^.*?exception:\s*/i, "");
}
