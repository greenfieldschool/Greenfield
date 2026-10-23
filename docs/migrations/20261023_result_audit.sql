-- Result integrity: final scores are locked, and every change to results is recorded.
--
-- Run AFTER 20261022_term_reports.sql.
--
-- 1. A result sheet (class + subject + term) is locked when the teacher submits it as final, and every sheet of a
--    class + term is locked while its report cards are published. Locked means NOBODY can add, change or delete its
--    scores or columns - not teachers, not admins, not the API. The database refuses the change.
-- 2. To correct a locked sheet an admin unlocks it and must give a reason (unpublishing also needs a reason). The
--    corrections are then recorded like any other change, and the sheet is submitted again.
-- 3. result_audit_log records every score entered, changed or deleted (old and new value, who, when, and whether it
--    came from a CBT import), every column change, welfare rating, submit, unlock, publish and unpublish. It is
--    written only by database triggers: the app cannot write, change or delete log entries. Admins can read it.

-- ---------------------------------------------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.result_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text not null,
  class_id uuid,
  subject_id uuid,
  academic_term_id uuid,
  assessment_id uuid,
  student_id uuid,
  criterion_id uuid,
  column_label text,
  old_value numeric,
  new_value numeric,
  reason text,
  detail jsonb
);

create index if not exists result_audit_log_sheet_idx on public.result_audit_log(class_id, academic_term_id, at desc);
create index if not exists result_audit_log_student_idx on public.result_audit_log(student_id, at desc);
create index if not exists result_audit_log_at_idx on public.result_audit_log(at desc);

alter table public.result_audit_log enable row level security;

-- Read: admins only. No insert/update/delete policies, so signed-in users can never write to it directly.
drop policy if exists result_audit_log_admin_select on public.result_audit_log;
create policy result_audit_log_admin_select
  on public.result_audit_log
  for select
  to authenticated
  using (public.is_admin());

revoke insert, update, delete, truncate on public.result_audit_log from anon, authenticated;

