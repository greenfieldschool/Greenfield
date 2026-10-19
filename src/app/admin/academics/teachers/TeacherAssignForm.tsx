"use client";

import { useState } from "react";
import { UserCheck } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { cn } from "@/lib/cn";

type Option = { id: string; label: string };
type ClassGroup = { level: string; items: Option[] };

const mode = {
  class: "class",
  subjects: "subjects"
} as const;

function toggle(set: Set<string>, id: string, on: boolean) {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

// Pick a teacher, tick one or more classes, and say whether they take the whole class or only some subjects.
export default function TeacherAssignForm({
  action,
  teachers,
  classGroups,
  subjects
}: {
  action: (formData: FormData) => void | Promise<void>;
  teachers: Option[];
  classGroups: ClassGroup[];
  subjects: Option[];
}) {
  const [assignMode, setAssignMode] = useState<keyof typeof mode>("class");
  const [classIds, setClassIds] = useState<Set<string>>(new Set());
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set());

  const allClassIds = classGroups.flatMap((g) => g.items.map((c) => c.id));

  function setGroup(group: ClassGroup, on: boolean) {
    setClassIds((prev) => {
      const next = new Set(prev);
      for (const c of group.items) {
        if (on) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  const checkboxClass =
    "flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-50 has-[:checked]:border-brand-green-300 has-[:checked]:bg-brand-green-50";

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="assign-teacher" className="gf-label">
            Teacher <span className="text-red-500">*</span>
          </label>
          <select id="assign-teacher" className="gf-select" name="teacher_id" defaultValue="" required>
            <option value="">Select teacher</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="gf-label">What do they teach?</legend>
          <div className="grid gap-2">
            <label className={cn(checkboxClass, "items-start")}>
              <input
                type="radio"
                name="mode"
                value={mode.class}
                checked={assignMode === "class"}
                onChange={() => setAssignMode("class")}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold text-slate-900">Class teacher</span>
                <span className="block text-xs text-slate-500">
                  The whole class: its students, attendance, and every subject the class takes.
                </span>
              </span>
            </label>
            <label className={cn(checkboxClass, "items-start")}>
              <input
                type="radio"
                name="mode"
                value={mode.subjects}
                checked={assignMode === "subjects"}
                onChange={() => setAssignMode("subjects")}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold text-slate-900">Subject teacher</span>
                <span className="block text-xs text-slate-500">
                  Only the subjects you tick, in the classes you tick (results and CBT questions for those subjects).
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="gf-label !mb-0">
            Classes <span className="text-red-500">*</span>
            <span className="ml-2 text-xs font-normal text-slate-500">{classIds.size} selected</span>
          </div>
          <div className="flex gap-3 text-xs font-semibold">
            <button type="button" className="gf-link" onClick={() => setClassIds(new Set(allClassIds))}>
              Select all
            </button>
            <button type="button" className="gf-link" onClick={() => setClassIds(new Set())}>
              Clear
            </button>
          </div>
        </div>
        <div className="mt-2 space-y-4">
          {classGroups.map((group) => {
            const ids = group.items.map((c) => c.id);
            const allOn = ids.length > 0 && ids.every((id) => classIds.has(id));
            return (
              <div key={group.level}>
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <input type="checkbox" className="gf-checkbox" checked={allOn} onChange={(e) => setGroup(group, e.target.checked)} />
                  All {group.level} classes
                </label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {group.items.map((c) => (
                    <label key={c.id} className={checkboxClass}>
                      <input
                        type="checkbox"
                        className="gf-checkbox"
                        name="class_id"
                        value={c.id}
                        checked={classIds.has(c.id)}
                        onChange={(e) => setClassIds((prev) => toggle(prev, c.id, e.target.checked))}
                      />
                      <span className="min-w-0 truncate font-medium text-slate-900">{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {assignMode === "subjects" ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="gf-label !mb-0">
              Subjects <span className="text-red-500">*</span>
              <span className="ml-2 text-xs font-normal text-slate-500">{subjectIds.size} selected</span>
            </div>
            <button type="button" className="gf-link text-xs font-semibold" onClick={() => setSubjectIds(new Set())}>
              Clear
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {subjects.map((s) => (
              <label key={s.id} className={checkboxClass}>
                <input
                  type="checkbox"
                  className="gf-checkbox"
                  name="subject_id"
                  value={s.id}
                  checked={subjectIds.has(s.id)}
                  onChange={(e) => setSubjectIds((prev) => toggle(prev, s.id, e.target.checked))}
                />
                <span className="min-w-0 truncate font-medium text-slate-900">{s.label}</span>
              </label>
            ))}
          </div>
          <p className="gf-hint">
            Every ticked subject is assigned in every ticked class. For example Year 2, 3 and 4 with IRS and Arabic gives six
            assignments.
          </p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton variant="primary" pendingText="Assigning…">
          <UserCheck className="h-4 w-4" aria-hidden="true" />
          Assign teacher
        </SubmitButton>
      </div>
    </form>
  );
}
