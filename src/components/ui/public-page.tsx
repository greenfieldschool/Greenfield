import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Header band for public inner pages (About, Academics, Admissions, …).
export function PublicPageHero({
  eyebrow,
  title,
  description,
  children,
  className
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative isolate overflow-hidden bg-brand-green-950 text-white", className)}>
      <div className="pointer-events-none absolute -right-32 -top-32 -z-10 h-96 w-96 rounded-full bg-brand-gold/15 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 left-1/4 -z-10 h-96 w-96 rounded-full bg-brand-green-500/20 blur-3xl" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20 lg:py-24">
        <div className="max-w-3xl animate-fade-up">
          {eyebrow ? (
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-300">{eyebrow}</div>
          ) : null}
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">{title}</h1>
          {description ? <p className="mt-5 max-w-2xl text-lg leading-relaxed text-brand-green-100">{description}</p> : null}
          {children ? <div className="mt-8 flex flex-wrap gap-3">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">{eyebrow}</div> : null}
      <h2 className="mt-3 font-display text-3xl font-semibold text-slate-900 sm:text-4xl">{title}</h2>
      {description ? <p className="mt-4 text-lg leading-relaxed text-slate-600">{description}</p> : null}
    </div>
  );
}

export function PublicSection({ children, className, tone = "canvas" }: { children: ReactNode; className?: string; tone?: "canvas" | "white" }) {
  return (
    <section className={cn(tone === "white" ? "bg-white" : "", className)}>
      <div className="mx-auto max-w-7xl px-6 py-20">{children}</div>
    </section>
  );
}
