"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
  type
}: {
  children: string;
  pendingText?: string;
  className: string;
  disabled?: boolean;
  type?: "submit" | "button";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type={type ?? "submit"}
      disabled={disabled || pending}
      aria-busy={pending}
      className={className}
    >
      {pending ? pendingText ?? "Loading…" : children}
    </button>
  );
}
