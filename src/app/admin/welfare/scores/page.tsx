import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CalendarCheck, CalendarRange, HeartHandshake, Settings2, Sigma } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherAccess } from "@/lib/teacher-access";
import { buildClassReport, type ClassReport } from "@/lib/term-report";
import { resultsErrorMessage } from "@/lib/results";
import { dayMonth, isMonday, weekRange, welfareSources } from "@/lib/welfare";
import UrlToast from "@/components/url-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { canManageClassReports, ClassTermPicker, loadReportPicker, reportsBack, reportsUrl } from "../../academics/reports/_shared";
import { WeekStrip, type StripWeek } from "./week-strip";
import { WeeklyGrid, type GridCriterion, type GridRow } from "./weekly-grid";

const PATH = "/admin/welfare/scores";
const sourceLabel = Object.fromEntries(welfareSources.map((s) => [s.value, s.label])) as Record<string, string>;

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

// Saves only the ratings that changed since the week was opened.
async function saveWeek(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const termId = String(formData.get("term_id") ?? "").trim();
  const week = String(formData.get("week_start") ?? "").trim();
  const params = { class_id: classId, term_id: termId, week };
  const supabase = getSupabaseServerClient();
  if (!supabase || !classId || !termId) reportsBack(PATH, params, "Choose a class and term first", "error");
  if (!isMonday(week)) reportsBack(PATH, params, "Choose a week first", "error");

  const access = await getTeacherAccess(supabase);
  if (!canManageClassReports(access, classId)) reportsBack(PATH, params, "Only the class teacher or an admin can score welfare", "error");

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
      week_start: week,
      rating,
      rated_by: user?.id ?? null,
      updated_at: new Date().toISOString()
    });
  }

  if (upserts.length) {
    const { error } = await supabase
      .from("welfare_ratings")
      .upsert(upserts, { onConflict: "student_id,academic_term_id,criterion_id,week_start" });
    if (error) reportsBack(PATH, params, resultsErrorMessage(error.message), "error");
  }
  for (const d of deletes) {
    const { error } = await supabase
      .from("welfare_ratings")
      .delete()
      .eq("student_id", d.student_id)
      .eq("criterion_id", d.criterion_id)
      .eq("academic_term_id", termId)
      .eq("week_start", week);
    if (error) reportsBack(PATH, params, resultsErrorMessage(error.message), "error");
  }

  revalidatePath(PATH);
  revalidatePath("/admin/academics/reports");
  revalidatePath("/portal/academics");
  const changed = upserts.length + deletes.length;
  reportsBack(PATH, params, changed ? `Saved ${changed} rating${changed === 1 ? "" : "s"} for the week of ${weekRange(week)}` : "Nothing had changed");
}

const fmt = (n: number | null) => (n === null ? "—" : String(n));

