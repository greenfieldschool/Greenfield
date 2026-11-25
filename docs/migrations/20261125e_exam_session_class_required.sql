-- Every exam session must be for one class (25 Nov 2026). Safe to run twice.
--
-- Why: a session with no class was open to every learner in the school, so a JS2 paper could be opened by a Year 5
-- learner. Sessions were being scheduled without a class by mistake (10 were open that way on 25 Nov).
-- Decided by the user: a class is required, and existing sessions without one are hidden from learners until an
-- admin picks the class (they come back as soon as it is set). A paper for several classes gets one session each.
--
-- 1. New sessions, and changes to a session's class, must name a class. A trigger rather than a check constraint
--    so that old sessions with no class can still be released, closed or handed in by the school's own functions.
-- 2. Every learner check now needs the session's class to be the learner's class ("no class" no longer means
--    "every class").

create or replace function public.exam_sessions_need_class()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.class_id is null and (tg_op = 'INSERT' or old.class_id is not null) then
    raise exception 'Choose the class that sits this exam.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists exam_sessions_need_class on public.exam_test_sessions;
create trigger exam_sessions_need_class
  before insert or update of class_id on public.exam_test_sessions
  for each row execute function public.exam_sessions_need_class();

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
      and s.class_id = st.class_id
      and s.results_released_at is not null
  );
$$;

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
      and s.class_id = st.class_id
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
      and s.class_id = st.class_id
      and (s.starts_at is null or s.starts_at <= now())
      and (s.ends_at is null or s.ends_at >= now())
  );
$$;

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
   and s.class_id = st.class_id
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
     and s.class_id = st.class_id
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
      and s.class_id = st.class_id
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

-- After running: the sessions that now need a class (admins set it under Exams > Sessions).
select s.id, t.name as test, s.status, s.starts_at, s.ends_at
from public.exam_test_sessions s
left join public.exam_tests t on t.id = s.test_id
where s.class_id is null and s.active
order by s.ends_at desc nulls first;
