-- A session that needs a secret code must have one (27 Nov 2026). Safe to run twice.
-- Run AFTER 20261127b_exam_session_list_and_codes.sql.
--
-- Why: "Require secret code to start" could be ticked with the code box left empty. Then nothing a learner types
-- matches (start_exam_attempt compares with an empty code), so nobody can start the exam. 9 sessions were like that
-- on 27 Nov 2026, 7 of them open to learners.
--
-- 1. Trigger exam_sessions_need_code: a new session, or a change to its code settings, that needs a code must have
--    one. Existing sessions are left as they are until someone edits them (the list flags them).
-- 2. exam_session_details() also returns code_set, so anyone who can see a session (not only those allowed to see
--    the code) can tell "no code set: learners can't start" from "code hidden".

-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.exam_sessions_need_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.requires_secret_code, false) and nullif(btrim(coalesce(new.secret_code, '')), '') is null then
    raise exception 'Type the secret code learners will use, or untick ''Require secret code to start''.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists exam_sessions_need_code on public.exam_test_sessions;
create trigger exam_sessions_need_code
  before insert or update of requires_secret_code, secret_code on public.exam_test_sessions
  for each row execute function public.exam_sessions_need_code();

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
  approved boolean,
  code_set boolean
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
         t.approval_status = 'approved',
         nullif(btrim(coalesce(s.secret_code, '')), '') is not null
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

-- Sessions that still need a code set (open each one under Exams > Sessions and type a code, or untick the box):
select s.id, t.name as test, c.name as class, s.status, s.starts_at, s.ends_at
from public.exam_test_sessions s
join public.exam_tests t on t.id = s.test_id
left join public.classes c on c.id = s.class_id
where s.active and s.requires_secret_code and nullif(btrim(coalesce(s.secret_code, '')), '') is null
order by s.starts_at nulls first;
