"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, CloudUpload, FileQuestion } from "lucide-react";
import { cn } from "@/lib/cn";
import { QuestionImage } from "@/components/question-image";
import { marksLabel, questionTypeLabel } from "../../_components/exam-labels";

function hasValue(v: unknown) {
  const a = asValueAnswer(v);
  return typeof a?.value === "string" && a.value.trim().length > 0;
}

function OptionTile({
  marker,
  label,
  selected,
  disabled,
  onSelect
}: {
  marker: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex min-h-[56px] w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base transition",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-green-500/20",
        "disabled:cursor-default",
        selected
          ? "border-brand-green-500 bg-brand-green-50 text-slate-900 shadow-sm"
          : "border-slate-200 bg-white text-slate-800 enabled:hover:border-brand-green-200 enabled:hover:bg-brand-green-50/40"
      )}
    >
      <span
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          selected ? "bg-brand-green text-white" : "bg-slate-100 text-slate-600"
        )}
        aria-hidden="true"
      >
        {selected ? <Check className="h-4 w-4" /> : marker}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap font-medium">{label}</span>
    </button>
  );
}

type QuestionRow = {
  id: string;
  question_type: string;
  prompt: string;
  marks: number;
  options?: unknown;
  image_url?: string | null;
};

type InitialAnswer = { question_id: string; answer: unknown };

type ValueAnswer = { value?: string };

function asValueAnswer(v: unknown): ValueAnswer | null {
  if (!v || typeof v !== "object") return null;
  if (!("value" in v)) return null;
  const value = (v as { value?: unknown }).value;
  return { value: typeof value === "string" ? value : undefined };
}

type McqOption = { key: string; label: string };