-- Internal: writes one log entry with the signed-in person's name and role as they are right now.
create or replace function public.log_result_event(
  p_action text,
  p_class uuid,
  p_subject uuid,
  p_term uuid,
  p_assessment uuid default null,
  p_student uuid default null,
  p_criterion uuid default null,
  p_label text default null,
  p_old numeric default null,
  p_new numeric default null,
  p_reason text default null,
  p_detail jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  who uuid := auth.uid();
  who_name text;
  who_role text;
begin
  if who is not null then
    select coalesce(p.full_name, p.email), p.role::text into who_name, who_role from public.profiles p where p.id = who;
  end if;
  insert into public.result_audit_log (
    actor_id, actor_name, actor_role, action, class_id, subject_id, academic_term_id, assessment_id, student_id,
    criterion_id, column_label, old_value, new_value, reason, detail
  )
  values (
    who, coalesce(who_name, case when who is null then 'System' end), who_role, p_action, p_class, p_subject, p_term,
    p_assessment, p_student, p_criterion, p_label, p_old, p_new, p_reason, p_detail
  );
end;
$$;

revoke all on function public.log_result_event(text, uuid, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Locks
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.result_sheet_locks (
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  locked_at timestamptz not null default now(),
  locked_by uuid references auth.users(id) on delete set null,
  primary key (class_id, subject_id, academic_term_id)
);

alter table public.result_sheet_locks enable row level security;

-- Read by staff; written only through submit_result_sheet / unlock_result_sheet below.
drop policy if exists result_sheet_locks_staff_select on public.result_sheet_locks;
create policy result_sheet_locks_staff_select
  on public.result_sheet_locks
  for select
  to authenticated
  using (public.is_staff());

create or replace function public.result_term_published(p_class uuid, p_term uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.result_publications
    where scope = 'term_results' and class_id = p_class and academic_term_id = p_term
  );
$$;

create or replace function public.result_sheet_locked(p_class uuid, p_subject uuid, p_term uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.result_sheet_locks
      where class_id = p_class and subject_id = p_subject and academic_term_id = p_term
    )
    or public.result_term_published(p_class, p_term);
$$;

grant execute on function public.result_term_published(uuid, uuid) to authenticated;
grant execute on function public.result_sheet_locked(uuid, uuid, uuid) to authenticated;

-- Merging duplicate subjects/classes moves locked results without changing any score; it sets this flag.
create or replace function public.result_lock_bypassed()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.result_lock_bypass', true), '') = 'on';
$$;

create or replace function public.submit_result_sheet(p_class uuid, p_subject uuid, p_term uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(public.is_admin(), false) or coalesce(public.teacher_teaches(p_class, p_subject), false)) then
    raise exception 'Only the subject''s teacher or an admin can submit this result sheet';
  end if;
  if not exists (
    select 1 from public.academic_assessments
    where class_id = p_class and subject_id = p_subject and academic_term_id = p_term and on_result_sheet
  ) then
    raise exception 'This result sheet has no columns yet';
  end if;
  insert into public.result_sheet_locks (class_id, subject_id, academic_term_id, locked_by)
  values (p_class, p_subject, p_term, auth.uid())
  on conflict do nothing;
  if found then
    perform public.log_result_event('sheet_submitted', p_class, p_subject, p_term);
  end if;
end;
$$;

create or replace function public.unlock_result_sheet(p_class uuid, p_subject uuid, p_term uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only an admin can unlock a result sheet';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason for unlocking (it is kept in the audit log)';
  end if;
  if public.result_term_published(p_class, p_term) then
    raise exception 'These results are published. Unpublish the report cards (with a reason) before unlocking a sheet.';
  end if;
  delete from public.result_sheet_locks where class_id = p_class and subject_id = p_subject and academic_term_id = p_term;
  perform public.log_result_event('sheet_unlocked', p_class, p_subject, p_term, p_reason => btrim(p_reason));
end;
$$;

create or replace function public.unpublish_term_results(p_class uuid, p_term uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only an admin can unpublish report cards';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason for unpublishing (it is kept in the audit log)';
  end if;
  perform set_config('app.result_unpublish_reason', btrim(p_reason), true);
  delete from public.result_publications where scope = 'term_results' and class_id = p_class and academic_term_id = p_term;
end;
$$;

revoke all on function public.submit_result_sheet(uuid, uuid, uuid) from public, anon;
revoke all on function public.unlock_result_sheet(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.unpublish_term_results(uuid, uuid, text) from public, anon;
grant execute on function public.submit_result_sheet(uuid, uuid, uuid) to authenticated;
grant execute on function public.unlock_result_sheet(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.unpublish_term_results(uuid, uuid, text) to authenticated;

-- Teachers may publish their class; only admins may unpublish (through unpublish_term_results, with a reason).
drop policy if exists result_publications_staff_all on public.result_publications;
drop policy if exists result_publications_staff_write on public.result_publications;
create policy result_publications_staff_write
  on public.result_publications
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (public.is_staff() and public.current_role() <> 'teacher')
    or public.teacher_has_class(class_id)
  );

drop policy if exists result_publications_staff_update on public.result_publications;
create policy result_publications_staff_update
  on public.result_publications
  for update
  to authenticated
  using (public.is_admin() or (public.is_staff() and public.current_role() <> 'teacher') or public.teacher_has_class(class_id))
  with check (public.is_admin() or (public.is_staff() and public.current_role() <> 'teacher') or public.teacher_has_class(class_id));

drop policy if exists result_publications_admin_delete on public.result_publications;
create policy result_publications_admin_delete
  on public.result_publications
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------------------------------------------
-- Triggers: refuse changes to locked results, and record every change
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.academic_scores_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  assessment uuid := case when tg_op = 'DELETE' then old.assessment_id else new.assessment_id end;
  detail jsonb;
begin
  select id, class_id, subject_id, academic_term_id, title, assessment_type, on_result_sheet
  into a
  from public.academic_assessments
  where id = assessment;

  -- The column itself is being deleted: academic_assessments_guard already checked the lock and logged the scores.
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if a.on_result_sheet and not public.result_lock_bypassed()
     and public.result_sheet_locked(a.class_id, a.subject_id, a.academic_term_id) then
    raise exception 'This result sheet is locked (submitted as final or published). An admin must unlock it, giving a reason, before scores can change.';
  end if;

  -- A score moved to another column must not leave a locked sheet either.
  if tg_op = 'UPDATE' and new.assessment_id <> old.assessment_id and not public.result_lock_bypassed() and exists (
    select 1 from public.academic_assessments o
    where o.id = old.assessment_id and o.on_result_sheet
      and public.result_sheet_locked(o.class_id, o.subject_id, o.academic_term_id)
  ) then
    raise exception 'This result sheet is locked (submitted as final or published). An admin must unlock it, giving a reason, before scores can change.';
  end if;

  if tg_op = 'UPDATE' and new.score is not distinct from old.score and new.student_id = old.student_id
     and new.assessment_id = old.assessment_id then
    return new; -- same score saved again (e.g. a CBT re-import): nothing to record
  end if;

  -- An upsert of a score that already exists fires this insert trigger first, then becomes an update (which is
  -- recorded by the update trigger). Only record genuinely new scores here.
  if tg_op = 'INSERT' and exists (
    select 1 from public.academic_assessment_scores x
    where x.assessment_id = new.assessment_id and x.student_id = new.student_id
  ) then
    return new;
  end if;

  if tg_op <> 'DELETE' and new.remarks is not null then
    detail := jsonb_build_object('remarks', new.remarks);
  end if;
  if public.result_lock_bypassed() then
    detail := coalesce(detail, '{}'::jsonb) || jsonb_build_object('via', 'merge');
  end if;

  perform public.log_result_event(
    case tg_op when 'INSERT' then 'score_added' when 'UPDATE' then 'score_changed' else 'score_deleted' end,
    a.class_id, a.subject_id, a.academic_term_id, a.id,
    case when tg_op = 'DELETE' then old.student_id else new.student_id end,
    null,
    coalesce(a.title, a.assessment_type),
    case when tg_op = 'INSERT' then null else old.score end,
    case when tg_op = 'DELETE' then null else new.score end,
    null,
    detail
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists academic_scores_guard on public.academic_assessment_scores;
create trigger academic_scores_guard
  before insert or update or delete on public.academic_assessment_scores
  for each row execute function public.academic_scores_guard();

create or replace function public.academic_assessments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sc record;
  changed boolean;
begin
  if not public.result_lock_bypassed() then
    if tg_op <> 'INSERT' and old.on_result_sheet
       and public.result_sheet_locked(old.class_id, old.subject_id, old.academic_term_id) then
      raise exception 'This result sheet is locked (submitted as final or published). An admin must unlock it, giving a reason, before its columns can change.';
    end if;
    if tg_op <> 'DELETE' and new.on_result_sheet
       and public.result_sheet_locked(new.class_id, new.subject_id, new.academic_term_id) then
      raise exception 'This result sheet is locked (submitted as final or published). An admin must unlock it, giving a reason, before its columns can change.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    perform public.log_result_event('column_added', new.class_id, new.subject_id, new.academic_term_id, new.id,
      p_label => coalesce(new.title, new.assessment_type), p_new => new.max_score);
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Record each score lost with the column, then the column.
    for sc in select student_id, score from public.academic_assessment_scores where assessment_id = old.id loop
      perform public.log_result_event('score_deleted', old.class_id, old.subject_id, old.academic_term_id, old.id, sc.student_id,
        p_label => coalesce(old.title, old.assessment_type), p_old => sc.score, p_detail => jsonb_build_object('because', 'column removed'));
    end loop;
    perform public.log_result_event('column_removed', old.class_id, old.subject_id, old.academic_term_id, old.id,
      p_label => coalesce(old.title, old.assessment_type), p_old => old.max_score);
    return old;
  end if;

  changed := new.title is distinct from old.title
    or new.max_score is distinct from old.max_score
    or new.component_group is distinct from old.component_group
    or new.class_id is distinct from old.class_id
    or new.subject_id is distinct from old.subject_id
    or new.academic_term_id is distinct from old.academic_term_id;
  if changed then
    perform public.log_result_event('column_changed', new.class_id, new.subject_id, new.academic_term_id, new.id,
      p_label => coalesce(new.title, new.assessment_type), p_old => old.max_score, p_new => new.max_score,
      p_detail => jsonb_strip_nulls(jsonb_build_object(
        'old_title', case when new.title is distinct from old.title then old.title end,
        'old_class_id', case when new.class_id is distinct from old.class_id then old.class_id end,
        'old_subject_id', case when new.subject_id is distinct from old.subject_id then old.subject_id end,
        'via', case when public.result_lock_bypassed() then 'merge' end
      )));
  end if;
  return new;
end;
$$;

drop trigger if exists academic_assessments_guard on public.academic_assessments;
create trigger academic_assessments_guard
  before insert or update or delete on public.academic_assessments
  for each row execute function public.academic_assessments_guard();

create or replace function public.welfare_ratings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.welfare_ratings%rowtype := case when tg_op = 'DELETE' then old else new end;
  label text;
begin
  if not public.result_lock_bypassed() and (
    public.result_term_published(r.class_id, r.academic_term_id)
    or (tg_op = 'UPDATE' and public.result_term_published(old.class_id, old.academic_term_id))
  ) then
    raise exception 'These report cards are published, so welfare ratings are locked. An admin must unpublish them (giving a reason) first.';
  end if;
  if tg_op = 'UPDATE' and new.rating is not distinct from old.rating then
    return new;
  end if;
  -- An upsert of an existing rating fires this insert trigger first, then becomes an update (recorded then).
  if tg_op = 'INSERT' and exists (
    select 1 from public.welfare_ratings x
    where x.student_id = new.student_id and x.academic_term_id = new.academic_term_id and x.criterion_id = new.criterion_id
  ) then
    return new;
  end if;
  select name into label from public.welfare_criteria where id = r.criterion_id;
  perform public.log_result_event(
    case tg_op when 'INSERT' then 'rating_added' when 'UPDATE' then 'rating_changed' else 'rating_deleted' end,
    r.class_id, null, r.academic_term_id, null, r.student_id, r.criterion_id, label,
    case when tg_op = 'INSERT' then null else old.rating end,
    case when tg_op = 'DELETE' then null else new.rating end
  );
  return r;
end;
$$;

drop trigger if exists welfare_ratings_guard on public.welfare_ratings;
create trigger welfare_ratings_guard
  before insert or update or delete on public.welfare_ratings
  for each row execute function public.welfare_ratings_guard();

create or replace function public.result_publications_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.scope, old.scope) <> 'term_results' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.log_result_event('unpublished', old.class_id, null, old.academic_term_id,
      p_reason => nullif(current_setting('app.result_unpublish_reason', true), ''));
  else
    perform public.log_result_event(case when tg_op = 'INSERT' then 'published' else 'republished' end,
      new.class_id, null, new.academic_term_id);
  end if;
  return null;
end;
$$;

drop trigger if exists result_publications_log on public.result_publications;
create trigger result_publications_log
  after insert or update or delete on public.result_publications
  for each row execute function public.result_publications_log();
