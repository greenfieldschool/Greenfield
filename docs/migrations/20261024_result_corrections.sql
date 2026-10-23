-- Correction requests and teachers' view of the results history.
--
-- Run AFTER 20261023_result_audit.sql.
--
-- 1. A teacher can't change a final (locked) score, but can ask an admin to: they enter the corrected score(s) on the
--    locked sheet with a reason and send a correction request. The score in the request is checked against the
--    sheet; the current score is read from the database, not from the teacher's screen.
-- 2. An admin approves (the corrected scores are applied straight away, the sheet stays locked) or rejects, with a
--    note. If a score changed after the request was made, approval is refused so nothing is overwritten unseen.
-- 3. Every request, approval, rejection and withdrawal is in result_audit_log, and each corrected score's log entry
--    carries the request's reason and number.
-- 4. Teachers can read the results history of the classes and subjects they teach (admins: everything).

-- ---------------------------------------------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.result_correction_requests (
  id uuid primary key default gen_random_uuid(),
  ref bigint generated always as identity,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  reason text not null check (length(btrim(reason)) >= 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text
);

create index if not exists result_correction_requests_status_idx on public.result_correction_requests(status, requested_at desc);
create index if not exists result_correction_requests_sheet_idx on public.result_correction_requests(class_id, subject_id, academic_term_id);

create table if not exists public.result_correction_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.result_correction_requests(id) on delete cascade,
  assessment_id uuid not null references public.academic_assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  column_label text,
  old_score numeric,
  new_score numeric,
  unique (request_id, assessment_id, student_id)
);

alter table public.result_correction_requests enable row level security;
alter table public.result_correction_items enable row level security;

-- Read: admins, the person who asked, and teachers of that subject in that class. Written only through the
-- functions below.
drop policy if exists result_correction_requests_select on public.result_correction_requests;
create policy result_correction_requests_select
  on public.result_correction_requests
  for select
  to authenticated
  using (
    public.is_admin()
    or requested_by = auth.uid()
    or public.teacher_teaches(class_id, subject_id)
  );

drop policy if exists result_correction_items_select on public.result_correction_items;
create policy result_correction_items_select
  on public.result_correction_items
  for select
  to authenticated
  using (exists (select 1 from public.result_correction_requests r where r.id = request_id));

