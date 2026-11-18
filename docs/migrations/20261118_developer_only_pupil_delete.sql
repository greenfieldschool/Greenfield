-- Permanent deletion of pupil records: developers only
--
-- What this does, in plain words:
-- The school's rule (Nov 2026): only the developers may permanently delete a pupil record. Admins can still
-- deactivate (which hides a record everywhere and can be undone). For a duplicate or test record with nothing
-- attached, an admin can ASK for it to be deleted, saying why. A developer then approves or rejects the request from
-- the Supabase SQL editor (which only developers can open):
--   select id, student_name, admission_number, reason, requested_by_name, requested_at
--   from student_delete_requests where status = 'pending';
--   select public.approve_student_delete('<request id>', 'Developer name', 'optional note');
--   select public.reject_student_delete('<request id>', 'Developer name', 'why, in words the school understands');
-- Every request, withdrawal, approval and rejection is in the deactivation log with who did it.
--
-- Run AFTER 20261117b_single_source_fixes.sql. It replaces student_usage with an admin-only wrapper around
-- student_usage_unchecked (the one skip list); later migrations change student_usage_unchecked. Safe to run twice.
-- The SQL editor may warn about "destructive operations": that is the
-- `drop … if exists` lines that replace older versions. Expected.

-- ---------------------------------------------------------------------------------------------------------------

-- The deactivation log records the new steps too.
alter table public.student_status_log drop constraint if exists student_status_log_action_check;
alter table public.student_status_log add constraint student_status_log_action_check
  check (action in ('deactivated', 'reactivated', 'deleted', 'delete_requested', 'delete_request_withdrawn', 'delete_rejected'));

