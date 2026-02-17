"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type QuestionRow = {
  id: string;
  question_type: string;
  prompt: string;
  marks: number;
  options?: unknown;
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

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Questions</div>
          <div className="mt-1 text-xs text-slate-600">Autosave: {saveState}</div>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {questions.map((q, idx) => {
          const val = asValueAnswer(answers[q.id]);
          const mcqOptions = q.question_type === "mcq_single" ? parseMcqOptions(q.options) : [];
          const shuffledOptions =
            mcqOptions.length > 1
              ? seededShuffle(mcqOptions, hashStringToInt(`${attemptId}:${q.id}`))
              : mcqOptions;

          return (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs font-semibold text-slate-500">
                Q{idx + 1} • {q.question_type} • {q.marks} mark(s)
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-900">{q.prompt}</div>

              <div className="mt-4">
                {q.question_type === "true_false" ? (
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    value={val?.value ?? ""}
                    onChange={(e) => setAnswer(q.id, { value: e.target.value })}
                    disabled={!!readOnly}
                  >
                    <option value="">Select</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : q.question_type === "fill_blank" ? (
                  <input
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    value={val?.value ?? ""}
                    onChange={(e) => setAnswer(q.id, { value: e.target.value })}
                    placeholder="Type your answer"
                    disabled={!!readOnly}
                  />
                ) : q.question_type === "mcq_single" ? (
                  shuffledOptions.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {shuffledOptions.map((opt) => {
                        const selected = (val?.value ?? "") === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setAnswer(q.id, { value: opt.key })}
                            disabled={!!readOnly}
                            className={
                              "rounded-xl border px-4 py-3 text-left text-sm font-semibold transition " +
                              (selected
                                ? "border-brand-green bg-brand-green/10 text-slate-900"
                                : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50")
                            }
                          >
                            <div className="text-xs font-semibold text-slate-500">{opt.key}</div>
                            <div className="mt-1 whitespace-pre-wrap">{opt.label}</div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                      value={val?.value ?? ""}
                      onChange={(e) => setAnswer(q.id, { value: e.target.value })}
                      placeholder="Enter selected option key"
                      disabled={!!readOnly}
                    />
                  )
                ) : (
                  <textarea
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    rows={4}
                    value={val?.value ?? ""}
                    onChange={(e) => setAnswer(q.id, { value: e.target.value })}
                    placeholder="Type your answer"
                    disabled={!!readOnly}
                  />
                )}

                <div className="mt-2 text-xs text-slate-500">Saved value is stored as JSON.</div>
              </div>
            </div>
          );
        })}

        {!questions.length ? <div className="text-sm text-slate-600">No questions yet.</div> : null}
      </div>
    </div>
  );
}
