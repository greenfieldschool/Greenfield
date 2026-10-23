"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { componentGroups, MAX_COMPONENTS, type ComponentGroup } from "@/lib/results";
import { cn } from "@/lib/cn";

export type EditableColumn = {
  /** Existing sheet column id; absent for new columns and for layout templates. */
  id?: string;
  label: string;
  group: ComponentGroup;
  max: number;
  /** Scores already entered in this column (warns before removing it). */
  scoreCount?: number;
  /** Highest score already entered (the max can't go below it). */
  highest?: number;
};

const compactInput =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15";

// Edits a list of result-sheet columns (label, kind, max score). The list is submitted as JSON in a hidden
// field named `name`, alongside the rest of the form.
export default function ColumnsEditor({ name, initial }: { name: string; initial: EditableColumn[] }) {
  const [rows, setRows] = useState<EditableColumn[]>(initial.length ? initial : [{ label: "", group: "ca", max: 10 }]);
  const total = Math.round(rows.reduce((a, r) => a + (Number(r.max) || 0), 0) * 100) / 100;
  const removedWithScores = initial.filter((c) => c.id && c.scoreCount && !rows.some((r) => r.id === c.id));

  const update = (i: number, patch: Partial<EditableColumn>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) =>
    setRows((rs) => {
      const next = [...rs];
      const [item] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + by)), 0, item);
      return next;
    });

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(rows.map(({ id, label, group, max }) => ({ id, label, group, max })))} />
      <div className="hidden grid-cols-[minmax(0,1fr)_11rem_6rem_auto] gap-3 px-1 text-xs font-semibold text-slate-500 sm:grid">
        <span>Column name</span>
        <span>Kind</span>
        <span>Max score</span>
        <span className="sr-only">Actions</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.id ?? `new-${i}`} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_6rem_auto] sm:gap-3">
          <input
            className={cn(compactInput, "col-span-2 sm:col-span-1")}
            value={r.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="e.g. 1st CA (Theory)"
            aria-label={`Column ${i + 1} name`}
            maxLength={60}
            required
          />
          <select
            className={compactInput}
            value={r.group}
            onChange={(e) => update(i, { group: e.target.value as ComponentGroup })}
            aria-label={`Column ${i + 1} kind`}
          >
            {componentGroups.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <input
            className={cn(compactInput, "tabular-nums")}
            type="number"
            inputMode="decimal"
            step="0.5"
            min={r.highest ? String(r.highest) : "0.5"}
            value={Number.isFinite(r.max) ? r.max : ""}
            onChange={(e) => update(i, { max: Number(e.target.value) })}
            aria-label={`Column ${i + 1} max score`}
            title={r.highest ? `Scores up to ${r.highest} are already entered` : undefined}
            required
          />
          <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              aria-label={`Move column ${i + 1} up`}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === rows.length - 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
              aria-label={`Move column ${i + 1} down`}
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              disabled={rows.length === 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30"
              aria-label={`Remove column ${i + 1}`}
              title={r.scoreCount ? `${r.scoreCount} score(s) entered in this column` : "Remove column"}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { label: "", group: "ca", max: 10 }])}
          disabled={rows.length >= MAX_COMPONENTS}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-green-700 hover:bg-brand-green-50 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add column
        </button>
        <span className={cn("text-sm font-semibold tabular-nums", total === 100 ? "text-brand-green-700" : "text-brand-gold-800")}>
          Total {total}
          {total === 100 ? "" : " — scores are scaled to 100"}
        </span>
      </div>
      {removedWithScores.length ? (
        <label className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <input type="checkbox" name="confirm_remove" className="mt-0.5 h-4 w-4" required />
          <span>
            Remove {removedWithScores.map((c) => `“${c.label}”`).join(", ")} and delete the{" "}
            {removedWithScores.reduce((a, c) => a + (c.scoreCount ?? 0), 0)} score(s) already entered in{" "}
            {removedWithScores.length === 1 ? "it" : "them"}.
          </span>
        </label>
      ) : null}
    </div>
  );
}