create table if not exists public.student_delete_requests (
  id uuid primary key default gen_random_uuid(),
  -- Cleared when the record is deleted; the name and number below keep the request readable.
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  admission_number text,
  deactivation_reason text,
  reason text not null check (length(trim(reason)) >= 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decided_by_name text,
  decision_note text,
  decided_at timestamptz,
  constraint student_delete_requests_decided check ((status = 'pending') = (decided_at is null))
);
-- One waiting request per pupil.
create unique index if not exists student_delete_requests_one_pending
  on public.student_delete_requests (student_id) where status = 'pending';
create index if not exists student_delete_requests_requested_idx on public.student_delete_requests (requested_at desc);

alter table public.student_delete_requests enable row level security;
drop policy if exists student_delete_requests_admin_read on public.student_delete_requests;
create policy student_delete_requests_admin_read on public.student_delete_requests
  for select to authenticated using (coalesce(public.is_admin(), false));
revoke insert, update, delete on public.student_delete_requests from anon, authenticated;

-- What is attached to a pupil record, by table. One copy of the counting and the skip list, used by the admin screen
-- (student_usage, admins only) and by the developer's approval (which runs with no signed-in user, so the admin check
-- in student_usage would return nothing and let anything through).
-- Skipped: links and history that don't make a record "in use": parents, sign-in links, notifications, the
-- deactivation log, the account log (keeps its own name snapshot) and delete requests.
create or replace function public.student_usage_unchecked(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  n bigint;
  out jsonb := '{}'::jsonb;
begin
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.students'::regclass
      and array_length(c.conkey, 1) = 1
      and c.conrelid <> 'public.students'::regclass
  loop
    if replace(r.tbl, 'public.', '') in ('student_guardians', 'student_user_links', 'student_status_log', 'notifications',
                                         'account_log', 'student_delete_requests') then
      continue;
    end if;
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into n using p_student;
    if n > 0 then
      out := out || jsonb_build_object(replace(r.tbl, 'public.', ''), coalesce((out ->> replace(r.tbl, 'public.', ''))::bigint, 0) + n);
    end if;
  end loop;
  return out;
end;
$$;
revoke all on function public.student_usage_unchecked(uuid) from public, anon, authenticated;

create or replace function public.student_usage(p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    return null;
  end if;
  return public.student_usage_unchecked(p_student);
end;
$$;
revoke all on function public.student_usage(uuid) from public, anon;
grant execute on function public.student_usage(uuid) to authenticated;

-- Why a record can't be deleted, or NULL when it can. Shared by the request and the approval (checked again then,
-- because something may have been attached in between).
create or replace function public.student_delete_problem(p_student uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
  usage jsonb;
begin
  select * into s from public.students where id = p_student;
  if not found then
    return 'This pupil record no longer exists.';
  end if;
  if s.status::text <> 'inactive' or coalesce(s.deactivation_reason, '') not in ('duplicate', 'test_record') then
    return 'Only records deactivated as a duplicate or a test record can be deleted. Deactivate it first.';
  end if;
  usage := public.student_usage_unchecked(p_student);
  if usage <> '{}'::jsonb then
    return 'This record has results, fees, attendance or other records attached, so it stays deactivated instead of being deleted.';
  end if;
  return null;
end;
$$;
revoke all on function public.student_delete_problem(uuid) from public, anon, authenticated;

-- Admins: ask the developers to delete a record.
create or replace function public.request_student_delete(p_student uuid, p_confirm_name text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_name text;
  v_problem text;
  v_id uuid;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can ask for a pupil record to be deleted.';
  end if;
  v_problem := public.student_delete_problem(p_student);
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;
  select * into s from public.students where id = p_student;
  v_name := trim(concat_ws(' ', s.first_name, s.last_name));
  if lower(regexp_replace(trim(coalesce(p_confirm_name, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(v_name, '\s+', ' ', 'g')) then
    raise exception 'Type the pupil''s name exactly as shown to confirm.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Say why it should be deleted, so the developers can check.';
  end if;
  if exists (select 1 from public.student_delete_requests where student_id = p_student and status = 'pending') then
    raise exception 'The developers have already been asked to delete this record.';
  end if;

  insert into public.student_delete_requests
    (student_id, student_name, admission_number, deactivation_reason, reason, requested_by, requested_by_name)
  values
    (p_student, v_name, s.admission_number, s.deactivation_reason, trim(p_reason), auth.uid(), public.student_log_actor_name())
  returning id into v_id;

  insert into public.student_status_log
    (student_id, student_name, admission_number, action, reason, reason_other, status_from, status_to, done_by, done_by_name)
  values
    (p_student, v_name, s.admission_number, 'delete_requested', s.deactivation_reason, left(trim(p_reason), 500),
     s.status::text, s.status::text, auth.uid(), public.student_log_actor_name());
  return v_id;
end;
$$;
revoke all on function public.request_student_delete(uuid, text, text) from public, anon;
grant execute on function public.request_student_delete(uuid, text, text) to authenticated;

-- Admins: withdraw a waiting request.
create or replace function public.withdraw_student_delete_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.student_delete_requests;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can do this.';
  end if;
  update public.student_delete_requests
     set status = 'withdrawn', decided_at = now(), decided_by_name = public.student_log_actor_name(), decision_note = 'Withdrawn by the school'
   where id = p_request and status = 'pending'
  returning * into r;
  if r.id is null then
    raise exception 'That request is no longer waiting.';
  end if;
  insert into public.student_status_log
    (student_id, student_name, admission_number, action, reason, done_by, done_by_name)
  values
    (r.student_id, r.student_name, r.admission_number, 'delete_request_withdrawn', r.deactivation_reason, auth.uid(), public.student_log_actor_name());
end;
$$;
revoke all on function public.withdraw_student_delete_request(uuid) from public, anon;
grant execute on function public.withdraw_student_delete_request(uuid) to authenticated;

-- Developers only (SQL editor): delete the record. No grants; refuses any signed-in caller.
create or replace function public.approve_student_delete(p_request uuid, p_developer text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.student_delete_requests;
  s record;
  v_problem text;
  v_dev text := trim(coalesce(p_developer, ''));
begin
  if auth.uid() is not null then
    raise exception 'Only the developers can permanently delete a pupil record, from the database itself.';
  end if;
  if length(v_dev) < 2 then
    raise exception 'Give your name as the developer approving it.';
  end if;
  select * into r from public.student_delete_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then
    raise exception 'That request is not waiting for a decision.';
  end if;
  select * into s from public.students where id = r.student_id for update;
  v_problem := public.student_delete_problem(r.student_id);
  if v_problem is not null then
    raise exception 'Not deleted: %', v_problem;
  end if;

  update public.student_delete_requests
     set status = 'approved', decided_at = now(), decided_by_name = v_dev || ' (developer)', decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = r.id;

  insert into public.student_status_log
    (student_id, student_name, admission_number, action, reason, reason_other, kept_student_id, status_from, status_to, done_by, done_by_name)
  values
    (null, r.student_name, s.admission_number, 'deleted', s.deactivation_reason,
     'Asked by ' || coalesce(r.requested_by_name, 'an admin') || ': ' || r.reason, s.duplicate_of,
     s.status::text, null, null, v_dev || ' (developer)');

  delete from public.students where id = r.student_id;
  return 'Deleted ' || r.student_name || coalesce(' (' || s.admission_number || ')', '') || '.';
end;
$$;
revoke all on function public.approve_student_delete(uuid, text, text) from public, anon, authenticated, service_role;

create or replace function public.reject_student_delete(p_request uuid, p_developer text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.student_delete_requests;
  v_dev text := trim(coalesce(p_developer, 'Developer'));
begin
  if auth.uid() is not null then
    raise exception 'Only the developers can decide on deleting a pupil record, from the database itself.';
  end if;
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Say why, so the school knows what to do next.';
  end if;
  update public.student_delete_requests
     set status = 'rejected', decided_at = now(), decided_by_name = v_dev || ' (developer)', decision_note = trim(p_note)
   where id = p_request and status = 'pending'
  returning * into r;
  if r.id is null then
    raise exception 'That request is not waiting for a decision.';
  end if;
  insert into public.student_status_log
    (student_id, student_name, admission_number, action, reason, reason_other, done_by, done_by_name)
  values
    (r.student_id, r.student_name, r.admission_number, 'delete_rejected', r.deactivation_reason, trim(p_note), null, v_dev || ' (developer)');
end;
$$;
revoke all on function public.reject_student_delete(uuid, text, text) from public, anon, authenticated, service_role;

-- The old direct delete is switched off for the website. It stays defined so anything still calling it gets a clear
-- message instead of "function not found".
create or replace function public.delete_student(p_student uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Only the developers can permanently delete a pupil record. Use "Ask the developers to delete" on the pupil''s page.';
end;
$$;
revoke all on function public.delete_student(uuid, text) from public, anon;
grant execute on function public.delete_student(uuid, text) to authenticated;