function hashStringToInt(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: T[], seed: number) {
  const a = [...items];
  let s = seed;
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function parseMcqOptions(options: unknown): McqOption[] {
  if (!options) return [];

  if (Array.isArray(options)) {
    return options
      .map((o, idx) => {
        if (typeof o === "string") return { key: String(idx + 1), label: o };
        if (o && typeof o === "object") {
          const k = (o as { key?: unknown }).key;
          const l = (o as { label?: unknown }).label;
          const key = typeof k === "string" && k.length ? k : String(idx + 1);
          const label = typeof l === "string" ? l : JSON.stringify(o);
          return { key, label };
        }
        return { key: String(idx + 1), label: String(o) };
      })
      .filter((o) => o.label.length > 0);
  }

  if (typeof options === "object") {
    const maybeArr = (options as { options?: unknown }).options;
    if (Array.isArray(maybeArr)) return parseMcqOptions(maybeArr);
  }

  return [];
}

type SaveState = "idle" | "saving" | "error";

export default function ExamAnswersClient({
  attemptId,
  questions,
  initialAnswers,
  readOnly
}: {
  attemptId: string;
  questions: QuestionRow[];
  initialAnswers: InitialAnswer[];
  readOnly?: boolean;
}) {
  const initialMap = useMemo(() => {
    const m = new Map<string, unknown>();
    for (const a of initialAnswers) m.set(a.question_id, a.answer);
    return m;
  }, [initialAnswers]);

  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const obj: Record<string, unknown> = {};
    for (const q of questions) obj[q.id] = initialMap.get(q.id) ?? null;
    return obj;
  });

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const inFlightRef = useRef<Record<string, boolean>>({});

  const saveAnswer = useCallback(
    async (questionId: string, answer: unknown) => {
      if (readOnly) return;
      if (!attemptId) return;
      if (inFlightRef.current[questionId]) return;

      inFlightRef.current[questionId] = true;
      setSaveState("saving");

      try {
        const res = await fetch("/portal/exams/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId, questionId, answer })
        });

        if (!res.ok) {
          setSaveState("error");
          return;
        }

        setSaveState("idle");
      } catch {
        setSaveState("error");
      } finally {
        inFlightRef.current[questionId] = false;
      }
    },
    [attemptId, readOnly]
  );

  function setAnswer(questionId: string, answer: unknown) {
    if (readOnly) return;
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    void saveAnswer(questionId, answer);
  }

  const answeredCount = questions.filter((q) => hasValue(answers[q.id])).length;
  const total = questions.length;
  const progressPct = total ? Math.round((answeredCount / total) * 100) : 0;

  return (
    <div className="space-y-5">
      {!readOnly ? (
        <div className="sticky top-16 z-20 -mx-1 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-card backdrop-blur sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-slate-900" aria-live="polite">
              {answeredCount} of {total} answered
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium",
                saveState === "error" ? "text-red-600" : saveState === "saving" ? "text-slate-500" : "text-brand-green-700"
              )}
              role="status"
              aria-live="polite"
            >
              {saveState === "saving" ? (
                <>
                  <CloudUpload className="h-4 w-4 animate-pulse" aria-hidden="true" />
                  Saving…
                </>
              ) : saveState === "error" ? (
                <>
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  Not saved — check your connection and try again
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {answeredCount ? "Saved" : "Answers save automatically"}
                </>
              )}
            </div>
          </div>
          <div
            className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Questions answered"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={answeredCount}
          >
            <div className="h-full rounded-full bg-brand-green-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      ) : (
        <h2 className="text-base font-semibold text-slate-900">Your answers</h2>
      )}

      {questions.map((q, idx) => {
        const val = asValueAnswer(answers[q.id]);
        const mcqOptions = q.question_type === "mcq_single" ? parseMcqOptions(q.options) : [];
        const shuffledOptions =
          mcqOptions.length > 1
            ? seededShuffle(mcqOptions, hashStringToInt(`${attemptId}:${q.id}`))
            : mcqOptions;
        const answered = hasValue(answers[q.id]);
        const fieldId = `q-${q.id}`;

        return (
          <section
            key={q.id}
            aria-labelledby={`${fieldId}-prompt`}
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    answered ? "bg-brand-green text-white" : "bg-slate-100 text-slate-700"
                  )}
                >
                  {idx + 1}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {questionTypeLabel(q.question_type)} · {marksLabel(q.marks)}
                </span>
              </div>
              {answered ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-green-700">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Answered
                </span>
              ) : null}
            </div>

            <p id={`${fieldId}-prompt`} className="mt-4 whitespace-pre-wrap text-lg font-semibold leading-relaxed text-slate-900">
              {q.prompt}
            </p>
            <QuestionImage src={q.image_url} className="mt-4" />

            <div className="mt-5">
              {q.question_type === "true_false" ? (
                <div className="grid gap-3 sm:grid-cols-2" role="group" aria-labelledby={`${fieldId}-prompt`}>
                  {[
                    { value: "true", label: "True", marker: "T" },
                    { value: "false", label: "False", marker: "F" }
                  ].map((opt) => {
                    const selected = (val?.value ?? "") === opt.value;
                    return (
                      <OptionTile
                        key={opt.value}
                        marker={opt.marker}
                        label={opt.label}
                        selected={selected}
                        disabled={!!readOnly}
                        // Tapping the chosen tile again clears it, like the old blank "Select" option ({ value: "" }).
                        onSelect={() => setAnswer(q.id, { value: selected ? "" : opt.value })}
                      />
                    );
                  })}
                  {!readOnly && (val?.value ?? "") !== "" ? (
                    <button
                      type="button"
                      onClick={() => setAnswer(q.id, { value: "" })}
                      className="justify-self-start rounded-lg px-1 py-1 text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline sm:col-span-2"
                    >
                      Clear answer
                    </button>
                  ) : null}
                </div>
              ) : q.question_type === "fill_blank" ? (
                <input
                  id={fieldId}
                  aria-labelledby={`${fieldId}-prompt`}
                  className="gf-input h-12 text-base"
                  value={val?.value ?? ""}
                  onChange={(e) => setAnswer(q.id, { value: e.target.value })}
                  placeholder="Type your answer"
                  disabled={!!readOnly}
                />
              ) : q.question_type === "mcq_single" ? (
                shuffledOptions.length ? (
                  <div className="grid gap-3 sm:grid-cols-2" role="group" aria-labelledby={`${fieldId}-prompt`}>
                    {shuffledOptions.map((opt) => (
                      <OptionTile
                        key={opt.key}
                        marker={opt.key}
                        label={opt.label}
                        selected={(val?.value ?? "") === opt.key}
                        disabled={!!readOnly}
                        onSelect={() => setAnswer(q.id, { value: opt.key })}
                      />
                    ))}
                  </div>
                ) : (
                  <input
                    id={fieldId}
                    aria-labelledby={`${fieldId}-prompt`}
                    className="gf-input h-12 text-base"
                    value={val?.value ?? ""}
                    onChange={(e) => setAnswer(q.id, { value: e.target.value })}
                    placeholder="Enter the letter or number of your answer"
                    disabled={!!readOnly}
                  />
                )
              ) : (
                <textarea
                  id={fieldId}
                  aria-labelledby={`${fieldId}-prompt`}
                  className="gf-input text-base leading-relaxed"
                  rows={5}
                  value={val?.value ?? ""}
                  onChange={(e) => setAnswer(q.id, { value: e.target.value })}
                  placeholder="Type your answer"
                  disabled={!!readOnly}
                />
              )}
            </div>
          </section>
        );
      })}

      {!questions.length ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <FileQuestion className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="mt-3 text-sm font-semibold text-slate-900">No questions yet</div>
            <p className="mt-1 max-w-sm text-sm text-slate-500">Your teacher hasn&apos;t added questions to this exam.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
