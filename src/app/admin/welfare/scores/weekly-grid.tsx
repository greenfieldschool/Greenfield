"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CopyPlus, RotateCcw, Save } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type GridCriterion = {
  id: string;
  name: string;
  description: string | null;
  /** true = the class teacher rates it 1–5; false = worked out from the school's records. */
  rated: boolean;
  max: number;
  /** Where a record-based criterion comes from, e.g. "Attendance". */
  sourceLabel: string;
};

export type GridRow = {
  id: string;
  name: string;
  admission: string | null;
  auto: Record<string, { points: number | null; detail: string; short: string }>;
  ratings: Record<string, number | null>;
  /** The pupil's ratings from their most recent earlier scored week, for "Copy last week". */
  previous: Record<string, number | null>;
};

const LABELS: Record<number, string> = { 5: "Excellent", 4: "Very good", 3: "Good", 2: "Fair", 1: "Poor" };
const RATINGS = [5, 4, 3, 2, 1];

const round2 = (n: number) => Math.round(n * 100) / 100;
const keyOf = (criterionId: string, studentId: string) => `${criterionId}:${studentId}`;

function bandClass(p: number) {
  return p >= 70 ? "bg-brand-green-500" : p >= 50 ? "bg-brand-gold-500" : "bg-red-500";
}

