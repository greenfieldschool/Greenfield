-- Student exam list: fast, single-call lookup
--
-- The portal Exams page used to read exam_test_sessions directly under the student RLS policy. On some
-- databases that policy still calls public.can_student_view_session(), which itself reads
-- exam_test_sessions (and so re-enters the policy for every row). The page then hit its timeout and
-- showed "Exams temporarily unavailable — timeout" with no sessions listed.
--
-- 1. portal_student_exam_sessions() returns the sessions the signed-in student can sit right now, with
--    the test name, duration and class, in one call. It runs as security definer and applies the same
--    rules as the RLS policy (active, status = 'active', inside the date window, class matches or blank).
-- 2. The student select policies on exam_test_sessions, exam_questions and exam_question_solutions are
--    re-created in their inlined, non-recursive form (same as 20260310_exam_session_performance.sql) in
--    case that migration was never applied. Re-running is harmless.

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
    s.id,
    s.test_id,
    t.name as test_name,
    t.duration_minutes,
    s.class_id,
    c.level::text as class_level,
    c.name as class_name,
    s.starts_at,
    s.ends_at,
    s.requires_secret_code
  from public.student_user_links sul
  join public.students st on st.id = sul.student_id
  join public.exam_test_sessions s
    on s.active = true
   and s.status = 'active'
   and (s.class_id is null or s.class_id = st.class_id)
   and (s.starts_at is null or s.starts_at <= now())
   and (s.ends_at is null or s.ends_at >= now())
  join public.exam_tests t on t.id = s.test_id
  left join public.classes c on c.id = s.class_id
  where sul.user_id = auth.uid()
  order by s.starts_at desc nulls last, t.name
  limit 100;
$$;

revoke all on function public.portal_student_exam_sessions() from public;
grant execute on function public.portal_student_exam_sessions() to authenticated;

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
          (exam_test_sessions.status = 'active'
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
    public.is_staff()
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

-- For exam_question_solutions: Inline the check instead of function call
drop policy if exists exam_question_solutions_student_select on public.exam_question_solutions;
create policy exam_question_solutions_student_select
  on public.exam_question_solutions
  for select
  to authenticated
  using (
    public.is_staff()
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

create index if not exists student_user_links_user_id_idx on public.student_user_links(user_id);
