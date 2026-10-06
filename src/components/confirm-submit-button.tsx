"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Submit button that asks for confirmation before letting the form submit.
export default function ConfirmSubmitButton({
  children,
  confirmMessage,
  className,
  title
}: {
  children: ReactNode;
  confirmMessage: string;
  className: string;
  title?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      title={title}
      disabled={pending}
      aria-busy={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
