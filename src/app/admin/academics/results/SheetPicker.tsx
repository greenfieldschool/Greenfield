"use client";

import { useState } from "react";
import { FolderOpen } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { buttonClasses } from "@/components/ui/button";

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

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
      <div>
        <label htmlFor="sheet-class" className="gf-label">
          Class
        </label>
        <select
          id="sheet-class"
          className="gf-select"
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
        <label htmlFor="sheet-subject" className="gf-label">
          Subject
        </label>
        <select
          id="sheet-subject"
          className="gf-select"
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
          <p className="gf-hint text-brand-gold-800">No subjects assigned to this class yet, so all subjects are listed.</p>
        ) : null}
      </div>
      <div>
        <label htmlFor="sheet-term" className="gf-label">
          Term
        </label>
        <select id="sheet-term" className="gf-select" name="term_id" defaultValue={defaultTermId} required>
          <option value="">Select term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <SubmitButton className={buttonClasses({ variant: "primary", className: "w-full lg:w-auto" })} pendingText="Opening…">
          <span className="inline-flex items-center gap-2">
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            Open sheet
          </span>
        </SubmitButton>
      </div>
    </form>
  );
}
