import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PortalPageHeader, portalMessages } from "../../_components/portal-ui";

function percentTone(p: number): BadgeTone {
  if (p >= 70) return "green";
  if (p >= 50) return "gold";
  return "red";
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type AttemptRow = {
  id: string;
  session_id: string;
  submitted_at: string | null;
  obtained_marks: number;
  max_marks: number;
  percent: number;
  exam_test_sessions: Array<{
    id: string;
    results_released_at: string | null;
    exam_tests: Array<{ id: string; name: string }>;
  }>;
};

type StudentLinkRow = { student_id: string };

export default async function PortalExamResultsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  let errorMsg: string | null = null;
  let studentId: string | null = null;
  let released: AttemptRow[] = [];

  try {
    const { data: studentLink, error: linkError } = await withTimeout(
      supabase.from("student_user_links").select("student_id").eq("user_id", user.id).maybeSingle(),
      6000
    );
    if (linkError) {
      errorMsg = String(linkError.message ?? "");
    }

    studentId = (studentLink as StudentLinkRow | null)?.student_id ?? null;

    if (studentId) {
      const { data, error: attemptsError } = await withTimeout(
        supabase
          .from("exam_attempts")
          .select(
            "id, session_id, submitted_at, obtained_marks, max_marks, percent, exam_test_sessions(id, results_released_at, exam_tests(id, name))"
          )
          .eq("student_id", studentId)
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(50),
        6000
      );
      if (attemptsError && !errorMsg) {
        errorMsg = String(attemptsError.message ?? "");
      }

      const rows = (data ?? []) as unknown as AttemptRow[];
      released = rows.filter((r) => (firstOrNull(r.exam_test_sessions)?.results_released_at ?? null) !== null);
    }
  } catch (e) {
    if (!errorMsg) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        back={{ href: "/portal/exams", label: "Exams" }}
        title="Exam results"
        description="Results appear here once your teachers release them."
      />

      {errorMsg ? (
        <Alert tone="warning" title="Results temporarily unavailable">
          <span className="text-xs">{errorMsg}</span>
        </Alert>
      ) : null}

      {!studentId && !errorMsg ? <Alert tone="info">{portalMessages.noStudent}</Alert> : null}

      <Card>
        <CardHeader title="Released results" />
        {released.length ? (
          <ul className="divide-y divide-slate-100">
            {released.map((a) => {
              const session = firstOrNull(a.exam_test_sessions);
              const test = firstOrNull(session?.exam_tests);
              const pct = Number(a.percent ?? 0);
              return (
                <li key={a.id}>
                  <Link
                    href={`/portal/exams/results/${a.id}`}
                    className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6"
                  >
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                      <BarChart3 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{test?.name ?? a.session_id}</div>
                      <div className="mt-0.5 text-sm text-slate-500">
                        {Number(a.obtained_marks ?? 0).toFixed(2)} / {Number(a.max_marks ?? 0).toFixed(2)} marks
                        {a.submitted_at ? ` · ${formatLagosDate(a.submitted_at)}` : ""}
                      </div>
                    </div>
                    <Badge tone={percentTone(pct)} className="text-sm">
                      {pct.toFixed(0)}%
                    </Badge>
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
                      aria-hidden="true"
                    />
                    <span className="sr-only">View result</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No results released yet"
            description="Once your teacher marks an exam and releases the results, you'll see your score here."
          />
        )}
      </Card>
    </div>
  );
}
