import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: studentLink } = await supabase
    .from("student_user_links")
    .select("student_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const studentId = (studentLink as StudentLinkRow | null)?.student_id ?? null;
  if (!studentId) return null;

  const { data } = await supabase
    .from("exam_attempts")
    .select(
      "id, session_id, submitted_at, obtained_marks, max_marks, percent, exam_test_sessions(id, results_released_at, exam_tests(id, name))"
    )
    .eq("student_id", studentId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as AttemptRow[];

  const released = rows.filter((r) => (r.exam_test_sessions?.[0]?.results_released_at ?? null) !== null);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Exam results</h1>
        <p className="mt-2 text-sm text-slate-600">Only results released by staff are shown here.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/portal/exams">
            Back to exams
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-6">Test</div>
          <div className="col-span-2">Score</div>
          <div className="col-span-2">%</div>
          <div className="col-span-2">Action</div>
        </div>
        <div>
          {released.length ? (
            released.map((a) => {
              const session = (a.exam_test_sessions ?? [])[0] ?? null;
              const test = (session?.exam_tests ?? [])[0] ?? null;

              return (
                <div key={a.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                  <div className="col-span-6 font-semibold text-slate-900">{test?.name ?? a.session_id}</div>
                  <div className="col-span-2 text-slate-700">
                    {Number(a.obtained_marks ?? 0).toFixed(2)} / {Number(a.max_marks ?? 0).toFixed(2)}
                  </div>
                  <div className="col-span-2 text-slate-700">{Number(a.percent ?? 0).toFixed(2)}%</div>
                  <div className="col-span-2">
                    <Link
                      className="text-xs font-semibold text-brand-green hover:underline"
                      href={`/portal/exams/results/${a.id}`}
                    >
                      View
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No released results yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
