-- Exam lock-outs and time limits (24 Nov 2026). Run after 20261123b_exam_conductor_access.sql. Safe to run twice.
--
-- Decisions (the user):
--   * Leaving the exam page is always recorded, but the exam only locks if the pupil is away for 10 seconds or more.
--     Before, any loss of focus (a phone screen dimming, a pop-up) locked it at once.
--   * The test's time limit is enforced per pupil. The clock runs only while the pupil is on the exam page: it stops
--     while they are away, locked, or cut off (power cut, lost connection), so an interruption costs no time.
--     Answers are handed in automatically when time runs out. Conductors and staff can add time.
--   * Unlocking takes a reason from a fixed list (power cut, network, device problem, left the page, other).
--
-- How the clock works (exam_attempts):
--   used_seconds      time already used in finished stretches
--   clock_started_at  start of the current stretch (null = clock stopped)
--   last_seen_at      last check-in from the pupil's page (every 15 seconds while open)
--   away_since        when the page was hidden or lost focus
--   extra_seconds     time added by a conductor or staff
-- Time left = duration + extra - used - (now - clock_started_at while running).
-- A check-in more than 45 seconds after the last one means the page was cut off (power, network, closed): the clock
-- is stopped at the last check-in and the exam is locked with the reason "interrupted", so a conductor lets the
-- pupil back in. Away 10+ seconds locks with "left_page".
--
-- All pupil calls go through exam_checkin(); pupils still can't update attempts directly.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------------------------------------------

alter table public.exam_attempts
  add column if not exists used_seconds int not null default 0 check (used_seconds >= 0),
  add column if not exists clock_started_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists away_since timestamptz,
  add column if not exists extra_seconds int not null default 0 check (extra_seconds between 0 and 7200),
  add column if not exists unlock_reason text check (unlock_reason is null or unlock_reason in (
    'power_cut', 'network', 'device', 'left_page', 'other'
  ));

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------------------------------------------

