import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {Icon ? (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      ) : null}
      <div className="mt-3 text-sm font-semibold text-slate-900">{title}</div>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
