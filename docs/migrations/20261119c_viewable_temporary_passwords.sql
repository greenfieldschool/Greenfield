-- Temporary passwords admins can look up again, until the end of the term
--
-- What this does, in plain words (the school's decision, Nov 2026):
-- - When an admin gives a parent or pupil a temporary password, the school keeps a locked copy so an admin can look
--   it up again (or reprint the login slip) when a family loses it.
-- - The copy is scrambled by the website before it reaches the database, with a key the database never sees. Someone
--   with a copy of the database alone can't read it. Only admins can look one up, through the website, and every
--   look-up is recorded in the account history with their name.
-- - A temporary password lasts until the end of the current term. After that the person must choose their own
--   password the next time they sign in, and the school's copy is deleted.
-- - As soon as the person chooses their own password, the school's copy is deleted. Nobody, not even admins, can see
--   a password a parent or pupil chose themselves: Supabase keeps only a scrambled form that can't be turned back.
--
-- Run AFTER 20261117_admission_numbers_and_accounts.sql. Safe to run twice. The SQL editor may warn about
-- "destructive operations": that is the `drop … if exists` lines that replace older versions. Expected.

-- ---------------------------------------------------------------------------------------------------------------

-- Account history: two new kinds of entry.
alter table public.account_log drop constraint if exists account_log_action_check;
alter table public.account_log add constraint account_log_action_check check (action in (
  'number_assigned', 'number_changed', 'number_removed',
  'account_created', 'password_reset', 'account_linked', 'account_unlinked',
  'slips_printed', 'settings_changed', 'duplicate_override',
  'format_change_requested', 'format_change_cancelled', 'format_change_rejected',
  'password_viewed', 'temporary_password_cleared'
));

-- One row per sign-in that currently has a school-given password. Not linked to students or guardians directly
-- (the sign-in links already say whose it is), so it never counts as something "attached" to a pupil record.
create table if not exists public.temporary_passwords (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- "v1:" + base64(iv | tag | ciphertext), AES-256-GCM, encrypted and decrypted only by the website's server.
  ciphertext text not null check (ciphertext like 'v1:%'),
  expires_at timestamptz not null,
  set_by uuid references auth.users(id) on delete set null,
  set_by_name text,
  set_at timestamptz not null default now()
);
create index if not exists temporary_passwords_expires_idx on public.temporary_passwords (expires_at);

-- No policies: nobody reads or writes the table directly. Everything goes through the functions below.
alter table public.temporary_passwords enable row level security;
revoke all on public.temporary_passwords from anon, authenticated;

-- When the current term ends (end of that day, Lagos time). Without term dates: four months from now.
create or replace function public.temporary_password_expiry()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ((t.ends_on + 1)::timestamp at time zone 'Africa/Lagos')
       from public.academic_terms t
      where t.ends_on is not null
        and t.ends_on >= (now() at time zone 'Africa/Lagos')::date
        and (t.starts_on is null or t.starts_on <= (now() at time zone 'Africa/Lagos')::date)
      order by t.is_active desc, t.ends_on
      limit 1),
    (select ((t.ends_on + 1)::timestamp at time zone 'Africa/Lagos')
       from public.academic_terms t
      where t.ends_on is not null and t.ends_on >= (now() at time zone 'Africa/Lagos')::date
      order by t.ends_on
      limit 1),
    now() + interval '4 months'
  )
$$;
revoke all on function public.temporary_password_expiry() from public, anon;
grant execute on function public.temporary_password_expiry() to authenticated;

