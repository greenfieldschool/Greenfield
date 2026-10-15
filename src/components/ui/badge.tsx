import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "green" | "gold" | "red" | "blue" | "slate" | "violet";

const tones: Record<BadgeTone, string> = {
  green: "bg-brand-green-50 text-brand-green-700 ring-brand-green-200/70",
  gold: "bg-brand-gold-50 text-brand-gold-800 ring-brand-gold-200/70",
  red: "bg-red-50 text-red-700 ring-red-200/70",
  blue: "bg-sky-50 text-sky-700 ring-sky-200/70",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200/70"
};

export function Badge({
  tone = "slate",
  dot,
  className,
  children
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        tones[tone],
        className
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
