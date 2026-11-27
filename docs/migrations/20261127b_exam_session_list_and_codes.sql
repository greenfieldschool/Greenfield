-- Exam sessions: who sees which session, its name and class, and its secret code (issue13, 27 Nov 2026).
-- Safe to run twice. Run AFTER 20261127_exam_unapprove.sql, and AFTER the matching code is live (the session pages
-- stop reading secret_code directly; old pages would fail once the column is hidden).
--
-- Why: since papers became private (20261125), teachers could read every session in the school but only the names
-- of their own papers and classes, so their Sessions list showed ID codes and "Another class". Nobody running a room
-- could see the secret code, yet every signed-in account that could read a session row (learners included, for their
-- own open session) could read its code straight from the database.
--
-- Decided with the user (27 Nov 2026):
-- 1. A teacher sees the sessions of their own papers, of classes where they are class teacher, of the subjects they
--    teach in a class, and of rooms they conduct. Admins and other staff see all, as before.
-- 2. exam_session_details(sessions[]) gives the paper's name, subject and class for each session the caller can see,
--    and the secret code only to admins, the teacher who owns the paper, and that session's conductors.
-- 3. The secret_code column can no longer be read directly by anyone signed in (it can still be written by those
--    who may change the session). start_exam_attempt checks the code inside the database as before.

-- ---------------------------------------------------------------------------------------------------------------

-- 1. Which sessions a teacher sees.
create or replace function public.teacher_sees_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.exam_test_sessions s
    join public.exam_tests t on t.id = s.test_id
    where s.id = p_session
      and (
        t.created_by = auth.uid()
        or (s.class_id is not null and coalesce(public.teacher_has_class(s.class_id), false))
        or (s.class_id is not null and coalesce(public.teacher_teaches(s.class_id, t.subject_id), false))
        or coalesce(public.can_conduct_session(s.id), false)
      )
  );
$$;
revoke all on function public.teacher_sees_session(uuid) from public, anon;
grant execute on function public.teacher_sees_session(uuid) to authenticated;

drop policy if exists exam_sessions_staff_select on public.exam_test_sessions;
create policy exam_sessions_staff_select on public.exam_test_sessions
  for select to authenticated
  using (
    case (select public.exam_viewer_kind())
      when 'admin' then true
      when 'staff' then true
      when 'teacher' then public.teacher_sees_session(id)
      else false
    end
  );

-- 2. Names, class and (for the right people) the secret code.
drop function if exists public.exam_session_details(uuid[]);
create or replace function public.exam_session_details(p_sessions uuid[])
returns table (
  session_id uuid,
  test_name text,
  subject_name text,
  class_level text,
  class_name text,
  secret_code text,
  can_change boolean,
  approved boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text := public.exam_viewer_kind();
  v_admin boolean := coalesce(public.is_admin(), false);
begin
  if p_sessions is null or cardinality(p_sessions) = 0 then
    return;
  end if;
  if cardinality(p_sessions) > 500 then
    raise exception 'Ask for 500 sessions or fewer at a time.';
  end if;
  return query
  select s.id,
         t.name,
         sub.name,
         c.level::text,
         c.name,
         case
           when v_admin or t.created_by = auth.uid() or coalesce(public.can_conduct_session(s.id), false) then s.secret_code
         end,
         v_admin or (v_kind = 'teacher' and coalesce(public.can_schedule_test(s.test_id, s.class_id), false)),
         t.approval_status = 'approved'
  from public.exam_test_sessions s
  join public.exam_tests t on t.id = s.test_id
  left join public.subjects sub on sub.id = t.subject_id
  left join public.classes c on c.id = s.class_id
  where s.id = any(p_sessions)
    and case v_kind
          when 'admin' then true
          when 'staff' then true
          when 'teacher' then public.teacher_sees_session(s.id)
          when 'conductor' then coalesce(public.can_conduct_session(s.id), false)
          else false
        end;
end;
$$;
revoke all on function public.exam_session_details(uuid[]) from public, anon;
grant execute on function public.exam_session_details(uuid[]) to authenticated;

-- 3. Hide the secret_code column from direct reads. A column can only be hidden by granting select on every other
--    column, so a column added later needs its own "grant select (col)" (see the cbt-exams skill).
revoke select on public.exam_test_sessions from anon, authenticated;
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'exam_test_sessions' and column_name <> 'secret_code';
  execute format('grant select (%s) on public.exam_test_sessions to authenticated', v_cols);
end;
$$;
