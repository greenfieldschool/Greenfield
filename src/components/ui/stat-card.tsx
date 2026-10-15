import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "green" | "gold" | "blue" | "rose" | "slate" | "violet";

export const toneStyles: Record<Tone, { icon: string; ring: string }> = {
  green: { icon: "bg-brand-green-50 text-brand-green-600", ring: "ring-brand-green-100" },
  gold: { icon: "bg-brand-gold-50 text-brand-gold-700", ring: "ring-brand-gold-100" },
  blue: { icon: "bg-sky-50 text-sky-600", ring: "ring-sky-100" },
  rose: { icon: "bg-rose-50 text-rose-600", ring: "ring-rose-100" },
  slate: { icon: "bg-slate-100 text-slate-600", ring: "ring-slate-200" },
  violet: { icon: "bg-violet-50 text-violet-600", ring: "ring-violet-100" }
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "green",
  href
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-slate-500">{label}</div>
        {Icon ? (
          <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl", toneStyles[tone].icon)}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-[1.65rem] font-bold leading-tight tracking-tight text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </>
  );

  const className =
    "block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition " +
    (href ? "hover:-translate-y-0.5 hover:border-brand-green-200 hover:shadow-lift" : "");

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
