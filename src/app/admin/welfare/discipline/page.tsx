import Link from "next/link";
import { CalendarDays, Gavel, ListChecks, Plus, ShieldAlert } from "lucide-react";
import { PolicyExcerpt } from "@/components/policies/policy-view";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { fetchAllRows } from "@/lib/fetch-all";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { formatLagosDate } from "@/lib/lagos-dates";
import { LEARN } from "@/lib/learn-guides";
import {
  COMMITTEE_OUTCOMES,
  CORRECTIONS,
  WITHDRAW_REASONS,
  disciplineError,
  ordinal,
  stepFor,
  type CorrectionCode,
  type DisciplineRule
} from "@/lib/discipline";
import { BackToScoreSheet, SeverityBadge, scoreSheetBack } from "../_ui";
import { CaseForm } from "./case-form";
import { committeeDecisionAction, recordCaseAction, saveStatementAction, withdrawRecordAction } from "./actions";

// Discipline cases and the ladder (school policy "When a rule is broken"). Staff record a case against a rule; the
// database counts which time it is for that pupil and rule (never reset) and allows only the policy's corrections.
// From the 4th time, an admin records the disciplinary committee's decision.

type StudentRow = { id: string; first_name: string; last_name: string; class_id: string | null };

type CaseRow = {
  id: string;
  student_id: string;
  category: string | null;
  description: string;
  severity: number;
  occurred_at: string;
  created_at: string;
  rule_id: string | null;
  occurrence: number | null;
  step: number | null;
  correction: CorrectionCode | null;
  statement: string | null;
  committee_outcome: keyof typeof COMMITTEE_OUTCOMES | null;
  committee_days: number | null;
  committee_note: string | null;
  pupil_explanation: string | null;
  parent_meeting_on: string | null;
  committee_decided_at: string | null;
  reported_by: string | null;
  reported_by_name: string | null;
};

const CASE_COLUMNS =
  "id, student_id, category, description, severity, occurred_at, created_at, rule_id, occurrence, step, correction, statement, committee_outcome, committee_days, committee_note, pupil_explanation, parent_meeting_on, committee_decided_at, reported_by, reported_by_name";

function lagosToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}
const day = (d: string) => formatLagosDate(d.length === 10 ? `${d}T12:00:00Z` : d);

function pageUrl(p: { class_id?: string; date?: string; back?: string | null; student_id?: string }) {
  const q = new URLSearchParams();
  if (p.class_id) q.set("class_id", p.class_id);
  if (p.date) q.set("date", p.date);
  if (p.back) q.set("back", p.back);
  if (p.student_id) q.set("student_id", p.student_id);
  const s = q.toString();
  return `/admin/welfare/discipline${s ? `?${s}` : ""}`;
}

export default async function AdminWelfareDisciplinePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const one = (v: unknown) => (typeof v === "string" ? v : "");
  // Opened from the welfare score sheet: this class, a day in that week, and the way back.
  const classFilter = one(sp.class_id);
  const dayParam = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)) ? one(sp.date) : "";
  const back = scoreSheetBack(sp.back);
  const pupilFilter = one(sp.student_id);
  const here = pageUrl({ class_id: classFilter, date: dayParam, back, student_id: pupilFilter });
  const today = lagosToday();

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const [students, rulesRes, recentRes, waitingRes, countRows, pupilRes] = await Promise.all([
    fetchAllRows<StudentRow>(() =>
      supabase.from("students").select("id, first_name, last_name, class_id").order("last_name").order("first_name").order("id")
    ),
    supabase.from("discipline_rules").select("id, name, description, ladder, active, position").order("position").order("name"),
    (() => {
      let qy = supabase.from("welfare_discipline_records").select(CASE_COLUMNS).order("occurred_at", { ascending: false }).limit(200);
      if (pupilFilter) qy = qy.eq("student_id", pupilFilter);
      return qy;
    })(),
    supabase.from("welfare_discipline_records").select(CASE_COLUMNS).eq("step", 4).is("committee_decided_at", null).order("occurred_at"),
    fetchAllRows<{ student_id: string; rule_id: string }>(() =>
      supabase.from("welfare_discipline_records").select("student_id, rule_id").not("rule_id", "is", null).order("id")
    ).catch(() => [] as Array<{ student_id: string; rule_id: string }>),
    pupilFilter ? supabase.from("students").select("id, first_name, last_name").eq("id", pupilFilter).maybeSingle() : Promise.resolve({ data: null })
  ]);

  const setupError = rulesRes.error ?? recentRes.error;
  const rules = (rulesRes.data ?? []) as DisciplineRule[];
  const recent = (recentRes.data ?? []) as unknown as CaseRow[];
  const waiting = (waitingRes.data ?? []) as unknown as CaseRow[];
  const studentById = new Map(students.map((s) => [s.id, s]));
  const name = (id: string) => {
    const s = studentById.get(id);
    return s ? `${s.first_name} ${s.last_name}` : "Pupil";
  };
  const shown = classFilter ? recent.filter((r) => studentById.get(r.student_id)?.class_id === classFilter) : recent;
  const pickable = classFilter ? students.filter((s) => s.class_id === classFilter) : students;

  const counts: Record<string, number> = {};
  for (const r of countRows) counts[`${r.student_id}:${r.rule_id}`] = (counts[`${r.student_id}:${r.rule_id}`] ?? 0) + 1;

  const monthCount = recent.filter((r) => String(r.occurred_at).slice(0, 7) === today.slice(0, 7)).length;
  const pupil = pupilRes.data as { id: string; first_name: string; last_name: string } | null;
  const canWithdraw = (r: CaseRow) =>
    isAdmin || (r.reported_by === user?.id && new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(r.created_at)) === today);

  // The pupil's ladder: every rule they have broken, how many times, and what comes next.
  const ladder = pupil
    ? rules
        .map((r) => ({ rule: r, times: counts[`${pupil.id}:${r.id}`] ?? 0 }))
        .filter((x) => x.times > 0)
        .sort((a, b) => b.times - a.times)
    : [];

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.disciplineLadder}
        eyebrow="Welfare"
        title="Discipline"
        description="Record a case against a school rule. The app counts which time it is for that pupil and rule, and offers the correction the policy sets."
        actions={
          <>
            {isAdmin ? (
              <Link href="/admin/welfare/discipline/rules" className={buttonClasses({ variant: "secondary" })}>
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                Rules
              </Link>
            ) : null}
            <a href="#new-case" className={buttonClasses({ variant: "primary" })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Record a case
            </a>
          </>
        }
      />

      <BackToScoreSheet href={back} what="any discipline case from that week (pick the day it happened)" />
      <PolicyExcerpt policy="families" section="discipline-ladder" />

      {setupError ? (
        <Alert tone="warning" title="Discipline records couldn't be loaded">
          {disciplineError(setupError.message)}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Cases" value={recent.length} hint={pupil ? "This pupil" : "Most recent 200"} icon={ShieldAlert} tone="slate" />
        <StatCard label="This month" value={monthCount} hint="Happened this calendar month" icon={CalendarDays} tone="blue" />
        <StatCard label="Waiting for the committee" value={waiting.length} hint="4th time or more" icon={Gavel} tone={waiting.length ? "rose" : "slate"} />
      </div>

      {waiting.length ? (
        <Card id="committee" className="scroll-mt-24">
          <CardHeader
            title="Waiting for the disciplinary committee"
            description={
              isAdmin
                ? "Record what the committee decided and the day the parent is invited in. The parents are told."
                : "An admin records the committee's decision for each of these."
            }
          />
          <ul className="divide-y divide-slate-100">
            {waiting.map((r) => (
              <li key={r.id} className="space-y-3 px-5 py-4 sm:px-6">
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">{name(r.student_id)}</span>{" "}
                  <span className="text-slate-500">
                    · {r.category} · {ordinal(r.occurrence ?? 4)} time · {day(r.occurred_at)}
                  </span>
                  <p className="mt-1 text-slate-700">{r.description}</p>
                  <Link href={pageUrl({ student_id: r.student_id })} className="gf-link mt-1 inline-block">
                    See {studentById.get(r.student_id)?.first_name ?? "the pupil"}&apos;s ladder
                  </Link>
                </div>
                {isAdmin ? (
                  <details className="rounded-xl border border-slate-200">
                    <summary className="flex min-h-[44px] cursor-pointer items-center px-3.5 text-sm font-semibold text-brand-green-700">
                      Record the committee&apos;s decision
                    </summary>
                    <form action={committeeDecisionAction} className="space-y-4 border-t border-slate-200 p-3.5">
                      <input type="hidden" name="back" value={`${here}#committee`} />
                      <input type="hidden" name="record_id" value={r.id} />
                      <div>
                        <label className="gf-label" htmlFor={`said-${r.id}`}>
                          What the pupil said when the committee heard them
                        </label>
                        <textarea id={`said-${r.id}`} name="pupil_explanation" rows={2} maxLength={2000} required minLength={5} className="gf-input" />
                        <p className="gf-hint">The policy asks the committee to hear the pupil before deciding.</p>
                      </div>
                      <fieldset>
                        <legend className="gf-label">What the committee decided</legend>
                        <div className="mt-1 grid gap-2">
                          {(Object.keys(COMMITTEE_OUTCOMES) as Array<keyof typeof COMMITTEE_OUTCOMES>).map((k) => (
                            <label key={k} className="flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm has-[:checked]:border-brand-green">
                              <input type="radio" name="outcome" value={k} required className="h-4 w-4" />
                              {COMMITTEE_OUTCOMES[k]}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="gf-label" htmlFor={`days-${r.id}`}>
                            School days with the environment team
                          </label>
                          <input id={`days-${r.id}`} name="days" type="number" min={1} max={10} className="gf-input" />
                          <p className="gf-hint">1 to 10, only for time with the environment team.</p>
                        </div>
                        <div>
                          <label className="gf-label" htmlFor={`meet-${r.id}`}>
                            Day the parent is invited in
                          </label>
                          <input id={`meet-${r.id}`} name="parent_meeting_on" type="date" min={today} className="gf-input" required />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="gf-label" htmlFor={`note-${r.id}`}>
                            Note for the parents
                          </label>
                          <textarea id={`note-${r.id}`} name="note" rows={2} maxLength={2000} className="gf-input" />
                          <p className="gf-hint">Needed for another measure. For a counsellor referral, say here if the parent agreed to outside support. Parents can read it.</p>
                        </div>
                      </div>
                      <SubmitButton variant="primary" pendingText="Saving…">
                        Save the decision
                      </SubmitButton>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="A pupil's ladder" description="Every rule the pupil has broken, how many times, and what the next time would be." />
        <form method="get" action="/admin/welfare/discipline" className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-end sm:px-6">
          <div className="min-w-0 flex-1">
            <label className="gf-label" htmlFor="ladder-pupil">
              Pupil
            </label>
            <select id="ladder-pupil" name="student_id" className="gf-select" defaultValue={pupilFilter}>
              <option value="">Choose a pupil</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClasses({ variant: "secondary" })}>
            Show
          </button>
          {pupil ? (
            <Link href="/admin/welfare/discipline" className="gf-link text-sm sm:pb-2.5">
              Show everyone
            </Link>
          ) : null}
        </form>
        {pupil ? (
          ladder.length ? (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {ladder.map(({ rule, times }) => {
                const next = stepFor(times, rule.ladder);
                return (
                  <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm sm:px-6">
                    <span>
                      <span className="font-semibold text-slate-900">{rule.name}</span>{" "}
                      <span className="text-slate-500">
                        · {times} {times === 1 ? "time" : "times"}
                      </span>
                    </span>
                    <Badge tone={next >= 4 ? "red" : next === 3 ? "gold" : "slate"}>
                      Next time: {next >= 4 ? "committee" : `step ${next}`}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600 sm:px-6">
              {pupil.first_name} has no cases against a rule. Cases recorded before 23 November 2026 have no rule and don&apos;t count.
            </p>
          )
        ) : null}
      </Card>

      <Card>
        <CardHeader title={pupil ? `${pupil.first_name} ${pupil.last_name}: cases` : "Recent cases"} description={classFilter ? "This class, newest first." : "Newest first."} />
        {shown.length ? (
          <ul className="divide-y divide-slate-100">
            {shown.map((r) => (
              <li key={r.id} className="space-y-2 px-5 py-4 text-sm sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={pageUrl({ student_id: r.student_id })} className="font-semibold text-slate-900 hover:underline">
                      {name(r.student_id)}
                    </Link>{" "}
                    <span className="text-slate-500">
                      · {r.category ?? "No rule"}
                      {r.occurrence ? ` · ${ordinal(r.occurrence)} time` : ""} · {day(r.occurred_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.step === 4 ? (
                      <Badge tone={r.committee_decided_at ? "slate" : "red"}>{r.committee_decided_at ? "Committee decided" : "For the committee"}</Badge>
                    ) : null}
                    <SeverityBadge severity={r.severity} />
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-slate-700">{r.description}</p>
                {r.correction ? <p className="text-slate-600">Correction: {CORRECTIONS[r.correction] ?? r.correction}</p> : null}
                {r.committee_outcome ? (
                  <p className="text-slate-600">
                    Committee: {COMMITTEE_OUTCOMES[r.committee_outcome]}
                    {r.committee_days ? `, ${r.committee_days} days` : ""}. Parent invited {r.parent_meeting_on ? day(r.parent_meeting_on) : ""}.
                    {r.committee_note ? ` ${r.committee_note}` : ""}
                  </p>
                ) : null}
                {r.pupil_explanation ? <p className="text-slate-600">The pupil said: {r.pupil_explanation}</p> : null}
                {!r.rule_id ? <p className="text-slate-500">Recorded before the ladder: doesn&apos;t count towards it.</p> : null}
                <p className="text-xs text-slate-500">Recorded by {r.reported_by_name ?? "staff"}</p>

                {(r.step ?? 0) >= 3 ? (
                  <details className="rounded-xl border border-slate-200" open={!r.statement && r.step === 3}>
                    <summary className="flex min-h-[44px] cursor-pointer items-center px-3.5 font-semibold text-slate-800">
                      {r.statement ? "Written statement" : "Add the written statement"}
                    </summary>
                    <form action={saveStatementAction} className="space-y-3 border-t border-slate-200 p-3.5">
                      <input type="hidden" name="back" value={here} />
                      <input type="hidden" name="record_id" value={r.id} />
                      <label className="sr-only" htmlFor={`st-${r.id}`}>
                        Written statement
                      </label>
                      <textarea
                        id={`st-${r.id}`}
                        name="statement"
                        rows={3}
                        className="gf-input"
                        defaultValue={r.statement ?? ""}
                        required
                        minLength={10}
                        maxLength={4000}
                        placeholder="Why it happened, and how the pupil will change"
                      />
                      <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                        Save statement
                      </SubmitButton>
                    </form>
                  </details>
                ) : null}

                {canWithdraw(r) ? (
                  <details className="rounded-xl">
                    <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-xs font-semibold text-red-700">Withdraw this record</summary>
                    <form action={withdrawRecordAction} className="mt-1 space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-3.5">
                      <input type="hidden" name="back" value={here} />
                      <input type="hidden" name="record_id" value={r.id} />
                      <p className="text-slate-700">It stops counting on the ladder and the welfare score sheet. Admins keep a copy.</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="gf-label" htmlFor={`wr-${r.id}`}>
                            Why
                          </label>
                          <select id={`wr-${r.id}`} name="reason" className="gf-select" required defaultValue="">
                            <option value="" disabled>
                              Choose a reason
                            </option>
                            {(Object.keys(WITHDRAW_REASONS) as Array<keyof typeof WITHDRAW_REASONS>).map((k) => (
                              <option key={k} value={k}>
                                {WITHDRAW_REASONS[k]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="gf-label" htmlFor={`wn-${r.id}`}>
                            Note
                          </label>
                          <input id={`wn-${r.id}`} name="note" className="gf-input" maxLength={500} />
                        </div>
                      </div>
                      <SubmitButton variant="danger" size="sm" pendingText="Withdrawing…">
                        Withdraw record
                      </SubmitButton>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={ShieldAlert} title="No discipline cases" description={pupil ? "Nothing recorded for this pupil." : "Cases you record below appear here."} />
        )}
      </Card>

      <Card id="new-case" className="scroll-mt-24">
        <CardHeader
          title="Record a case"
          description={
            rules.some((r) => r.active)
              ? "Pick the pupil and the rule first: the form then shows which time it is and the corrections the policy allows."
              : undefined
          }
        />
        <div className="px-5 pb-5 sm:px-6">
          {rules.some((r) => r.active) ? (
            <CaseForm
              action={recordCaseAction}
              pupils={pickable.map((s) => ({ id: s.id, name: `${s.first_name} ${s.last_name}` }))}
              rules={rules.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, description: r.description, ladder: r.ladder }))}
              counts={counts}
              today={today}
              defaultDay={dayParam || today}
              defaultStudent={pupilFilter && studentById.has(pupilFilter) ? pupilFilter : ""}
              back={here}
            />
          ) : (
            <Alert tone="warning" title="No rules to choose from">
              {setupError ? "Run the discipline ladder database update first." : "An admin needs to add the school rules under Rules."}
            </Alert>
          )}
        </div>
      </Card>

    </div>
  );
}
