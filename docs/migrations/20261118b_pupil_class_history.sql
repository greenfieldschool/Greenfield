-- Pupil class history: which class each pupil was in, term by term
--
-- Why: students.class_id only says which class a pupil is in NOW. Moving pupils up at the end of a session
-- overwrites it, so "which class was Ada in last term?" could only be guessed from her scores, welfare ratings,
-- attendance and published report cards. Last term's report card for a class then listed this year's pupils.
--
-- What this adds:
-- 1. student_class_terms: one row per pupil per term = the class the pupil was in that term (the record the school
--    goes by). It keeps the class name as it was, who set it, when, and how ('records' = worked out from last
--    terms' records when this file was run, 'term start', 'class change', 'new pupil', 'class merge', 'admin').
-- 2. student_class_term_log: every change to those rows (from → to), who did it and when. Kept after a pupil
--    record is deleted (name copied in).
-- 3. student_class_term_conflicts: pupils whose records put them in two classes in the same term. Nothing is
--    guessed for a past term: an admin picks the class on Pupils → Class history (set_student_class_for_term).
-- 4. Keeping it in step automatically:
--    - when a pupil's class changes (or a pupil is added with a class), the CURRENT term's row follows, unless that
--      term is closed for the class: the term's end date has passed, or the class's term results are published.
--      A closed term keeps the class the pupil was in (that is what makes "move pupils up after the term" safe);
--    - when a term is made active, every pupil on roll gets a row for it with their current class;
--    - merge_classes moves the history of the class being removed onto the class being kept;
--    - a duplicate or test record that is deactivated (it leaves its class) drops out of the current term.
-- 5. class_members_in_term(class, term): the pupils of a class in a given term, for report cards and result
--    sheets. If a term has no history at all yet, it falls back to the pupils in the class now.
-- 6. Fills in the history from the records already in the database (scores, welfare ratings, attendance, report
--    card comments, published report cards, and the current class for the current term). Re-running the file
--    only fills what is missing; rows already set (or fixed by an admin) are never changed.
--
-- Who can see it: admins and office staff see everything; teachers see the classes they teach; parents and pupils
-- see only their own child's / their own rows. Nobody writes the tables directly: only the triggers and
-- set_student_class_for_term (admins). Results are not touched: no score, lock or published report changes.
--
-- Run AFTER 20261118_developer_only_pupil_delete.sql (itself after 20261117b_single_source_fixes.sql and
-- 20261113b_student_deactivation.sql, whose student_log_actor_name and 'inactive' status this uses). Its trigger on students runs AFTER the row is saved, so the
-- BEFORE triggers (students_00_level_follows_class, students_admission_number, students_guard_status) all run first.
-- Run the whole file once in the Supabase SQL editor; re-running is harmless. The editor may warn about
-- "destructive operations": those are the `drop … if exists` lines that replace an older copy of a trigger or
-- policy, nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.student_class_terms (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  -- Null only if the class is later deleted; class_name / class_level still say which class it was.
  class_id uuid references public.classes(id) on delete set null,
  class_name text not null,
  class_level text,
  source text not null check (source in ('records','term start','class change','new pupil','class merge','admin')),
  note text,
  set_by uuid references auth.users(id) on delete set null,
  set_by_name text,
  set_at timestamptz not null default now(),
  unique (student_id, academic_term_id)
);

create index if not exists student_class_terms_term_class_idx on public.student_class_terms(academic_term_id, class_id);
create index if not exists student_class_terms_class_idx on public.student_class_terms(class_id);

create table if not exists public.student_class_term_log (
  id bigint generated always as identity primary key,
  -- No foreign key on purpose: the log outlives a deleted pupil record (the name is kept below).
  student_id uuid,
  student_name text,
  academic_term_id uuid references public.academic_terms(id) on delete cascade,
  term_name text,
  from_class_id uuid,
  from_class_name text,
  to_class_id uuid,
  to_class_name text,
  source text not null,
  note text,
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text,
  done_at timestamptz not null default now()
);

create index if not exists student_class_term_log_student_idx on public.student_class_term_log(student_id, done_at desc);
create index if not exists student_class_term_log_done_at_idx on public.student_class_term_log(done_at desc);

create table if not exists public.student_class_term_conflicts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  -- [{class_id, class_name, class_level, scores, welfare, attendance, comments, published, current}]
  candidates jsonb not null default '[]'::jsonb,
  -- The class written meanwhile (current term only: the pupil's class now), or null when nothing was written.
  provisional_class_id uuid references public.classes(id) on delete set null,
  status text not null default 'open' check (status in ('open','resolved')),
  found_at timestamptz not null default now(),
  resolved_class_id uuid references public.classes(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_by_name text,
  resolved_at timestamptz,
  unique (student_id, academic_term_id)
);

create index if not exists student_class_term_conflicts_open_idx on public.student_class_term_conflicts(status, academic_term_id);

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------------------------------------------

-- The term the school is in: the active term (of the active year first), else the term whose dates cover today.
create or replace function public.current_academic_term_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select t.id
       from public.academic_terms t
       join public.academic_years y on y.id = t.academic_year_id
      where t.is_active
      order by y.is_active desc, t.starts_on desc nulls last, t.created_at desc
      limit 1),
    (select t.id
       from public.academic_terms t
      where t.starts_on is not null and t.ends_on is not null
        and (now() at time zone 'Africa/Lagos')::date between t.starts_on and t.ends_on
      order by t.starts_on desc
      limit 1)
  );