function TermSummary({ report, href }: { report: ClassReport; href: (week: string) => string }) {
  const weeks = report.weeks.filter((w) => !w.future);
  const weekAverages = weeks.map((w) => {
    const values = report.students
      .map((s) => s.weeklyWelfare.weeks.find((x) => x.weekStart === w.start)?.percent ?? null)
      .filter((p): p is number => p !== null);
    return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;
  });
  const cell = (rowIndex: number) => cn("border-b border-slate-100 px-2 py-2 text-center tabular-nums", rowIndex % 2 ? "bg-slate-50" : "bg-white");

  return (
    <Card>
      <CardHeader
        title={`${report.cls.name} · ${report.term.name} · term summary`}
        description="Each week is out of 100. The term's welfare score is the average of the weeks scored, and the final score is the average of the academic average and welfare."
      />
      {!weeks.length ? (
        <EmptyState icon={CalendarRange} title="The term hasn't started yet" description="Weeks appear here once the term's first week begins." />
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: `${16 + weeks.length * 4.5 + 22}rem` }}>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 w-32 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 sm:w-48 sm:pl-6">
                  Pupil
                </th>
                {weeks.map((w) => (
                  <th key={w.start} scope="col" className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-1 py-2 text-center text-xs font-semibold text-slate-600">
                    <a className="gf-link" href={href(w.start)} title={`Open week ${w.number} (${w.range})`}>
                      Wk {w.number}
                    </a>
                    <div className="font-normal text-slate-400">{dayMonth(w.start)}</div>
                  </th>
                ))}
                <th className="sticky top-0 z-20 border-b border-l border-slate-200 bg-brand-green-50 px-3 py-2 text-center text-xs font-semibold text-brand-green-800">
                  Welfare
                  <div className="font-normal">/100</div>
                </th>
                <th className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600">
                  Academic
                  <div className="font-normal text-slate-400">/100</div>
                </th>
                <th className="sticky top-0 z-20 border-b border-slate-200 bg-brand-green-50 px-3 py-2 text-center text-xs font-semibold text-brand-green-800 sm:pr-6">
                  Final score
                  <div className="font-normal">/100</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {report.students.map((s, i) => (
                <tr key={s.student.id}>
                  <th scope="row" className={cn("sticky left-0 z-10 w-32 max-w-[8rem] border-b sm:w-48 sm:max-w-none border-slate-100 px-4 py-2 text-left font-normal sm:pl-6", i % 2 ? "bg-slate-50" : "bg-white")}>
                    <div className="truncate font-semibold text-slate-900">
                      {s.student.last_name} {s.student.first_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {s.weeklyWelfare.weeksCounted} week{s.weeklyWelfare.weeksCounted === 1 ? "" : "s"} scored
                    </div>
                  </th>
                  {weeks.map((w) => {
                    const wk = s.weeklyWelfare.weeks.find((x) => x.weekStart === w.start);
                    return (
                      <td key={w.start} className={cell(i)}>
                        {wk?.percent !== null && wk?.percent !== undefined ? (
                          <span className={cn(wk.percent < 50 && "font-semibold text-red-700", wk.needsRating && "underline decoration-brand-gold-400 decoration-dotted")}>
                            {Math.round(wk.percent)}
                          </span>
                        ) : wk?.needsRating ? (
                          <span className="text-[11px] font-medium text-brand-gold-800">to rate</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={cn(cell(i), "border-l border-slate-200 font-bold text-brand-green-800")}>{fmt(s.welfare.percent)}</td>
                  <td className={cell(i)}>{fmt(s.academicAverage)}</td>
                  <td className={cn(cell(i), "font-bold text-slate-900 sm:pr-6")}>{fmt(s.termTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="sticky bottom-0 left-0 z-30 border-t border-slate-200 bg-slate-100 px-4 py-2 text-left text-xs font-semibold text-slate-700 sm:pl-6">
                  Class average
                </th>
                {weekAverages.map((a, i) => (
                  <td key={weeks[i].start} className="sticky bottom-0 z-20 border-t border-slate-200 bg-slate-100 px-1 py-2 text-center text-xs font-semibold tabular-nums text-slate-700">
                    {a === null ? "—" : Math.round(a)}
                  </td>
                ))}
                <td colSpan={3} className="sticky bottom-0 z-20 border-t border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500 sm:pr-6">
                  Low weeks (under 50) are in red.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
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
  const view = str(sp.view) === "term" ? "term" : "week";
  const allowed = classId ? canManageClassReports(access, classId) : true;
  const report = classId && termId && allowed ? await buildClassReport(supabase, classId, termId) : null;

  const criteria = report?.welfareCriteria ?? [];
  const n = report?.students.length ?? 0;
  const locked = Boolean(report?.publication);
  const weeks = report?.weeks ?? [];
  const requested = str(sp.week);
  const selected =
    weeks.find((w) => w.start === requested && !w.future) ??
    weeks.find((w) => w.current) ??
    [...weeks].reverse().find((w) => !w.future) ??
    null;
  const url = (extra: Record<string, string | undefined>) => reportsUrl(PATH, { class_id: classId, term_id: termId, ...extra });
  const weekHref = (start: string) => url({ week: start });
  const ratingCount = criteria.filter((c) => c.source === "rating").length;

  // Week chips: how many pupils are fully scored / started in each week.
  const strip: StripWeek[] = weeks.map((w) => {
    let done = 0;
    let started = 0;
    for (const s of report?.students ?? []) {
      const wk = s.weeklyWelfare.weeks.find((x) => x.weekStart === w.start);
      if (wk?.rated) started += 1;
      if (wk?.counted && wk.toRate === 0) done += 1;
    }
    return { ...w, href: weekHref(w.start), done, started: ratingCount ? started : done, total: n };
  });

  // The selected week's grid. "Copy last week" uses each pupil's most recent earlier week with ratings.
  const selectedIndex = selected ? weeks.findIndex((w) => w.start === selected.start) : -1;
  let hasPrevious = false;
  const gridCriteria: GridCriterion[] = criteria.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    rated: c.source === "rating",
    max: Number(c.max_points),
    sourceLabel: sourceLabel[c.source] ?? c.source
  }));
  const gridRows: GridRow[] = selected
    ? (report?.students ?? []).map((s) => {
        const wk = s.weeklyWelfare.weeks.find((x) => x.weekStart === selected.start);
        const prev = selectedIndex > 0 ? s.weeklyWelfare.weeks.slice(0, selectedIndex).reverse().find((x) => x.rated > 0) ?? null : null;
        if (prev) hasPrevious = true;
        const auto: GridRow["auto"] = {};
        const ratings: GridRow["ratings"] = {};
        const previous: GridRow["previous"] = {};
        criteria.forEach((c, i) => {
          const item = wk?.items[i];
          if (c.source === "rating") {
            ratings[c.id] = item?.rating ?? null;
            previous[c.id] = prev?.items[i]?.rating ?? null;
          } else {
            auto[c.id] = { points: item?.points ?? null, detail: item?.detail ?? "", short: item?.short ?? "" };
          }
        });
        return { id: s.student.id, name: `${s.student.last_name} ${s.student.first_name}`, admission: s.student.admission_number, auto, ratings, previous };
      })
    : [];

  const scoredWeeks = strip.filter((w) => !w.future && w.started > 0).length;
  const pastWeeks = strip.filter((w) => !w.future).length;
  const welfareValues = (report?.students ?? []).map((s) => s.welfare.percent).filter((p): p is number => p !== null);
  const termAverage = welfareValues.length ? Math.round((welfareValues.reduce((a, b) => a + b, 0) / welfareValues.length) * 100) / 100 : null;
  const selectedStrip = selected ? strip[selectedIndex] : null;
  const totalMax = criteria.reduce((a, c) => a + Number(c.max_points), 0);
  const markChips = (
    <>
      {criteria.map((c) => (
        <span
          key={c.id}
          className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", c.source === "rating" ? "bg-slate-100 text-slate-700" : "bg-sky-50 text-sky-800")}
        >
          {c.name} <span className="tabular-nums font-semibold">{Number(c.max_points)}</span>
        </span>
      ))}
      <span className="text-[11px] font-semibold text-slate-700">
        = {totalMax}
        {totalMax === 100 ? "" : " (shown out of 100)"}
      </span>
    </>
  );

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Welfare"
        title="Welfare scores"
        description="Score every pupil each week out of 100. At the end of term the weekly scores are averaged into one welfare score out of 100, and the final score on the report card is the average of the academic average and welfare."
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
      ) : !report.weeklyReady ? (
        <Alert tone="warning" title="Weekly welfare scoring needs a database update">
          Ask whoever looks after the website to run <code>20261102_weekly_welfare.sql</code> in Supabase. Until then report cards keep
          using the whole-term ratings.
        </Alert>
      ) : !n ? (
        <Card>
          <EmptyState icon={HeartHandshake} title="No pupils in this class" />
        </Card>
      ) : (
        <>
          {locked ? (
            <Alert tone="info">
              The report cards for this class and term are published, so welfare scores are locked. An admin can unpublish them (giving a
              reason) on the Report cards page if a correction is needed.
            </Alert>
          ) : null}
          {report.welfareMode === "term" ? (
            <Alert tone="warning" title="This term was rated for the whole term">
              {report.legacyRatings} rating{report.legacyRatings === 1 ? " was" : "s were"} saved for the whole term before weekly scoring started,
              and the report cards use them for now. As soon as you save the first week, this term switches to weekly scores and those
              whole-term ratings stop counting.
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={selected ? `Week ${selected.number} (${selected.range})` : "This week"}
              value={selectedStrip ? `${selectedStrip.done} / ${n}` : "—"}
              hint="pupils fully scored"
              icon={CalendarCheck}
              tone={selectedStrip && selectedStrip.done === n ? "green" : "gold"}
            />
            <StatCard
              label="Weeks scored so far"
              value={`${scoredWeeks} / ${pastWeeks}`}
              hint={`${weeks.length} weeks in the term`}
              icon={CalendarRange}
              tone="blue"
              href={url({ view: "term" })}
            />
            <StatCard
              label="Class welfare this term"
              value={termAverage === null ? "—" : termAverage}
              hint="average of pupils' weekly scores, out of 100"
              icon={Sigma}
              tone="violet"
            />
          </div>

          <LinkTabs
            tabs={[
              { key: "week", label: "Score a week", href: selected ? weekHref(selected.start) : url({}) },
              { key: "term", label: "Term summary", href: url({ view: "term" }) }
            ]}
            active={view}
          />

          {view === "term" ? (
            <TermSummary report={report} href={weekHref} />
          ) : !selected ? (
            <Card>
              <EmptyState
                icon={CalendarRange}
                title={weeks.length ? "The term hasn't started yet" : "This term has no dates"}
                description={
                  weeks.length
                    ? "You can score the first week once it begins."
                    : "An admin needs to set the term's start and end dates (Finance → Fees setup → Academic years) before weeks can be scored."
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              <WeekStrip weeks={strip} selected={selected.start} />
              <Card>
                <CardHeader
                  title={`${report.cls.name} · Week ${selected.number} · ${selected.range}`}
                  description="Blue columns are worked out from this week's attendance, uniform checks and discipline records. Rate the rest from 1 (Poor) to 5 (Excellent)."
                />
                <div className="hidden flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-2.5 sm:flex sm:px-6">{markChips}</div>
                <details className="border-b border-slate-100 px-5 py-2.5 text-sm sm:hidden">
                  <summary className="cursor-pointer font-medium text-slate-700">How the {totalMax} marks are made</summary>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">{markChips}</div>
                </details>
                <WeeklyGrid
                  key={`${classId}:${termId}:${selected.start}`}
                  action={saveWeek}
                  hidden={{ class_id: classId, term_id: termId, week_start: selected.start }}
                  criteria={gridCriteria}
                  rows={gridRows}
                  locked={locked}
                  hasPrevious={hasPrevious}
                  weekLabel={`Week ${selected.number}`}
                />
              </Card>
              <p className="text-xs text-slate-500">
                A week counts towards the term once you rate a pupil for it. If nothing was recorded for a criterion that week (for example no
                uniform check), it is left out and the week is scored out of the rest.{" "}
                <Link className="gf-link" href={reportsUrl("/admin/academics/reports", { class_id: classId, term_id: termId })}>
                  Check the report cards
                </Link>
                .
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
