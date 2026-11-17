-- Admission numbers and portal accounts
--
-- What this does, in plain words:
-- 1. Admission numbers are given automatically when a pupil is enrolled (approved application, added by hand,
--    imported), in the school's format (GRE/2026/007; the year is the session start year). Changing the format needs the
--    developers' approval: admins can only ask (see request_admission_format_change below). A counter in the database hands
--    out the next number, so two people can never get the same one, even at the same moment. It starts after the
--    highest number already used, so it never clashes with old numbers.
-- 2. "GRE/2026/007", "gre/2026/7" and "GRE 2026 007" count as the same number. A number already used by another
--    pupil is refused with that pupil's name. Old numbers keep working.
-- 3. When a pupil's admission number changes, their portal sign-in changes with it (same password).
-- 4. Staff can check for likely duplicates (same name and birthday, similar names, same parent phone or email)
--    before adding a pupil.
-- 5. Admins get one list of every pupil and parent with their sign-in and last sign-in, and accounts that belong to
--    nobody. Every account created, password reset, number given or changed is logged with who did it.
--
-- Passwords are never stored here: Supabase keeps only a scrambled (hashed) form that nobody can read back.
--
-- Run AFTER 20261113b_student_deactivation.sql. Safe to run twice. The SQL editor may warn about "destructive
-- operations": that is the `drop … if exists` lines that replace older versions of the same things. Expected.
-- If existing pupils already share a number, this still runs: the clashes are listed on Accounts & passwords for an admin to
-- fix, and the strict database rule switches on by running this file again once they are fixed.

-- ---------------------------------------------------------------------------------------------------------------

-- The comparison form of an admission number: lower case, letters and digits only, leading zeros dropped from
-- each number part. "GRE/2026/007" → "gre20267".
create or replace function public.admission_key(p text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(p, '')), '([a-z])([0-9])', '\1 \2', 'g'),
          '[^a-z0-9]+', ' ', 'g'),
        '(^| )0+([0-9])', '\1\2', 'g'),
      ' ', ''),
    '')
$$;

-- The username part of a pupil's sign-in email, built the same way as the website does
-- (admissionNumberToEmail in src/lib/admission-login.ts).
create or replace function public.admission_login_local(p text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(regexp_replace(lower(trim(coalesce(p, ''))), '[^a-z0-9._-]', '', 'g'), '')
$$;

-- The school's number format. One row.
create table if not exists public.admission_number_settings (
  id boolean primary key default true check (id),
  template text not null default '{PREFIX}/{YYYY}/{N}',
  prefix text not null default 'GRE',
  section_prefixes jsonb not null default '{}'::jsonb,
  digits int not null default 3 check (digits between 1 and 8),
  year_basis text not null default 'session' check (year_basis in ('calendar', 'session')),
  session_start_month int not null default 9 check (session_start_month between 1 and 12),
  auto_assign boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint admission_template_has_number check (position('{N}' in template) > 0)
);
insert into public.admission_number_settings (id) values (true) on conflict (id) do nothing;

alter table public.admission_number_settings enable row level security;
drop policy if exists admission_number_settings_staff_read on public.admission_number_settings;
create policy admission_number_settings_staff_read on public.admission_number_settings
  for select to authenticated using (coalesce(public.is_staff(), false));
revoke insert, update, delete on public.admission_number_settings from anon, authenticated;

-- The running number for each "scope" (the number with the running part left out, e.g. "GRE/2026/").
create table if not exists public.admission_number_counters (
  scope text primary key,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.admission_number_counters enable row level security;
drop policy if exists admission_number_counters_admin_read on public.admission_number_counters;
create policy admission_number_counters_admin_read on public.admission_number_counters
  for select to authenticated using (coalesce(public.is_admin(), false));
revoke insert, update, delete on public.admission_number_counters from anon, authenticated;

-- Everything done to admission numbers and portal accounts, with who did it.
create table if not exists public.account_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in (
    'number_assigned', 'number_changed', 'number_removed',
    'account_created', 'password_reset', 'account_linked', 'account_unlinked',
    'slips_printed', 'settings_changed', 'duplicate_override',
    'format_change_requested', 'format_change_cancelled', 'format_change_rejected'
  )),
  student_id uuid references public.students(id) on delete set null,
  guardian_id uuid references public.guardians(id) on delete set null,
  user_id uuid,
  subject_name text,
  admission_number text,
  detail text,
  done_by uuid references auth.users(id) on delete set null,
  done_by_name text,
  created_at timestamptz not null default now()
);
-- Keep the allowed actions in step if an earlier draft of this table exists.
alter table public.account_log drop constraint if exists account_log_action_check;
alter table public.account_log add constraint account_log_action_check check (action in (
  'number_assigned', 'number_changed', 'number_removed',
  'account_created', 'password_reset', 'account_linked', 'account_unlinked',
  'slips_printed', 'settings_changed', 'duplicate_override',
  'format_change_requested', 'format_change_cancelled', 'format_change_rejected'
));
create index if not exists account_log_created_idx on public.account_log(created_at desc);
create index if not exists account_log_student_idx on public.account_log(student_id, created_at desc);
create index if not exists account_log_guardian_idx on public.account_log(guardian_id, created_at desc);
create index if not exists account_log_user_idx on public.account_log(user_id, created_at desc);

