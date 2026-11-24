import { Clock, Lock, LockOpen, RotateCcw, Timer } from "lucide-react";
import type { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { LiveRefresh } from "@/components/chat/client";
import { formatLagosDateTime } from "@/lib/lagos-dates";
import {
  TIME_REASONS,
  UNLOCK_REASONS,
  clockText,
  examRoomError,
  lockReasonLabel,
  secondsLeft,
  type TimeReason,
  type UnlockReason
} from "@/lib/exam-room";
import { addTimeAction, handInAllAction, reopenAttemptAction, unlockPupilsAction } from "@/lib/exam-room-actions";

// Running the exam room. Answer first: who needs unlocking, with Unlock on the row (a reason is preselected, so it
// is one tap). Then everyone with their time left; tick pupils (or choose everyone) to add time, with a reason.
// Pupils the school handed in (automatically or with "Hand in everyone") can be let back in; a pupil's own Submit is
// final. Used on the conductor's session page and the admin Attempts page; refreshes every 10 seconds.

type Supabase = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

type ListRow = { attempt_id: string; admission_number: string | null; first_name: string; last_name: string };
type ClockRow = {
  id: string;
  status: string;
  locked_at: string | null;
  locked_reason: string | null;
  lock_count: number | null;
  submitted_at: string | null;
  used_seconds: number | null;
  clock_started_at: string | null;
  extra_seconds: number | null;
  unlocked_at: string | null;
  unlock_reason: UnlockReason | null;
};

const MINUTES = [5, 10, 15, 20, 30];
const TIME_FORM = "exam-room-add-time";

function ReasonSelect({ id, defaultValue, label }: { id: string; defaultValue: UnlockReason; label?: string }) {
  return (
    <select id={id} name="reason" className="gf-select" defaultValue={defaultValue} required aria-label={label}>
      {(Object.keys(UNLOCK_REASONS) as UnlockReason[]).map((k) => (
        <option key={k} value={k}>
          {UNLOCK_REASONS[k]}
        </option>
      ))}
    </select>
  );
}

function Hidden({ back, sessionId, attemptId }: { back: string; sessionId: string; attemptId?: string }) {
  return (
    <>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="session_id" value={sessionId} />
      {attemptId ? <input type="hidden" name="attempt_id" value={attemptId} /> : null}
    </>
  );
}

/** A tick box that belongs to the "Add time" form further down (form attribute), so rows can keep their own forms. */
function TickForTime({ attemptId, name }: { attemptId: string; name: string }) {
  return (
    <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
      <input type="checkbox" name="attempt_ids" value={attemptId} form={TIME_FORM} className="h-4 w-4" aria-label={`Add time for ${name}`} />
      Add time
    </label>
  );
}

export async function ExamRoom({ supabase, sessionId, back }: { supabase: Supabase; sessionId: string; back: string }) {
  const [{ data: list }, { data: clocks, error }, { data: info }] = await Promise.all([
    supabase
      .from("exam_attempt_list_v")
      .select("attempt_id, admission_number, first_name, last_name")
      .eq("session_id", sessionId)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase
      .from("exam_attempts")
      .select("id, status, locked_at, locked_reason, lock_count, submitted_at, used_seconds, clock_started_at, extra_seconds, unlocked_at, unlock_reason")
      .eq("session_id", sessionId),
    supabase.rpc("exam_room_info", { p_session: sessionId })
  ]);
  const duration = ((Array.isArray(info) ? info[0] : info) as { duration_minutes: number | null } | null)?.duration_minutes ?? null;
  const clockById = new Map(((clocks ?? []) as ClockRow[]).map((c) => [c.id, c]));
  const rows = ((list ?? []) as ListRow[]).map((l) => ({ ...l, c: clockById.get(l.attempt_id) ?? null }));

  // Who handed each pupil in: the latest of their own Submit, time running out, the school, or being let back in.
  const handedInIds = rows.filter((r) => r.c?.submitted_at).map((r) => r.attempt_id);
  const byWhom = new Map<string, string>();
  if (handedInIds.length) {
    const { data: ev } = await supabase
      .from("exam_malpractice_events")
      .select("attempt_id, event_type, created_at")
      .in("attempt_id", handedInIds)
      .in("event_type", ["submit", "time_up", "handed_in_by_school", "reopened"])
      .order("created_at", { ascending: true });
    for (const e of (ev ?? []) as Array<{ attempt_id: string; event_type: string }>) byWhom.set(e.attempt_id, e.event_type);
  }

  const now = Date.now();
  const locked = rows.filter((r) => r.c?.locked_at && !r.c.submitted_at);
  const writing = rows.filter((r) => r.c && !r.c.locked_at && !r.c.submitted_at);
  const handedIn = rows.filter((r) => r.c?.submitted_at);
  const others = rows.filter((r) => !(r.c?.locked_at && !r.c.submitted_at));
  const stillOpen = writing.length + locked.length;
  const name = (r: ListRow) => `${r.first_name} ${r.last_name}`;

  const timeLeft = (c: ClockRow | null) => {
    const left = c ? secondsLeft(c, duration, now) : null;
    return left === null || c?.submitted_at ? null : (
      <span className="inline-flex items-center gap-1 tabular-nums text-slate-600">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        {clockText(left)} left{c?.clock_started_at ? "" : " (paused)"}
      </span>
    );
  };
  const extras = (c: ClockRow | null) =>
    (c?.extra_seconds ?? 0) > 0 ? `${Math.round((c?.extra_seconds ?? 0) / 60)} extra minutes` : null;

  return (
    <div className="space-y-6">
      <LiveRefresh intervalMs={10000} />
      {error ? <Alert tone="warning">{examRoomError(error.message)}</Alert> : null}

      <p className="text-sm text-slate-600" role="status">
        <span className="font-semibold text-slate-900">{writing.length} writing</span> ·{" "}
        <span className={locked.length ? "font-semibold text-red-700" : ""}>{locked.length} locked</span> · {handedIn.length} handed in
        {duration ? ` · ${duration} minutes each` : ""}. Updates every 10 seconds.
      </p>

      {locked.length ? (
        <Card className="border-red-200">
          <CardHeader
            title={`Needs unlocking (${locked.length})`}
            description="Check the learner is ready, choose why, then Unlock. Their answers are saved and their clock was paused while locked."
          />
          <ul className="divide-y divide-red-100">
            {locked.map((r) => (
              <li key={r.attempt_id} className="space-y-2 px-5 py-3 text-sm sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold text-slate-900">{name(r)}</span>{" "}
                    <span className="font-mono text-xs text-slate-500">{r.admission_number ?? ""}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3">
                    {timeLeft(r.c)}
                    <TickForTime attemptId={r.attempt_id} name={name(r)} />
                  </span>
                </div>
                <p className="text-red-800">
                  <Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  {lockReasonLabel(r.c?.locked_reason)}
                  {r.c?.locked_at ? `, ${formatLagosDateTime(r.c.locked_at)}` : ""}. Locked {r.c?.lock_count ?? 1} time
                  {(r.c?.lock_count ?? 1) === 1 ? "" : "s"}.
                </p>
                <form action={unlockPupilsAction} className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-center">
                  <Hidden back={back} sessionId={sessionId} attemptId={r.attempt_id} />
                  <ReasonSelect id={`r-${r.attempt_id}`} label={`Why unlock ${name(r)}`} defaultValue={r.c?.locked_reason === "interrupted" ? "power_cut" : "left_page"} />
                  <input name="note" className="gf-input" maxLength={300} placeholder="Note (needed for another reason)" aria-label={`Note for ${name(r)}`} />
                  <SubmitButton variant="primary" size="sm" pendingText="Unlocking…">
                    <span className="inline-flex items-center gap-1.5">
                      <LockOpen className="h-4 w-4" aria-hidden="true" />
                      Unlock
                    </span>
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          {locked.length > 1 ? (
            <form action={unlockPupilsAction} className="grid gap-2 border-t border-red-100 bg-red-50/40 px-5 py-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-center sm:px-6">
              <Hidden back={back} sessionId={sessionId} />
              <p className="text-sm font-semibold text-slate-900 sm:col-span-3">Or unlock all {locked.length} at once, for example after a power cut</p>
              <ReasonSelect id="all-reason" label="Why unlock everyone" defaultValue="power_cut" />
              <input name="note" className="gf-input" maxLength={300} placeholder="Note (needed for another reason)" aria-label="Note for unlocking everyone" />
              <SubmitButton variant="primary" pendingText="Unlocking…">
                Unlock all {locked.length}
              </SubmitButton>
            </form>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Learners" description={rows.length ? "Everyone who has started, by surname. Tick learners to add time for them." : undefined} />
        {others.length ? (
          <ul className="divide-y divide-slate-100">
            {others.map((r) => {
              const c = r.c;
              const done = !!c?.submitted_at;
              const how = byWhom.get(r.attempt_id);
              const bySchool = done && how === "handed_in_by_school";
              const extra = extras(c);
              return (
                <li key={r.attempt_id} className="space-y-2 px-5 py-3 text-sm sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-900">{name(r)}</span>{" "}
                      <span className="font-mono text-xs text-slate-500">{r.admission_number ?? ""}</span>
                      {c?.unlocked_at || extra ? (
                        <span className="block text-xs text-slate-500">
                          {c?.unlocked_at
                            ? `Unlocked ${formatLagosDateTime(c.unlocked_at)}${c.unlock_reason ? ` · ${UNLOCK_REASONS[c.unlock_reason] ?? c.unlock_reason}` : ""}`
                            : ""}
                          {c?.unlocked_at && extra ? " · " : ""}
                          {extra ?? ""}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {done ? (
                        <Badge tone={bySchool ? "gold" : "green"}>
                          {bySchool ? "Handed in by the school" : how === "time_up" ? "Handed in: time up" : "Handed in"}
                        </Badge>
                      ) : (
                        <Badge tone="blue">Writing</Badge>
                      )}
                      {timeLeft(c)}
                      {!done && c ? <TickForTime attemptId={r.attempt_id} name={name(r)} /> : null}
                    </div>
                  </div>
                  {bySchool ? (
                    <details>
                      <summary className="inline-flex min-h-[36px] cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Let back in
                      </summary>
                      <form action={reopenAttemptAction} className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <Hidden back={back} sessionId={sessionId} attemptId={r.attempt_id} />
                        <input
                          name="reason"
                          className="gf-input"
                          required
                          minLength={3}
                          maxLength={300}
                          placeholder="Why (e.g. handed in too early, end date was wrong)"
                          aria-label={`Why let ${name(r)} back in`}
                        />
                        <SubmitButton variant="secondary" size="sm" pendingText="Opening…">
                          Let back in
                        </SubmitButton>
                      </form>
                      <p className="mt-1 text-xs text-slate-500">They carry on with the answers and time they had. The session must still be open.</p>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-sm text-slate-600 sm:px-6">
            {rows.length ? "Everyone who started is locked: unlock them above." : "No one has started yet. Learners appear here once they press Start exam."}
          </p>
        )}

        {stillOpen > 0 ? (
          <form id={TIME_FORM} action={addTimeAction} className="space-y-3 border-t border-slate-100 px-5 py-4 sm:px-6">
            <Hidden back={back} sessionId={sessionId} />
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Timer className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
              Add time
            </div>
            <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
              <legend className="sr-only">Who gets the time</legend>
              <label className="inline-flex min-h-[36px] items-center gap-2">
                <input type="radio" name="target" value="ticked" defaultChecked className="h-4 w-4" />
                The learners ticked above
              </label>
              <label className="inline-flex min-h-[36px] items-center gap-2">
                <input type="radio" name="target" value="everyone" className="h-4 w-4" />
                Everyone who hasn&apos;t handed in ({stillOpen})
              </label>
            </fieldset>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,16rem)_minmax(0,1fr)_auto] sm:items-center">
              <select name="minutes" className="gf-select" defaultValue="10" aria-label="Minutes to add">
                {MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
              <select name="reason" className="gf-select" defaultValue="" required aria-label="Why time is being added">
                <option value="" disabled>
                  Why
                </option>
                {(Object.keys(TIME_REASONS) as TimeReason[]).map((k) => (
                  <option key={k} value={k}>
                    {TIME_REASONS[k]}
                  </option>
                ))}
              </select>
              <input name="note" className="gf-input" maxLength={300} placeholder="Note (needed for another reason)" aria-label="Note about the extra time" />
              <SubmitButton variant="secondary" pendingText="Adding…">
                Add time
              </SubmitButton>
            </div>
          </form>
        ) : null}

        {stillOpen > 0 ? (
          <form action={handInAllAction} className="flex flex-col gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <Hidden back={back} sessionId={sessionId} />
            <p className="text-sm text-slate-600">
              End of the exam? Hand in everyone still writing, with the answers they have saved. You can let a learner back in afterwards if it
              was too early. If nobody does this, the school hands them in 2 hours after the session&apos;s end date.
            </p>
            <ConfirmSubmitButton
              className={buttonClasses({ variant: "secondary", size: "sm", className: "shrink-0" })}
              confirmMessage={`Hand in ${stillOpen} learner${stillOpen === 1 ? "" : "s"} now with the answers they have saved?`}
            >
              Hand in everyone ({stillOpen})
            </ConfirmSubmitButton>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