-- Whose sign-in is this? For the log. Internal.
create or replace function public.account_owner(p_user uuid, out student_id uuid, out guardian_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select (select l.student_id from public.student_user_links l where l.user_id = p_user limit 1),
         (select l.guardian_id from public.guardian_user_links l where l.user_id = p_user limit 1)
$$;
revoke all on function public.account_owner(uuid) from public, anon, authenticated;

-- Admins: keep the (already scrambled) copy of a temporary password just given. Returns when it runs out.
create or replace function public.save_temporary_password(p_user uuid, p_ciphertext text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  v_expires timestamptz := public.temporary_password_expiry();
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can give temporary passwords.';
  end if;
  if coalesce(p_ciphertext, '') not like 'v1:%' then
    raise exception 'The password copy is not in the expected form; nothing was saved.';
  end if;
  select * into o from public.account_owner(p_user);
  if o.student_id is null and o.guardian_id is null then
    raise exception 'That sign-in is not linked to a pupil or parent.';
  end if;
  insert into public.temporary_passwords (user_id, ciphertext, expires_at, set_by, set_by_name, set_at)
  values (p_user, p_ciphertext, v_expires, auth.uid(), public.account_actor_name(), now())
  on conflict (user_id) do update
    set ciphertext = excluded.ciphertext, expires_at = excluded.expires_at, set_by = excluded.set_by,
        set_by_name = excluded.set_by_name, set_at = excluded.set_at;
  return v_expires;
end;
$$;
revoke all on function public.save_temporary_password(uuid, text) from public, anon;
grant execute on function public.save_temporary_password(uuid, text) to authenticated;

-- Admins: which sign-ins have a temporary password still in force (no password, just dates). Clears expired ones.
create or replace function public.admin_temporary_passwords()
returns table (user_id uuid, expires_at timestamptz, set_by_name text, set_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    return;
  end if;
  delete from public.temporary_passwords t where t.expires_at <= now();
  return query select t.user_id, t.expires_at, t.set_by_name, t.set_at from public.temporary_passwords t;
end;
$$;
revoke all on function public.admin_temporary_passwords() from public, anon;
grant execute on function public.admin_temporary_passwords() to authenticated;

-- Admins: look temporary passwords up again (scrambled; the website unscrambles them). Every look-up is logged.
create or replace function public.view_temporary_passwords(p_users uuid[], p_purpose text default 'Looked up')
returns table (user_id uuid, ciphertext text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  o record;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can look up temporary passwords.';
  end if;
  if coalesce(array_length(p_users, 1), 0) > 200 then
    raise exception 'Look up at most 200 at a time.';
  end if;
  delete from public.temporary_passwords t where t.expires_at <= now();
  for r in select t.* from public.temporary_passwords t where t.user_id = any (p_users) loop
    select * into o from public.account_owner(r.user_id);
    insert into public.account_log (action, student_id, guardian_id, user_id, subject_name, admission_number, detail, done_by, done_by_name)
    select 'password_viewed', o.student_id, o.guardian_id, r.user_id,
      coalesce((select trim(concat_ws(' ', s.first_name, s.last_name)) from public.students s where s.id = o.student_id),
               (select g.full_name from public.guardians g where g.id = o.guardian_id)),
      (select s.admission_number from public.students s where s.id = o.student_id),
      left(coalesce(nullif(trim(p_purpose), ''), 'Looked up'), 200),
      auth.uid(), public.account_actor_name();
    user_id := r.user_id;
    ciphertext := r.ciphertext;
    expires_at := r.expires_at;
    return next;
  end loop;
end;
$$;
revoke all on function public.view_temporary_passwords(uuid[], text) from public, anon;
grant execute on function public.view_temporary_passwords(uuid[], text) to authenticated;

-- Parents and pupils: called after they choose their own password. Deletes the school's copy and records it.
create or replace function public.clear_my_temporary_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
begin
  if auth.uid() is null then
    return;
  end if;
  delete from public.temporary_passwords where user_id = auth.uid();
  if found then
    select * into o from public.account_owner(auth.uid());
    insert into public.account_log (action, student_id, guardian_id, user_id, subject_name, detail, done_by, done_by_name)
    values ('temporary_password_cleared', o.student_id, o.guardian_id, auth.uid(),
      coalesce((select trim(concat_ws(' ', s.first_name, s.last_name)) from public.students s where s.id = o.student_id),
               (select g.full_name from public.guardians g where g.id = o.guardian_id)),
      'Chose their own password; the school''s copy was deleted', auth.uid(), public.account_actor_name());
  end if;
end;
$$;
revoke all on function public.clear_my_temporary_password() from public, anon;
grant execute on function public.clear_my_temporary_password() to authenticated;