alter table public.account_log enable row level security;
drop policy if exists account_log_admin_read on public.account_log;
create policy account_log_admin_read on public.account_log
  for select to authenticated using (coalesce(public.is_admin(), false));
revoke insert, update, delete on public.account_log from anon, authenticated;

create or replace function public.account_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(nullif(trim(full_name), ''), email) from public.profiles where id = auth.uid()),
    case when auth.uid() is null then 'System' else 'Staff' end)
$$;
revoke all on function public.account_actor_name() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Building and handing out numbers

-- Lagos-time year for numbering ("calendar": 2026 all year; "session": the year the school session started).
create or replace function public.admission_year(p_at timestamptz default now())
returns int
language sql
stable
set search_path = public
as $$
  select case
    when s.year_basis = 'session'
      and extract(month from (p_at at time zone 'Africa/Lagos'))::int < s.session_start_month
      then extract(year from (p_at at time zone 'Africa/Lagos'))::int - 1
    else extract(year from (p_at at time zone 'Africa/Lagos'))::int
  end
  from public.admission_number_settings s
  where s.id
$$;

-- The template filled in except for the running number, which stays as "{N}".
create or replace function public.admission_scope_template(p_level text default null, p_year int default null)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  s public.admission_number_settings;
  v_year int := coalesce(p_year, public.admission_year());
  v_prefix text;
begin
  select * into s from public.admission_number_settings where id;
  v_prefix := coalesce(nullif(trim(s.section_prefixes ->> coalesce(p_level, '')), ''), s.prefix);
  return replace(replace(replace(s.template, '{PREFIX}', v_prefix), '{YYYY}', v_year::text), '{YY}', lpad((v_year % 100)::text, 2, '0'));
end;
$$;

