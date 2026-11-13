"use client";

import { useState } from "react";
import { UserX } from "lucide-react";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { buttonClasses } from "@/components/ui/button";
import { DEACTIVATION_REASONS, type DeactivationReason } from "@/lib/student-deactivation";
import { deactivateStudentAction } from "./deactivation-actions";

export type KeepOption = { id: string; label: string; likely: boolean };

/**
 * "Deactivate this pupil": the reason is a fixed list; only "Other" asks for typed text, and "Duplicate record"
 * asks which record to keep (likely matches by name first). Admins only (the page shows it to admins; the
 * database checks again).
 */
export function DeactivatePanel({ studentId, studentName, keepOptions }: { studentId: string; studentName: string; keepOptions: KeepOption[] }) {
  const [reason, setReason] = useState<DeactivationReason | "">("");
  const chosen = DEACTIVATION_REASONS.find((r) => r.value === reason);
  const likely = keepOptions.filter((o) => o.likely);
  const others = keepOptions.filter((o) => !o.likely);

  return (
    <form action={deactivateStudentAction} className="space-y-4">
      <input type="hidden" name="student_id" value={studentId} />
      <div>
        <label htmlFor="deactivate-reason" className="gf-label">
          Reason
        </label>
        <select
          id="deactivate-reason"
          name="reason"
          className="gf-select"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value as DeactivationReason | "")}
        >
          <option value="" disabled>
            Choose a reason…
          </option>
          {DEACTIVATION_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {chosen ? <p className="gf-hint mt-1.5">{chosen.hint}</p> : null}
      </div>

      {reason === "duplicate" ? (
        <div>
          <label htmlFor="deactivate-kept" className="gf-label">
            Record to keep
          </label>
          <select id="deactivate-kept" name="kept_student_id" className="gf-select" required defaultValue="">
            <option value="" disabled>
              Choose the pupil&apos;s other record…
            </option>
            {likely.length ? (
              <optgroup label="Same name">
                {likely.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label={likely.length ? "All other pupils" : "Pupils"}>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="gf-hint mt-1.5">This record&apos;s results and fees stay with it; they are not moved.</p>
        </div>
      ) : null}

      {reason === "other" ? (
        <div>
          <label htmlFor="deactivate-other" className="gf-label">
            Type the reason
          </label>
          <input id="deactivate-other" name="reason_other" className="gf-input" required maxLength={200} placeholder="e.g. Parents asked to pause the place" />
        </div>
      ) : null}

      <div className="flex justify-end">
        <ConfirmSubmitButton
          className={buttonClasses({ variant: "danger" })}
          confirmMessage={`Deactivate ${studentName}? They will be taken off class lists, registers and result sheets. You can reactivate them later.`}
        >
          <UserX className="h-4 w-4" aria-hidden="true" />
          Deactivate pupil
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}
