"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/form-section";
import { UNAPPROVE_REASONS } from "@/lib/exam-approval";
import { unapproveTestAction } from "./approval-actions";

// Admins take approval back from a paper (exam_unapprove_test). Reason from the list; only Other is typed.
export default function UnapproveForm({ testId, writing, sat }: { testId: string; writing: number; sat: number }) {
  const [reason, setReason] = useState("");
  const blocked = writing > 0;
  return (
    <form action={unapproveTestAction} className="space-y-4">
      <input type="hidden" name="test_id" value={testId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Why are you unapproving it?" htmlFor="unapprove-reason" required>
          <select
            id="unapprove-reason"
            name="reason"
            className="gf-select"
            required
            disabled={blocked}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {UNAPPROVE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        {reason === "other" ? (
          <Field label="Say what is wrong" htmlFor="unapprove-note" required hint="The teacher sees this.">
            <input id="unapprove-note" name="note" className="gf-input" required minLength={5} maxLength={500} autoFocus />
          </Field>
        ) : null}
      </div>
      {blocked ? null : (
        <ConfirmSubmitButton
          confirmMessage={`Unapprove this paper? Learners won't be able to open it until it is approved again${
            sat ? `. The ${sat} learner${sat === 1 ? "" : "s"} who sat it keep their answers and marks` : ""
          }. The teacher will be emailed the reason.`}
          className={buttonClasses({ variant: "danger" })}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          Unapprove and send back
        </ConfirmSubmitButton>
      )}
    </form>
  );
}
