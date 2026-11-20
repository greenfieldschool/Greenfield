"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/form-section";
import { REVERSE_REASONS } from "@/lib/payment-corrections";
import { reversePaymentAction } from "./actions";

export default function ReversePaymentForm({ paymentId, amountLabel }: { paymentId: string; amountLabel: string }) {
  const [reason, setReason] = useState("");
  return (
    <form action={reversePaymentAction} className="space-y-4">
      <input type="hidden" name="payment_id" value={paymentId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Why is it being reversed?" htmlFor="reverse-reason" required>
          <select
            id="reverse-reason"
            name="reason"
            className="gf-select"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {REVERSE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        {reason === "other" ? (
          <Field label="Type the reason" htmlFor="reverse-note" required>
            <input id="reverse-note" name="reason_note" className="gf-input" required minLength={3} maxLength={300} autoFocus />
          </Field>
        ) : null}
      </div>
      <ConfirmSubmitButton
        confirmMessage={`Reverse this payment of ${amountLabel}? It will stay on record, crossed out, and stop counting towards any balance. This can't be undone.`}
        className={buttonClasses({ variant: "danger" })}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        Reverse payment
      </ConfirmSubmitButton>
    </form>
  );
}
