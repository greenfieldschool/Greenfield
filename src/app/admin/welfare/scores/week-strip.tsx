"use client";

import { useEffect, useRef } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type StripWeek = {
  start: string;
  number: number;
  range: string;
  current: boolean;
  future: boolean;
  /** Chosen by an admin as a week that must be filled (Welfare → Compulsory weeks). */
  compulsory?: boolean;
  href: string;
  /** Pupils fully scored / with at least one rating, out of total. */
  done: number;
  started: number;
  total: number;
};

// Plain <a> links (not next/link) so the grid's "unsaved changes" warning fires when switching weeks.
export function WeekStrip({ weeks, selected }: { weeks: StripWeek[]; selected: string }) {
  const listRef = useRef<HTMLOListElement>(null);
  const index = weeks.findIndex((w) => w.start === selected);
  const prev = index > 0 ? weeks[index - 1] : null;
  const next = index >= 0 && index < weeks.length - 1 && !weeks[index + 1].future ? weeks[index + 1] : null;

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[aria-current='true']")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);

  const arrow = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-brand-green-300 hover:text-brand-green-700";

  return (
    <div className="flex items-center gap-2">
      {prev ? (
        <a href={prev.href} className={arrow} aria-label={`Previous week (week ${prev.number})`}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : (
        <span className={cn(arrow, "pointer-events-none opacity-40")} aria-hidden="true">
          <ChevronLeft className="h-5 w-5" />
        </span>
      )}
      <ol ref={listRef} className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto px-0.5 py-1" aria-label="Weeks of the term">
        {weeks.map((w) => {
          const isSelected = w.start === selected;
          const complete = w.total > 0 && w.done === w.total;
          const status = w.future ? "Not yet" : complete ? "All scored" : w.started ? `${w.done} of ${w.total}` : "Not scored";
          const body = (
            <>
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
                Week {w.number}
                {w.current ? <span className="rounded-full bg-brand-green-600 px-1.5 py-px text-[10px] font-semibold text-white">This week</span> : null}
              </span>
              {w.compulsory ? (
                <span className="mt-0.5 w-fit rounded bg-brand-gold-100 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-brand-gold-800">
                  Compulsory
                </span>
              ) : null}
              <span className="text-[11px] text-slate-500">{w.range}</span>
              <span
                className={cn(
                  "mt-1 inline-flex items-center gap-1 text-[11px] font-medium",
                  w.future ? "text-slate-400" : complete ? "text-brand-green-700" : w.started ? "text-brand-gold-800" : "text-slate-500"
                )}
              >
                {complete ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", w.future ? "bg-slate-300" : w.started ? "bg-brand-gold-500" : "bg-slate-400")}
                    aria-hidden="true"
                  />
                )}
                {status}
              </span>
            </>
          );
          const chip = cn(
            "flex w-full snap-start flex-col rounded-xl border px-3 py-2 text-left transition",
            isSelected
              ? "border-brand-green-500 bg-brand-green-50 text-brand-green-900 ring-2 ring-brand-green-500/20"
              : w.future
                ? "border-dashed border-slate-200 bg-slate-50 text-slate-400"
                : "border-slate-200 bg-white text-slate-800 hover:border-brand-green-300"
          );
          return (
            <li key={w.start} className={cn("shrink-0", w.current ? "w-[9rem]" : "w-[7.5rem]")}>
              {w.future ? (
                <span className={chip} aria-disabled="true" title="This week hasn't started yet">
                  {body}
                </span>
              ) : (
                <a href={w.href} className={chip} aria-current={isSelected ? "true" : undefined}>
                  {body}
                </a>
              )}
            </li>
          );
        })}
      </ol>
      {next ? (
        <a href={next.href} className={arrow} aria-label={`Next week (week ${next.number})`}>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : (
        <span className={cn(arrow, "pointer-events-none opacity-40")} aria-hidden="true">
          <ChevronRight className="h-5 w-5" />
        </span>
      )}
    </div>
  );
}
