-- Deactivating pupils, with a reason (issue 11)
--
-- The school asked for a way to take duplicate and test pupil records out of the official list, admins only,
-- with a confirmation, and with the reason chosen from a list (Other = the only free text).
--
-- What this adds:
-- 1. A new pupil status "inactive" (duplicates, test records and other reasons). Leavers keep the existing
--    statuses: Left the school = withdrawn, Moved to another school = transferred, Graduated = graduated.
-- 2. Columns on students recording why, when, by whom, the status before, and (for duplicates) the record kept.
-- 3. student_status_log: every deactivation, reactivation and permanent delete, with the reason. It keeps the
--    pupil's name and admission number so a deleted record still shows in the log.
-- 4. deactivate_student(...), reactivate_student(...), student_usage(...) and delete_student(...): admins only.
--    - Duplicate: the record kept must be another pupil who is not deactivated; the duplicate's parents are also
--      linked to the record kept so no family loses access. Results are NOT moved: results are locked once final
--      and every change is audited, so the duplicate keeps its own and is simply hidden.
--    - Permanent delete only for a record that is already deactivated as a duplicate or test record and has
--      nothing attached (no results, fees, attendance, exams, welfare, assignments …).
-- 5. A deactivated record (duplicate, test record, other) also leaves its class, so it drops off class lists,
--    registers, result sheets and report cards everywhere; the class is remembered and restored on reactivation.
--    Leavers keep their class, so past report cards still include them. Parents no longer see a deactivated
--    record in the portal (students_parent_select).
-- 6. A guard: a pupil's status can only move to or from graduated / withdrawn / transferred / inactive through
--    these functions, so a reason is always recorded. Joining (applied → enrolled → active) is unchanged.
--
-- Run AFTER 20261113_record_who_did_what.sql. Run the whole file once in the Supabase SQL editor; re-running is
-- harmless. The editor may warn about "destructive operations": those are the `drop … if exists` lines that
-- replace an older copy of a trigger or policy, nothing is deleted.

alter type public.student_status add value if not exists 'inactive';

-- ---------------------------------------------------------------------------------------------------------------

alter table public.students add column if not exists deactivation_reason text;
alter table public.students add column if not exists deactivation_note text;
alter table public.students add column if not exists deactivated_at timestamptz;
alter table public.students add column if not exists deactivated_by uuid references auth.users(id) on delete set null;
alter table public.students add column if not exists status_before_deactivation text;
alter table public.students add column if not exists duplicate_of uuid references public.students(id) on delete set null;
alter table public.students add column if not exists class_before_deactivation uuid;

alter table public.students drop constraint if exists students_deactivation_reason_check;
alter table public.students add constraint students_deactivation_reason_check
  check (deactivation_reason is null or deactivation_reason in ('duplicate','test_record','left_school','transferred','graduated','other'));

create table if not exists public.student_status_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  admission_number text,
  action text not null check (action in ('deactivated','reactivated','deleted')),
  reason text check (reason is null or reason in ('duplicate','test_record','left_school','transferred','graduated','other')),
  reason_other text,
  kept_student_id uuid references public.students(id) on delete set null,
  status_from text,
  status_to text,
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists student_status_log_student_idx on public.student_status_log(student_id, created_at desc);
create index if not exists student_status_log_created_idx on public.student_status_log(created_at desc);

alter table public.student_status_log enable row level security;
drop policy if exists student_status_log_admin_read on public.student_status_log;
create policy student_status_log_admin_read on public.student_status_log
  for select to authenticated using (coalesce(public.is_admin(), false));
revoke insert, update, delete on public.student_status_log from anon, authenticated;

-- Parents see their children, except records deactivated as duplicates, test records or other.
drop policy if exists "students_parent_select" on public.students;
create policy "students_parent_select"
  on public.students
  for select
  to authenticated
  using (
    students.status::text <> 'inactive'
    and exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = students.id
    )
  );

