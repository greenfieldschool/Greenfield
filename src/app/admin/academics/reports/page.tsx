import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CheckCircle2, CircleAlert, EyeOff, FileText, HeartHandshake, MessageSquareText, Printer, Send } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherAccess } from "@/lib/teacher-access";
import { buildClassReport, ordinal } from "@/lib/term-report";
import UrlToast from "@/components/url-toast";
import ConfirmActionButton from "@/components/confirm-action-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { canManageClassReports, ClassTermPicker, loadReportPicker, reportsBack, reportsUrl } from "./_shared";

const PATH = "/admin/academics/reports";

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function revalidateReports() {
  revalidatePath(PATH);
  revalidatePath("/admin/academics/results");
  revalidatePath("/admin/academics/publications");
  revalidatePath("/portal/academics");
  revalidatePath("/portal");
}

async function publishReports(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const termId = String(formData.get("term_id") ?? "").trim();
  const params = { class_id: classId, term_id: termId };
  const supabase = getSupabaseServerClient();
  if (!supabase || !classId || !termId) reportsBack(PATH, params, "Choose a class and term first", "error");

  const access = await getTeacherAccess(supabase);
  if (!canManageClassReports(access, classId)) reportsBack(PATH, params, "Only the class teacher or an admin can publish", "error");

  const [{ data: cls }, { data: term }] = await Promise.all([
    supabase.from("classes").select("level").eq("id", classId).maybeSingle(),
    supabase.from("academic_terms").select("academic_year_id").eq("id", termId).maybeSingle()
  ]);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("result_publications").upsert(
    {
      scope: "term_results",
      academic_year_id: (term as { academic_year_id: string } | null)?.academic_year_id ?? null,
      academic_term_id: termId,
      level: (cls as { level: string } | null)?.level ?? null,
      class_id: classId,
      published_at: new Date().toISOString(),
      published_by: user?.id ?? null
    },
    { onConflict: "scope,academic_year_id,academic_term_id,level,class_id" }
  );
  if (error) reportsBack(PATH, params, error.message, "error");
  revalidateReports();
  reportsBack(PATH, params, "Report cards published — parents and students can now see them");
}

