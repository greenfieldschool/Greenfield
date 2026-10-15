import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// A titled card for forms and settings blocks: title + description on top, fields below.
export function FormSection({
  title,
  description,
  children,
  footer,
  className,
  id
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-card", className)}>
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

// Label + control + hint, wired for accessibility via htmlFor.
export function Field({
  label,
  htmlFor,
  hint,
  required,
  className,
  children
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="gf-label">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="gf-hint">{hint}</p> : null}
    </div>
  );
}
