import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

// Standard top-of-page block for the admin and portal: optional back link, eyebrow, title,
// description and actions aligned to the right on wide screens.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
  className
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-green"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? (
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-green-600">{eyebrow}</div>
        ) : null}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
