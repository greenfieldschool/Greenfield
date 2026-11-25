-- Exam pages were slow (15-20 s) and sometimes timed out ("This exam isn't available") (25 Nov 2026). Safe to run
-- twice. Same meaning as before; only faster.
--
-- Why: the read rules on exam sessions, tests, questions and attempts called permission functions (who is this:
-- staff? admin? conductor? which classes?) once for every row, and the learner rule joined other tables that have
-- their own rules. With ~100 sessions and ~200 tests that multiplied on every page.
-- Fix: the "who is asking" part is wrapped in (select …), which Postgres works out once per request, so a learner's
-- request skips the staff and conductor checks at once; the learner's own check is one security definer function.

-- Who is asking, worked out once per request.
create or replace function public.exam_viewer_kind()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.role::text in ('admin', 'super_admin') then 'admin'
    when p.role::text = 'teacher' then 'teacher'
    when p.role::text in ('front_desk', 'nurse') then 'staff'
    when exists (select 1 from public.exam_conductor_user_links l where l.user_id = auth.uid()) then 'conductor'
    when exists (select 1 from public.student_user_links sul where sul.user_id = auth.uid()) then 'learner'
    else 'other'
  end
  from (select 1) one
  left join public.profiles p on p.id = auth.uid();
$$;
revoke all on function public.exam_viewer_kind() from public, anon;
grant execute on function public.exam_viewer_kind() to authenticated;

-- A learner can see this session (open for their class and approved, or results released).
create or replace function public.learner_sees_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exam_test_sessions s
    join public.student_user_links sul on sul.user_id = auth.uid()
    join public.students st on st.id = sul.student_id
    where s.id = p_session
      and s.active = true
      and (s.class_id is null or s.class_id = st.class_id)
      and (
        s.results_released_at is not null
        or (
          s.status = 'active'
          and (s.starts_at is null or s.starts_at <= now())
          and (s.ends_at is null or s.ends_at >= now())
          and exists (select 1 from public.exam_tests t where t.id = s.test_id and t.approval_status = 'approved')
        )
      )
  );
$$;
revoke all on function public.learner_sees_session(uuid) from public, anon;
grant execute on function public.learner_sees_session(uuid) to authenticated;

-- Sessions
drop policy if exists exam_sessions_student_select on public.exam_test_sessions;
create policy exam_sessions_student_select on public.exam_test_sessions
  for select to authenticated
  using ((select public.exam_viewer_kind()) = 'learner' and public.learner_sees_session(id));

drop policy if exists exam_sessions_staff_select on public.exam_test_sessions;
create policy exam_sessions_staff_select on public.exam_test_sessions
  for select to authenticated
  using ((select public.exam_viewer_kind()) in ('admin', 'teacher', 'staff'));

drop policy if exists exam_sessions_manage on public.exam_test_sessions;
create policy exam_sessions_manage on public.exam_test_sessions
  for all to authenticated
  using ((select public.exam_viewer_kind()) in ('admin', 'teacher') and coalesce(public.can_schedule_test(test_id, class_id), false))
  with check ((select public.exam_viewer_kind()) in ('admin', 'teacher') and coalesce(public.can_schedule_test(test_id, class_id), false));

drop policy if exists exam_sessions_conductor_select on public.exam_test_sessions;
create policy exam_sessions_conductor_select on public.exam_test_sessions
  for select to authenticated
  using ((select public.exam_viewer_kind()) = 'conductor' and coalesce(public.can_conduct_session(id), false));

-- Tests (names and descriptions)
drop policy if exists exam_tests_student_select on public.exam_tests;
create policy exam_tests_student_select on public.exam_tests
  for select to authenticated
  using (
    case (select public.exam_viewer_kind())
      when 'admin' then true
      when 'staff' then true
      when 'teacher' then created_by = auth.uid()
      when 'conductor' then exists (select 1 from public.exam_test_sessions s where s.test_id = exam_tests.id and coalesce(public.can_conduct_session(s.id), false))
      when 'learner' then exists (select 1 from public.exam_test_sessions s where s.test_id = exam_tests.id and public.learner_sees_session(s.id))
      else false
    end
  );

-- Questions and answers: the learner check first, the staff check only for staff.
drop policy if exists exam_questions_student_select on public.exam_questions;
create policy exam_questions_student_select on public.exam_questions
  for select to authenticated
  using (
    case (select public.exam_viewer_kind())
      when 'learner' then coalesce(public.learner_sees_test(test_id), false)
      when 'admin' then true
      when 'teacher' then coalesce(public.can_manage_test(test_id), false)
      else false
    end
  );

drop policy if exists exam_question_solutions_student_select on public.exam_question_solutions;
create policy exam_question_solutions_student_select on public.exam_question_solutions
  for select to authenticated
  using (
    case (select public.exam_viewer_kind())
      when 'learner' then exists (select 1 from public.exam_questions q where q.id = exam_question_solutions.question_id and coalesce(public.learner_sees_test(q.test_id, true), false))
      when 'admin' then true
      when 'teacher' then exists (select 1 from public.exam_questions q where q.id = exam_question_solutions.question_id and coalesce(public.can_manage_test(q.test_id), false))
      else false
    end
  );

-- The "staff can change" rules also run on every read; only admins and teachers get past the first check.
drop policy if exists exam_questions_staff_all on public.exam_questions;
create policy exam_questions_staff_all on public.exam_questions
  for all to authenticated
  using ((select public.exam_viewer_kind()) in ('admin', 'teacher') and coalesce(public.can_manage_test(test_id), false))
  with check ((select public.exam_viewer_kind()) in ('admin', 'teacher') and coalesce(public.can_manage_test(test_id), false));

drop policy if exists exam_question_solutions_staff_all on public.exam_question_solutions;
create policy exam_question_solutions_staff_all on public.exam_question_solutions
  for all to authenticated
  using (
    (select public.exam_viewer_kind()) in ('admin', 'teacher')
    and exists (select 1 from public.exam_questions q where q.id = exam_question_solutions.question_id and coalesce(public.can_manage_test(q.test_id), false))
  )
  with check (
    (select public.exam_viewer_kind()) in ('admin', 'teacher')
    and exists (select 1 from public.exam_questions q where q.id = exam_question_solutions.question_id and coalesce(public.can_manage_test(q.test_id), false))
  );

drop policy if exists exam_tests_staff_all on public.exam_tests;
create policy exam_tests_staff_all on public.exam_tests
  for all to authenticated
  using (
    (select public.exam_viewer_kind()) = 'admin'
    or ((select public.exam_viewer_kind()) = 'teacher' and created_by = auth.uid())
  )
  with check (
    (select public.exam_viewer_kind()) = 'admin'
    or ((select public.exam_viewer_kind()) = 'teacher' and created_by = auth.uid() and public.teacher_teaches_subject(subject_id))
  );