revoke insert, update, delete, truncate on public.result_correction_requests, public.result_correction_items from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Approved corrections pass the lock; the log records them as corrections with the request's reason
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.result_lock_bypassed()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.result_lock_bypass', true), '') in ('on', 'correction');
$$;

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
  bypass text := coalesce(current_setting('app.result_lock_bypass', true), '');
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
    raise exception 'This result sheet is locked (submitted as final or published). Send a correction request to an admin instead.';
  end if;

  -- A score moved to another column must not leave a locked sheet either.
  if tg_op = 'UPDATE' and new.assessment_id <> old.assessment_id and not public.result_lock_bypassed() and exists (
    select 1 from public.academic_assessments o
    where o.id = old.assessment_id and o.on_result_sheet
      and public.result_sheet_locked(o.class_id, o.subject_id, o.academic_term_id)
  ) then
    raise exception 'This result sheet is locked (submitted as final or published). Send a correction request to an admin instead.';
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
  if bypass = 'on' then
    detail := coalesce(detail, '{}'::jsonb) || jsonb_build_object('via', 'merge');
  elsif bypass = 'correction' then
    detail := coalesce(detail, '{}'::jsonb) || jsonb_build_object(
      'via', 'correction',
      'request_ref', nullif(current_setting('app.correction_request_ref', true), '')
    );
  end if;

  perform public.log_result_event(
    case tg_op when 'INSERT' then 'score_added' when 'UPDATE' then 'score_changed' else 'score_deleted' end,
    a.class_id, a.subject_id, a.academic_term_id, a.id,
    case when tg_op = 'DELETE' then old.student_id else new.student_id end,
    null,
    coalesce(a.title, a.assessment_type),
    case when tg_op = 'INSERT' then null else old.score end,
    case when tg_op = 'DELETE' then null else new.score end,
    case when bypass = 'correction' then nullif(current_setting('app.result_change_reason', true), '') end,
    detail
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Welfare ratings saved again with an upsert are recorded once (as a change), not twice.
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

-- ---------------------------------------------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.staff_display_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(full_name, email) from public.profiles where id = auth.uid();
$$;

-- p_items: [{"assessment_id": "...", "student_id": "...", "new_score": 17}] (new_score null = clear the score).
create or replace function public.request_result_correction(
  p_class uuid,
  p_subject uuid,
  p_term uuid,
  p_reason text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  req uuid;
  req_ref bigint;
  item jsonb;
  col record;
  current_score numeric;
  wanted numeric;
  n int := 0;
begin
  if not (coalesce(public.is_admin(), false) or coalesce(public.teacher_teaches(p_class, p_subject), false)) then
    raise exception 'Only the subject''s teacher or an admin can ask for a correction';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Explain why the scores need correcting (e.g. what was mis-keyed)';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Change at least one score to request a correction';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Too many changes in one request';
  end if;

  insert into public.result_correction_requests (class_id, subject_id, academic_term_id, reason, requested_by, requested_by_name)
  values (p_class, p_subject, p_term, btrim(p_reason), auth.uid(), public.staff_display_name())
  returning id, ref into req, req_ref;

  for item in select * from jsonb_array_elements(p_items) loop
    select id, title, assessment_type, max_score into col
    from public.academic_assessments
    where id = (item->>'assessment_id')::uuid
      and class_id = p_class and subject_id = p_subject and academic_term_id = p_term and on_result_sheet;
    if not found then
      raise exception 'A score in the request is not on this result sheet';
    end if;
    if not exists (select 1 from public.students where id = (item->>'student_id')::uuid) then
      raise exception 'A pupil in the request no longer exists';
    end if;

    wanted := nullif(item->>'new_score', '')::numeric;
    if wanted is not null and (wanted < 0 or wanted > col.max_score) then
      raise exception '% must be between 0 and %', coalesce(col.title, col.assessment_type), col.max_score;
    end if;
    select score into current_score
    from public.academic_assessment_scores
    where assessment_id = col.id and student_id = (item->>'student_id')::uuid;
    if current_score is not distinct from wanted then
      continue;
    end if;

    insert into public.result_correction_items (request_id, assessment_id, student_id, column_label, old_score, new_score)
    values (req, col.id, (item->>'student_id')::uuid, coalesce(col.title, col.assessment_type), current_score, wanted)
    on conflict (request_id, assessment_id, student_id) do update set new_score = excluded.new_score;
    n := n + 1;
  end loop;

  if n = 0 then
    raise exception 'None of the scores are different from what is on the sheet';
  end if;

  perform public.log_result_event('correction_requested', p_class, p_subject, p_term,
    p_reason => btrim(p_reason), p_detail => jsonb_build_object('request_ref', req_ref, 'changes', n));
  return req;
end;
$$;

create or replace function public.decide_result_correction(p_request uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.result_correction_requests%rowtype;
  it record;
  current_score numeric;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only an admin can approve or reject a correction request';
  end if;
  select * into r from public.result_correction_requests where id = p_request for update;
  if not found then
    raise exception 'That request no longer exists';
  end if;
  if r.status <> 'pending' then
    raise exception 'That request has already been %', r.status;
  end if;
  if not p_approve and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why the request is rejected, so the teacher knows';
  end if;

  if p_approve then
    -- Refuse if anything changed since the teacher asked, so no score is overwritten unseen.
    for it in select * from public.result_correction_items where request_id = r.id loop
      select score into current_score
      from public.academic_assessment_scores
      where assessment_id = it.assessment_id and student_id = it.student_id;
      if current_score is distinct from it.old_score then
        raise exception 'A score in this request has changed since it was made (% is now %). Reject it and ask for a new request.',
          it.column_label, coalesce(current_score::text, 'empty');
      end if;
    end loop;

    perform set_config('app.result_lock_bypass', 'correction', true);
    perform set_config('app.result_change_reason',
      'Correction #' || r.ref || ': ' || r.reason || coalesce(' — approved: ' || nullif(btrim(p_note), ''), ''), true);
    perform set_config('app.correction_request_ref', r.ref::text, true);

    for it in select * from public.result_correction_items where request_id = r.id loop
      if it.new_score is null then
        delete from public.academic_assessment_scores where assessment_id = it.assessment_id and student_id = it.student_id;
      else
        insert into public.academic_assessment_scores (assessment_id, student_id, score, graded_by, remarks)
        values (it.assessment_id, it.student_id, it.new_score, r.requested_by, 'Correction #' || r.ref)
        on conflict (assessment_id, student_id) do update
          set score = excluded.score, graded_by = excluded.graded_by, remarks = excluded.remarks;
      end if;
    end loop;

    perform set_config('app.result_lock_bypass', '', true);
  end if;

  update public.result_correction_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(),
      decided_by_name = public.staff_display_name(),
      decided_at = now(),
      decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = r.id;

  perform public.log_result_event(case when p_approve then 'correction_approved' else 'correction_rejected' end,
    r.class_id, r.subject_id, r.academic_term_id,
    p_reason => nullif(btrim(coalesce(p_note, '')), ''), p_detail => jsonb_build_object('request_ref', r.ref));
end;
$$;

create or replace function public.withdraw_result_correction(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.result_correction_requests%rowtype;
begin
  select * into r from public.result_correction_requests where id = p_request for update;
  if not found or (r.requested_by is distinct from auth.uid() and not coalesce(public.is_admin(), false)) then
    raise exception 'You can only withdraw your own requests';
  end if;
  if r.status <> 'pending' then
    raise exception 'That request has already been %', r.status;
  end if;
  update public.result_correction_requests set status = 'withdrawn', decided_at = now() where id = r.id;
  perform public.log_result_event('correction_withdrawn', r.class_id, r.subject_id, r.academic_term_id,
    p_detail => jsonb_build_object('request_ref', r.ref));
end;
$$;

revoke all on function public.request_result_correction(uuid, uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.decide_result_correction(uuid, boolean, text) from public, anon;
revoke all on function public.withdraw_result_correction(uuid) from public, anon;
grant execute on function public.request_result_correction(uuid, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.decide_result_correction(uuid, boolean, text) to authenticated;
grant execute on function public.withdraw_result_correction(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Teachers can read the history of what they teach
-- ---------------------------------------------------------------------------------------------------------------

drop policy if exists result_audit_log_admin_select on public.result_audit_log;
drop policy if exists result_audit_log_select on public.result_audit_log;
create policy result_audit_log_select
  on public.result_audit_log
  for select
  to authenticated
  using (
    public.is_admin()
    -- Subject teachers: their subject in their class. Class teachers: everything in their class (welfare,
    -- publishing and every subject).
    or (subject_id is not null and public.teacher_teaches(class_id, subject_id))
    or public.teacher_has_class(class_id)
  );
