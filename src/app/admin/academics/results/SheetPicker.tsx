"use client";

import { useState } from "react";
import SubmitButton from "@/components/submit-button";

type Option = { id: string; label: string };

// Class / subject / term picker for the result sheet. The subject list follows the chosen class:
// only the class's assigned subjects are offered, or every subject when none have been assigned yet.
export default function SheetPicker({
  action,
  classes,
  subjects,
  terms,
  subjectIdsByClass,
  defaultClassId,
  defaultSubjectId,
  defaultTermId
}: {
  action: (formData: FormData) => void | Promise<void>;
  classes: Option[];
  subjects: Option[];
  terms: Option[];
  subjectIdsByClass: Record<string, string[]>;
  defaultClassId: string;
  defaultSubjectId: string;
  defaultTermId: string;
}) {
  const [classId, setClassId] = useState(defaultClassId);
  const [subjectId, setSubjectId] = useState(defaultSubjectId);

  const assignedIds = classId ? subjectIdsByClass[classId] ?? [] : [];
  const usesAssigned = assignedIds.length > 0;
  const subjectOptions = usesAssigned ? subjects.filter((s) => assignedIds.includes(s.id)) : subjects;

  const selectClass =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green";

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="text-sm font-semibold text-slate-900">Class</label>
        <select
          className={selectClass}
          name="class_id"
          value={classId}
          onChange={(e) => {
            const next = e.target.value;
            setClassId(next);
            const nextAssigned = subjectIdsByClass[next] ?? [];
            if (nextAssigned.length && !nextAssigned.includes(subjectId)) setSubjectId("");
          }}
          required
        >
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-900">Subject</label>
        <select
          className={selectClass}
          name="subject_id"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          required
        >
          <option value="">{classId ? `Select subject (${subjectOptions.length})` : "Select subject"}</option>
          {subjectOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {classId && !usesAssigned ? (
          <div className="mt-1 text-xs text-amber-700">
            No subjects assigned to this class yet, so all subjects are listed.
          </div>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-900">Term</label>
        <select className={selectClass} name="term_id" defaultValue={defaultTermId} required>
          <option value="">Select term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <SubmitButton
          className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          pendingText="Opening…"
        >
          Open sheet
        </SubmitButton>
      </div>
    </form>
  );
}
