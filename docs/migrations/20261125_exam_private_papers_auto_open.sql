-- Exams: private papers, and open to learners as soon as approved (25 Nov 2026, issues12.docx). Run after 20261124c_exam_close_schedule.sql. Safe to run twice.
--
-- 1. Each teacher's papers are private: a teacher sees, changes and schedules only the tests they created. Admins
--    see and manage all of them, and can hand a paper to another teacher (change its owner). Before, every teacher
--    of the same subject could open, change and delete each other's papers.
--    Other teachers can't see its name either.
-- 2. A session can be set "Open to learners" before its test is approved. Learners only see it (and its questions)
--    once the test is approved, so approval opens it with no second step. Changing an approved test is still
--    refused while learners can see it.
-- A learner who is cut off (power, network, closed browser, signed out) still comes back locked: the session's
-- conductor or staff unlock them, then they carry on with their saved answers and time (the user, 25 Nov 2026).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Private papers
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
      and exists (select 1 from public.exam_tests t where t.id = p_test and t.created_by = auth.uid())
    );
$$;

drop policy if exists exam_tests_staff_all on public.exam_tests;
create policy exam_tests_staff_all
  on public.exam_tests
  for all
  to authenticated
  using (
    coalesce(public.is_admin(), false)
    or (public.current_role() = 'teacher' and created_by = auth.uid())
  )
  with check (
    coalesce(public.is_admin(), false)
    or (public.current_role() = 'teacher' and created_by = auth.uid() and public.teacher_teaches_subject(subject_id))
  );

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Learners see a session only once its test is approved
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.exam_test_approved(p_test uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select approval_status = 'approved' from public.exam_tests where id = p_test), false);
$$;
revoke all on function public.exam_test_approved(uuid) from public, anon;
grant execute on function public.exam_test_approved(uuid) to authenticated;

drop trigger if exists exam_sessions_need_approval on public.exam_test_sessions;

create or replace function public.can_student_view_session(session_uuid uuid) returns boolean
language sql stable parallel safe
as $$
  select exists(
    select 1
    from public.exam_test_sessions s
    inner join public.student_user_links sul on sul.user_id = auth.uid()
    inner join public.students st on st.id = sul.student_id
    where s.id = session_uuid
      and s.active = true
      and (s.class_id is null or s.class_id = st.class_id)
      and (
        (s.status = 'active' and public.exam_test_approved(s.test_id)
          and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at >= now()))
        or s.results_released_at is not null
      )
  );
$$;

create or replace function public.can_student_access_session(session_uuid uuid) returns boolean
language sql stable parallel safe
as $$
  select exists(
    select 1
    from public.exam_test_sessions s
    inner join public.student_user_links sul on sul.user_id = auth.uid()
    inner join public.students st on st.id = sul.student_id
    where s.id = session_uuid
      and s.active = true
      and s.status = 'active'
      and public.exam_test_approved(s.test_id)
      and (s.class_id is null or s.class_id = st.class_id)
      and (s.starts_at is null or s.starts_at <= now())
      and (s.ends_at is null or s.ends_at >= now())
  );
$$;

drop policy if exists exam_sessions_student_select on public.exam_test_sessions;
create policy exam_sessions_student_select
  on public.exam_test_sessions
  for select
  to authenticated
  using (
    exists(
      select 1
      from public.student_user_links sul
      inner join public.students st on st.id = sul.student_id
      where sul.user_id = auth.uid()
        and exam_test_sessions.active = true
        and (exam_test_sessions.class_id is null or exam_test_sessions.class_id = st.class_id)
        and (
          (exam_test_sessions.status = 'active' and public.exam_test_approved(exam_test_sessions.test_id)
            and (exam_test_sessions.starts_at is null or exam_test_sessions.starts_at <= now())
            and (exam_test_sessions.ends_at is null or exam_test_sessions.ends_at >= now()))
          or exam_test_sessions.results_released_at is not null
        )
    )
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
          (s.status = 'active' and public.exam_test_approved(s.test_id)
            and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at >= now()))
          or s.results_released_at is not null
        )
    )
  );

create or replace function public.portal_student_exam_sessions()
returns table (
  id uuid,
  test_id uuid,
  test_name text,
  duration_minutes int,
  class_id uuid,
  class_level text,
  class_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  requires_secret_code boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id, s.test_id, t.name, t.duration_minutes, s.class_id, c.level::text, c.name,
    s.starts_at, s.ends_at, s.requires_secret_code
  from public.student_user_links sul
  join public.students st on st.id = sul.student_id
  join public.exam_test_sessions s
    on s.active = true
   and s.status = 'active'
   and (s.class_id is null or s.class_id = st.class_id)
   and (s.starts_at is null or s.starts_at <= now())
   and (s.ends_at is null or s.ends_at >= now())
  join public.exam_tests t on t.id = s.test_id and t.approval_status = 'approved'
  left join public.classes c on c.id = s.class_id
  where sul.user_id = auth.uid()
  order by s.starts_at desc nulls last, t.name
  limit 100;
$$;
revoke all on function public.portal_student_exam_sessions() from public;
grant execute on function public.portal_student_exam_sessions() to authenticated;

-- Changing a test is refused only while learners can actually see it (approved and open). A submitted test that
-- is changed simply goes back to draft.
create or replace function public.exam_open_to_learners(p_test uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.exam_test_approved(p_test) and exists (
    select 1 from public.exam_test_sessions s
    where s.test_id = p_test and s.active and s.status = 'active'
      and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at >= now())
  );
$$;
revoke all on function public.exam_open_to_learners(uuid) from public, anon, authenticated;

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
  if old.approval_status in ('submitted', 'approved')
     and (new.duration_minutes is distinct from old.duration_minutes or new.subject_id is distinct from old.subject_id) then
    if public.exam_open_to_learners(old.id) then
      raise exception 'Learners can see this test now. Set its session to draft first, then change the test.';
    end if;
    new.approval_status := 'draft';
    insert into public.exam_test_events (test_id, action, note, done_by, done_by_name)
    values (old.id, 'back_to_draft', 'Time or subject changed', auth.uid(), public.exam_actor_name());
  end if;
  return new;
end;
$$;

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
    if public.exam_open_to_learners(v_test) then
      raise exception 'Learners can see this test now. Set its session to draft first, then change the questions.';
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


-- Test names and descriptions: the teacher who owns the paper, admins, other staff (to run exam rooms and lists),
-- conductors of a session for it, and learners who can see a session for it. Before, any signed-in account could
-- read every test's name and description.
create or replace function public.exam_can_see_test(p_test uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or (coalesce(public.is_staff(), false) and public.current_role() <> 'teacher')
    or exists (select 1 from public.exam_tests t where t.id = p_test and t.created_by = auth.uid())
    or exists (select 1 from public.exam_test_sessions s where s.test_id = p_test and coalesce(public.can_conduct_session(s.id), false))
    or exists (select 1 from public.exam_test_sessions s where s.test_id = p_test and coalesce(public.can_student_view_session(s.id), false));
$$;
revoke all on function public.exam_can_see_test(uuid) from public, anon;
grant execute on function public.exam_can_see_test(uuid) to authenticated;

drop policy if exists exam_tests_student_select on public.exam_tests;
create policy exam_tests_student_select
  on public.exam_tests
  for select
  to authenticated
  using (coalesce(public.exam_can_see_test(id), false));