-- Guard: leaving or re-joining only through the functions below (they set app.student_status_change).
create or replace function public.students_guard_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status
    and (old.status::text in ('graduated','withdrawn','transferred','inactive')
         or new.status::text in ('graduated','withdrawn','transferred','inactive'))
    and coalesce(current_setting('app.student_status_change', true), '') <> 'on' then
    raise exception 'To mark a pupil as left, graduated or inactive (or bring them back), use Deactivate / Reactivate on the pupil''s page so the reason is recorded.';
  end if;
  return new;
end;
$$;

drop trigger if exists students_guard_status on public.students;
create trigger students_guard_status
  before update of status on public.students
  for each row execute function public.students_guard_status();

-- Who is doing it, for the log.
create or replace function public.student_log_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(full_name), ''), email, 'Admin') from public.profiles where id = auth.uid();
$$;
revoke all on function public.student_log_actor_name() from public, anon, authenticated;

create or replace function public.deactivate_student(
  p_student uuid,
  p_reason text,
  p_other text default null,
  p_kept uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  k record;
  v_to text;
  v_other text := nullif(trim(coalesce(p_other, '')), '');
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can deactivate pupils';
  end if;
  if p_reason is null or p_reason not in ('duplicate','test_record','left_school','transferred','graduated','other') then
    raise exception 'Choose a reason from the list';
  end if;
  if p_reason = 'other' and v_other is null then
    raise exception 'Type the reason when you choose Other';
  end if;
  if p_reason <> 'other' then
    v_other := null;
  end if;

  select * into s from public.students where id = p_student for update;
  if not found then
    raise exception 'This pupil record no longer exists';
  end if;
  if s.deactivated_at is not null or s.status::text in ('graduated','withdrawn','transferred','inactive') then
    raise exception 'This pupil is already marked as %. Reactivate them first to change the reason.', s.status::text;
  end if;

  if p_reason = 'duplicate' then
    if p_kept is null then
      raise exception 'Choose the record to keep';
    end if;
    if p_kept = p_student then
      raise exception 'Choose a different record to keep';
    end if;
    select * into k from public.students where id = p_kept;
    if not found then
      raise exception 'The record to keep no longer exists';
    end if;
    if k.deactivated_at is not null or k.status::text in ('graduated','withdrawn','transferred','inactive') then
      raise exception 'The record to keep is itself deactivated. Choose the pupil''s current record.';
    end if;
    -- The family keeps access through the record kept.
    insert into public.student_guardians (student_id, guardian_id, relationship, is_primary)
    select p_kept, sg.guardian_id, sg.relationship, false
    from public.student_guardians sg
    where sg.student_id = p_student
    on conflict do nothing;
  else
    p_kept := null;
  end if;

  v_to := case p_reason
    when 'left_school' then 'withdrawn'
    when 'transferred' then 'transferred'
    when 'graduated' then 'graduated'
    else 'inactive'
  end;

  perform set_config('app.student_status_change', 'on', true);
  update public.students
     set status = v_to::public.student_status,
         status_before_deactivation = s.status::text,
         class_id = case when v_to = 'inactive' then null else s.class_id end,
         class_before_deactivation = case when v_to = 'inactive' then s.class_id else null end,
         deactivation_reason = p_reason,
         deactivation_note = v_other,
         deactivated_at = now(),
         deactivated_by = auth.uid(),
         duplicate_of = p_kept
   where id = p_student;
  perform set_config('app.student_status_change', 'off', true);

  insert into public.student_status_log
    (student_id, student_name, admission_number, action, reason, reason_other, kept_student_id, status_from, status_to, done_by, done_by_name)
  values
    (p_student, trim(concat_ws(' ', s.first_name, s.last_name)), s.admission_number, 'deactivated', p_reason, v_other,
     p_kept, s.status::text, v_to, auth.uid(), public.student_log_actor_name());
end;
$$;

revoke all on function public.deactivate_student(uuid, text, text, uuid) from public, anon;
grant execute on function public.deactivate_student(uuid, text, text, uuid) to authenticated;

create or replace function public.reactivate_student(p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_to text;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can reactivate pupils';
  end if;
  select * into s from public.students where id = p_student for update;
  if not found then
    raise exception 'This pupil record no longer exists';
  end if;
  if s.status::text not in ('graduated','withdrawn','transferred','inactive') then
    raise exception 'This pupil is not deactivated';
  end if;

  v_to := coalesce(nullif(s.status_before_deactivation, ''), 'active');
  if v_to in ('graduated','withdrawn','transferred','inactive') then
    v_to := 'active';
  end if;

  perform set_config('app.student_status_change', 'on', true);
  update public.students
     set status = v_to::public.student_status,
         class_id = case
           when s.class_before_deactivation is not null
                and exists (select 1 from public.classes c where c.id = s.class_before_deactivation)
             then s.class_before_deactivation
           else s.class_id
         end,
         class_before_deactivation = null,
         status_before_deactivation = null,
         deactivation_reason = null,
         deactivation_note = null,
         deactivated_at = null,
         deactivated_by = null,
         duplicate_of = null
   where id = p_student;
  perform set_config('app.student_status_change', 'off', true);

  insert into public.student_status_log
    (student_id, student_name, admission_number, action, reason, reason_other, status_from, status_to, done_by, done_by_name)
  values
    (p_student, trim(concat_ws(' ', s.first_name, s.last_name)), s.admission_number, 'reactivated',
     s.deactivation_reason, s.deactivation_note, s.status::text, v_to, auth.uid(), public.student_log_actor_name());
end;
$$;

revoke all on function public.reactivate_student(uuid) from public, anon;
grant execute on function public.reactivate_student(uuid) to authenticated;

-- What is attached to a pupil record, table by table (every table that points at students), except links that
-- only set the record up: parents, the pupil's own login, automatic notifications and the status log itself.
create or replace function public.student_usage(p_student uuid)
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
  if not coalesce(public.is_admin(), false) then
    return null;
  end if;
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.students'::regclass
      and array_length(c.conkey, 1) = 1
      and c.conrelid <> 'public.students'::regclass
  loop
    if r.tbl in ('student_guardians','public.student_guardians','student_user_links','public.student_user_links',
                 'student_status_log','public.student_status_log','notifications','public.notifications') then
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

revoke all on function public.student_usage(uuid) from public, anon;
grant execute on function public.student_usage(uuid) to authenticated;

create or replace function public.delete_student(p_student uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  usage jsonb;
  v_name text;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can delete pupil records';
  end if;
  select * into s from public.students where id = p_student for update;
  if not found then
    raise exception 'This pupil record no longer exists';
  end if;
  if s.status::text <> 'inactive' or coalesce(s.deactivation_reason, '') not in ('duplicate','test_record') then
    raise exception 'Only records deactivated as a duplicate or a test record can be deleted. Deactivate it first.';
  end if;
  v_name := trim(concat_ws(' ', s.first_name, s.last_name));
  if lower(regexp_replace(trim(coalesce(p_confirm_name, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(v_name, '\s+', ' ', 'g')) then
    raise exception 'Type the pupil''s name exactly as shown to confirm';
  end if;
  usage := public.student_usage(p_student);
  if usage is not null and usage <> '{}'::jsonb then
    raise exception 'This record has results, fees, attendance or other records attached, so it stays deactivated instead of being deleted.';
  end if;

  insert into public.student_status_log
    (student_id, student_name, admission_number, action, reason, reason_other, kept_student_id, status_from, status_to, done_by, done_by_name)
  values
    (null, v_name, s.admission_number, 'deleted', s.deactivation_reason, s.deactivation_note, s.duplicate_of,
     s.status::text, null, auth.uid(), public.student_log_actor_name());

  delete from public.students where id = p_student;
end;
$$;

revoke all on function public.delete_student(uuid, text) from public, anon;
grant execute on function public.delete_student(uuid, text) to authenticated;
