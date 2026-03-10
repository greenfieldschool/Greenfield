-- Migration: Optimize exam session performance to fix CPU overload
-- Date: 2026-03-10
-- Issue: RLS policies calling expensive per-row functions causing N+1 query problems

-- =============================================================================
-- 1. ADD MISSING INDEXES for RLS policy lookups
-- =============================================================================

-- Index for student_user_links lookups (used by current_student_id)
create index if not exists student_user_links_user_id_idx 
  on public.student_user_links(user_id);

-- Index for exam_conductor_user_links lookups (used by is_exam_conductor, can_conduct_session)
create index if not exists exam_conductor_user_links_user_id_idx 
  on public.exam_conductor_user_links(user_id);

-- Index for exam_session_conductors lookups
create index if not exists exam_session_conductors_conductor_id_idx 
  on public.exam_session_conductors(conductor_id);

-- Composite index for exam_test_sessions RLS checks
create index if not exists exam_test_sessions_active_status_idx 
  on public.exam_test_sessions(active, status) 
  where active = true;

-- Index for exam_test_sessions class lookups
create index if not exists exam_test_sessions_class_active_idx 
  on public.exam_test_sessions(class_id, active) 
  where active = true;

-- Index for exam_attempts session lookups
create index if not exists exam_attempts_session_student_idx 
  on public.exam_attempts(session_id, student_id);

-- Index for profiles role lookups (used by is_staff)
create index if not exists profiles_id_role_idx 
  on public.profiles(id, role);

-- =============================================================================
-- 2. OPTIMIZE current_student_id() - use immutable caching pattern
-- =============================================================================

-- The original function is called multiple times per request.
-- We mark it as STABLE which allows PostgreSQL to cache the result within a statement.
-- Already marked stable, but ensure it's optimized.

create or replace function public.current_student_id() returns uuid
language sql stable parallel safe
as $$
  select sul.student_id
  from public.student_user_links sul
  where sul.user_id = auth.uid()
  limit 1;
$$;

-- =============================================================================
-- 3. OPTIMIZE can_student_access_session() - inline the student lookup
-- =============================================================================

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
      and (s.class_id is null or s.class_id = st.class_id)
      and (s.starts_at is null or s.starts_at <= now())
      and (s.ends_at is null or s.ends_at >= now())
  );
$$;

-- =============================================================================
-- 4. OPTIMIZE can_student_view_session_results() - inline the student lookup
-- =============================================================================

create or replace function public.can_student_view_session_results(session_uuid uuid) returns boolean
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
      and s.results_released_at is not null
  );
$$;

-- =============================================================================
-- 5. OPTIMIZE can_student_view_session() - combine both checks in single query
-- =============================================================================

-- This is the MAIN performance fix. Instead of calling two separate functions,
-- we combine both access checks into a single query with OR conditions.

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
        -- can_student_access_session conditions
        (
          s.status = 'active'
          and (s.starts_at is null or s.starts_at <= now())
          and (s.ends_at is null or s.ends_at >= now())
        )
        or
        -- can_student_view_session_results conditions
        s.results_released_at is not null
      )
  );
$$;

-- =============================================================================
-- 6. OPTIMIZE can_conduct_session() - add parallel safe
-- =============================================================================

create or replace function public.can_conduct_session(session_uuid uuid) returns boolean
language sql stable parallel safe
as $$
  select exists(
    select 1
    from public.exam_conductor_user_links l
    inner join public.exam_session_conductors sc on sc.conductor_id = l.conductor_id
    where l.user_id = auth.uid()
      and sc.session_id = session_uuid
  );
$$;

-- =============================================================================
-- 7. OPTIMIZE is_staff() - ensure it's optimized
-- =============================================================================

create or replace function public.is_staff() returns boolean
language sql stable parallel safe
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin', 'admin', 'teacher', 'front_desk', 'nurse')
  );
$$;

-- =============================================================================
-- 8. OPTIMIZE is_exam_conductor() - add parallel safe
-- =============================================================================

create or replace function public.is_exam_conductor() returns boolean
language sql stable parallel safe
as $$
  select exists(
    select 1
    from public.exam_conductor_user_links l
    where l.user_id = auth.uid()
  );
$$;

-- =============================================================================
-- 9. RECREATE RLS POLICIES with optimized checks
-- =============================================================================

-- For exam_questions: Instead of calling can_student_view_session for each question,
-- we use a more efficient subquery that checks session access once per test_id

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

-- For exam_test_sessions: Inline the student check
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
          (exam_test_sessions.status = 'active' and (exam_test_sessions.starts_at is null or exam_test_sessions.starts_at <= now()) and (exam_test_sessions.ends_at is null or exam_test_sessions.ends_at >= now()))
          or exam_test_sessions.results_released_at is not null
        )
    )
  );

-- For exam_attempts conductor policies: Inline the check
drop policy if exists exam_attempts_conductor_select on public.exam_attempts;
create policy exam_attempts_conductor_select
  on public.exam_attempts
  for select
  to authenticated
  using (
    exists(
      select 1
      from public.exam_conductor_user_links l
      inner join public.exam_session_conductors sc on sc.conductor_id = l.conductor_id
      where l.user_id = auth.uid()
        and sc.session_id = exam_attempts.session_id
    )
  );

drop policy if exists exam_attempts_conductor_unlock on public.exam_attempts;
create policy exam_attempts_conductor_unlock
  on public.exam_attempts
  for update
  to authenticated
  using (
    exists(
      select 1
      from public.exam_conductor_user_links l
      inner join public.exam_session_conductors sc on sc.conductor_id = l.conductor_id
      where l.user_id = auth.uid()
        and sc.session_id = exam_attempts.session_id
    )
  )
  with check (
    exists(
      select 1
      from public.exam_conductor_user_links l
      inner join public.exam_session_conductors sc on sc.conductor_id = l.conductor_id
      where l.user_id = auth.uid()
        and sc.session_id = exam_attempts.session_id
    )
  );

-- =============================================================================
-- 10. ANALYZE tables to update statistics for query planner
-- =============================================================================

analyze public.student_user_links;
analyze public.exam_conductor_user_links;
analyze public.exam_session_conductors;
analyze public.exam_test_sessions;
analyze public.exam_attempts;
analyze public.exam_questions;
analyze public.exam_question_solutions;
analyze public.profiles;
