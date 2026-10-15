"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { buttonClasses } from "@/components/ui/button";

// Two-step submit for the exam form: the first tap asks for confirmation inline (no browser
// dialog, which would blur the window and lock the attempt), the second tap submits the form.
export default function SubmitExamButton() {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
      >
        <Send className="h-5 w-5" aria-hidden="true" />
        Submit exam
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end" role="group" aria-label="Confirm submission">
      <p className="text-sm font-medium text-slate-700">Are you sure? You can&apos;t change answers after submitting.</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={buttonClasses({ variant: "secondary", size: "lg" })}
        >
          Keep working
        </button>
        <SubmitButton variant="primary" size="lg" pendingText="Submitting…">
          Yes, submit
        </SubmitButton>
      </div>
    </div>
  );
}
