-- Exams: hand-in when a session closes, who can set tests, and approving questions (24 Nov 2026).
-- Run after 20261124_exam_lockouts_and_time.sql. Safe to run twice. 20261124c_exam_close_schedule.sql (needs
-- pg_cron) then hands in open attempts automatically every 15 minutes.
--
-- Decisions (the user, 24 Nov 2026):
--   * Admins approve exam questions (the policy's "examination board").
--   * Tests and questions: admins, and teachers of the subject. Front desk and the nurse lose access to questions.
--   * A teacher schedules a test only for classes they teach that subject in. Admins schedule any class.
--
-- 1. Hand-in. A pupil still writing when the session closes (or who closed the browser and never came back) used to
--    keep an open attempt for ever: handing in was refused once the session had ended, so it was never marked.
--    exam_hand_in_open() hands in every open attempt of a session with the answers already saved (staff or the
--    session's conductor, e.g. at the end of the exam in the hall); exam_close_ended_sessions() does it for every
--    session whose end has passed (scheduled).
-- 2. Access: can_manage_test() and the test/question/solution/session rules no longer let every non-teaching staff
--    member in. Staff can still read sessions (to run exam rooms); questions are for admins and the subject's
--    teachers, and for pupils only while their session is open (unchanged).
-- 3. Approval: exam_tests.approval_status draft → submitted → approved, or returned with comments. A session can
--    only be opened (status active) for an approved test. Changing an approved or submitted test's questions, time
--    or subject puts it back to draft; while a session for it is open, those changes are refused. Tests that already
--    have a session count as approved. Each test belongs to a term; questions are due on Friday of week 2.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Handing in open attempts
-- ---------------------------------------------------------------------------------------------------------------

-- Marks an attempt with the answers saved so far and hands it in. Internal (no permission check).
create or replace function public.exam_finalise_attempt(p_attempt uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test uuid;
  v_has_manual boolean;
  v_max numeric(10,2);
  v_obt numeric(10,2);
begin
  select s.test_id into v_test
  from public.exam_attempts a join public.exam_test_sessions s on s.id = a.session_id
  where a.id = p_attempt and a.submitted_at is null;
  if v_test is null then
    return;
  end if;

  perform public.exam_stop_clock(p_attempt);
  update public.exam_attempts
  set submitted_at = now(), status = 'submitted', locked_at = null, away_since = null
  where id = p_attempt;

  with qs as (
    select id, question_type, marks from public.exam_questions where test_id = v_test and active = true
  ), scored as (
    select qs.id as question_id, qs.marks,
      case
        when qs.question_type in ('mcq_single', 'true_false') then
          (coalesce(ans.answer->>'value', '') = coalesce(sol.correct_answer->>'value', ''))
        when qs.question_type = 'fill_blank' then
          lower(btrim(coalesce(ans.answer->>'value', ''))) = lower(btrim(coalesce(sol.correct_answer->>'value', '')))
        else null
      end as is_correct
    from qs
    left join public.exam_question_solutions sol on sol.question_id = qs.id
    left join public.exam_attempt_answers ans on ans.question_id = qs.id and ans.attempt_id = p_attempt
  )
  update public.exam_attempt_answers a
  set is_correct = s.is_correct,
      awarded_marks = case when s.is_correct then s.marks else 0 end,
      marked_at = now()
  from scored s
  where a.attempt_id = p_attempt and a.question_id = s.question_id and s.is_correct is not null;

  select coalesce(sum(q.marks), 0),
         coalesce(sum(case when a.is_correct = true then q.marks else 0 end), 0),
         bool_or(q.question_type in ('short_answer', 'essay', 'mcq_multi'))
  into v_max, v_obt, v_has_manual
  from public.exam_questions q
  left join public.exam_attempt_answers a on a.question_id = q.id and a.attempt_id = p_attempt
  where q.test_id = v_test and q.active = true;

  update public.exam_attempts
  set max_marks = v_max,
      obtained_marks = v_obt,
      percent = case when v_max > 0 then (v_obt / v_max) * 100 else 0 end,
      graded_at = case when coalesce(v_has_manual, false) = false then now() else graded_at end,
      status = case when coalesce(v_has_manual, false) = false then 'graded' else 'submitted' end
  where id = p_attempt;

  insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
  values (p_attempt, 'handed_in_by_school', jsonb_build_object('reason', p_reason, 'by', auth.uid()));
end;
$$;

revoke all on function public.exam_finalise_attempt(uuid, text) from public, anon, authenticated;

-- "Hand in everyone still writing" for one session. Staff or the session's conductor. Returns how many.
create or replace function public.exam_hand_in_open(p_session uuid, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if not (coalesce(public.is_staff(), false) or coalesce(public.can_conduct_session(p_session), false)) then
    raise exception 'You are not assigned to conduct this session.';
  end if;
  for r in select id from public.exam_attempts where session_id = p_session and submitted_at is null loop
    perform public.exam_finalise_attempt(r.id, coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'end_of_exam'));
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.exam_hand_in_open(uuid, text) from public, anon;
grant execute on function public.exam_hand_in_open(uuid, text) to authenticated;

-- Every session whose end passed more than 2 hours ago: hand in what is still open. For the scheduled job.
-- The grace period gives staff time to notice an end date set too early and move it before anyone is handed in;
-- a school hand-in can also be undone (exam_reopen_attempt), so it is never final the way a pupil's own Submit is.
create or replace function public.exam_close_ended_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select a.id
    from public.exam_attempts a
    join public.exam_test_sessions s on s.id = a.session_id
    where a.submitted_at is null and s.ends_at is not null and s.ends_at < now() - interval '2 hours'
      and (a.last_seen_at is null or a.last_seen_at < now() - interval '30 minutes')
  loop
    perform public.exam_finalise_attempt(r.id, 'session_closed');
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.exam_close_ended_sessions() from public, anon, authenticated;

-- Let a pupil back in after the school handed them in (automatically or with "Hand in everyone"). Staff or the
-- session's conductor, with a reason. Not for a pupil who pressed Submit themselves, nor once results are released.
-- The session must still be open to pupils (move its end date first if needed). Their clock carries on.
create or replace function public.exam_reopen_attempt(p_attempt uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.exam_attempts%rowtype;
  s public.exam_test_sessions%rowtype;
  v_by_school boolean;
begin
  select * into a from public.exam_attempts where id = p_attempt for update;
  if a.id is null then
    raise exception 'That learner''s exam was not found.';
  end if;
  if not (coalesce(public.is_staff(), false) or coalesce(public.can_conduct_session(a.session_id), false)) then
    raise exception 'You are not assigned to conduct this session.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say why the learner is being let back in.';
  end if;
  if a.submitted_at is null then
    raise exception 'This learner hasn''t been handed in.';
  end if;
  select (e.event_type = 'handed_in_by_school') into v_by_school
  from public.exam_malpractice_events e
  where e.attempt_id = a.id and e.event_type in ('handed_in_by_school', 'submit', 'time_up', 'reopened')
  order by e.created_at desc limit 1;
  if not coalesce(v_by_school, false) then
    raise exception 'This learner handed in their own answers (or their time ran out), so it can''t be reopened.';
  end if;
  select * into s from public.exam_test_sessions where id = a.session_id;
  if s.results_released_at is not null then
    raise exception 'Results for this session have been released, so it can''t be reopened.';
  end if;
  if not (s.active and s.status = 'active' and (s.ends_at is null or s.ends_at >= now()) and (s.starts_at is null or s.starts_at <= now())) then
    raise exception 'The session is closed to learners. Move its end date first, then let the learner back in.';
  end if;

  update public.exam_attempts
  set submitted_at = null, graded_at = null, status = 'in_progress',
      locked_at = null, locked_reason = null, clock_started_at = null, last_seen_at = null, away_since = null
  where id = a.id;
  insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
  values (a.id, 'reopened', jsonb_build_object('reason', btrim(p_reason), 'by', auth.uid()));
end;
$$;

revoke all on function public.exam_reopen_attempt(uuid, text) from public, anon;
grant execute on function public.exam_reopen_attempt(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Who can set tests and schedule sessions
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.can_manage_test(p_test uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(public.is_admin(), false)
    or (
      public.current_role() = 'teacher'
      and exists (
        select 1
        from public.exam_tests t
        where t.id = p_test
          and (t.created_by = auth.uid() or public.teacher_teaches_subject(t.subject_id))
      )
    );
$$;

drop policy if exists exam_tests_staff_all on public.exam_tests;
create policy exam_tests_staff_all
  on public.exam_tests
  for all
  to authenticated
  using (
    coalesce(public.is_admin(), false)
    or (public.current_role() = 'teacher' and (created_by = auth.uid() or public.teacher_teaches_subject(subject_id)))
  )
  with check (
    coalesce(public.is_admin(), false)
    or (public.current_role() = 'teacher' and public.teacher_teaches_subject(subject_id))
  );

drop policy if exists exam_questions_student_select on public.exam_questions;
create policy exam_questions_student_select
  on public.exam_questions
  for select
  to authenticated
  using (
    coalesce(public.can_manage_test(test_id), false)
    or exists(
      select 1
      from public.exam_test_sessions s
      inner join public.student_user_links sul on sul.user_id = auth.uid()
      inner join public.students st on st.id = sul.student_id
      where s.test_id = exam_questions.test_id
        and s.active = true
        and (s.class_id is null or s.class_id = st.class_id)
        and (
          (s.status = 'active' and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at >= now()))
          or s.results_released_at is not null
        )
    )
  );

drop policy if exists exam_question_solutions_student_select on public.exam_question_solutions;
create policy exam_question_solutions_student_select
  on public.exam_question_solutions
  for select
  to authenticated
  using (
    exists (select 1 from public.exam_questions q where q.id = exam_question_solutions.question_id and coalesce(public.can_manage_test(q.test_id), false))
    or exists(
      select 1
      from public.exam_questions q
      inner join public.exam_test_sessions s on s.test_id = q.test_id
      inner join public.student_user_links sul on sul.user_id = auth.uid()
      inner join public.students st on st.id = sul.student_id
      where q.id = exam_question_solutions.question_id
        and s.active = true
        and (s.class_id is null or s.class_id = st.class_id)
        and s.results_released_at is not null
    )
  );

-- Sessions: staff read them (exam rooms, published lists); admins and the subject's teachers change them, and a
-- teacher only for a class they teach that subject in.
create or replace function public.can_schedule_test(p_test uuid, p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or (
      public.current_role() = 'teacher'
      and p_class is not null
      and coalesce(public.can_manage_test(p_test), false)
      and exists (
        select 1 from public.exam_tests t
        where t.id = p_test and coalesce(public.teacher_teaches(p_class, t.subject_id), false)
      )
    );
$$;

revoke all on function public.can_schedule_test(uuid, uuid) from public, anon;
grant execute on function public.can_schedule_test(uuid, uuid) to authenticated;

drop policy if exists exam_sessions_staff_all on public.exam_test_sessions;
drop policy if exists exam_sessions_staff_select on public.exam_test_sessions;
drop policy if exists exam_sessions_manage on public.exam_test_sessions;
create policy exam_sessions_staff_select
  on public.exam_test_sessions
  for select
  to authenticated
  using (coalesce(public.is_staff(), false));
create policy exam_sessions_manage
  on public.exam_test_sessions
  for all
  to authenticated
  using (coalesce(public.can_schedule_test(test_id, class_id), false))
  with check (coalesce(public.can_schedule_test(test_id, class_id), false));

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Approving questions
-- ---------------------------------------------------------------------------------------------------------------

alter table public.exam_tests
  add column if not exists academic_term_id uuid references public.academic_terms(id) on delete set null,
  add column if not exists approval_status text not null default 'draft'
    check (approval_status in ('draft', 'submitted', 'approved', 'returned')),
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_note text check (review_note is null or length(review_note) <= 2000);

-- First run only: tests already used in a session count as approved, and take that session's term.
do $$
begin
  if not exists (select 1 from public.exam_tests where approval_status <> 'draft' or reviewed_at is not null) then
    update public.exam_tests t
    set approval_status = 'approved', reviewed_at = now()
    where exists (select 1 from public.exam_test_sessions s where s.test_id = t.id);
  end if;
end;
$$;
update public.exam_tests t
set academic_term_id = (
  select s.academic_term_id from public.exam_test_sessions s
  where s.test_id = t.id and s.academic_term_id is not null
  order by s.created_at desc limit 1
)
where t.academic_term_id is null;

create index if not exists exam_tests_term_status_idx on public.exam_tests (academic_term_id, approval_status);

create table if not exists public.exam_test_events (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.exam_tests(id) on delete cascade,
  action text not null check (action in ('submitted', 'approved', 'returned', 'back_to_draft')),
  note text,
  detail jsonb not null default '{}'::jsonb,
  done_at timestamptz not null default now(),
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text
);
create index if not exists exam_test_events_test_idx on public.exam_test_events (test_id, done_at);
alter table public.exam_test_events enable row level security;
drop policy if exists exam_test_events_read on public.exam_test_events;
create policy exam_test_events_read on public.exam_test_events
  for select to authenticated
  using (coalesce(public.can_manage_test(test_id), false));
revoke all on public.exam_test_events from anon;
revoke insert, update, delete, truncate on public.exam_test_events from authenticated;
grant select on public.exam_test_events to authenticated;

create or replace function public.exam_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Staff') from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.exam_actor_name() from public, anon, authenticated;

-- Friday of week 2 of a term (week 1 ends on the first Friday on or after the first day).
create or replace function public.exam_questions_due(p_term uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select t.starts_on + ((5 - extract(isodow from t.starts_on)::int + 7) % 7) + 7
  from public.academic_terms t
  where t.id = p_term and t.starts_on is not null;
$$;
revoke all on function public.exam_questions_due(uuid) from public, anon;
grant execute on function public.exam_questions_due(uuid) to authenticated;

-- Only the functions below change approval_status and the review columns.
create or replace function public.exam_tests_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.exam_approval', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'draft';
    new.submitted_at := null; new.submitted_by := null;
    new.reviewed_at := null; new.reviewed_by := null; new.review_note := null;
    return new;
  end if;
  if new.approval_status is distinct from old.approval_status
     or new.submitted_at is distinct from old.submitted_at or new.submitted_by is distinct from old.submitted_by
     or new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by
     or new.review_note is distinct from old.review_note then
    raise exception 'Use Send for approval, Approve or Send back to change a test''s approval.';
  end if;
  -- Changing the time allowed or the subject of a submitted or approved test needs approval again.
  if old.approval_status in ('submitted', 'approved')
     and (new.duration_minutes is distinct from old.duration_minutes or new.subject_id is distinct from old.subject_id) then
    if exists (
      select 1 from public.exam_test_sessions s
      where s.test_id = old.id and s.active and s.status = 'active' and (s.ends_at is null or s.ends_at >= now())
    ) then
      raise exception 'This test is open to learners in a session. Set that session to draft first, then change the test.';
    end if;
    new.approval_status := 'draft';
    insert into public.exam_test_events (test_id, action, note, done_by, done_by_name)
    values (old.id, 'back_to_draft', 'Time or subject changed', auth.uid(), public.exam_actor_name());
  end if;
  return new;
end;
$$;

drop trigger if exists exam_tests_approval_guard on public.exam_tests;
create trigger exam_tests_approval_guard
  before insert or update on public.exam_tests
  for each row execute function public.exam_tests_approval_guard();

-- Changing questions of a submitted or approved test puts it back to draft (refused while a session is open).
create or replace function public.exam_questions_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test uuid;
  v_status text;
begin
  if tg_table_name = 'exam_question_solutions' then
    select q.test_id into v_test from public.exam_questions q where q.id = coalesce(new.question_id, old.question_id);
  else
    v_test := coalesce(new.test_id, old.test_id);
  end if;
  select approval_status into v_status from public.exam_tests where id = v_test;
  if v_status in ('submitted', 'approved') then
    if exists (
      select 1 from public.exam_test_sessions s
      where s.test_id = v_test and s.active and s.status = 'active' and (s.ends_at is null or s.ends_at >= now())
    ) then
      raise exception 'This test is open to learners in a session. Set that session to draft first, then change the questions.';
    end if;
    perform set_config('app.exam_approval', 'on', true);
    update public.exam_tests set approval_status = 'draft' where id = v_test;
    perform set_config('app.exam_approval', '', true);
    insert into public.exam_test_events (test_id, action, note, done_by, done_by_name)
    values (v_test, 'back_to_draft', 'Questions changed', auth.uid(), public.exam_actor_name());
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists exam_questions_approval_guard on public.exam_questions;
create trigger exam_questions_approval_guard
  before insert or update or delete on public.exam_questions
  for each row execute function public.exam_questions_approval_guard();
drop trigger if exists exam_question_solutions_approval_guard on public.exam_question_solutions;
create trigger exam_question_solutions_approval_guard
  before insert or update or delete on public.exam_question_solutions
  for each row execute function public.exam_questions_approval_guard();

-- A session can only be opened to pupils for an approved test.
create or replace function public.exam_sessions_need_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active and new.status = 'active'
     and coalesce((select approval_status from public.exam_tests where id = new.test_id), 'draft') <> 'approved' then
    raise exception 'This test hasn''t been approved yet. Save the session as draft; it can open once an admin approves the questions.';
  end if;
  return new;
end;
$$;

drop trigger if exists exam_sessions_need_approval on public.exam_test_sessions;
create trigger exam_sessions_need_approval
  before insert or update of status, active, test_id on public.exam_test_sessions
  for each row execute function public.exam_sessions_need_approval();

-- Teacher (or admin) sends a test for approval.
create or replace function public.exam_submit_test(p_test uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.exam_tests%rowtype;
begin
  if not coalesce(public.can_manage_test(p_test), false) then
    raise exception 'Only the subject''s teachers and admins can send this test for approval.';
  end if;
  select * into t from public.exam_tests where id = p_test for update;
  if t.approval_status not in ('draft', 'returned') then
    raise exception 'This test has already been sent for approval.';
  end if;
  if t.academic_term_id is null then
    raise exception 'Choose the term this test is for, then send it.';
  end if;
  if not exists (select 1 from public.exam_questions q where q.test_id = p_test and q.active) then
    raise exception 'Add the questions first.';
  end if;
  perform set_config('app.exam_approval', 'on', true);
  update public.exam_tests
  set approval_status = 'submitted', submitted_at = now(), submitted_by = auth.uid(), review_note = null
  where id = p_test;
  perform set_config('app.exam_approval', '', true);
  insert into public.exam_test_events (test_id, action, note, detail, done_by, done_by_name)
  values (p_test, 'submitted', nullif(btrim(coalesce(p_note, '')), ''),
          jsonb_build_object('due', public.exam_questions_due(t.academic_term_id)), auth.uid(), public.exam_actor_name());
end;
$$;

revoke all on function public.exam_submit_test(uuid, text) from public, anon;
grant execute on function public.exam_submit_test(uuid, text) to authenticated;

-- Exam emails to staff (approved / sent back), with their own unsubscribe switch.
alter table public.email_preferences add column if not exists exams boolean not null default true;
alter table public.email_outbox drop constraint if exists email_outbox_category_check;
alter table public.email_outbox add constraint email_outbox_category_check
  check (category in ('notification', 'message', 'announcement', 'test', 'spending', 'exam'));

create or replace function public.email_address_for(p_user uuid, p_category text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from auth.users u
  left join public.email_preferences p on p.user_id = u.id
  where u.id = p_user
    and u.email is not null and u.email like '%@%'
    and case p_category
          when 'notification' then coalesce(p.notifications, true)
          when 'message' then coalesce(p.messages, true)
          when 'announcement' then coalesce(p.announcements, true)
          when 'spending' then coalesce(p.spending, true)
          when 'exam' then coalesce(p.exams, true)
          else true
        end;
$$;

-- Admins approve (after checking the 20%/80% split) or send back with comments. The teacher is emailed.
create or replace function public.exam_review_test(p_test uuid, p_decision text, p_note text default null, p_split_checked boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.exam_tests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_to uuid;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins approve exam questions.';
  end if;
  if p_decision not in ('approve', 'return') then
    raise exception 'Choose Approve or Send back.';
  end if;
  select * into t from public.exam_tests where id = p_test for update;
  if t.id is null then
    raise exception 'That test was not found.';
  end if;
  if t.approval_status = 'approved' and p_decision = 'approve' then
    raise exception 'This test is already approved.';
  end if;
  if p_decision = 'return' and (v_note is null or length(v_note) < 5) then
    raise exception 'Say what needs changing, so the teacher knows what to correct.';
  end if;
  if p_decision = 'approve' and not coalesce(p_split_checked, false) then
    raise exception 'Tick that you checked the questions are 20%% from past work and 80%% from this term.';
  end if;
  if not exists (select 1 from public.exam_questions q where q.test_id = p_test and q.active) then
    raise exception 'This test has no questions yet.';
  end if;

  perform set_config('app.exam_approval', 'on', true);
  update public.exam_tests
  set approval_status = case when p_decision = 'approve' then 'approved' else 'returned' end,
      reviewed_at = now(), reviewed_by = auth.uid(), review_note = v_note
  where id = p_test;
  perform set_config('app.exam_approval', '', true);
  insert into public.exam_test_events (test_id, action, note, done_by, done_by_name)
  values (p_test, case when p_decision = 'approve' then 'approved' else 'returned' end, v_note, auth.uid(), public.exam_actor_name());

  v_to := coalesce(t.submitted_by, t.created_by);
  if v_to is not null and v_to <> auth.uid() then
    perform public.email_enqueue(
      v_to, 'exam',
      case when p_decision = 'approve' then 'Exam questions approved: ' || t.name else 'Exam questions sent back: ' || t.name end,
      case when p_decision = 'approve' then 'Your exam questions were approved' else 'Your exam questions need changes' end,
      case when p_decision = 'approve' then 'The test can now be opened to learners in a session.' else 'Comments: ' || v_note end,
      '/admin/exams/tests/' || t.id::text, t.id, 2
    );
  end if;
end;
$$;

revoke all on function public.exam_review_test(uuid, text, text, boolean) from public, anon;
grant execute on function public.exam_review_test(uuid, text, text, boolean) to authenticated;