// Admin only, with a reason that is kept in the audit log. Unpublishing unlocks the scores for correction.
async function unpublishReports(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const termId = String(formData.get("term_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const params = { class_id: classId, term_id: termId };
  const supabase = getSupabaseServerClient();
  if (!supabase || !classId || !termId) reportsBack(PATH, params, "Choose a class and term first", "error");
  if (reason.length < 5) reportsBack(PATH, params, "Give a reason for unpublishing (it is kept in the audit log)", "error");

  const { error } = await supabase.rpc("unpublish_term_results", { p_class: classId, p_term: termId, p_reason: reason });
  if (error) reportsBack(PATH, params, error.message, "error");
  revalidateReports();
  reportsBack(PATH, params, "Report cards unpublished. Submitted sheets stay locked until an admin unlocks them.");
}

function Check({ ok, label, detail, href, action }: { ok: boolean; label: string; detail: string; href?: string; action?: string }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3 sm:px-6">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-green-600" aria-hidden="true" />
      ) : (
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold-600" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-sm text-slate-600">{detail}</div>
      </div>
      {href ? (
        <Link href={href} className="shrink-0 text-sm font-semibold text-brand-green-700 hover:underline">
          {action ?? "Open"}
        </Link>
      ) : null}
    </li>
  );
}

export default async function AdminReportCardsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const access = await getTeacherAccess(supabase);
  const picker = await loadReportPicker(supabase, access);
  const classId = str(sp.class_id);
  const termId = str(sp.term_id) || (classId ? picker.activeTermId : "");
  const allowed = classId ? canManageClassReports(access, classId) : true;

  const report = classId && termId && allowed ? await buildClassReport(supabase, classId, termId) : null;
  const { data: me } = access.userId
    ? await supabase.from("profiles").select("role").eq("id", access.userId).maybeSingle()
    : { data: null };
  const isAdmin = ["admin", "super_admin"].includes((me as { role?: string } | null)?.role ?? "");
  const n = report?.students.length ?? 0;
  const c = report?.completeness;
  const ratingCriteria = report?.welfareCriteria.filter((x) => x.source === "rating").length ?? 0;
  const params = { class_id: classId, term_id: termId };

  const missing: string[] = [];
  if (report && c) {
    const incompleteSubjects = report.subjects.filter((s) => !s.columns.length || s.completeCount < n);
    if (incompleteSubjects.length) missing.push(`${incompleteSubjects.length} subject(s) not fully scored`);
    const unsubmitted = report.subjects.filter((s) => !s.submitted).length;
    if (unsubmitted) missing.push(`${unsubmitted} subject(s) not submitted as final`);
    if (ratingCriteria && c.ratingsComplete < n) missing.push(`welfare ratings for ${n - c.ratingsComplete} pupil(s)`);
    if (!report.daysOpened) missing.push("attendance for the term");
    if (c.classCommentsDone < n) missing.push(`class teacher comments for ${n - c.classCommentsDone} pupil(s)`);
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Report cards"
        description="The termly result sheet for each pupil: every subject with its CA and exam scores, welfare, the term total (average of academic and welfare), positions and comments. Check everything is complete, then publish."
      />

      <Card>
        <CardHeader title="Choose a class and term" />
        <CardBody>
          <ClassTermPicker action={PATH} classes={picker.classes} terms={picker.terms} classId={classId} termId={termId} />
          {access.isTeacher && !picker.classes.length ? (
            <Alert tone="warning" className="mt-4">
              Report cards are prepared by class teachers. You are not the class teacher of any class.
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      {!classId || !termId ? (
        <Card>
          <EmptyState icon={FileText} title="No class open" description="Choose a class and term to see its report cards." />
        </Card>
      ) : !allowed ? (
        <Alert tone="danger">Only the class teacher of this class or an admin can open its report cards.</Alert>
      ) : !report ? (
        <Alert tone="danger">That class or term could not be found.</Alert>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Checklist"
                description="Everything a report card needs. Subject teachers fill in their result sheets; the class teacher does welfare ratings, attendance and comments."
                action={
                  c?.ready ? (
                    <Badge tone="green" dot>
                      Ready
                    </Badge>
                  ) : (
                    <Badge tone="gold" dot>
                      Incomplete
                    </Badge>
                  )
                }
              />
              <ul className="divide-y divide-slate-100">
                <Check
                  ok={!!report.subjects.length && c!.subjectsComplete === report.subjects.length}
                  label={`Subject scores · ${c!.subjectsComplete} of ${report.subjects.length} subjects complete`}
                  detail={
                    report.subjects.length
                      ? "Every pupil needs a score in every column of each subject. See the subject list below."
                      : "No subjects yet. Assign subjects to this class under Class subjects."
                  }
                />
                <Check
                  ok={!!report.subjects.length && c!.subjectsSubmitted === report.subjects.length}
                  label={`Submitted as final · ${c!.subjectsSubmitted} of ${report.subjects.length} subjects`}
                  detail="Each subject teacher submits their sheet as final once the scores match the marked scripts. Submitted sheets are locked."
                />
                <Check
                  ok={!ratingCriteria || c!.ratingsComplete === n}
                  label={`Welfare ratings · ${c!.ratingsComplete} of ${n} pupils rated`}
                  detail={`${ratingCriteria} criteria rated 1–5 by the class teacher.`}
                  href={reportsUrl("/admin/welfare/scores", params)}
                  action="Rate pupils"
                />
                <Check
                  ok={report.daysOpened > 0}
                  label={`Attendance · taken on ${report.daysOpened} day(s)`}
                  detail="Used for the attendance and punctuality welfare scores and printed on the report card."
                  href="/admin/welfare/attendance"
                  action="Attendance"
                />
                <Check
                  ok={c!.uniformChecks > 0}
                  label={`Uniform checks · ${c!.uniformChecks} recorded`}
                  detail="Optional. If none are recorded, the uniform criterion is left out and welfare is scored on the rest."
                  href="/admin/welfare/uniform"
                  action="Uniform"
                />
                <Check
                  ok={c!.classCommentsDone === n}
                  label={`Comments · class teacher ${c!.classCommentsDone}/${n}, head teacher ${c!.headCommentsDone}/${n}`}
                  detail="The class teacher writes a comment for every pupil; the head teacher (admin) adds theirs."
                  href={reportsUrl(`${PATH}/comments`, params)}
                  action="Write comments"
                />
              </ul>
            </Card>

            <Card className={report.publication ? "!border-brand-green-200" : "!border-brand-gold-200"}>
              <CardHeader
                title="Publish"
                action={
                  report.publication ? (
                    <Badge tone="green" dot>
                      Published
                    </Badge>
                  ) : (
                    <Badge tone="gold" dot>
                      Not published
                    </Badge>
                  )
                }
              />
              <CardBody className="space-y-4">
                <p className="text-sm text-slate-700">
                  {report.publication
                    ? `Published ${new Date(report.publication.published_at).toLocaleString()}. Parents and pupils in ${report.cls.name} can see these report cards.`
                    : "Not published. Parents and pupils cannot see these report cards yet."}
                </p>
                <form className="flex flex-wrap gap-2">
                  <input type="hidden" name="class_id" value={classId} />
                  <input type="hidden" name="term_id" value={termId} />
                  {report.publication ? (
                    isAdmin ? (
                      <div className="w-full space-y-2">
                        <label htmlFor="unpublish-reason" className="gf-label">
                          Reason for unpublishing (kept in the audit log)
                        </label>
                        <input id="unpublish-reason" name="reason" className="gf-input" minLength={5} placeholder="e.g. Parent query on Maths CA" />
                        <ConfirmActionButton
                          formAction={unpublishReports}
                          confirmMessage="Hide these report cards from parents and pupils so scores can be corrected?"
                          className={buttonClasses({ variant: "secondary" })}
                        >
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                          Unpublish
                        </ConfirmActionButton>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Published report cards are locked. Only an admin can unpublish them.</p>
                    )
                  ) : (
                    <ConfirmActionButton
                      formAction={publishReports}
                      confirmMessage={
                        (missing.length
                          ? `These report cards are not complete yet: ${missing.join("; ")}.\n\nPublish anyway?`
                          : `Publish ${report.term.name} report cards for ${report.cls.name}? Parents and pupils will be able to see them.`) +
                        "\n\nPublishing locks every score and welfare rating for this class and term."
                      }
                      className={buttonClasses({ variant: missing.length ? "secondary" : "primary" })}
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                      {missing.length ? "Publish anyway" : "Publish report cards"}
                    </ConfirmActionButton>
                  )}
                </form>
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <ButtonLink href={reportsUrl(`${PATH}/print`, params)} variant="secondary" size="sm">
                    <Printer className="h-4 w-4" aria-hidden="true" />
                    Print all
                  </ButtonLink>
                  <ButtonLink href={reportsUrl(`${PATH}/comments`, params)} variant="secondary" size="sm">
                    <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                    Comments
                  </ButtonLink>
                  <ButtonLink href={reportsUrl("/admin/welfare/scores", params)} variant="secondary" size="sm">
                    <HeartHandshake className="h-4 w-4" aria-hidden="true" />
                    Welfare
                  </ButtonLink>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Subjects" description="How far each subject's result sheet has got. Click a subject to open its sheet." />
            {report.subjects.length ? (
              <div className="gf-table-wrap">
                <table className="gf-table min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Columns</th>
                      <th className="text-right">Complete</th>
                      <th>Status</th>
                      <th className="text-right">Class average</th>
                      <th className="text-right">Highest</th>
                      <th className="text-right">Lowest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.subjects.map((s) => (
                      <tr key={s.id}>
                        <td className="font-semibold text-slate-900">
                          <Link
                            className="hover:underline"
                            href={`/admin/academics/results?class_id=${classId}&subject_id=${s.id}&year_id=${report.year?.id ?? ""}&term_id=${termId}`}
                          >
                            {s.name}
                          </Link>
                        </td>
                        <td className="text-xs text-slate-600">
                          {s.columns.length ? s.columns.map((col) => `${col.label} /${col.max}`).join(" · ") : <span className="text-brand-gold-800">Sheet not set up</span>}
                        </td>
                        <td className="text-right">
                          <Badge tone={s.columns.length && s.completeCount === n ? "green" : s.startedCount ? "gold" : "slate"}>
                            {s.completeCount}/{n}
                          </Badge>
                        </td>
                        <td>
                          {s.submitted ? <Badge tone="blue">Final</Badge> : <Badge tone="gold">Draft</Badge>}
                        </td>
                        <td className="text-right tabular-nums">{s.classAverage ?? "—"}</td>
                        <td className="text-right tabular-nums">{s.highest ?? "—"}</td>
                        <td className="text-right tabular-nums">{s.lowest ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={FileText} title="No subjects" description="Assign subjects to this class under Academics → Class subjects." />
            )}
          </Card>

          <Card>
            <CardHeader title="Pupils" description="Term total = average of the academic average and the welfare score." />
            {n ? (
              <div className="gf-table-wrap">
                <table className="gf-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th>Pupil</th>
                      <th className="text-right">Academic</th>
                      <th className="text-right">Welfare</th>
                      <th className="text-right">Term total</th>
                      <th className="text-center">Grade</th>
                      <th className="text-center">Position</th>
                      <th>Status</th>
                      <th className="text-right">Report card</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.students
                      .slice()
                      .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
                      .map((r) => {
                        const subjectsDone = r.subjects.filter((s) => s.complete).length;
                        const issues = [
                          subjectsDone < r.subjects.length ? `${r.subjects.length - subjectsDone} subject(s)` : null,
                          r.welfare.unrated ? "welfare rating" : null,
                          r.comments.classTeacher?.trim() ? null : "comment"
                        ].filter(Boolean);
                        return (
                          <tr key={r.student.id}>
                            <td>
                              <div className="font-semibold text-slate-900">
                                {r.student.last_name} {r.student.first_name}
                              </div>
                              {r.student.admission_number ? <div className="text-xs text-slate-500">{r.student.admission_number}</div> : null}
                            </td>
                            <td className="text-right tabular-nums">{r.academicAverage ?? "—"}</td>
                            <td className="text-right tabular-nums">{r.welfare.percent ?? "—"}</td>
                            <td className="text-right font-semibold tabular-nums">{r.termTotal ?? "—"}</td>
                            <td className="text-center">{r.termGrade ?? "—"}</td>
                            <td className="text-center tabular-nums">{r.position ? ordinal(r.position) : "—"}</td>
                            <td>
                              {issues.length ? (
                                <span className={cn("text-xs font-medium text-brand-gold-800")}>Missing: {issues.join(", ")}</span>
                              ) : (
                                <Badge tone="green">Complete</Badge>
                              )}
                            </td>
                            <td className="text-right">
                              <Link
                                className="text-sm font-semibold text-brand-green-700 hover:underline"
                                href={reportsUrl(`${PATH}/print`, { ...params, student_id: r.student.id })}
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={FileText} title="No pupils in this class" />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
