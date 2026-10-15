import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  BarChart3,
  CircleCheck,
  ClipboardList,
  EyeOff,
  FileSpreadsheet,
  Lock,
  Send,
  Settings2,
  Users
} from "lucide-react";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { formatLagosDate } from "@/lib/lagos-dates";
import { AttemptStatusBadge } from "../../../_components/exam-ui";
import { firstOrNull } from "@/lib/relations";
import { failWithToast, NO_DB_MESSAGE } from "../../../_components/feedback";

type AttemptRow = {
  attempt_id: string;
  session_id: string;
  student_id: string;
  admission_number: string | null;
  first_name: string;
  last_name: string;
  obtained_marks: number;
  max_marks: number;
  percent: number;
  status: string;
  locked_at: string | null;
  lock_count: number;
  started_at: string;
  submitted_at: string | null;
};

type SessionReleaseRow = {
  id: string;
  class_id: string | null;
  academic_year_id: string | null;
  academic_term_id: string | null;
  results_released_at: string | null;
  exam_tests: { subject_id: string | null } | Array<{ subject_id: string | null }> | null;
};

export default async function AdminExamSessionAttemptsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: releaseData } = await supabase
    .from("exam_test_sessions")
    .select("id, class_id, academic_year_id, academic_term_id, results_released_at, exam_tests(subject_id)")
    .eq("id", id)
    .maybeSingle();

  const release = (releaseData ?? null) as unknown as SessionReleaseRow | null;
  const subjectId = firstOrNull(release?.exam_tests)?.subject_id ?? null;
  const resultSheetParams = new URLSearchParams({ session_id: id });
  if (release?.class_id) resultSheetParams.set("class_id", release.class_id);
  if (subjectId) resultSheetParams.set("subject_id", subjectId);
  if (release?.academic_year_id) resultSheetParams.set("year_id", release.academic_year_id);
  if (release?.academic_term_id) resultSheetParams.set("term_id", release.academic_term_id);
  const resultSheetHref = `/admin/academics/results?${resultSheetParams.toString()}`;

  const { data: attemptsData } = await supabase
    .from("exam_attempt_list_v")
    .select(
      "attempt_id, session_id, student_id, admission_number, first_name, last_name, obtained_marks, max_marks, percent, status, locked_at, lock_count, started_at, submitted_at"
    )
    .eq("session_id", id)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const attempts = (attemptsData ?? []) as AttemptRow[];

  async function releaseResults(formData: FormData) {
    "use server";

    const note = String(formData.get("note") ?? "").trim();

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(`/admin/exams/sessions/${id}/attempts`, NO_DB_MESSAGE);

    const {
      data: { user }
    } = await supabase.auth.getUser();

    await supabase
      .from("exam_test_sessions")
      .update({
        results_released_at: new Date().toISOString(),
        results_released_by: user?.id ?? null,
        results_release_note: note.length ? note : null
      })
      .eq("id", id);

    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
    revalidatePath("/portal/exams");
    revalidatePath("/portal/exams/results");
    revalidatePath("/portal");
  }

  async function unreleaseResults() {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(`/admin/exams/sessions/${id}/attempts`, NO_DB_MESSAGE);

    await supabase
      .from("exam_test_sessions")
      .update({ results_released_at: null, results_released_by: null, results_release_note: null })
      .eq("id", id);

    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
    revalidatePath("/portal/exams");
  }

  async function updateMarks(formData: FormData) {
    "use server";

    const attemptId = String(formData.get("attempt_id") ?? "").trim();
    const obtained = Number(String(formData.get("obtained_marks") ?? "0").trim() || "0");
    const max = Number(String(formData.get("max_marks") ?? "0").trim() || "0");

    if (!attemptId) failWithToast(`/admin/exams/sessions/${id}/attempts`, "Attempt not found.");
    if (!Number.isFinite(obtained) || obtained < 0) failWithToast(`/admin/exams/sessions/${id}/attempts`, "Obtained marks must be 0 or more.");
    if (!Number.isFinite(max) || max < 0) failWithToast(`/admin/exams/sessions/${id}/attempts`, "Max marks must be 0 or more.");

    const percent = max > 0 ? (obtained / max) * 100 : 0;

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(`/admin/exams/sessions/${id}/attempts`, NO_DB_MESSAGE);

    await supabase
      .from("exam_attempts")
      .update({ obtained_marks: obtained, max_marks: max, percent, status: "graded", graded_at: new Date().toISOString() })
      .eq("id", attemptId);

    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
  }

  const submittedCount = attempts.filter((a) => !!a.submitted_at).length;
  const lockedCount = attempts.filter((a) => !!a.locked_at).length;
  const averagePercent = attempts.length
    ? attempts.reduce((sum, a) => sum + Number(a.percent ?? 0), 0) / attempts.length
    : null;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/exams/sessions", label: "Back to sessions" }}
        eyebrow="Exams"
        title="Session attempts"
        description="Review who attempted and edit marks if needed."
        actions={
          <Link className={buttonClasses({ variant: "secondary" })} href={`/admin/exams/sessions/${id}`}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Session settings
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attempts" value={attempts.length} hint="Students who started" icon={Users} tone="blue" />
        <StatCard label="Submitted" value={submittedCount} hint="Finished and handed in" icon={CircleCheck} tone="green" />
        <StatCard label="Locked" value={lockedCount} hint="Need a conductor to unlock" icon={Lock} tone="rose" />
        <StatCard
          label="Average score"
          value={averagePercent === null ? "—" : `${averagePercent.toFixed(1)}%`}
          hint="Across all attempts"
          icon={BarChart3}
          tone="violet"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Result release"
            description="Students see their CBT score, correct answers and explanations under Exam Results only after you release."
            action={
              release?.results_released_at ? (
                <Badge tone="green" dot>
                  Released
                </Badge>
              ) : (
                <Badge tone="gold" dot>
                  Not released
                </Badge>
              )
            }
          />
          <CardBody>
            {release?.results_released_at ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                  Status: Released{" "}
                  <span className="font-semibold text-slate-900" title={release.results_released_at}>
                    ({formatLagosDate(release.results_released_at)})
                  </span>
                </p>
                <form action={unreleaseResults}>
                  <SubmitButton variant="secondary" pendingText="Unreleasing…" showSpinner={false}>
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                    Unrelease
                  </SubmitButton>
                </form>
              </div>
            ) : (
              <form action={releaseResults} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="Release note" htmlFor="release-note" className="flex-1">
                  <input id="release-note" className="gf-input" name="note" placeholder="(optional release note)" />
                </Field>
                <SubmitButton variant="primary" pendingText="Releasing…">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Release results
                </SubmitButton>
              </form>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Add to term result"
            description="Copy these objective scores into the class result sheet, then add 1st CA, 2nd CA and theory before publishing the term result."
          />
          <CardBody className="space-y-4">
            {!release?.class_id || !subjectId || !release?.academic_term_id ? (
              <Alert tone="warning">
                Tip: set the class and term on this session (and a subject on its test) so the sheet opens pre-filled.
              </Alert>
            ) : null}
            <Link className={buttonClasses({ variant: "primary" })} href={resultSheetHref}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Open result sheet
            </Link>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Attempts" description={`${attempts.length} student${attempts.length === 1 ? "" : "s"}`} />
        {attempts.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[880px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Adm no</th>
                  <th>Obtained</th>
                  <th>Max</th>
                  <th>%</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => {
                  const formId = `marks-${a.attempt_id}`;
                  return (
                    <tr key={a.attempt_id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={`${a.first_name} ${a.last_name}`} size="sm" />
                          <span className="font-semibold text-slate-900">
                            {a.first_name} {a.last_name}
                          </span>
                        </div>
                      </td>
                      <td className="text-slate-600">{a.admission_number ?? "—"}</td>
                      <td>
                        <input
                          form={formId}
                          aria-label={`Obtained marks for ${a.first_name} ${a.last_name}`}
                          className="gf-input w-24 py-2"
                          name="obtained_marks"
                          type="number"
                          step="0.01"
                          min={0}
                          defaultValue={String(a.obtained_marks ?? 0)}
                        />
                      </td>
                      <td>
                        <input
                          form={formId}
                          aria-label={`Max marks for ${a.first_name} ${a.last_name}`}
                          className="gf-input w-24 py-2"
                          name="max_marks"
                          type="number"
                          step="0.01"
                          min={0}
                          defaultValue={String(a.max_marks ?? 0)}
                        />
                      </td>
                      <td className="font-semibold tabular-nums text-slate-900">{Number(a.percent ?? 0).toFixed(2)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AttemptStatusBadge status={a.status} />
                          {a.locked_at ? (
                            <Badge tone="red">
                              <Lock className="h-3 w-3" aria-hidden="true" />
                              locked({a.lock_count ?? 0})
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            className={buttonClasses({ variant: "ghost", size: "sm" })}
                            href={`/admin/exams/sessions/${id}/attempts/${a.attempt_id}`}
                          >
                            Mark
                          </Link>
                          <form id={formId} action={updateMarks}>
                            <input type="hidden" name="attempt_id" value={a.attempt_id} />
                            <SubmitButton variant="primary" size="sm" pendingText="Saving…">
                              Save
                            </SubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={ClipboardList} title="No attempts yet." description="Attempts appear here once students start the exam." />
        )}
      </Card>
    </div>
  );
}
