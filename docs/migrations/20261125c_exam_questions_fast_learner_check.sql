-- Learners could not see their exam questions: the request timed out (25 Nov 2026). Safe to run twice.
--
-- Why: the read rule on exam_questions decided, for every question, whether the learner had an open session for the
-- test by joining exam_test_sessions, student_user_links and students inside the rule. Each of those tables has its
-- own read rules (with permission functions per row), so the check multiplied and ran past the website's statement
-- time limit ("canceling statement due to statement timeout"). The page showed "0 of 0 answered". In the SQL editor
-- (no time limit) the same check said yes, which hid the cause.
--
-- Fix: one security definer function per question does the learner check directly with indexed lookups and no
-- nested read rules. Same meaning as before: an approved test in an open session for the learner's class (or for
-- every class), within its dates; or a session whose results were released (questions and, for solutions, answers).

create or replace function public.learner_sees_test(p_test uuid, p_released_only boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_user_links sul
    join public.students st on st.id = sul.student_id
    join public.exam_test_sessions s
      on s.test_id = p_test
     and s.active = true
     and (s.class_id is null or s.class_id = st.class_id)
    where sul.user_id = auth.uid()
      and (
        s.results_released_at is not null
        or (
          not p_released_only
          and s.status = 'active'
          and (s.starts_at is null or s.starts_at <= now())
          and (s.ends_at is null or s.ends_at >= now())
          and exists (select 1 from public.exam_tests t where t.id = p_test and t.approval_status = 'approved')
        )
      )
  );
$$;

revoke all on function public.learner_sees_test(uuid, boolean) from public, anon;
grant execute on function public.learner_sees_test(uuid, boolean) to authenticated;

drop policy if exists exam_questions_student_select on public.exam_questions;
create policy exam_questions_student_select
  on public.exam_questions
  for select
  to authenticated
  using (
    coalesce(public.learner_sees_test(test_id), false)
    or coalesce(public.can_manage_test(test_id), false)
  );

drop policy if exists exam_question_solutions_student_select on public.exam_question_solutions;
create policy exam_question_solutions_student_select
  on public.exam_question_solutions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.exam_questions q
      where q.id = exam_question_solutions.question_id
        and (coalesce(public.learner_sees_test(q.test_id, true), false) or coalesce(public.can_manage_test(q.test_id), false))
    )
  );

create index if not exists exam_tests_id_approval_idx on public.exam_tests (id) where approval_status = 'approved';
