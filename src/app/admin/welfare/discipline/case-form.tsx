"use client";

import { useMemo, useState } from "react";
import SubmitButton from "@/components/submit-button";
import { CORRECTIONS, STEP_MEANING, correctionsFor, ordinal, stepFor, type Ladder } from "@/lib/discipline";

// Recording a case. As staff pick the pupil and rule, the form shows which time it is and offers only the
// corrections the policy allows for that step. The database works the step out again when saving.

type Pupil = { id: string; name: string };
type Rule = { id: string; name: string; description: string | null; ladder: Ladder };

export function CaseForm({
  action,
  pupils,
  rules,
  counts,
  today,
  defaultDay,
  defaultStudent,
  back
}: {
  action: (fd: FormData) => Promise<void>;
  pupils: Pupil[];
  rules: Rule[];
  /** Times each pupil has broken each rule so far, keyed `${student}:${rule}`. */
  counts: Record<string, number>;
  today: string;
  defaultDay: string;
  defaultStudent: string;
  back: string;
}) {
  const [student, setStudent] = useState(defaultStudent);
  const [ruleId, setRuleId] = useState("");
  const rule = rules.find((r) => r.id === ruleId) ?? null;
  const before = student && rule ? (counts[`${student}:${rule.id}`] ?? 0) : null;
  const step = rule && before !== null ? stepFor(before, rule.ladder) : null;
  const options = useMemo(() => (rule && step ? correctionsFor(step, rule.ladder) : []), [rule, step]);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="back" value={back} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="gf-label" htmlFor="dis-student">
            Pupil
          </label>
          <select id="dis-student" name="student_id" className="gf-select" required value={student} onChange={(e) => setStudent(e.target.value)}>
            <option value="">Choose a pupil</option>
            {pupils.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="gf-label" htmlFor="dis-rule">
            Rule broken
          </label>
          <select id="dis-rule" name="rule_id" className="gf-select" required value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            <option value="">Choose a rule</option>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {rule?.description ? <p className="gf-hint">{rule.description}</p> : null}
        </div>
      </div>

      {step && before !== null ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${step >= 3 ? "border-red-200 bg-red-50 text-red-900" : "border-brand-green-200 bg-brand-green-50/60 text-slate-800"}`}
          aria-live="polite"
        >
          <p className="font-semibold">
            {rule?.ladder === "committee"
              ? "This rule goes straight to the disciplinary committee."
              : `This will be the ${ordinal(before + 1)} time for this rule. ${STEP_MEANING[step]}.`}
          </p>
          {step === 4 ? (
            <p className="mt-1">Save the case; an admin then records the committee&apos;s decision and the day the parent is invited in.</p>
          ) : null}
        </div>
      ) : null}

      {options.length ? (
        <fieldset>
          <legend className="gf-label">Correction given</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {options.map((c) => (
              <label
                key={c}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-brand-green has-[:checked]:bg-brand-green-50/60"
              >
                <input type="radio" name="correction" value={c} required defaultChecked={options.length === 1} className="h-4 w-4" />
                {CORRECTIONS[c]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="gf-label" htmlFor="dis-day">
            Day it happened
          </label>
          <input id="dis-day" name="occurred_on" type="date" className="gf-input" defaultValue={defaultDay} max={today} required />
        </div>
        <div>
          <label className="gf-label" htmlFor="dis-severity">
            How serious (1 to 5)
          </label>
          <select id="dis-severity" name="severity" className="gf-select" defaultValue="1">
            <option value="1">1: minor</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5: very serious</option>
          </select>
          <p className="gf-hint">Takes marks off Conduct on the welfare score sheet for that week.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="gf-label" htmlFor="dis-description">
            What happened
          </label>
          <textarea id="dis-description" name="description" rows={3} className="gf-input" required minLength={3} maxLength={2000} />
          <p className="gf-hint">Parents can read this on the portal. Stick to the facts.</p>
        </div>
        {step === 3 ? (
          <div className="sm:col-span-2">
            <label className="gf-label" htmlFor="dis-statement">
              Written statement for the pupil&apos;s file <span className="font-normal text-slate-500">(you can add it later)</span>
            </label>
            <textarea id="dis-statement" name="statement" rows={3} className="gf-input" maxLength={4000} placeholder="Why it happened, and how the pupil will change" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="primary" pendingText="Saving…">
          Save case
        </SubmitButton>
        <span className="text-sm text-slate-500">Parents are told on the portal and by email.</span>
      </div>
    </form>
  );
}
