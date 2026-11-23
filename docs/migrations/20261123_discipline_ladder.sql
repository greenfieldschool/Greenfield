-- Discipline ladder (school policy "When a rule is broken", families policy section discipline-ladder).
-- Run after 20261122_payment_plans.sql. Safe to run more than once.
--
-- Decisions (23 Nov 2026, the user):
--   * The count is per pupil and per rule, and never starts again (whole time at the school).
--   * Staff pick a rule from a list; admins can add rules and retire them.
--   * Parents are told every time (portal + email), with nothing about discipline on a phone's lock screen.
--   * The 4th time (and later) waits for an admin to record the disciplinary committee's decision.
--
-- What changes:
--   1. discipline_rules: the list staff pick from, with how the ladder applies to each rule.
--   2. welfare_discipline_records gets rule, which time, step, correction, statement and committee decision.
--      Old records (no rule) stay as they are and don't count on the ladder.
--   3. All writes go through functions; staff can no longer insert, edit or delete rows directly.
--      A record made in error is withdrawn with a reason: it moves to welfare_discipline_withdrawn (kept, not lost),
--      so it stops counting everywhere (ladder, welfare score sheet, report cards, management pack) at once.
--   4. discipline_events: who did what to each record.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Rules
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.discipline_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 3 and 80),
  description text check (description is null or length(description) <= 300),
  -- steps: the usual ladder. useful_work_first: useful work from the 1st time (taking what isn't yours).
  -- committee: straight to the disciplinary committee (behaviour outside school in uniform: suspension or expulsion
  -- are possible, so the committee decides).
  ladder text not null default 'steps' check (ladder in ('steps', 'useful_work_first', 'committee')),
  active boolean not null default true,
  position int not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

create unique index if not exists discipline_rules_name_key on public.discipline_rules (lower(btrim(name)));

insert into public.discipline_rules (name, description, ladder, position)
values
  ('Lateness', 'Arriving after 7:45 am.', 'steps', 10),
  ('Absence without permission', 'Missing school or a lesson without written permission from the head teacher.', 'steps', 20),
  ('Taking what isn''t theirs', 'Taking anything that belongs to someone else.', 'useful_work_first', 30),
  ('Unkind words or bad manners', 'Not speaking to others with a kind tone and good manners.', 'steps', 40),
  ('Language rule', 'Not using English in class (other languages only in their own lessons).', 'steps', 50),
  ('Uniform and appearance', 'Incomplete or wrong uniform, shoes, hair, jewellery or make-up.', 'steps', 60),
  ('Noise during lessons', 'Making noise during lessons or official hours.', 'steps', 70),
  ('Fighting', 'Fighting or hurting another pupil.', 'steps', 80),
  ('Behaviour outside school in uniform', 'Playing cards, ludo or draughts in public, fighting in the street or hawking while in uniform.', 'committee', 90),
  ('Other', 'Anything else against the school rules. Say what happened in the notes.', 'steps', 999)
on conflict do nothing;

alter table public.discipline_rules enable row level security;

drop policy if exists discipline_rules_read on public.discipline_rules;
create policy discipline_rules_read on public.discipline_rules
  for select to authenticated
  using (true);

drop policy if exists discipline_rules_admin_insert on public.discipline_rules;
create policy discipline_rules_admin_insert on public.discipline_rules
  for insert to authenticated
  with check (coalesce(public.is_admin(), false));

drop policy if exists discipline_rules_admin_update on public.discipline_rules;
create policy discipline_rules_admin_update on public.discipline_rules
  for update to authenticated
  using (coalesce(public.is_admin(), false))
  with check (coalesce(public.is_admin(), false));

revoke all on public.discipline_rules from anon;
revoke delete, truncate on public.discipline_rules from authenticated;
grant select, insert, update on public.discipline_rules to authenticated;

drop trigger if exists discipline_rules_set_updated_at on public.discipline_rules;
create trigger discipline_rules_set_updated_at
  before update on public.discipline_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Records: the ladder columns
-- ---------------------------------------------------------------------------------------------------------------

alter table public.welfare_discipline_records
  add column if not exists rule_id uuid references public.discipline_rules(id) on delete restrict,
  add column if not exists occurrence int check (occurrence is null or occurrence >= 1),
  add column if not exists step int check (step is null or step between 1 and 4),
  add column if not exists correction text check (correction is null or correction in (
    'read_and_warn', 'useful_work', 'supervised_reflection', 'lose_break', 'spoken_promise', 'three_days_counselling_statement'
  )),
  add column if not exists statement text check (statement is null or length(statement) <= 4000),
  add column if not exists committee_outcome text check (committee_outcome is null or committee_outcome in (
    'environment_team', 'counsellor', 'other'
  )),
  add column if not exists committee_days int check (committee_days is null or committee_days between 1 and 10),
  add column if not exists pupil_explanation text check (pupil_explanation is null or length(pupil_explanation) <= 2000),
  add column if not exists committee_note text check (committee_note is null or length(committee_note) <= 2000),
  add column if not exists parent_meeting_on date,
  add column if not exists committee_decided_at timestamptz,
  add column if not exists committee_decided_by uuid references auth.users(id) on delete set null,
  add column if not exists reported_by_name text;

create index if not exists welfare_discipline_student_rule_idx
  on public.welfare_discipline_records (student_id, rule_id) where rule_id is not null;
create index if not exists welfare_discipline_committee_idx
  on public.welfare_discipline_records (occurred_at) where step = 4 and committee_decided_at is null;

-- Writes only through the functions below.
drop policy if exists welfare_discipline_staff_all on public.welfare_discipline_records;
drop policy if exists welfare_discipline_staff_select on public.welfare_discipline_records;
create policy welfare_discipline_staff_select on public.welfare_discipline_records
  for select to authenticated
  using (coalesce(public.is_staff(), false));

revoke all on public.welfare_discipline_records from anon;
revoke insert, update, delete, truncate on public.welfare_discipline_records from authenticated;
grant select on public.welfare_discipline_records to authenticated;

-- Withdrawn records: the whole row as it was, with why and by whom. Admins only.
create table if not exists public.welfare_discipline_withdrawn (
  id uuid primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  rule_id uuid references public.discipline_rules(id) on delete set null,
  record jsonb not null,
  reason text not null check (reason in ('recorded_in_error', 'wrong_pupil', 'duplicate', 'other')),
  note text check (note is null or length(note) <= 500),
  withdrawn_at timestamptz not null default now(),
  withdrawn_by uuid references auth.users(id) on delete set null,
  withdrawn_by_name text
);

alter table public.welfare_discipline_withdrawn enable row level security;
drop policy if exists welfare_discipline_withdrawn_admin_select on public.welfare_discipline_withdrawn;
create policy welfare_discipline_withdrawn_admin_select on public.welfare_discipline_withdrawn
  for select to authenticated
  using (coalesce(public.is_admin(), false));
revoke all on public.welfare_discipline_withdrawn from anon;
revoke insert, update, delete, truncate on public.welfare_discipline_withdrawn from authenticated;
grant select on public.welfare_discipline_withdrawn to authenticated;

-- Who did what. record_id is not a foreign key: the log outlives a withdrawn record.
create table if not exists public.discipline_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null,
  student_id uuid references public.students(id) on delete cascade,
  action text not null check (action in ('recorded', 'statement', 'committee', 'withdrawn')),
  detail jsonb not null default '{}'::jsonb,
  done_at timestamptz not null default now(),
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text
);
create index if not exists discipline_events_record_idx on public.discipline_events (record_id, done_at);

