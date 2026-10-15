"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Like ConfirmSubmitButton, but for a submit button that targets its own server action via
// `formAction` (several buttons sharing one <form>).
export default function ConfirmActionButton({
  children,
  confirmMessage,
  formAction,
  className,
  title
}: {
  children: ReactNode;
  confirmMessage: string;
  formAction: (formData: FormData) => void | Promise<void>;
  className: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      title={title}
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