-- Seconds left on an attempt (can be negative). Null when the test has no time limit.
create or replace function public.exam_seconds_left(p_attempt uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when t.duration_minutes is null or t.duration_minutes <= 0 then null else
    t.duration_minutes * 60 + a.extra_seconds - a.used_seconds
      - case when a.clock_started_at is not null then floor(extract(epoch from (now() - a.clock_started_at)))::int else 0 end
  end
  from public.exam_attempts a
  join public.exam_test_sessions s on s.id = a.session_id
  join public.exam_tests t on t.id = s.test_id
  where a.id = p_attempt;
$$;

revoke all on function public.exam_seconds_left(uuid) from public, anon, authenticated;

-- Stop the clock (adds the running stretch to used_seconds), up to p_until (default now).
create or replace function public.exam_stop_clock(p_attempt uuid, p_until timestamptz default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.exam_attempts
  set used_seconds = used_seconds + greatest(0, floor(extract(epoch from (coalesce(p_until, now()) - clock_started_at)))::int),
      clock_started_at = null
  where id = p_attempt and clock_started_at is not null;
$$;

revoke all on function public.exam_stop_clock(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.exam_lock_internal(p_attempt uuid, p_reason text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exam_stop_clock(p_attempt);
  update public.exam_attempts
  set locked_at = now(),
      locked_reason = p_reason,
      lock_count = lock_count + 1,
      status = 'locked',
      away_since = null
  where id = p_attempt and locked_at is null and submitted_at is null;
  insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
  values (p_attempt, 'lock', jsonb_build_object('reason', p_reason) || coalesce(p_data, '{}'::jsonb));
end;
$$;

revoke all on function public.exam_lock_internal(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. The pupil's page checks in: on load, every 15 seconds, when it is hidden or loses focus ('away') and when it
--    comes back ('back', with how long the browser says it was hidden).
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.exam_checkin(p_attempt uuid, p_event text, p_hidden_seconds int default null)
returns table (status text, seconds_left int, locked boolean, submitted boolean, locked_reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := public.current_student_id();
  a public.exam_attempts%rowtype;
  v_away int;
  v_left int;
begin
  if v_student is null then
    raise exception 'Not a learner user';
  end if;
  if p_event is null or p_event not in ('load', 'heartbeat', 'away', 'back') then
    raise exception 'Unknown check-in';
  end if;
  select * into a from public.exam_attempts x where x.id = p_attempt and x.student_id = v_student for update;
  if a.id is null then
    raise exception 'Attempt not found';
  end if;

  if a.submitted_at is null and a.locked_at is null and public.can_student_access_session(a.session_id) then
    if p_event = 'away' then
      perform public.exam_stop_clock(a.id);
      update public.exam_attempts x set away_since = coalesce(x.away_since, now()), last_seen_at = now() where x.id = a.id;
      insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
      values (a.id, 'left_page', '{}'::jsonb);

    elsif a.clock_started_at is not null and a.last_seen_at is not null and now() - a.last_seen_at > interval '45 seconds' then
      -- The page was cut off (power, network, browser closed). Count time only up to the last check-in.
      perform public.exam_stop_clock(a.id, a.last_seen_at);
      perform public.exam_lock_internal(a.id, 'interrupted',
        jsonb_build_object('seconds_away', floor(extract(epoch from (now() - a.last_seen_at)))::int));

    else
      v_away := greatest(
        coalesce(floor(extract(epoch from (now() - a.away_since)))::int, 0),
        case when p_event = 'back' then least(greatest(coalesce(p_hidden_seconds, 0), 0), 86400) else 0 end
      );
      if v_away >= 10 then
        perform public.exam_lock_internal(a.id, 'left_page', jsonb_build_object('seconds_away', v_away));
      else
        if a.away_since is not null then
          insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
          values (a.id, 'back', jsonb_build_object('seconds_away', v_away));
        end if;
        update public.exam_attempts x
        set away_since = null,
            clock_started_at = coalesce(x.clock_started_at, now()),
            last_seen_at = now(),
            status = case when x.status = 'locked' then 'in_progress' else x.status end
        where x.id = a.id;

        v_left := public.exam_seconds_left(a.id);
        if v_left is not null and v_left <= 0 then
          perform public.exam_stop_clock(a.id);
          insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
          values (a.id, 'time_up', '{}'::jsonb);
          perform public.submit_exam_attempt(a.id);
        end if;
      end if;
    end if;
  end if;

  select * into a from public.exam_attempts x where x.id = p_attempt;
  status := a.status;
  seconds_left := greatest(public.exam_seconds_left(a.id), 0);
  locked := a.locked_at is not null;
  submitted := a.submitted_at is not null;
  locked_reason := a.locked_reason;
  return next;
end;
$$;

revoke all on function public.exam_checkin(uuid, text, int) from public, anon;
grant execute on function public.exam_checkin(uuid, text, int) to authenticated;

-- Older pages (still open during the deploy) call lock_exam_attempt on any loss of focus. Treat it as 'away' so
-- the 10-second rule applies to them too.
create or replace function public.lock_exam_attempt(attempt_uuid uuid, reason text, event_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exam_checkin(attempt_uuid, 'away', null);
end;
$$;

-- Starting the exam starts the clock.
create or replace function public.exam_attempts_start_clock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.clock_started_at := coalesce(new.clock_started_at, now());
  new.last_seen_at := coalesce(new.last_seen_at, now());
  return new;
end;
$$;

drop trigger if exists exam_attempts_start_clock on public.exam_attempts;
create trigger exam_attempts_start_clock
  before insert on public.exam_attempts
  for each row execute function public.exam_attempts_start_clock();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Answers can't be saved once time is up (a minute's grace for a slow connection)
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.exam_answers_time_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left int;
begin
  -- Only pupils' saves; staff marking is not limited.
  if public.current_student_id() is null then
    return new;
  end if;
  v_left := public.exam_seconds_left(new.attempt_id);
  if v_left is not null and v_left < -60 then
    raise exception 'Time is up for this exam.';
  end if;
  return new;
end;
$$;

drop trigger if exists exam_answers_time_guard on public.exam_attempt_answers;
create trigger exam_answers_time_guard
  before insert or update on public.exam_attempt_answers
  for each row execute function public.exam_answers_time_guard();

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Unlocking (reason from a list) and adding time
-- ---------------------------------------------------------------------------------------------------------------

drop function if exists public.exam_unlock_attempts(uuid, uuid, text);
create or replace function public.exam_unlock_attempts(
  p_session uuid,
  p_attempt uuid default null,
  p_note text default null,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if not (coalesce(public.is_staff(), false) or coalesce(public.can_conduct_session(p_session), false)) then
    raise exception 'You are not assigned to conduct this session.';
  end if;
  if p_reason is not null and p_reason not in ('power_cut', 'network', 'device', 'left_page', 'other') then
    raise exception 'Choose why the exam is being unlocked.';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'Say why the exam is being unlocked.';
  end if;
  if p_reason is null and v_note is null then
    raise exception 'Choose why the exam is being unlocked.';
  end if;

  -- The clock starts again when the pupil's page next checks in.
  with done as (
    update public.exam_attempts a
    set locked_at = null,
        locked_reason = null,
        status = case when a.status = 'locked' and a.submitted_at is null then 'in_progress' else a.status end,
        clock_started_at = null,
        away_since = null,
        last_seen_at = null,
        unlocked_at = now(),
        unlocked_by = auth.uid(),
        unlock_note = v_note,
        unlock_reason = p_reason
    where a.session_id = p_session
      and a.locked_at is not null
      and (p_attempt is null or a.id = p_attempt)
    returning a.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from done;

  insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
  select x, case when p_attempt is null then 'bulk_unlock' else 'unlock' end,
         jsonb_build_object('unlock_reason', p_reason, 'unlock_note', v_note, 'unlocked_by', auth.uid())
  from unnest(v_ids) as x;

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke all on function public.exam_unlock_attempts(uuid, uuid, text, text) from public, anon;
grant execute on function public.exam_unlock_attempts(uuid, uuid, text, text) to authenticated;

-- Add minutes for the ticked pupils (p_attempts) or, when p_attempts is null, everyone in the session who hasn't
-- handed in. A reason is required: late_start, interruption, access_arrangement (e.g. extra time agreed for a
-- pupil's needs) or other (with a note). Returns how many pupils got the time.
drop function if exists public.exam_add_time(uuid, uuid, int, text);
create or replace function public.exam_add_time(p_session uuid, p_attempts uuid[], p_minutes int, p_reason text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if not (coalesce(public.is_staff(), false) or coalesce(public.can_conduct_session(p_session), false)) then
    raise exception 'You are not assigned to conduct this session.';
  end if;
  if p_minutes is null or p_minutes not between 1 and 60 then
    raise exception 'Add between 1 and 60 minutes.';
  end if;
  if p_reason is null or p_reason not in ('late_start', 'interruption', 'access_arrangement', 'other') then
    raise exception 'Choose why the time is being added.';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'Say why the time is being added.';
  end if;
  if p_attempts is not null and cardinality(p_attempts) = 0 then
    raise exception 'Tick the learners to give time to, or choose everyone.';
  end if;

  with done as (
    update public.exam_attempts a
    set extra_seconds = least(7200, a.extra_seconds + p_minutes * 60)
    where a.session_id = p_session
      and a.submitted_at is null
      and (p_attempts is null or a.id = any(p_attempts))
    returning a.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from done;

  insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
  select x, 'extra_time', jsonb_build_object('minutes', p_minutes, 'reason', p_reason, 'note', v_note,
                                             'everyone', p_attempts is null, 'added_by', auth.uid())
  from unnest(v_ids) as x;

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke all on function public.exam_add_time(uuid, uuid[], int, text, text) from public, anon;
grant execute on function public.exam_add_time(uuid, uuid[], int, text, text) to authenticated;

-- The test's name and time limit for the exam room page (conductors who aren't staff can't read exam_tests).
create or replace function public.exam_room_info(p_session uuid)
returns table (test_name text, duration_minutes int)
language sql
stable
security definer
set search_path = public
as $$
  select t.name, t.duration_minutes
  from public.exam_test_sessions s
  join public.exam_tests t on t.id = s.test_id
  where s.id = p_session
    and (coalesce(public.is_staff(), false) or coalesce(public.can_conduct_session(p_session), false));
$$;

revoke all on function public.exam_room_info(uuid) from public, anon;
grant execute on function public.exam_room_info(uuid) to authenticated;