export function WeeklyGrid({
  action,
  hidden,
  criteria,
  rows,
  locked,
  hasPrevious,
  weekLabel
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  criteria: GridCriterion[];
  rows: GridRow[];
  locked: boolean;
  /** Some pupil has ratings in an earlier week. */
  hasPrevious: boolean;
  weekLabel: string;
}) {
  const rated = useMemo(() => criteria.filter((c) => c.rated), [criteria]);
  const initial = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rows) for (const c of rated) m[keyOf(c.id, r.id)] = r.ratings[c.id] ? String(r.ratings[c.id]) : "";
    return m;
  }, [rows, rated]);
  const [values, setValues] = useState(initial);
  const submitting = useRef(false);

  // After a save the page re-renders with the saved values; start tracking changes from there.
  useEffect(() => {
    submitting.current = false;
  }, [initial]);

  const changed = Object.keys(initial).filter((k) => (values[k] ?? "") !== initial[k]).length;
  const empty = Object.keys(initial).filter((k) => !values[k]).length;
  const canCopy = hasPrevious && rows.some((r) => rated.some((c) => !values[keyOf(c.id, r.id)] && r.previous[c.id]));

  useEffect(() => {
    if (!changed) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (submitting.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  const set = (key: string, v: string) => setValues((old) => ({ ...old, [key]: v }));

  const fillEmpty = (criterionId: string, v: string) =>
    setValues((old) => {
      const next = { ...old };
      for (const r of rows) {
        const k = keyOf(criterionId, r.id);
        if (!next[k]) next[k] = v;
      }
      return next;
    });

  const copyPrevious = () =>
    setValues((old) => {
      const next = { ...old };
      for (const r of rows)
        for (const c of rated) {
          const k = keyOf(c.id, r.id);
          const prev = r.previous[c.id];
          if (!next[k] && prev) next[k] = String(prev);
        }
      return next;
    });

  // Same rule as lib/welfare.ts: scored out of the criteria that can be scored this week, shown out of 100.
  const totalFor = (r: GridRow) => {
    let earned = 0;
    let possible = 0;
    let ratedCount = 0;
    for (const c of criteria) {
      if (c.rated) {
        const v = Number(values[keyOf(c.id, r.id)] || 0);
        if (v) {
          earned += (c.max * v) / 5;
          possible += c.max;
          ratedCount += 1;
        }
      } else {
        const p = r.auto[c.id]?.points;
        if (p !== null && p !== undefined) {
          earned += p;
          possible += c.max;
        }
      }
    }
    const percent = possible > 0 && (!rated.length || ratedCount > 0) ? round2((earned / possible) * 100) : null;
    return { percent, missing: rated.length - ratedCount };
  };

  const totals = rows.map(totalFor);
  const scoredTotals = totals.map((t) => t.percent).filter((p): p is number => p !== null);
  const classAverage = scoredTotals.length ? round2(scoredTotals.reduce((a, b) => a + b, 0) / scoredTotals.length) : null;
  const fullyScored = totals.filter((t) => t.percent !== null && t.missing === 0).length;
  const maxTotal = criteria.reduce((a, c) => a + c.max, 0);

  return (
    <form
      action={action}
      onSubmit={() => {
        submitting.current = true;
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{fullyScored}</span> of {rows.length} pupils fully scored for {weekLabel}
          {classAverage !== null ? (
            <>
              {" "}
              · class average <span className="font-semibold tabular-nums text-slate-900">{classAverage}</span>
            </>
          ) : null}
        </p>
        {locked ? null : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyPrevious}
              disabled={!canCopy}
              title={
                hasPrevious
                  ? "Fills each pupil's empty boxes with their ratings from the last week they were scored. Nothing is saved until you press Save."
                  : "No earlier week has ratings yet"
              }
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <CopyPlus className="h-4 w-4" aria-hidden="true" />
              Copy last week into empty boxes
            </button>
            {changed ? (
              <button type="button" onClick={() => setValues(initial)} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Undo changes
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-32 border-b sm:w-48 border-slate-200 bg-slate-50 px-4 py-2.5 text-left align-bottom text-xs font-semibold text-slate-600 sm:pl-6">
                Pupil
              </th>
              {criteria.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  title={c.description ?? undefined}
                  className={cn(
                    "sticky top-0 z-20 border-b border-slate-200 px-2 py-2 text-center align-bottom text-xs font-semibold text-slate-700",
                    c.rated ? "bg-slate-50" : "bg-sky-50"
                  )}
                >
                  <div className="mx-auto max-w-[6.5rem] leading-tight">{c.name}</div>
                  <div className="mt-0.5 font-normal text-slate-500">
                    {c.max} marks · {c.rated ? "rate 1–5" : `from ${c.sourceLabel.toLowerCase()}`}
                  </div>
                  {c.rated && !locked ? (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) fillEmpty(c.id, e.target.value);
                      }}
                      aria-label={`Fill the empty ${c.name} boxes`}
                      className="mt-1.5 h-7 w-[5.75rem] rounded-md border border-slate-200 bg-white px-1 text-[11px] font-normal text-slate-600 outline-none focus:ring-2 focus:ring-brand-green-500/30"
                    >
                      <option value="">Fill empty…</option>
                      {RATINGS.map((v) => (
                        <option key={v} value={v}>
                          {v} · {LABELS[v]}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </th>
              ))}
              <th className="sticky top-0 z-20 border-b border-l sm:right-0 sm:z-30 border-slate-200 bg-slate-50 px-4 py-2.5 text-right align-bottom text-xs font-semibold text-slate-700 sm:shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.15)] sm:pr-6">
                This week
                <div className="font-normal text-slate-500">out of {maxTotal === 100 ? "100" : `100 (scaled from ${maxTotal})`}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, rowIndex) => {
              const zebra = rowIndex % 2 ? "bg-slate-50" : "bg-white";
              const total = totals[rowIndex];
              return (
                <tr key={r.id}>
                  <th scope="row" className={cn("sticky left-0 z-10 w-32 max-w-[8rem] border-b sm:w-48 sm:max-w-none border-slate-100 px-4 py-2 text-left font-normal sm:pl-6", zebra)}>
                    <div className="truncate font-semibold text-slate-900" title={r.name}>
                      {r.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {total.missing && !locked ? <span className="font-medium text-brand-gold-800">{total.missing} to rate</span> : r.admission ?? ""}
                    </div>
                  </th>
                  {criteria.map((c) => {
                    if (!c.rated) {
                      const a = r.auto[c.id];
                      return (
                        <td key={c.id} title={a?.detail} className={cn("border-b border-slate-100 px-2 py-2 text-center", zebra)}>
                          <div className="tabular-nums font-medium text-slate-800">
                            {a?.points === null || a?.points === undefined ? <span className="text-slate-400">—</span> : a.points}
                          </div>
                          <div className="whitespace-nowrap text-[10.5px] leading-tight text-slate-500">{a?.short}</div>
                        </td>
                      );
                    }
                    const k = keyOf(c.id, r.id);
                    const v = values[k] ?? "";
                    const isChanged = v !== initial[k];
                    return (
                      <td key={c.id} className={cn("border-b border-slate-100 px-2 py-2 text-center", zebra)}>
                        <input type="hidden" name={`orig:${k}`} value={initial[k]} />
                        <select
                          name={`rating:${k}`}
                          value={v}
                          onChange={(e) => set(k, e.target.value)}
                          disabled={locked}
                          aria-label={`${c.name} for ${r.name}`}
                          title={v ? `${v} · ${LABELS[Number(v)]} = ${round2((c.max * Number(v)) / 5)} of ${c.max} marks` : "Not rated yet"}
                          className={cn(
                            "h-9 w-[4.25rem] rounded-lg border px-1 text-center text-sm font-medium tabular-nums shadow-sm outline-none transition focus:ring-4 focus:ring-brand-green-500/20",
                            isChanged
                              ? "border-sky-400 bg-sky-50 text-sky-900"
                              : v
                                ? "border-slate-300 bg-white text-slate-900"
                                : "border-brand-gold-300 bg-brand-gold-50 text-slate-500",
                            locked && "cursor-not-allowed opacity-70"
                          )}
                        >
                          <option value="">–</option>
                          {RATINGS.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                  <td className={cn("border-b border-l sm:sticky sm:right-0 sm:z-10 border-slate-100 px-4 py-2 text-right sm:shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.15)] sm:pr-6", zebra)}>
                    {total.percent === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-200 sm:block" aria-hidden="true">
                          <div className={cn("h-full rounded-full", bandClass(total.percent))} style={{ width: `${Math.min(100, total.percent)}%` }} />
                        </div>
                        <span className="w-12 font-semibold tabular-nums text-slate-900">{total.percent}</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 z-30 flex flex-col gap-3 rounded-b-2xl border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="hidden text-xs text-slate-600 sm:block">
          <p>
            <span className="font-semibold text-slate-800">5</span> Excellent · <span className="font-semibold text-slate-800">4</span> Very good ·{" "}
            <span className="font-semibold text-slate-800">3</span> Good · <span className="font-semibold text-slate-800">2</span> Fair ·{" "}
            <span className="font-semibold text-slate-800">1</span> Poor
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm border border-brand-gold-300 bg-brand-gold-50" aria-hidden="true" /> still to rate ({empty})
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm border border-sky-400 bg-sky-50" aria-hidden="true" /> changed, not saved yet
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-100" aria-hidden="true" /> worked out from records
            </span>
          </p>
        </div>
        {locked ? null : (
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className={cn("text-sm", changed ? "font-semibold text-sky-800" : "text-slate-500")} aria-live="polite">
              {changed ? `${changed} unsaved change${changed === 1 ? "" : "s"}` : "No unsaved changes"}
            </span>
            <SubmitButton pendingText="Saving…" disabled={!changed} className={buttonClasses({ variant: "primary", className: "shrink-0" })}>
              <span className="inline-flex items-center gap-2">
                <Save className="h-4 w-4" aria-hidden="true" />
                Save {weekLabel.toLowerCase()}
              </span>
            </SubmitButton>
          </div>
        )}
      </div>
    </form>
  );
}