-- A pattern that finds the running number inside any existing number of this scope, whatever its spacing,
-- separators, case or leading zeros.
create or replace function public.admission_scope_pattern(p_scope_template text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[] := string_to_array(lower(p_scope_template), '{n}');
  v_before text := coalesce(v_parts[1], '');
  v_after text := coalesce(v_parts[2], '');
  v_sep constant text := '[^a-z0-9]*';
begin
  -- Only letters and digits are kept from the literal parts, so nothing needs escaping.
  return '^' || v_sep
    || array_to_string(array_remove(regexp_split_to_array(v_before, '[^a-z0-9]+'), ''), v_sep) || v_sep
    || '0*([0-9]+)' || v_sep
    || array_to_string(array_remove(regexp_split_to_array(v_after, '[^a-z0-9]+'), ''), v_sep) || v_sep || '$';
end;
$$;

-- Hands out the next number for a section (or the default prefix). Internal: called by the trigger and the
-- admin functions below. Locks the scope's counter row, so two callers at the same moment get different numbers.
create or replace function public.allocate_admission_number(p_level text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.admission_number_settings;
  v_scope_template text := public.admission_scope_template(p_level);
  v_scope text := replace(v_scope_template, '{N}', '');
  v_pattern text := public.admission_scope_pattern(v_scope_template);
  v_last bigint;
  v_highest bigint;
  v_next bigint;
  v_candidate text;
  v_tries int := 0;
begin
  select * into s from public.admission_number_settings where id;

  insert into public.admission_number_counters (scope, last_value) values (v_scope, 0)
  on conflict (scope) do nothing;
  select last_value into v_last from public.admission_number_counters where scope = v_scope for update;

  -- Start after the highest number already used in this scope (typed by hand, imported, or from before).
  select coalesce(max((regexp_match(lower(trim(st.admission_number)), v_pattern))[1]::bigint), 0)
    into v_highest
  from public.students st
  where st.admission_number is not null
    and lower(trim(st.admission_number)) ~ v_pattern;

  v_next := greatest(v_last, v_highest) + 1;
  loop
    v_candidate := replace(v_scope_template, '{N}', lpad(v_next::text, s.digits, '0'));
    exit when not exists (
      select 1 from public.students st where public.admission_key(st.admission_number) = public.admission_key(v_candidate)
    );
    v_next := v_next + 1;
    v_tries := v_tries + 1;
    if v_tries > 10000 then
      raise exception 'Could not find a free admission number. Check the number format in Settings.';
    end if;
  end loop;

  update public.admission_number_counters set last_value = v_next, updated_at = now() where scope = v_scope;
  return v_candidate;
end;
$$;
revoke all on function public.allocate_admission_number(text) from public, anon, authenticated;

-- What the next number will look like, without using it up (for the forms: "Will be GRE/2026/448").
create or replace function public.preview_admission_number(p_level text default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_staff(), false) then
    return null;
  end if;
  return public.preview_admission_number_unchecked(p_level);
end;
$$;
revoke all on function public.preview_admission_number(text) from public, anon;
grant execute on function public.preview_admission_number(text) to authenticated;

create or replace function public.preview_admission_number_unchecked(p_level text default null)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.admission_number_settings;
  v_scope_template text;
  v_pattern text;
  v_last bigint;
  v_highest bigint;
  v_next bigint;
  v_candidate text;
begin
  select * into s from public.admission_number_settings where id;
  v_scope_template := public.admission_scope_template(p_level);
  v_pattern := public.admission_scope_pattern(v_scope_template);
  select last_value into v_last from public.admission_number_counters where scope = replace(v_scope_template, '{N}', '');
  select coalesce(max((regexp_match(lower(trim(st.admission_number)), v_pattern))[1]::bigint), 0) into v_highest
  from public.students st where st.admission_number is not null and lower(trim(st.admission_number)) ~ v_pattern;
  v_next := greatest(coalesce(v_last, 0), v_highest) + 1;
  loop
    v_candidate := replace(v_scope_template, '{N}', lpad(v_next::text, s.digits, '0'));
    exit when not exists (select 1 from public.students st where public.admission_key(st.admission_number) = public.admission_key(v_candidate));
    v_next := v_next + 1;
  end loop;
  return v_candidate;
end;
$$;
revoke all on function public.preview_admission_number_unchecked(text) from public, anon, authenticated;

-- Who already has this number (any spelling)? For the forms, before saving.
create or replace function public.admission_number_owner(p_number text, p_exclude uuid default null)
returns table (student_id uuid, full_name text, admission_number text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select st.id, trim(concat_ws(' ', st.first_name, st.last_name)), st.admission_number, st.status::text
  from public.students st
  where coalesce(public.is_staff(), false)
    and public.admission_key(p_number) is not null
    and public.admission_key(st.admission_number) = public.admission_key(p_number)
    and (p_exclude is null or st.id <> p_exclude)
  limit 1
$$;
revoke all on function public.admission_number_owner(text, uuid) from public, anon;
grant execute on function public.admission_number_owner(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- On every insert or change of a pupil: tidy the number, refuse clashes, give one automatically on enrolment.

create or replace function public.students_admission_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_owner text;
  v_auto boolean;
begin
  -- Tidy: trim, single spaces, capitals. Empty → none.
  new.admission_number := nullif(upper(regexp_replace(trim(coalesce(new.admission_number, '')), '\s+', ' ', 'g')), '');

  if tg_op = 'UPDATE' and new.admission_number is null and old.admission_number is not null
    and exists (select 1 from public.student_user_links l where l.student_id = new.id) then
    raise exception 'This pupil signs in to the portal with their admission number, so it can''t be removed. Give them a different number instead.'
      using errcode = 'check_violation';
  end if;

  select s.auto_assign into v_auto from public.admission_number_settings s where s.id;
  if new.admission_number is null
    and coalesce(v_auto, false)
    and new.status::text in ('enrolled', 'active')
    -- On an update, only when it never had one (a number someone just cleared is not silently replaced).
    and (tg_op = 'INSERT' or old.admission_number is null) then
    new.admission_number := public.allocate_admission_number(new.level::text);
  end if;

  if new.admission_number is not null
    and (tg_op = 'INSERT' or public.admission_key(new.admission_number) is distinct from public.admission_key(old.admission_number)) then
    v_key := public.admission_key(new.admission_number);
    -- Serialise everyone saving the same number, then check: the second one waits and then sees the first.
    perform pg_advisory_xact_lock(hashtext('admission:' || v_key));
    select trim(concat_ws(' ', st.first_name, st.last_name)) || ' (' || st.admission_number || ')' into v_owner
    from public.students st
    where public.admission_key(st.admission_number) = v_key and st.id <> new.id
    limit 1;
    if v_owner is not null then
      raise exception 'Admission number % is already used by %.', new.admission_number, v_owner
        using errcode = 'unique_violation', hint = 'Choose another number, or open that pupil''s record if it is the same child.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.students_admission_number() from public, anon, authenticated;

-- Fast lookups by the comparison form (the unique version is added at the end when the data allows it).
create index if not exists students_admission_key_idx on public.students (public.admission_key(admission_number));

drop trigger if exists students_admission_number on public.students;
create trigger students_admission_number
  before insert or update of admission_number, status on public.students
  for each row execute function public.students_admission_number();

-- After a number is given or changed: log it, and move the pupil's portal sign-in to the new number.
create or replace function public.students_admission_number_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_local text;
  v_new_local text;
  r record;
  v_new_email text;
begin
  if tg_op = 'UPDATE' and new.admission_number is not distinct from old.admission_number then
    return null;
  end if;
  if tg_op = 'INSERT' and new.admission_number is null then
    return null;
  end if;

  insert into public.account_log (action, student_id, subject_name, admission_number, detail, done_by, done_by_name)
  values (
    case
      when tg_op = 'INSERT' or old.admission_number is null then 'number_assigned'
      when new.admission_number is null then 'number_removed'
      else 'number_changed'
    end,
    new.id,
    trim(concat_ws(' ', new.first_name, new.last_name)),
    new.admission_number,
    case when tg_op = 'UPDATE' and old.admission_number is not null then 'Was ' || old.admission_number end,
    auth.uid(),
    public.account_actor_name()
  );

  if tg_op = 'UPDATE' and old.admission_number is not null and new.admission_number is not null then
    v_old_local := public.admission_login_local(old.admission_number);
    v_new_local := public.admission_login_local(new.admission_number);
    if v_old_local is distinct from v_new_local then
      for r in
        select u.id, u.email
        from public.student_user_links l
        join auth.users u on u.id = l.user_id
        where l.student_id = new.id
          and split_part(lower(u.email), '@', 1) = v_old_local
      loop
        v_new_email := v_new_local || '@' || split_part(lower(r.email), '@', 2);
        if exists (select 1 from auth.users u2 where lower(u2.email) = v_new_email and u2.id <> r.id) then
          raise exception 'Another portal account already signs in as %. Link or remove it on Accounts & passwords first.', v_new_email;
        end if;
        update auth.users set email = v_new_email where id = r.id;
        if to_regclass('auth.identities') is not null then
          execute $q$
            update auth.identities
               set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb($1::text))
             where user_id = $2 and provider = 'email'
          $q$ using v_new_email, r.id;
        end if;
        -- profiles.email follows by itself (on_auth_user_email_changed, 20261117b).
      end loop;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.students_admission_number_after() from public, anon, authenticated;

drop trigger if exists students_admission_number_after on public.students;
create trigger students_admission_number_after
  after insert or update of admission_number on public.students
  for each row execute function public.students_admission_number_after();

-- ---------------------------------------------------------------------------------------------------------------
-- Admin actions

-- Changing the number format needs the developers' approval (the school's rule, Nov 2026). Admins can only ASK:
-- request_admission_format_change() records what they want and why. A developer approves or rejects it from the
-- Supabase SQL editor (which only developers can open), e.g.
--   select public.approve_admission_format_change('<request id>', 'Developer name', 'Checked with the bursar');
--   select public.reject_admission_format_change('<request id>', 'Developer name', 'Would clash with old numbers');
-- Those two can't be called from the website at all (no grants), only by the database owner.

create table if not exists public.admission_format_requests (
  id uuid primary key default gen_random_uuid(),
  template text not null check (position('{N}' in template) > 0),
  prefix text not null default '',
  section_prefixes jsonb not null default '{}'::jsonb,
  digits int not null check (digits between 1 and 8),
  year_basis text not null check (year_basis in ('calendar', 'session')),
  session_start_month int not null check (session_start_month between 1 and 12),
  auto_assign boolean not null,
  reason text not null check (length(trim(reason)) >= 5),
  -- What the format was when asked, so the developer sees the change, not just the new value.
  current_summary text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  decided_by_name text,
  decision_note text,
  decided_at timestamptz,
  constraint admission_format_requests_decided check ((status = 'pending') = (decided_at is null))
);
-- At most one request waiting at a time.
create unique index if not exists admission_format_requests_one_pending
  on public.admission_format_requests ((true)) where status = 'pending';
create index if not exists admission_format_requests_requested_idx on public.admission_format_requests(requested_at desc);

alter table public.admission_format_requests enable row level security;
drop policy if exists admission_format_requests_admin_read on public.admission_format_requests;
create policy admission_format_requests_admin_read on public.admission_format_requests
  for select to authenticated using (coalesce(public.is_admin(), false));
revoke insert, update, delete on public.admission_format_requests from anon, authenticated;

create or replace function public.admission_format_summary(
  p_template text, p_prefix text, p_digits int, p_year_basis text, p_auto boolean
)
returns text
language sql
immutable
as $$
  select p_template || ' · prefix ' || coalesce(nullif(p_prefix, ''), '(none)') || ' · ' || p_digits || ' digits · '
    || case p_year_basis when 'session' then 'session start year' else 'calendar year' end
    || case when p_auto then ' · numbers given automatically' else ' · numbers typed in by hand' end
$$;

-- Admins: ask the developers for a new format. Replaces any request still waiting.
create or replace function public.request_admission_format_change(
  p_template text,
  p_prefix text,
  p_section_prefixes jsonb,
  p_digits int,
  p_year_basis text,
  p_session_start_month int,
  p_auto_assign boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.admission_number_settings;
  v_id uuid;
  v_template text := trim(coalesce(p_template, ''));
  v_prefix text := upper(trim(coalesce(p_prefix, '')));
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can ask for a change to the admission number format.';
  end if;
  if position('{N}' in v_template) = 0 then
    raise exception 'The format must include {N} for the running number.';
  end if;
  if v_prefix = '' and position('{PREFIX}' in v_template) > 0 then
    raise exception 'Enter the school prefix (for example GRE).';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Say why the format should change, so the developers can check it.';
  end if;
  select * into s from public.admission_number_settings where id;
  if v_template = s.template and v_prefix = s.prefix and coalesce(p_section_prefixes, '{}'::jsonb) = s.section_prefixes
     and p_digits = s.digits and p_year_basis = s.year_basis and coalesce(p_session_start_month, 9) = s.session_start_month
     and coalesce(p_auto_assign, true) = s.auto_assign then
    raise exception 'That is already the format. Nothing to ask for.';
  end if;

  update public.admission_format_requests
     set status = 'cancelled', decided_at = now(), decided_by_name = public.account_actor_name(),
         decision_note = 'Replaced by a newer request'
   where status = 'pending';

  insert into public.admission_format_requests
    (template, prefix, section_prefixes, digits, year_basis, session_start_month, auto_assign, reason,
     current_summary, requested_by, requested_by_name)
  values
    (v_template, v_prefix, coalesce(p_section_prefixes, '{}'::jsonb), p_digits, p_year_basis, coalesce(p_session_start_month, 9),
     coalesce(p_auto_assign, true), trim(p_reason),
     public.admission_format_summary(s.template, s.prefix, s.digits, s.year_basis, s.auto_assign),
     auth.uid(), public.account_actor_name())
  returning id into v_id;

  insert into public.account_log (action, detail, done_by, done_by_name)
  values ('format_change_requested',
    'Asked for ' || public.admission_format_summary(v_template, v_prefix, p_digits, p_year_basis, coalesce(p_auto_assign, true)) || '. Reason: ' || left(trim(p_reason), 300),
    auth.uid(), public.account_actor_name());
  return v_id;
end;
$$;
revoke all on function public.request_admission_format_change(text, text, jsonb, int, text, int, boolean, text) from public, anon;
grant execute on function public.request_admission_format_change(text, text, jsonb, int, text, int, boolean, text) to authenticated;

-- Admins: withdraw their waiting request.
create or replace function public.cancel_admission_format_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can do this.';
  end if;
  update public.admission_format_requests
     set status = 'cancelled', decided_at = now(), decided_by_name = public.account_actor_name(), decision_note = 'Withdrawn by the school'
   where id = p_request and status = 'pending';
  if not found then
    raise exception 'That request is no longer waiting.';
  end if;
  insert into public.account_log (action, detail, done_by, done_by_name)
  values ('format_change_cancelled', 'Request withdrawn', auth.uid(), public.account_actor_name());
end;
$$;
revoke all on function public.cancel_admission_format_request(uuid) from public, anon;
grant execute on function public.cancel_admission_format_request(uuid) to authenticated;

-- Developers only (SQL editor). Applies the request and logs it with the developer's name.
create or replace function public.approve_admission_format_change(p_request uuid, p_developer text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.admission_format_requests;
  v_before text;
  v_after text;
begin
  if auth.uid() is not null then
    raise exception 'Only the developers can approve a format change, from the database itself.';
  end if;
  if length(trim(coalesce(p_developer, ''))) < 2 then
    raise exception 'Give your name as the developer approving it.';
  end if;
  select * into r from public.admission_format_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then
    raise exception 'That request is not waiting for a decision.';
  end if;

  select public.admission_format_summary(template, prefix, digits, year_basis, auto_assign) into v_before
  from public.admission_number_settings where id;
  update public.admission_number_settings set
    template = r.template, prefix = r.prefix, section_prefixes = r.section_prefixes, digits = r.digits,
    year_basis = r.year_basis, session_start_month = r.session_start_month, auto_assign = r.auto_assign,
    updated_by = r.requested_by, updated_at = now()
  where id;
  select public.admission_format_summary(template, prefix, digits, year_basis, auto_assign) into v_after
  from public.admission_number_settings where id;

  update public.admission_format_requests
     set status = 'approved', decided_at = now(), decided_by_name = trim(p_developer) || ' (developer)', decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = r.id;
  insert into public.account_log (action, detail, done_by, done_by_name)
  values ('settings_changed', 'Was: ' || v_before || '. Now: ' || v_after || '. Asked by ' || coalesce(r.requested_by_name, 'an admin'),
          null, trim(p_developer) || ' (developer)');
  return 'Approved. New numbers will look like ' || public.preview_admission_number_unchecked(null);
end;
$$;
revoke all on function public.approve_admission_format_change(uuid, text, text) from public, anon, authenticated, service_role;

create or replace function public.reject_admission_format_change(p_request uuid, p_developer text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    raise exception 'Only the developers can decide on a format change, from the database itself.';
  end if;
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Say why, so the school knows what to do next.';
  end if;
  update public.admission_format_requests
     set status = 'rejected', decided_at = now(), decided_by_name = trim(coalesce(p_developer, 'Developer')) || ' (developer)', decision_note = trim(p_note)
   where id = p_request and status = 'pending';
  if not found then
    raise exception 'That request is not waiting for a decision.';
  end if;
  insert into public.account_log (action, detail, done_by, done_by_name)
  values ('format_change_rejected', 'Not approved: ' || trim(p_note), null, trim(coalesce(p_developer, 'Developer')) || ' (developer)');
end;
$$;
revoke all on function public.reject_admission_format_change(uuid, text, text) from public, anon, authenticated, service_role;

-- Give numbers to on-roll pupils who have none (all of them, or the ones listed), oldest record first.
create or replace function public.assign_missing_admission_numbers(p_students uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can give admission numbers.';
  end if;
  for r in
    select st.id, st.level::text as level
    from public.students st
    where st.admission_number is null
      and st.status::text in ('applied', 'enrolled', 'active')
      and (p_students is null or st.id = any (p_students))
    order by st.created_at, st.last_name, st.first_name
  loop
    update public.students set admission_number = public.allocate_admission_number(r.level) where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.assign_missing_admission_numbers(uuid[]) from public, anon;
grant execute on function public.assign_missing_admission_numbers(uuid[]) to authenticated;

-- Written by the website after it creates an account or resets a password (it does those with the service key,
-- which can't say who the admin was). Admins only; the admin is taken from the session, not from the caller.
create or replace function public.log_account_action(
  p_action text,
  p_student uuid default null,
  p_guardian uuid default null,
  p_user uuid default null,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_adm text;
begin
  -- Admins log account changes; any staff member who adds a pupil despite a likely duplicate logs that choice.
  if not (coalesce(public.is_admin(), false)
          or (p_action = 'duplicate_override' and coalesce(public.is_staff(), false))) then
    raise exception 'Only admins can do this.';
  end if;
  if p_action not in ('account_created', 'password_reset', 'account_linked', 'account_unlinked', 'slips_printed', 'duplicate_override') then
    raise exception 'Unknown action %', p_action;
  end if;
  if p_student is not null then
    select trim(concat_ws(' ', first_name, last_name)), admission_number into v_name, v_adm from public.students where id = p_student;
  elsif p_guardian is not null then
    select full_name into v_name from public.guardians where id = p_guardian;
  end if;
  insert into public.account_log (action, student_id, guardian_id, user_id, subject_name, admission_number, detail, done_by, done_by_name)
  values (p_action, p_student, p_guardian, p_user, v_name, v_adm, left(p_detail, 500), auth.uid(), public.account_actor_name());
end;
$$;
revoke all on function public.log_account_action(text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.log_account_action(text, uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Likely duplicates: check before adding a pupil.

create or replace function public.name_key(p text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(lower(coalesce(p, '')), '[^a-z]', '', 'g')
$$;

create or replace function public.phone_key(p text)
returns text
language sql
immutable
parallel safe
as $$
  -- Last 10 digits, so +234 803…, 234803… and 0803… match.
  select nullif(right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 10), '')
$$;

-- The duplicate check looks parents up by their cleaned-up phone and email, and pupils by name and birthday.
create index if not exists guardians_phone_key_idx on public.guardians (public.phone_key(phone));
create index if not exists guardians_email_lower_idx on public.guardians (lower(trim(email)));
create index if not exists students_name_key_idx on public.students (public.name_key(last_name), public.name_key(first_name));
create index if not exists students_first_name_key_idx on public.students (public.name_key(first_name));
create index if not exists students_dob_idx on public.students (date_of_birth) where date_of_birth is not null;

create or replace function public.find_possible_duplicates(
  p_first text,
  p_last text,
  p_dob date default null,
  p_phones text[] default null,
  p_emails text[] default null,
  p_exclude uuid default null
)
returns table (
  student_id uuid,
  full_name text,
  admission_number text,
  class_name text,
  status text,
  date_of_birth date,
  reasons text[],
  strength int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first text := public.name_key(p_first);
  v_last text := public.name_key(p_last);
  v_phones text[] := array(select distinct public.phone_key(x) from unnest(coalesce(p_phones, '{}')) x where public.phone_key(x) is not null and length(public.phone_key(x)) >= 7);
  v_emails text[] := array(select distinct lower(trim(x)) from unnest(coalesce(p_emails, '{}')) x where position('@' in coalesce(x, '')) > 1);
begin
  if not coalesce(public.is_staff(), false) then
    return;
  end if;
  return query
  -- Candidates first, through indexes (name, surname swapped, birthday, parent phone/email); then score them.
  with ids as (
    select st.id from public.students st where public.name_key(st.last_name) in (v_last, v_first)
    union
    select st.id from public.students st where v_first <> '' and public.name_key(st.first_name) = v_first
    union
    select st.id from public.students st where p_dob is not null and st.date_of_birth = p_dob
    union
    select sg.student_id
    from public.guardians g join public.student_guardians sg on sg.guardian_id = g.id
    where public.phone_key(g.phone) = any (v_phones) or lower(trim(g.email)) = any (v_emails)
  ),
  cand as (
    select
      st.id,
      trim(concat_ws(' ', st.first_name, st.middle_name, st.last_name)) as nm,
      st.admission_number as adm,
      c.name as cls,
      st.status::text as stat,
      st.date_of_birth as dob,
      public.name_key(st.first_name) as f,
      public.name_key(st.last_name) as l,
      public.name_key(st.middle_name) as m,
      exists (
        select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
        where sg.student_id = st.id and public.phone_key(g.phone) = any (v_phones)
      ) as phone_hit,
      exists (
        select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
        where sg.student_id = st.id and lower(trim(g.email)) = any (v_emails)
      ) as email_hit
    from public.students st
    left join public.classes c on c.id = st.class_id
    where st.id in (select ids.id from ids)
      and (p_exclude is null or st.id <> p_exclude)
  ),
  scored as (
    select cand.*,
      ((f = v_first and l = v_last) or (f = v_last and l = v_first)) as same_name,
      (v_first <> '' and v_last <> '' and (
        (l = v_last and (left(f, 3) = left(v_first, 3) or m = v_first or f = (select public.name_key(split_part(p_first, ' ', 1)))))
        or (f = v_first and left(l, 4) = left(v_last, 4))
      )) as similar_name,
      (p_dob is not null and dob = p_dob) as same_dob
    from cand
  )
  select s.id, s.nm, s.adm, s.cls, s.stat, s.dob,
    array_remove(array[
      case when s.same_name and s.same_dob then 'Same name and date of birth' end,
      case when s.same_name and not s.same_dob then 'Same name' end,
      case when not s.same_name and s.similar_name then 'Similar name' end,
      case when not s.same_name and s.same_dob and s.l = v_last then 'Same surname and date of birth' end,
      case when s.phone_hit then 'Same parent phone number' end,
      case when s.email_hit then 'Same parent email' end
    ], null),
    (case when s.same_name and s.same_dob then 100 else 0 end)
      + (case when s.same_name then 50 when s.similar_name then 25 else 0 end)
      + (case when s.same_dob and s.l = v_last then 20 else 0 end)
      + (case when s.phone_hit then 15 else 0 end)
      + (case when s.email_hit then 15 else 0 end)
  from scored s
  where (v_first <> '' or v_last <> '')
    and (s.same_name or s.similar_name or (s.same_dob and s.l = v_last)
         -- A shared parent phone/email alone is usually a brother or sister, so only show it with some name match.
         or ((s.phone_hit or s.email_hit) and (s.f = v_first or s.same_dob)))
  order by 8 desc, 2
  limit 8;
end;
$$;
revoke all on function public.find_possible_duplicates(text, text, date, text[], text[], uuid) from public, anon;
grant execute on function public.find_possible_duplicates(text, text, date, text[], text[], uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- The Accounts page (admins only). These read sign-in times, which only the database can see.

create or replace function public.admin_pupil_accounts()
returns table (
  student_id uuid,
  first_name text,
  last_name text,
  admission_number text,
  class_id uuid,
  class_name text,
  level text,
  status text,
  user_id uuid,
  login_email text,
  last_sign_in_at timestamptz,
  account_created_at timestamptz,
  account_count int,
  login_matches_number boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select st.id, st.first_name, st.last_name, st.admission_number, st.class_id, c.name, st.level::text, st.status::text,
    a.user_id, a.email, a.last_sign_in_at, a.created_at, coalesce(a.n, 0),
    case when a.user_id is null then null else split_part(lower(a.email), '@', 1) = public.admission_login_local(st.admission_number) end
  from public.students st
  left join public.classes c on c.id = st.class_id
  left join lateral (
    select l.user_id, u.email, u.last_sign_in_at, u.created_at, count(*) over () ::int as n
    from public.student_user_links l join auth.users u on u.id = l.user_id
    where l.student_id = st.id
    order by u.last_sign_in_at desc nulls last
    limit 1
  ) a on true
  where coalesce(public.is_admin(), false)
$$;
revoke all on function public.admin_pupil_accounts() from public, anon;
grant execute on function public.admin_pupil_accounts() to authenticated;

create or replace function public.admin_parent_accounts()
returns table (
  guardian_id uuid,
  full_name text,
  email text,
  phone text,
  children text,
  child_ids uuid[],
  user_id uuid,
  login_email text,
  last_sign_in_at timestamptz,
  account_created_at timestamptz,
  account_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.full_name, g.email, g.phone,
    (select string_agg(trim(concat_ws(' ', st.first_name, st.last_name)), ', ' order by st.first_name)
       from public.student_guardians sg join public.students st on st.id = sg.student_id
      where sg.guardian_id = g.id and st.status::text <> 'inactive'),
    (select array_agg(sg.student_id) from public.student_guardians sg where sg.guardian_id = g.id),
    a.user_id, a.email, a.last_sign_in_at, a.created_at, coalesce(a.n, 0)
  from public.guardians g
  left join lateral (
    select l.user_id, u.email, u.last_sign_in_at, u.created_at, count(*) over () ::int as n
    from public.guardian_user_links l join auth.users u on u.id = l.user_id
    where l.guardian_id = g.id
    order by u.last_sign_in_at desc nulls last
    limit 1
  ) a on true
  where coalesce(public.is_admin(), false)
$$;
revoke all on function public.admin_parent_accounts() from public, anon;
grant execute on function public.admin_parent_accounts() to authenticated;

-- Parent and pupil accounts that aren't linked to anyone.
create or replace function public.admin_unlinked_accounts()
returns table (user_id uuid, email text, role text, full_name text, created_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, p.role::text, p.full_name, u.created_at, u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where coalesce(public.is_admin(), false)
    and coalesce(p.role::text, 'parent') in ('parent', 'student')
    and not exists (select 1 from public.student_user_links l where l.user_id = u.id)
    and not exists (select 1 from public.guardian_user_links l where l.user_id = u.id)
  order by u.created_at desc
$$;
revoke all on function public.admin_unlinked_accounts() from public, anon;
grant execute on function public.admin_unlinked_accounts() to authenticated;

-- Pupils who share a number today (from before this rule). Shown on Accounts until fixed.
create or replace function public.admission_number_clashes()
returns table (admission_key text, students jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select public.admission_key(st.admission_number),
    jsonb_agg(jsonb_build_object('id', st.id, 'name', trim(concat_ws(' ', st.first_name, st.last_name)),
      'admission_number', st.admission_number, 'status', st.status::text) order by st.created_at)
  from public.students st
  where coalesce(public.is_admin(), false) and st.admission_number is not null
  group by 1
  having count(*) > 1
$$;
revoke all on function public.admission_number_clashes() from public, anon;
grant execute on function public.admission_number_clashes() to authenticated;

-- The strict rule in the database. Switched on only when no two pupils share a number already (otherwise the
-- whole file would fail); fix the clashes on Accounts & passwords and run this file again.
do $$
begin
  if not exists (
    select 1 from public.students where admission_number is not null
    group by public.admission_key(admission_number) having count(*) > 1
  ) then
    execute 'create unique index if not exists students_admission_key_unique on public.students (public.admission_key(admission_number)) where admission_number is not null';
  else
    raise notice 'Some pupils share an admission number. Fix them on People → Accounts & passwords, then run this file again.';
  end if;
end;
$$;
