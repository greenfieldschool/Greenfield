-- Exam conductors who are not staff can open their sessions and unlock pupils (23 Nov 2026).
--
-- Why: a conductor account (an invigilator linked under Exams > Conductors) could not read its own link row,
-- because the only rule on exam_conductor_user_links was for staff, and the checks is_exam_conductor() and
-- can_conduct_session() ran with the conductor's own rights, so they always said no. Conductors who are not staff
-- were sent to "unauthorized" and never reached their sessions.
--
-- Letting them in would also have switched on two older rules that were too wide:
--   * a conductor could update any column of an exam attempt, including the marks;
--   * a conductor could change or delete malpractice records (the lock/unlock history).
-- And unlocking cleared locked_at but left the attempt's status as 'locked', so the pupil's exam page stayed locked.
--
-- What this does:
--   1. is_exam_conductor() and can_conduct_session() check the links with full rights and return a definite
--      true/false.
--   2. A conductor can read their own link row and their own session assignments.
--   3. Conductors no longer update attempts directly. Unlocking goes through exam_unlock_attempts(), which checks
--      the person is staff or assigned to the session, only clears the lock (marks can't be touched), puts the
--      attempt back to 'in_progress' if it wasn't handed in, records who unlocked it and writes the malpractice
--      record.
--   4. Conductors can read the malpractice records for their sessions but not change or delete them.
--
-- Safe to run twice. Run with or after 20261123_view_row_checks.sql (either order works). Deploy the website change
-- (the conductor session page calls exam_unlock_attempts) together with or after this file: the page's Unlock
-- buttons stop working for conductors once this runs, until the new page is live.
-- The SQL editor may warn about "destructive operations": two old policies are replaced, nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------
-- Exam conductor access: own link rows, checked unlocks (see docs/migrations/20261123b_exam_conductor_access.sql)
-- ---------------------------------------------------------------------------------------------------------------

-- 1. Conductor checks that see the link rows, with definite answers.
create or replace function public.is_exam_conductor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (select 1 from public.exam_conductor_user_links l where l.user_id = auth.uid()), false);
$$;
revoke all on function public.is_exam_conductor() from public, anon;
grant execute on function public.is_exam_conductor() to authenticated;

create or replace function public.can_conduct_session(session_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1
    from public.exam_conductor_user_links l
    join public.exam_session_conductors sc on sc.conductor_id = l.conductor_id
    where l.user_id = auth.uid()
      and sc.session_id = session_uuid
  ), false);
$$;
revoke all on function public.can_conduct_session(uuid) from public, anon;
grant execute on function public.can_conduct_session(uuid) to authenticated;

-- 2. A conductor reads their own link and their own assignments.
drop policy if exists exam_conductor_user_links_own_select on public.exam_conductor_user_links;
create policy exam_conductor_user_links_own_select
  on public.exam_conductor_user_links
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists exam_session_conductors_own_select on public.exam_session_conductors;
create policy exam_session_conductors_own_select
  on public.exam_session_conductors
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.exam_conductor_user_links l
      where l.user_id = auth.uid()
        and l.conductor_id = exam_session_conductors.conductor_id
    )
  );

-- 3. Unlocking through one checked function; no direct updates by conductors.
drop policy if exists exam_attempts_conductor_unlock on public.exam_attempts;

-- Unlock one attempt (p_attempt) or every locked attempt in the session (p_attempt null; a note is required).
-- Returns how many attempts were unlocked.
create or replace function public.exam_unlock_attempts(p_session uuid, p_attempt uuid default null, p_note text default null)
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
  if p_attempt is null and v_note is null then
    raise exception 'Enter a reason for unlocking everyone.';
  end if;

  with done as (
    update public.exam_attempts a
    set locked_at = null,
        locked_reason = null,
        status = case when a.status = 'locked' and a.submitted_at is null then 'in_progress' else a.status end,
        unlocked_at = now(),
        unlocked_by = auth.uid(),
        unlock_note = v_note
    where a.session_id = p_session
      and a.locked_at is not null
      and (p_attempt is null or a.id = p_attempt)
    returning a.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from done;

  insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
  select x, case when p_attempt is null then 'bulk_unlock' else 'unlock' end,
         jsonb_build_object('unlock_note', v_note, 'unlocked_by', auth.uid())
  from unnest(v_ids) as x;

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;
revoke all on function public.exam_unlock_attempts(uuid, uuid, text) from public, anon;
grant execute on function public.exam_unlock_attempts(uuid, uuid, text) to authenticated;

-- 4. Conductors read the malpractice records of their sessions; only the functions above write them.
drop policy if exists exam_malpractice_conductor_all on public.exam_malpractice_events;
drop policy if exists exam_malpractice_conductor_select on public.exam_malpractice_events;
create policy exam_malpractice_conductor_select
  on public.exam_malpractice_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.exam_attempts a
      where a.id = exam_malpractice_events.attempt_id
        and public.can_conduct_session(a.session_id)
    )
  );
