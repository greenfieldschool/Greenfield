-- Single source of truth fixes (data-modelling review, Nov 2026)
--
-- What this does, in plain words:
-- 1. A pupil's section (creche / primary / secondary) now always follows their class. It was stored on the pupil
--    as well, and only some screens kept the two in step. Pupils without a class keep the section typed for them.
--    If a class's section is corrected, its pupils follow.
-- 2. The email shown on someone's profile now always follows the email they sign in with. It was only copied when
--    the account was first made.
-- 3. Existing records are brought into line once, and the counts are shown as notices.
--
-- Run AFTER 20261117_admission_numbers_and_accounts.sql. Safe to run twice. The SQL editor may warn about
-- "destructive operations": that is the `drop … if exists` lines that replace older versions. Expected.

-- ---------------------------------------------------------------------------------------------------------------

-- 1. Section follows the class (classes.level is the source of truth).
-- Named with "00" so it runs before the other BEFORE triggers on students (they run in name order): the admission
-- number is then built from the right section.
create or replace function public.students_level_follows_class()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_level public.school_level;
begin
  if new.class_id is not null then
    select c.level into v_level from public.classes c where c.id = new.class_id;
    if v_level is not null then
      new.level := v_level;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.students_level_follows_class() from public, anon, authenticated;

drop trigger if exists students_00_level_follows_class on public.students;
create trigger students_00_level_follows_class
  before insert or update of class_id, level on public.students
  for each row execute function public.students_level_follows_class();

create or replace function public.classes_level_to_students()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students set level = new.level where class_id = new.id and level is distinct from new.level;
  return null;
end;
$$;
revoke all on function public.classes_level_to_students() from public, anon, authenticated;

drop trigger if exists classes_level_to_students on public.classes;
create trigger classes_level_to_students
  after update of level on public.classes
  for each row when (new.level is distinct from old.level)
  execute function public.classes_level_to_students();

do $$
declare
  n int;
begin
  update public.students s set level = c.level
  from public.classes c
  where c.id = s.class_id and s.level is distinct from c.level;
  get diagnostics n = row_count;
  raise notice 'Pupils whose section was corrected to match their class: %', n;
end;
$$;

-- 2. Profile email follows the sign-in email (auth.users.email is the source of truth).
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trusted boolean := coalesce(public.role_change_trusted_caller(), false);
  actor uuid := auth.uid();
  actor_role public.app_role;
  old_role public.app_role;
  problem text;
begin
  -- Keeping the sign-in email copy in step (sync_profile_email, 20261117b): only profiles.email may change, and the
  -- flag can only be set inside that security definer function.
  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.profile_email_sync', true), '') = 'on'
     and (to_jsonb(new) - 'email' - 'updated_at') = (to_jsonb(old) - 'email' - 'updated_at') then
    return new;
  end if;

  if tg_op = 'DELETE' then
    old_role := old.role;
  elsif tg_op = 'UPDATE' then
    old_role := old.role;
  else
    old_role := null;
  end if;

  if not trusted then
    select p.role into actor_role from public.profiles p where p.id = actor;

    if tg_op = 'UPDATE' then
      -- People who are not admins may only edit their own name and photo.
      if actor_role is null or actor_role not in ('super_admin', 'admin') then
        if new.id is distinct from old.id
           or new.email is distinct from old.email
           or new.created_at is distinct from old.created_at then
          raise exception 'You can only change your own name and photo.' using errcode = '42501';
        end if;
      end if;
      problem := public.role_change_problem(actor, actor_role, old.id, old.role, new.role);
    elsif tg_op = 'INSERT' then
      -- New accounts start as parents. Anything else is a role change from parent.
      problem := public.role_change_problem(actor, actor_role, new.id, 'parent', new.role);
    else
      -- Removing someone's profile takes their role away.
      if old.role in ('super_admin', 'admin') or actor = old.id then
        problem := public.role_change_problem(actor, actor_role, old.id, old.role, 'parent');
      end if;
    end if;

    if problem is not null then
      raise exception '%', problem using errcode = '42501';
    end if;
  end if;

  -- The school must always keep at least one super admin.
  if old_role = 'super_admin' and (tg_op = 'DELETE' or new.role is distinct from 'super_admin') then
    perform pg_advisory_xact_lock(hashtext('greenfield_last_super_admin'));
    if not exists (select 1 from public.profiles p where p.role = 'super_admin' and p.id <> old.id) then
      raise exception 'This is the last super admin. Make someone else a super admin first.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.profile_email_sync', 'on', true);
  update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
  perform set_config('app.profile_email_sync', 'off', true);
  return null;
end;
$$;
revoke all on function public.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.sync_profile_email();

-- Bring existing profiles into line, one at a time so a single clash can't stop the rest.
do $$
declare
  r record;
  fixed int := 0;
  skipped int := 0;
begin
  perform set_config('app.profile_email_sync', 'on', true);
  for r in
    select p.id, u.email from public.profiles p join auth.users u on u.id = p.id
    where p.email is distinct from u.email
  loop
    begin
      update public.profiles set email = r.email where id = r.id;
      fixed := fixed + 1;
    exception when unique_violation then
      skipped := skipped + 1;
    end;
  end loop;
  perform set_config('app.profile_email_sync', 'off', true);
  raise notice 'Profile emails corrected: %, left as they were because another profile has that email: %', fixed, skipped;
end;
$$;
