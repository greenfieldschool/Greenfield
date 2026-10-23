"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

export default function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
  type,
  showSpinner,
  variant,
  size,
  formAction
}: {
  children: ReactNode;
  pendingText?: string;
  /** Full class list (legacy). When omitted, the design-system button style is used. */
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  type?: "submit" | "button";
  showSpinner?: boolean;
  /** Submit to a different server action than the form's own. */
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();

  const shouldShowSpinner = showSpinner ?? true;

  return (
    <button
      type={type ?? "submit"}
      formAction={formAction}
      disabled={disabled || pending}
      aria-busy={pending}
      className={className ?? buttonClasses({ variant, size })}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {pending && shouldShowSpinner ? (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        ) : null}
        <span>{pending ? pendingText ?? "Loading…" : children}</span>
      </span>
    </button>
  );
}