$$;

revoke all on function public.current_academic_term_id() from public, anon;
grant execute on function public.current_academic_term_id() to authenticated;

-- A term is over once its end date has passed (Lagos time).
create or replace function public.academic_term_ended(p_term uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select t.ends_on < (now() at time zone 'Africa/Lagos')::date from public.academic_terms t where t.id = p_term),
    false);
$$;

revoke all on function public.academic_term_ended(uuid) from public, anon, authenticated;

-- A class's term is closed (its pupils for that term are settled) when the term has ended or the class's term
-- results are published. Always a definite true/false.
create or replace function public.class_term_closed(p_term uuid, p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.academic_term_ended(p_term), false)
    or (p_class is not null and exists (
          select 1 from public.result_publications p
          where p.scope = 'term_results' and p.class_id = p_class and p.academic_term_id = p_term));
$$;

revoke all on function public.class_term_closed(uuid, uuid) from public, anon, authenticated;

-- Writes one pupil's class for one term and logs the change. Internal: the triggers and the admin function call it.
create or replace function public.write_student_class_term(
  p_student uuid,
  p_term uuid,
  p_class uuid,
  p_source text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur record;
  c record;
  v_actor text := coalesce(public.student_log_actor_name(), 'System');
begin
  select * into cur from public.student_class_terms where student_id = p_student and academic_term_id = p_term for update;

  if p_class is null then
    if found then
      delete from public.student_class_terms where id = cur.id;
      insert into public.student_class_term_log
        (student_id, student_name, academic_term_id, term_name, from_class_id, from_class_name, to_class_id, to_class_name, source, note, done_by, done_by_name)
      select p_student, trim(concat_ws(' ', s.first_name, s.last_name)), p_term, (select name from public.academic_terms where id = p_term),
             cur.class_id, cur.class_name, null, null, p_source, p_note, auth.uid(), v_actor
      from public.students s where s.id = p_student;
    end if;
    return;
  end if;

  select id, name, level::text as level into c from public.classes where id = p_class;
  if not found then
    raise exception 'That class no longer exists';
  end if;

  if cur.id is not null and cur.class_id is not distinct from p_class then
    return; -- nothing changes
  end if;

  if cur.id is null then
    insert into public.student_class_terms (student_id, academic_term_id, class_id, class_name, class_level, source, note, set_by, set_by_name)
    values (p_student, p_term, p_class, c.name, c.level, p_source, p_note, auth.uid(), v_actor);
  else
    update public.student_class_terms
       set class_id = p_class, class_name = c.name, class_level = c.level, source = p_source, note = p_note,
           set_by = auth.uid(), set_by_name = v_actor, set_at = now()
     where id = cur.id;
  end if;

  insert into public.student_class_term_log
    (student_id, student_name, academic_term_id, term_name, from_class_id, from_class_name, to_class_id, to_class_name, source, note, done_by, done_by_name)
  select p_student, trim(concat_ws(' ', s.first_name, s.last_name)), p_term, (select name from public.academic_terms where id = p_term),
         cur.class_id, cur.class_name, p_class, c.name, p_source, p_note, auth.uid(), v_actor
  from public.students s where s.id = p_student;
end;
$$;

revoke all on function public.write_student_class_term(uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- Gives every pupil on roll who has a class a row for the term (their class now). Never changes existing rows.
create or replace function public.snapshot_class_term(p_term uuid, p_source text default 'term start')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  v_actor text := coalesce(public.student_log_actor_name(), 'System');
begin
  if p_term is null then
    return 0;
  end if;
  with ins as (
    insert into public.student_class_terms (student_id, academic_term_id, class_id, class_name, class_level, source, set_by, set_by_name)
    select s.id, p_term, s.class_id, c.name, c.level::text, p_source, auth.uid(), v_actor
    from public.students s
    join public.classes c on c.id = s.class_id
    where s.status::text not in ('graduated','withdrawn','transferred','inactive')
    on conflict (student_id, academic_term_id) do nothing
    returning student_id, class_id, class_name
  ), logged as (
    insert into public.student_class_term_log
      (student_id, student_name, academic_term_id, term_name, to_class_id, to_class_name, source, done_by, done_by_name)
    select ins.student_id, trim(concat_ws(' ', s.first_name, s.last_name)), p_term, (select name from public.academic_terms where id = p_term),
           ins.class_id, ins.class_name, p_source, auth.uid(), v_actor
    from ins join public.students s on s.id = ins.student_id
    returning 1
  )
  select count(*) into n from logged;
  return n;
end;
$$;

revoke all on function public.snapshot_class_term(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Keeping it in step
-- ---------------------------------------------------------------------------------------------------------------

-- A pupil's class changes (or a pupil is added with a class): the current term follows, unless closed.
create or replace function public.students_class_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid := public.current_academic_term_id();
  cur record;
  v_source text;
  v_term_name text;
begin
  if t is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.class_id is not distinct from old.class_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.class_id is null then
    return new;
  end if;

  v_source := coalesce(nullif(current_setting('app.class_history_source', true), ''),
                       case when tg_op = 'INSERT' then 'new pupil' else 'class change' end);

  select * into cur from public.student_class_terms where student_id = new.id and academic_term_id = t;

  -- A closed term keeps the class the pupil was in (or doesn't take a new pupil in). Log it so admins can see why.
  if public.class_term_closed(t, cur.class_id) or public.class_term_closed(t, new.class_id) then
    if cur.id is not null or new.class_id is not null then
      select name into v_term_name from public.academic_terms where id = t;
      insert into public.student_class_term_log
        (student_id, student_name, academic_term_id, term_name, from_class_id, from_class_name, to_class_id, to_class_name, source, note, done_by, done_by_name)
      values (new.id, trim(concat_ws(' ', new.first_name, new.last_name)), t, v_term_name,
              cur.class_id, cur.class_name, cur.class_id, cur.class_name, v_source,
              'Class changed to ' || coalesce((select name from public.classes where id = new.class_id), 'no class')
                || ', but ' || coalesce(v_term_name, 'this term') || ' is closed (ended or results published), so its record is kept. The new class counts from the next term.',
              auth.uid(), coalesce(public.student_log_actor_name(), 'System'));
    end if;
    return new;
  end if;

  -- First class change of a term nobody has recorded yet: record everyone first, so the term is complete.
  if new.class_id is not null and not exists (select 1 from public.student_class_terms where academic_term_id = t) then
    perform public.snapshot_class_term(t, 'term start');
  end if;

  perform public.write_student_class_term(new.id, t, new.class_id, v_source, null);
  return new;
end;
$$;

revoke all on function public.students_class_history() from public, anon, authenticated;

drop trigger if exists students_class_history on public.students;
create trigger students_class_history
  after insert or update of class_id on public.students
  for each row execute function public.students_class_history();

-- A term is made active: everyone on roll gets a row for it with their class now (if the term hasn't ended).
create or replace function public.academic_terms_class_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active and (tg_op = 'INSERT' or not coalesce(old.is_active, false))
     and new.id = public.current_academic_term_id()
     and not coalesce(public.academic_term_ended(new.id), false) then
    perform public.snapshot_class_term(new.id, 'term start');
  end if;
  return new;
end;
$$;

revoke all on function public.academic_terms_class_history() from public, anon, authenticated;

drop trigger if exists academic_terms_class_history on public.academic_terms;
create trigger academic_terms_class_history
  after insert or update of is_active on public.academic_terms
  for each row execute function public.academic_terms_class_history();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Fixing a term by hand (admins)
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.set_student_class_for_term(p_student uuid, p_term uuid, p_class uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can change a pupil''s class for a term';
  end if;
  if p_student is null or not exists (select 1 from public.students where id = p_student) then
    raise exception 'This pupil record no longer exists';
  end if;
  if p_term is null or not exists (select 1 from public.academic_terms where id = p_term) then
    raise exception 'Choose a term';
  end if;
  if p_class is null then
    raise exception 'Choose a class';
  end if;

  perform public.write_student_class_term(p_student, p_term, p_class, 'admin', v_note);

  update public.student_class_term_conflicts
     set status = 'resolved', resolved_class_id = p_class, resolved_by = auth.uid(),
         resolved_by_name = coalesce(public.student_log_actor_name(), 'Admin'), resolved_at = now()
   where student_id = p_student and academic_term_id = p_term and status = 'open';
end;
$$;

revoke all on function public.set_student_class_for_term(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.set_student_class_for_term(uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Reading: the pupils of a class in a term
-- ---------------------------------------------------------------------------------------------------------------

-- Staff who may see the class get every pupil who was in it that term (including pupils since moved up, so last
-- term's report cards are right). Parents and pupils get only their own child / themselves, as on students.
-- A term with no history at all yet (e.g. a term that hasn't started) falls back to the class's pupils now.
create or replace function public.class_members_in_term(p_class uuid, p_term uuid)
returns table (
  id uuid,
  first_name text,
  middle_name text,
  last_name text,
  admission_number text,
  sex text,
  date_of_birth date,
  passport_photo_url text,
  profile_photo_url text,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff boolean := coalesce(auth.role(), '') = 'service_role'
    or coalesce(public.staff_can_class(p_class), false)
    or coalesce(public.teacher_has_class_or_subject(p_class), false);
begin
  if p_class is null or p_term is null then
    return;
  end if;
  if exists (select 1 from public.student_class_terms x where x.academic_term_id = p_term) then
    return query
      select s.id, s.first_name, s.middle_name, s.last_name, s.admission_number, s.sex, s.date_of_birth,
             s.passport_photo_url, s.profile_photo_url, s.status::text
      from public.student_class_terms h
      join public.students s on s.id = h.student_id
      where h.academic_term_id = p_term and h.class_id = p_class
        and s.status::text <> 'inactive'
        and (v_staff or coalesce(public.portal_sees_student(s.id), false))
      order by s.last_name, s.first_name, s.id;
  else
    return query
      select s.id, s.first_name, s.middle_name, s.last_name, s.admission_number, s.sex, s.date_of_birth,
             s.passport_photo_url, s.profile_photo_url, s.status::text
      from public.students s
      where s.class_id = p_class
        and s.status::text <> 'inactive'
        and (v_staff or coalesce(public.portal_sees_student(s.id), false))
      order by s.last_name, s.first_name, s.id;
  end if;
end;
$$;

revoke all on function public.class_members_in_term(uuid, uuid) from public, anon;
grant execute on function public.class_members_in_term(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Who can see what (nobody writes directly)
-- ---------------------------------------------------------------------------------------------------------------

alter table public.student_class_terms enable row level security;
alter table public.student_class_term_log enable row level security;
alter table public.student_class_term_conflicts enable row level security;

create or replace function public.can_see_class_history(p_student uuid, p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or (coalesce(public.is_staff(), false) and public.current_role() is distinct from 'teacher')
    or (p_class is not null and public.current_role() = 'teacher' and coalesce(public.teacher_has_class_or_subject(p_class), false))
    or (coalesce(public.portal_sees_student(p_student), false)
        and exists (select 1 from public.students s where s.id = p_student and s.status::text <> 'inactive'));
$$;

revoke all on function public.can_see_class_history(uuid, uuid) from public, anon;
grant execute on function public.can_see_class_history(uuid, uuid) to authenticated;

drop policy if exists student_class_terms_select on public.student_class_terms;
create policy student_class_terms_select
  on public.student_class_terms
  for select
  to authenticated
  using (public.can_see_class_history(student_id, class_id));

drop policy if exists student_class_term_log_admin_read on public.student_class_term_log;
create policy student_class_term_log_admin_read
  on public.student_class_term_log
  for select
  to authenticated
  using (coalesce(public.is_admin(), false));

drop policy if exists student_class_term_conflicts_admin_read on public.student_class_term_conflicts;
create policy student_class_term_conflicts_admin_read
  on public.student_class_term_conflicts
  for select
  to authenticated
  using (coalesce(public.is_admin(), false));

revoke insert, update, delete on public.student_class_terms from anon, authenticated;
revoke insert, update, delete on public.student_class_term_log from anon, authenticated;
revoke insert, update, delete on public.student_class_term_conflicts from anon, authenticated;
revoke all on public.student_class_terms, public.student_class_term_log, public.student_class_term_conflicts from anon;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Pupil records: a test or duplicate record's own class history doesn't stop it being deleted
-- ---------------------------------------------------------------------------------------------------------------

-- Same as 20261118_developer_only_pupil_delete.sql (the one skip list), plus the two class-history tables: they are
-- deleted with the record, and the change log keeps the name. student_usage (admins) and the developer's approval
-- both call this; don't redefine student_usage or delete_student here.
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
                                         'account_log', 'student_delete_requests',
                                         'student_class_terms', 'student_class_term_conflicts') then
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


-- ---------------------------------------------------------------------------------------------------------------
-- 8. Merging two classes moves the removed class's history onto the class kept
-- ---------------------------------------------------------------------------------------------------------------

-- Same as 20261022_term_reports.sql, plus the two class-history steps marked below.
create or replace function public.merge_classes(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_level public.school_level;
  src_assessment record;
  match_id uuid;
  moved_students int := 0;
  moved_assessments int := 0;
  combined_assessments int := 0;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can merge classes';
  end if;
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'Choose two different classes to merge';
  end if;
  -- Moves results without changing any score, so locked (final/published) sheets may be moved. Every move is still
  -- recorded in result_audit_log (20261023_result_audit.sql).
  perform set_config('app.result_lock_bypass', 'on', true);
  -- Pupils' class history follows (20261118b_pupil_class_history.sql); the trigger records it as a class merge.
  perform set_config('app.class_history_source', 'class merge', true);
  if not exists (select 1 from public.classes where id = p_source) then
    raise exception 'The class to remove no longer exists';
  end if;
  select level into target_level from public.classes where id = p_target;
  if target_level is null then
    raise exception 'The class to keep no longer exists';
  end if;

  if exists (
    select 1
    from public.fee_schedules s
    join public.fee_schedules t
      on t.class_id = p_target
     and t.academic_year_id = s.academic_year_id
     and t.academic_term_id is not distinct from s.academic_term_id
    where s.class_id = p_source
  ) then
    raise exception 'Both classes have a fee schedule for the same year and term. Delete or fix the duplicate fee schedule first, then merge.';
  end if;

  update public.students set class_id = p_target, level = target_level where class_id = p_source;
  get diagnostics moved_students = row_count;

  update public.fee_schedules set class_id = p_target where class_id = p_source;

  for src_assessment in
    select * from public.academic_assessments where class_id = p_source
  loop
    select a.id into match_id
    from public.academic_assessments a
    where a.class_id = p_target
      and a.subject_id is not distinct from src_assessment.subject_id
      and a.academic_year_id is not distinct from src_assessment.academic_year_id
      and a.academic_term_id is not distinct from src_assessment.academic_term_id
      and a.on_result_sheet = src_assessment.on_result_sheet
      -- Sheet columns match by name (several columns can be of the same kind); older assessments by type.
      and case
        when src_assessment.on_result_sheet then lower(coalesce(a.title, '')) = lower(coalesce(src_assessment.title, ''))
        else a.assessment_type = src_assessment.assessment_type
      end
    order by a.created_at
    limit 1;

    if match_id is null then
      update public.academic_assessments set class_id = p_target where id = src_assessment.id;
      moved_assessments := moved_assessments + 1;
    else
      insert into public.academic_assessment_scores (assessment_id, student_id, score, remarks, graded_by)
      select match_id, sc.student_id, sc.score, sc.remarks, sc.graded_by
      from public.academic_assessment_scores sc
      where sc.assessment_id = src_assessment.id
      on conflict (assessment_id, student_id) do nothing;

      delete from public.academic_assessments where id = src_assessment.id;
      combined_assessments := combined_assessments + 1;
    end if;
  end loop;

  update public.student_attendance set class_id = p_target where class_id = p_source;
  update public.exam_test_sessions set class_id = p_target where class_id = p_source;

  update public.result_publications p
  set class_id = p_target
  where p.class_id = p_source
    and not exists (
      select 1
      from public.result_publications t
      where t.class_id = p_target
        and t.scope = p.scope
        and t.academic_year_id is not distinct from p.academic_year_id
        and t.academic_term_id is not distinct from p.academic_term_id
        and t.level is not distinct from p.level
    );
  delete from public.result_publications where class_id = p_source;

  insert into public.class_subjects (class_id, subject_id)
  select p_target, cs.subject_id from public.class_subjects cs where cs.class_id = p_source
  on conflict do nothing;

  insert into public.teacher_class_assignments (teacher_id, class_id, active)
  select tca.teacher_id, p_target, tca.active from public.teacher_class_assignments tca where tca.class_id = p_source
  on conflict (teacher_id, class_id) do update
    set active = public.teacher_class_assignments.active or excluded.active;

  insert into public.teacher_subject_assignments (teacher_id, class_id, subject_id, active)
  select tsa.teacher_id, p_target, tsa.subject_id, tsa.active
  from public.teacher_subject_assignments tsa
  where tsa.class_id = p_source
  on conflict (teacher_id, class_id, subject_id) do update
    set active = public.teacher_subject_assignments.active or excluded.active;

  update public.welfare_ratings set class_id = p_target where class_id = p_source;
  update public.report_card_comments set class_id = p_target where class_id = p_source;
  update public.result_layouts l
  set class_id = p_target
  where l.class_id = p_source
    and not exists (
      select 1 from public.result_layouts t
      where t.class_id = p_target
        and t.subject_id is not distinct from l.subject_id
        and t.level is not distinct from l.level
    );

  update public.classes t
  set active = t.active or s.active
  from public.classes s
  where t.id = p_target and s.id = p_source;

  -- Class history: the removed class's terms now belong to the class kept (logged).
  insert into public.student_class_term_log
    (student_id, student_name, academic_term_id, term_name, from_class_id, from_class_name, to_class_id, to_class_name, source, done_by, done_by_name)
  select h.student_id, trim(concat_ws(' ', s.first_name, s.last_name)), h.academic_term_id, t.name,
         h.class_id, h.class_name, k.id, k.name, 'class merge', auth.uid(), coalesce(public.student_log_actor_name(), 'System')
  from public.student_class_terms h
  join public.students s on s.id = h.student_id
  join public.academic_terms t on t.id = h.academic_term_id
  join public.classes k on k.id = p_target
  where h.class_id = p_source;
  update public.student_class_terms h
     set class_id = p_target, class_name = k.name, class_level = k.level::text, source = 'class merge', set_by = auth.uid(),
         set_by_name = coalesce(public.student_log_actor_name(), 'System'), set_at = now()
    from public.classes k
   where k.id = p_target and h.class_id = p_source;
  perform set_config('app.class_history_source', '', true);

  delete from public.classes where id = p_source;

  return jsonb_build_object(
    'moved_students', moved_students,
    'moved_assessments', moved_assessments,
    'combined_assessments', combined_assessments
  );
end;
$$;

revoke all on function public.merge_classes(uuid, uuid) from public, anon;
grant execute on function public.merge_classes(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 9. Filling in the history from the records already kept
-- ---------------------------------------------------------------------------------------------------------------

-- For each pupil and term, every class the records put them in. One class → that's the row. Two or more → listed
-- for an admin (no row for a past term; for the current term the class now is written meanwhile and still listed).
-- Never changes a row that already exists. Returns what it did.
create or replace function public.backfill_student_class_terms()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t_now uuid := public.current_academic_term_id();
  v_rows int := 0;
  v_conflicts int := 0;
begin
  with evidence as (
    -- Scores on result sheets and other assessments
    select sc.student_id, a.academic_term_id as term_id, a.class_id, 'scores'::text as kind, count(*)::int as n
    from public.academic_assessment_scores sc
    join public.academic_assessments a on a.id = sc.assessment_id
    where a.class_id is not null and a.academic_term_id is not null
    group by 1, 2, 3
    union all
    select w.student_id, w.academic_term_id, w.class_id, 'welfare', count(*)::int
    from public.welfare_ratings w
    where w.class_id is not null
    group by 1, 2, 3
    union all
    -- Registers: the term on the row, or the term whose dates cover the day
    select r.student_id, r.term_id, r.class_id, 'attendance', count(*)::int
    from (
      select sa.student_id, sa.class_id,
             coalesce(sa.academic_term_id, (
               select t.id from public.academic_terms t
               where t.starts_on is not null and t.ends_on is not null and sa.date between t.starts_on and t.ends_on
               order by t.starts_on desc limit 1)) as term_id
      from public.student_attendance sa
      where sa.class_id is not null
    ) r
    where r.term_id is not null
    group by 1, 2, 3
    union all
    select rc.student_id, rc.academic_term_id, rc.class_id, 'comments', count(*)::int
    from public.report_card_comments rc
    where rc.class_id is not null
    group by 1, 2, 3
    union all
    -- Published report cards (the saved copy lists every pupil on it)
    select (p.elem ->> 'id')::uuid, p.academic_term_id, p.class_id, 'published', 1
    from (
      select pr.academic_term_id, pr.class_id, jsonb_array_elements(pr.pupils) as elem
      from public.published_results pr
      where pr.class_id is not null and jsonb_typeof(pr.pupils) = 'array'
    ) p
    where (p.elem ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    union all
    -- The class now, for the current term while it is open for that class
    select s.id, t_now, s.class_id, 'current', 1
    from public.students s
    where t_now is not null and s.class_id is not null
      and s.status::text not in ('graduated','withdrawn','transferred','inactive')
      and not public.class_term_closed(t_now, s.class_id)
  ),
  valid as (
    select e.*
    from evidence e
    join public.students s on s.id = e.student_id
    join public.classes c on c.id = e.class_id
    join public.academic_terms t on t.id = e.term_id
  ),
  per_class as (
    select v.student_id, v.term_id, v.class_id,
           coalesce(sum(v.n) filter (where v.kind = 'scores'), 0) as scores,
           coalesce(sum(v.n) filter (where v.kind = 'welfare'), 0) as welfare,
           coalesce(sum(v.n) filter (where v.kind = 'attendance'), 0) as attendance,
           coalesce(sum(v.n) filter (where v.kind = 'comments'), 0) as comments,
           bool_or(v.kind = 'published') as published,
           bool_or(v.kind = 'current') as current
    from valid v
    group by 1, 2, 3
  ),
  per_term as (
    select pc.student_id, pc.term_id,
           count(*) as n_classes,
           (array_agg(pc.class_id))[1] as only_class,
           (array_agg(pc.class_id) filter (where pc.current))[1] as current_class,
           jsonb_agg(jsonb_build_object(
             'class_id', pc.class_id, 'class_name', c.name, 'class_level', c.level::text,
             'scores', pc.scores, 'welfare', pc.welfare, 'attendance', pc.attendance, 'comments', pc.comments,
             'published', pc.published, 'current', pc.current) order by c.level, c.name) as candidates
    from per_class pc
    join public.classes c on c.id = pc.class_id
    group by 1, 2
  ),
  missing as (
    select pt.*
    from per_term pt
    where not exists (select 1 from public.student_class_terms h where h.student_id = pt.student_id and h.academic_term_id = pt.term_id)
  ),
  ins_rows as (
    insert into public.student_class_terms (student_id, academic_term_id, class_id, class_name, class_level, source, note, set_by_name)
    select m.student_id, m.term_id, k.id, k.name, k.level::text, 'records',
           case when m.n_classes > 1 then 'Records show more than one class this term; this is the class now. Check Pupils → Class history.' end,
           'Filled in from records'
    from missing m
    join public.classes k on k.id = case when m.n_classes = 1 then m.only_class else m.current_class end
    on conflict (student_id, academic_term_id) do nothing
    returning 1
  ),
  ins_conflicts as (
    insert into public.student_class_term_conflicts (student_id, academic_term_id, candidates, provisional_class_id)
    select m.student_id, m.term_id, m.candidates, m.current_class
    from missing m
    where m.n_classes > 1
    on conflict (student_id, academic_term_id) do nothing
    returning 1
  )
  select (select count(*) from ins_rows), (select count(*) from ins_conflicts) into v_rows, v_conflicts;

  return jsonb_build_object('rows_added', v_rows, 'conflicts_listed', v_conflicts, 'current_term', t_now);
end;
$$;

revoke all on function public.backfill_student_class_terms() from public, anon, authenticated;

-- Run it now (safe to repeat: only fills what is missing).
select public.backfill_student_class_terms();
