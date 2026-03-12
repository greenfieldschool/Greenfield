"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
  type,
  showSpinner
}: {
  children: string;
  pendingText?: string;
  className: string;
  disabled?: boolean;
  type?: "submit" | "button";
  showSpinner?: boolean;
}) {
  const { pending } = useFormStatus();

  const shouldShowSpinner = showSpinner ?? true;

  return (
    <button
      type={type ?? "submit"}
      disabled={disabled || pending}
      aria-busy={pending}
      className={className}
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
