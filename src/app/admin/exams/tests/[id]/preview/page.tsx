import Link from "next/link";
import { canManageTest, getTeacherAccess } from "@/lib/teacher-access";
import { redirect } from "next/navigation";
import { Clock, ListChecks } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QuestionImage } from "@/components/question-image";
import { buttonClasses } from "@/components/ui/button";

type TestRow = {
  id: string;
  name: string;
  duration_minutes: number;
  subject_id: string | null;
  created_by: string | null;
};

type QuestionRow = {
  id: string;
  question_type: string;
  prompt: string;
  marks: number;
  options: unknown | null;
  active: boolean;
  image_url?: string | null;
};

type McqOption = { key: string; label: string };

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

function questionTypeLabel(t: string) {
  switch (t) {
    case "mcq_single":
      return "Multiple choice (single answer)";
    case "mcq_multi":
      return "Multiple choice (multiple answers)";
    case "true_false":
      return "True / False";
    case "fill_blank":
      return "Fill in the blank";
    case "short_answer":
      return "Short answer";
    case "essay":
      return "Essay";
    default:
      return t;
  }
}

export default async function AdminExamTestPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: testData }, { data: questionsData }] = await Promise.all([
    supabase.from("exam_tests").select("id, name, duration_minutes, subject_id, created_by").eq("id", id).maybeSingle(),
    supabase
      .from("exam_questions")
      // "*" so the preview still loads before the image_url column migration has been run.
      .select("*")
      .eq("test_id", id)
      .order("created_at", { ascending: true })
      .limit(200)
  ]);

  const test = (testData ?? null) as TestRow | null;
  if (!test) return null;
  if (!canManageTest(await getTeacherAccess(supabase), test)) redirect("/admin/exams/tests");

  const questions = (questionsData ?? []) as QuestionRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: `/admin/exams/tests/${id}`, label: "Back to editor" }}
        eyebrow="Exams"
        title={`Preview: ${test.name}`}
        description="This is a read-only preview of how questions will appear to students."
        actions={
          <>
            <Badge tone="blue">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {test.duration_minutes} minutes
            </Badge>
            <Link className={buttonClasses({ variant: "secondary" })} href="/admin/exams/tests">
              Back to tests
            </Link>
          </>
        }
      />

      <Card>
        <CardHeader title="Questions" description={`Showing ${questions.length} question(s).`} />

        {questions.length ? (
          <CardBody className="space-y-4">
            {questions.map((q, idx) => {
              const isMcq = q.question_type === "mcq_single" || q.question_type === "mcq_multi";
              const mcqOptions = isMcq ? parseMcqOptions(q.options) : [];

              return (
                <div key={q.id} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg bg-brand-green-50 px-2 text-xs font-bold text-brand-green-700">
                      Q{idx + 1}
                    </span>
                    <Badge tone="blue">{questionTypeLabel(q.question_type)}</Badge>
                    <Badge tone="slate">{q.marks} mark(s)</Badge>
                    {q.active ? null : <Badge tone="red">inactive</Badge>}
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm font-semibold text-slate-900">{q.prompt}</div>
                  <QuestionImage src={q.image_url} />

                  <div className="mt-4">
                    {q.question_type === "true_false" ? (
                      <select className="gf-select" disabled defaultValue="" aria-label="Answer">
                        <option value="">Select</option>
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : q.question_type === "fill_blank" ? (
                      <input className="gf-input" disabled placeholder="Type your answer" aria-label="Answer" />
                    ) : isMcq ? (
                      mcqOptions.length ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {q.question_type === "mcq_multi" ? (
                            <p className="text-xs font-medium text-slate-500 sm:col-span-2">Select all that apply.</p>
                          ) : null}
                          {mcqOptions.map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              disabled
                              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800"
                            >
                              <span
                                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center bg-slate-100 text-xs font-semibold text-slate-600 ${
                                  q.question_type === "mcq_multi" ? "rounded-md border border-slate-300" : "rounded-full"
                                }`}
                              >
                                {opt.key}
                              </span>
                              <span className="whitespace-pre-wrap">{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">No options set yet.</div>
                      )
                    ) : (
                      <textarea className="gf-input" rows={4} disabled placeholder="Type your answer" aria-label="Answer" />
                    )}
                  </div>
                </div>
              );
            })}
          </CardBody>
        ) : (
          <EmptyState icon={ListChecks} title="No questions yet." description="Add questions in the editor to see them here." />
        )}
      </Card>
    </div>
  );
}
