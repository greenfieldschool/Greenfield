import Link from "next/link";
import { revalidatePath } from "next/cache";
import { HeartHandshake, Save, Settings2 } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherAccess } from "@/lib/teacher-access";
import { buildClassReport } from "@/lib/term-report";
import { ratingLabels, welfareSources } from "@/lib/welfare";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { canManageClassReports, ClassTermPicker, loadReportPicker, reportsBack, reportsUrl } from "../../academics/reports/_shared";

const PATH = "/admin/welfare/scores";
const sourceLabel = Object.fromEntries(welfareSources.map((s) => [s.value, s.label])) as Record<string, string>;

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

// Saves only the ratings that changed since the sheet was opened.
async function saveRatings(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const termId = String(formData.get("term_id") ?? "").trim();
  const params = { class_id: classId, term_id: termId };
  const supabase = getSupabaseServerClient();
  if (!supabase || !classId || !termId) reportsBack(PATH, params, "Choose a class and term first", "error");

  const access = await getTeacherAccess(supabase);
  if (!canManageClassReports(access, classId)) reportsBack(PATH, params, "Only the class teacher or an admin can rate pupils", "error");

  const { data: term } = await supabase.from("academic_terms").select("academic_year_id").eq("id", termId).maybeSingle();
  const yearId = (term as { academic_year_id: string } | null)?.academic_year_id ?? null;
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const upserts: Array<Record<string, unknown>> = [];
  const deletes: Array<{ student_id: string; criterion_id: string }> = [];
  for (const [key, value] of Array.from(formData.entries())) {
    if (!key.startsWith("rating:")) continue;
    const [, criterionId, studentId] = key.split(":");
    const raw = String(value).trim();
    if (raw === String(formData.get(`orig:${criterionId}:${studentId}`) ?? "").trim()) continue;
    if (!raw) {
      deletes.push({ student_id: studentId, criterion_id: criterionId });
      continue;
    }
    const rating = Number(raw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    upserts.push({
      student_id: studentId,
      criterion_id: criterionId,
      academic_term_id: termId,
      academic_year_id: yearId,
      class_id: classId,
      rating,
      rated_by: user?.id ?? null,
      updated_at: new Date().toISOString()
    });
  }

  if (upserts.length) {
    const { error } = await supabase.from("welfare_ratings").upsert(upserts, { onConflict: "student_id,academic_term_id,criterion_id" });
    if (error) reportsBack(PATH, params, error.message, "error");
  }
  for (const d of deletes) {
    const { error } = await supabase
      .from("welfare_ratings")
      .delete()
      .eq("student_id", d.student_id)
      .eq("criterion_id", d.criterion_id)
      .eq("academic_term_id", termId);
    if (error) reportsBack(PATH, params, error.message, "error");
  }

  revalidatePath(PATH);
  revalidatePath("/admin/academics/reports");
  revalidatePath("/portal/academics");
  const changed = upserts.length + deletes.length;
  reportsBack(PATH, params, changed ? `Saved ${changed} rating(s)` : "Nothing had changed");
}

export default async function WelfareScoresPage({
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

  const criteria = report?.welfareCriteria ?? [];
  const ratingCriteria = criteria.filter((c) => c.source === "rating");
  const autoCriteria = criteria.filter((c) => c.source !== "rating");
  const totalMax = criteria.reduce((a, c) => a + Number(c.max_points), 0);
  const rated = report?.completeness.ratingsComplete ?? 0;
  const n = report?.students.length ?? 0;
  const locked = Boolean(report?.publication);

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Welfare"
        title="Welfare scores"
        description="Welfare is scored out of 100 for every pupil each term. Some criteria come from the records the school keeps (attendance, lateness, uniform checks, discipline); the class teacher rates the rest from 1 to 5 here."
        actions={
          <ButtonLink href="/admin/welfare/criteria" variant="secondary" size="sm">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Welfare criteria
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader title="Choose a class and term" />
        <CardBody>
          <ClassTermPicker action={PATH} classes={picker.classes} terms={picker.terms} classId={classId} termId={termId} />
          {access.isTeacher && !picker.classes.length ? (
            <Alert tone="warning" className="mt-4">
              Welfare scores are given by class teachers. You are not the class teacher of any class.
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      {!classId || !termId ? (
        <Card>
          <EmptyState icon={HeartHandshake} title="No class open" description="Choose a class and term to score welfare." />
        </Card>
      ) : !allowed ? (
        <Alert tone="danger">Only the class teacher of this class or an admin can score its welfare.</Alert>
      ) : !report ? (
        <Alert tone="danger">That class or term could not be found.</Alert>
      ) : !criteria.length ? (
        <Alert tone="warning">
          No welfare criteria are set for {report.cls.level}. An admin can add them under{" "}
          <Link className="gf-link" href="/admin/welfare/criteria">
            Welfare criteria
          </Link>
          .
        </Alert>
      ) : (
        <form action={saveRatings}>
          {locked ? (
            <Alert tone="info" className="mb-4">
              The report cards for this class and term are published, so welfare ratings are locked. An admin can unpublish them
              (giving a reason) on the Report cards page if a correction is needed.
            </Alert>
          ) : null}
          <input type="hidden" name="class_id" value={classId} />
          <input type="hidden" name="term_id" value={termId} />
          <Card>
            <CardHeader
              title={`${report.cls.name} · ${report.term.name}`}
              description={
                <>
                  {rated} of {n} pupils fully rated. Worked out from records:{" "}
                  {autoCriteria.map((c) => `${c.name} (${Number(c.max_points)})`).join(", ") || "none"}. Rated 1–5:{" "}
                  {ratingCriteria.map((c) => `${c.name} (${Number(c.max_points)})`).join(", ") || "none"}. Total {totalMax}.
                </>
              }
              action={
                <Badge tone={rated === n && n ? "green" : rated ? "gold" : "slate"} dot>
                  {rated}/{n} rated
                </Badge>
              }
            />
            {n ? (
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-30 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 sm:pl-6">
                        Pupil
                      </th>
                      {criteria.map((c) => (
                        <th
                          key={c.id}
                          title={c.description ?? undefined}
                          className={cn(
                            "sticky top-0 z-20 border-b border-slate-200 px-2 py-2.5 text-center text-xs font-semibold text-slate-600",
                            c.source === "rating" ? "bg-slate-50" : "bg-sky-50"
                          )}
                        >
                          <div className="max-w-[7rem] leading-tight">{c.name}</div>
                          <div className="font-normal text-slate-400">
                            {c.source === "rating" ? "1–5" : sourceLabel[c.source]} · /{Number(c.max_points)}
                          </div>
                        </th>
                      ))}
                      <th className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-right text-xs font-semibold text-slate-600 sm:pr-6">
                        Welfare
                        <div className="font-normal text-slate-400">out of 100</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.students.map((r, rowIndex) => (
                      <tr key={r.student.id} className="group">
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 z-10 border-b border-slate-100 px-4 py-2 text-left font-normal sm:pl-6",
                            rowIndex % 2 ? "bg-slate-50" : "bg-white"
                          )}
                        >
                          <div className="font-semibold text-slate-900">
                            {r.student.last_name} {r.student.first_name}
                          </div>
                          {r.welfare.unrated ? (
                            <div className="text-xs text-brand-gold-800">{r.welfare.unrated} not rated</div>
                          ) : null}
                        </th>
                        {r.welfare.items.map((item) => {
                          const key = `${item.criterion.id}:${r.student.id}`;
                          return (
                            <td
                              key={item.criterion.id}
                              className={cn("border-b border-slate-100 px-2 py-2 text-center", rowIndex % 2 ? "bg-slate-50/60" : "bg-white")}
                            >
                              {item.criterion.source === "rating" ? (
                                <>
                                  <input type="hidden" name={`orig:${key}`} value={item.rating ?? ""} />
                                  <select
                                    name={`rating:${key}`}
                                    defaultValue={item.rating ?? ""}
                                    disabled={locked}
                                    aria-label={`${item.criterion.name} for ${r.student.first_name}`}
                                    className={cn(
                                      "h-9 w-[4.5rem] rounded-lg border bg-white px-1 text-center text-sm shadow-sm outline-none focus:ring-4 focus:ring-brand-green-500/15",
                                      item.rating ? "border-slate-300" : "border-brand-gold-300 bg-brand-gold-50"
                                    )}
                                  >
                                    <option value="">–</option>
                                    {[5, 4, 3, 2, 1].map((v) => (
                                      <option key={v} value={v} title={ratingLabels[v]}>
                                        {v}
                                      </option>
                                    ))}
                                  </select>
                                </>
                              ) : (
                                <span title={item.detail} className="tabular-nums text-slate-700">
                                  {item.points === null ? <span className="text-slate-400">—</span> : item.points}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td
                          className={cn(
                            "border-b border-slate-100 px-4 py-2 text-right font-semibold tabular-nums sm:pr-6",
                            rowIndex % 2 ? "bg-slate-50/60" : "bg-white"
                          )}
                        >
                          {r.welfare.percent ?? "—"}
                          {r.welfareBadge ? <div className="text-[11px] font-medium text-brand-gold-800">{r.welfareBadge}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={HeartHandshake} title="No pupils in this class" />
            )}
            {n ? (
              <div className="sticky bottom-0 z-30 flex flex-col gap-3 rounded-b-2xl border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs text-slate-600">
                  5 Excellent · 4 Very good · 3 Good · 2 Fair · 1 Poor. Blue columns come from the records — hover for details. If a record-based
                  criterion has nothing recorded yet (e.g. no uniform checks), it is left out and welfare is scored out of the rest.
                </p>
                {locked ? null : (
                  <SubmitButton pendingText="Saving…" className={buttonClasses({ variant: "primary", className: "shrink-0" })}>
                    <span className="inline-flex items-center gap-2">
                      <Save className="h-4 w-4" aria-hidden="true" />
                      Save ratings
                    </span>
                  </SubmitButton>
                )}
              </div>
            ) : null}
          </Card>
          <p className="mt-3 text-xs text-slate-500">
            Next:{" "}
            <Link className="gf-link" href={reportsUrl("/admin/academics/reports", { class_id: classId, term_id: termId })}>
              check the report cards
            </Link>
            .
          </p>
        </form>
      )}
    </div>
  );
}