alter table public.discipline_events enable row level security;
drop policy if exists discipline_events_staff_select on public.discipline_events;
create policy discipline_events_staff_select on public.discipline_events
  for select to authenticated
  using (coalesce(public.is_staff(), false));
revoke all on public.discipline_events from anon;
revoke insert, update, delete, truncate on public.discipline_events from authenticated;
grant select on public.discipline_events to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.discipline_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Staff')
  from public.profiles p where p.id = auth.uid();
$$;

-- Parents only (pupils read their own records on the portal but aren't sent an alert). The words are the same for
-- every case and say nothing about what happened: they show on phone lock screens.
create or replace function public.discipline_notify_parents(p_student uuid, p_kind text, p_title text, p_body text, p_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, student_id, kind, title, body, link, ref_id)
  select distinct gul.user_id, p_student, p_kind, left(p_title, 200), left(p_body, 500),
         '/portal/discipline?student_id=' || p_student::text, p_ref
  from public.student_guardians sg
  join public.guardian_user_links gul on gul.guardian_id = sg.guardian_id
  where sg.student_id = p_student and gul.user_id is not null;
exception when others then
  raise warning 'discipline_notify_parents failed: %', sqlerrm;
end;
$$;

create or replace function public.discipline_log(p_record uuid, p_student uuid, p_action text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.discipline_events (record_id, student_id, action, detail, done_by, done_by_name)
  values (p_record, p_student, p_action, coalesce(p_detail, '{}'::jsonb), auth.uid(), public.discipline_actor_name());
$$;

revoke all on function public.discipline_actor_name() from public, anon, authenticated;
revoke all on function public.discipline_notify_parents(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.discipline_log(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- Which time this would be for a pupil and rule, and so which step and corrections apply. Staff only.
create or replace function public.discipline_next_step(p_student uuid, p_rule uuid)
returns table (occurrence int, step int, ladder text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ladder text;
  v_count int;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Only school staff can do this.';
  end if;
  select r.ladder into v_ladder from public.discipline_rules r where r.id = p_rule;
  if v_ladder is null then
    raise exception 'Choose a rule from the list.';
  end if;
  select count(*) into v_count
  from public.welfare_discipline_records d
  where d.student_id = p_student and d.rule_id = p_rule;
  occurrence := v_count + 1;
  step := case when v_ladder = 'committee' then 4 else least(v_count + 1, 4) end;
  ladder := v_ladder;
  return next;
end;
$$;

revoke all on function public.discipline_next_step(uuid, uuid) from public, anon;
grant execute on function public.discipline_next_step(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Recording a case
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.record_discipline_case(
  p_student uuid,
  p_rule uuid,
  p_occurred_on date,
  p_description text,
  p_severity int,
  p_correction text,
  p_statement text default null
)
returns table (record_id uuid, occurrence int, step int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.discipline_rules%rowtype;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_count int;
  v_step int;
  v_allowed text[];
  v_term uuid;
  v_year uuid;
  v_id uuid;
  v_first text;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Only school staff can record discipline cases.';
  end if;
  if p_student is null or not exists (select 1 from public.students s where s.id = p_student) then
    raise exception 'Choose a pupil.';
  end if;
  select * into v_rule from public.discipline_rules r where r.id = p_rule;
  if v_rule.id is null then
    raise exception 'Choose a rule from the list.';
  end if;
  if not v_rule.active then
    raise exception 'That rule is no longer in use. Choose another.';
  end if;
  if p_occurred_on is null or p_occurred_on > v_today or p_occurred_on < v_today - 120 then
    raise exception 'The day it happened must be today or in the last 120 days.';
  end if;
  if length(btrim(coalesce(p_description, ''))) < 3 then
    raise exception 'Say briefly what happened.';
  end if;
  if length(p_description) > 2000 then
    raise exception 'What happened is too long (2,000 characters at most).';
  end if;
  if p_severity is null or p_severity not between 1 and 5 then
    raise exception 'Seriousness must be between 1 and 5.';
  end if;

  -- One case at a time per pupil and rule, so two staff recording at once can't both get the same step.
  perform pg_advisory_xact_lock(hashtextextended(p_student::text || ':' || p_rule::text, 0));

  select count(*) into v_count
  from public.welfare_discipline_records d
  where d.student_id = p_student and d.rule_id = p_rule;
  v_step := case when v_rule.ladder = 'committee' then 4 else least(v_count + 1, 4) end;

  v_allowed := case
    when v_step = 1 and v_rule.ladder = 'useful_work_first' then array['useful_work']
    when v_step = 1 then array['read_and_warn']
    when v_step = 2 then array['useful_work', 'supervised_reflection', 'lose_break', 'spoken_promise']
    when v_step = 3 then array['three_days_counselling_statement']
    else array[]::text[]
  end;
  if v_step = 4 then
    if p_correction is not null and p_correction <> '' then
      raise exception 'The disciplinary committee decides the correction from the 4th time. Leave it for an admin to record.';
    end if;
  elsif p_correction is null or not (p_correction = any(v_allowed)) then
    raise exception 'Choose a correction the policy allows for the % time.',
      case v_step when 1 then '1st' when 2 then '2nd' else '3rd' end;
  end if;
  if p_statement is not null and length(p_statement) > 4000 then
    raise exception 'The written statement is too long (4,000 characters at most).';
  end if;

  -- The term (and year) the day falls in.
  select t.id, t.academic_year_id into v_term, v_year
  from public.academic_terms t
  where t.starts_on is not null and t.ends_on is not null and p_occurred_on between t.starts_on and t.ends_on
  order by t.starts_on desc
  limit 1;

  insert into public.welfare_discipline_records (
    student_id, academic_year_id, academic_term_id, category, description, severity, sanction,
    reported_by, reported_by_name, occurred_at, rule_id, occurrence, step, correction, statement
  ) values (
    p_student, v_year, v_term, v_rule.name, btrim(p_description), p_severity, null,
    auth.uid(), public.discipline_actor_name(),
    -- Mid-morning Lagos time on that day, so it counts in the right week on the welfare score sheet.
    (p_occurred_on::timestamp + time '10:00') at time zone 'Africa/Lagos',
    p_rule, v_count + 1, v_step, nullif(p_correction, ''), nullif(btrim(coalesce(p_statement, '')), '')
  )
  returning id into v_id;

  perform public.discipline_log(v_id, p_student, 'recorded',
    jsonb_build_object('rule', v_rule.name, 'occurrence', v_count + 1, 'step', v_step, 'correction', p_correction));

  select s.first_name into v_first from public.students s where s.id = p_student;
  perform public.discipline_notify_parents(p_student, 'discipline',
    'A note from school about ' || coalesce(v_first, 'your child'),
    'Open Discipline on the portal to read it.', v_id);

  record_id := v_id;
  occurrence := v_count + 1;
  step := v_step;
  return next;
end;
$$;

revoke all on function public.record_discipline_case(uuid, uuid, date, text, int, text, text) from public, anon;
grant execute on function public.record_discipline_case(uuid, uuid, date, text, int, text, text) to authenticated;

-- The 3rd-time written statement can be added or corrected later (it is often written after a counselling session).
create or replace function public.save_discipline_statement(p_record uuid, p_statement text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.welfare_discipline_records%rowtype;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Only school staff can do this.';
  end if;
  select * into v_row from public.welfare_discipline_records d where d.id = p_record;
  if v_row.id is null then
    raise exception 'That record was not found.';
  end if;
  if v_row.step is null or v_row.step < 3 then
    raise exception 'A written statement is kept from the 3rd time.';
  end if;
  if length(btrim(coalesce(p_statement, ''))) < 10 then
    raise exception 'Write the statement (why it happened and how the pupil will change).';
  end if;
  if length(p_statement) > 4000 then
    raise exception 'The written statement is too long (4,000 characters at most).';
  end if;
  update public.welfare_discipline_records set statement = btrim(p_statement) where id = p_record;
  perform public.discipline_log(p_record, v_row.student_id, 'statement',
    jsonb_build_object('had_one_before', v_row.statement is not null));
end;
$$;

revoke all on function public.save_discipline_statement(uuid, text) from public, anon;
grant execute on function public.save_discipline_statement(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. The disciplinary committee (4th time and later). Admins record the decision; it can be corrected later.
-- The pupil is heard first and what they said is recorded (policy). Environment team: up to 10 school days.
-- Counsellor: the school counsellor, and outside support only with the parent's agreement (in the note).
-- ---------------------------------------------------------------------------------------------------------------

drop function if exists public.record_committee_decision(uuid, text, int, date, text);

create or replace function public.record_committee_decision(
  p_record uuid,
  p_outcome text,
  p_days int,
  p_parent_meeting_on date,
  p_note text,
  p_pupil_explanation text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.welfare_discipline_records%rowtype;
  v_first text;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can record the disciplinary committee''s decision.';
  end if;
  select * into v_row from public.welfare_discipline_records d where d.id = p_record for update;
  if v_row.id is null then
    raise exception 'That record was not found.';
  end if;
  if v_row.step is distinct from 4 then
    raise exception 'The committee decides from the 4th time only.';
  end if;
  if length(btrim(coalesce(p_pupil_explanation, ''))) < 5 then
    raise exception 'Write what the pupil said when the committee heard them.';
  end if;
  if length(p_pupil_explanation) > 2000 then
    raise exception 'What the pupil said is too long (2,000 characters at most).';
  end if;
  if p_outcome is null or p_outcome not in ('environment_team', 'counsellor', 'other') then
    raise exception 'Choose what the committee decided.';
  end if;
  if p_outcome = 'environment_team' and (p_days is null or p_days not between 1 and 10) then
    raise exception 'Say how many school days with the environment team (1 to 10).';
  end if;
  if p_outcome = 'other' and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Write what the committee decided.';
  end if;
  if p_parent_meeting_on is null then
    raise exception 'Give the day the parent is invited to the school.';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'The note is too long (2,000 characters at most).';
  end if;

  update public.welfare_discipline_records
  set committee_outcome = p_outcome,
      committee_days = case when p_outcome = 'environment_team' then p_days else null end,
      committee_note = nullif(btrim(coalesce(p_note, '')), ''),
      pupil_explanation = btrim(p_pupil_explanation),
      parent_meeting_on = p_parent_meeting_on,
      committee_decided_at = now(),
      committee_decided_by = auth.uid()
  where id = p_record;

  perform public.discipline_log(p_record, v_row.student_id, 'committee',
    jsonb_build_object('outcome', p_outcome, 'days', p_days, 'parent_meeting_on', p_parent_meeting_on,
                       'changed', v_row.committee_decided_at is not null));

  select s.first_name into v_first from public.students s where s.id = v_row.student_id;
  perform public.discipline_notify_parents(v_row.student_id, 'discipline_committee',
    'Please come to the school about ' || coalesce(v_first, 'your child'),
    'Open Discipline on the portal for the day and details.', p_record);
end;
$$;

revoke all on function public.record_committee_decision(uuid, text, int, date, text, text) from public, anon;
grant execute on function public.record_committee_decision(uuid, text, int, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Withdrawing a record made in error
-- ---------------------------------------------------------------------------------------------------------------
-- Admins, or the person who recorded it on the same day (Lagos). The row is kept in welfare_discipline_withdrawn.
-- Later cases already recorded keep the time they were given; the next case counts only what is left.

create or replace function public.withdraw_discipline_record(p_record uuid, p_reason text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.welfare_discipline_records%rowtype;
  v_admin boolean := coalesce(public.is_admin(), false);
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Only school staff can do this.';
  end if;
  select * into v_row from public.welfare_discipline_records d where d.id = p_record for update;
  if v_row.id is null then
    raise exception 'That record was not found.';
  end if;
  if not v_admin and not (
    v_row.reported_by = auth.uid()
    and (v_row.created_at at time zone 'Africa/Lagos')::date = (now() at time zone 'Africa/Lagos')::date
  ) then
    raise exception 'You can withdraw your own records on the day you made them. Ask an admin for anything else.';
  end if;
  if p_reason is null or p_reason not in ('recorded_in_error', 'wrong_pupil', 'duplicate', 'other') then
    raise exception 'Choose why it is being withdrawn.';
  end if;
  if p_reason = 'other' and length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Say why it is being withdrawn.';
  end if;

  insert into public.welfare_discipline_withdrawn (id, student_id, rule_id, record, reason, note, withdrawn_by, withdrawn_by_name)
  values (v_row.id, v_row.student_id, v_row.rule_id, to_jsonb(v_row), p_reason, nullif(btrim(coalesce(p_note, '')), ''),
          auth.uid(), public.discipline_actor_name());
  delete from public.welfare_discipline_records where id = p_record;

  perform public.discipline_log(p_record, v_row.student_id, 'withdrawn',
    jsonb_build_object('reason', p_reason, 'rule', v_row.category, 'step', v_row.step));
end;
$$;

revoke all on function public.withdraw_discipline_record(uuid, text, text) from public, anon;
grant execute on function public.withdraw_discipline_record(uuid, text, text) to authenticated;
