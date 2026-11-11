-- Locks down who can change a person's role, and keeps a record of every role change. Run AFTER 20261110_email.sql.
--
-- Why: the rule that lets everyone edit their own name ("profiles_update_own_name") did not stop them editing their
-- own role, so a parent or pupil could make themselves a super admin from the browser. From now on the database
-- itself checks every role change:
--   * only staff with the admin or super admin role can change roles, and nobody can change their own role;
--   * only a super admin can make someone an admin or super admin, or take that role away;
--   * an admin can only give the roles teacher, front desk, nurse, parent or student, to people who are not admins;
--   * the last super admin can never be demoted or removed;
--   * people who are not admins can still edit their own name and photo, but not their role or email.
-- Every role change is written to role_change_log (who changed it, whose account, from, to, when). Admins can read
-- it; nobody can edit or delete it.
--
-- Changes made by the website's server key (creating parent and pupil accounts) or in this SQL editor are trusted
-- and logged with no "changed by". The last-super-admin rule applies to them too.
--
-- Safe to run twice. The editor may warn about "destructive operations": they are the "drop trigger if exists"
-- lines that replace the old versions. Nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.role_change_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  user_name text,
  old_role public.app_role,
  new_role public.app_role,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now()
);

create index if not exists role_change_log_changed_at_idx on public.role_change_log (changed_at desc);
create index if not exists role_change_log_user_idx on public.role_change_log (user_id, changed_at desc);

alter table public.role_change_log enable row level security;

drop policy if exists "role_change_log_admin_read" on public.role_change_log;
create policy "role_change_log_admin_read"
  on public.role_change_log
  for select
  to authenticated
  using (coalesce(public.is_admin(), false));

revoke insert, update, delete, truncate on public.role_change_log from anon, authenticated;
grant select on public.role_change_log to authenticated;

-- True for the server key and the SQL editor (no signed-in user, not the public key).
create or replace function public.role_change_trusted_caller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null
     and coalesce(nullif(auth.role(), ''), 'service_role') not in ('anon', 'authenticated');
$$;

revoke all on function public.role_change_trusted_caller() from public, anon, authenticated;

-- The plain-language reason a role change is refused, or NULL when it is allowed.
-- Mirrors roleChangeProblem() in src/lib/roles.ts; keep the two in step.
create or replace function public.role_change_problem(
  p_actor uuid,
  p_actor_role public.app_role,
  p_target uuid,
  p_old public.app_role,
  p_new public.app_role
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_old is not distinct from p_new then null
    when p_actor_role is null or p_actor_role not in ('super_admin', 'admin') then
      'Only an admin can change roles.'
    when p_actor = p_target then
      'You cannot change your own role. Ask another admin.'
    when p_actor_role = 'super_admin' then null
    when p_old in ('super_admin', 'admin') then
      'Only a super admin can change the role of an admin or super admin.'
    when p_new in ('super_admin', 'admin') then
      'Only a super admin can make someone an admin or super admin.'
    else null
  end;
$$;

revoke all on function public.role_change_problem(uuid, public.app_role, uuid, public.app_role, public.app_role)
  from public, anon, authenticated;

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

revoke all on function public.profiles_guard_role() from public, anon, authenticated;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before insert or update or delete on public.profiles
  for each row execute procedure public.profiles_guard_role();

create or replace function public.profiles_log_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if new.role is distinct from old.role then
    insert into public.role_change_log (user_id, user_name, old_role, new_role, changed_by, changed_by_name)
    values (
      new.id,
      coalesce(nullif(new.full_name, ''), new.email),
      old.role,
      new.role,
      actor,
      (select coalesce(nullif(p.full_name, ''), p.email) from public.profiles p where p.id = actor)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_log_role_change() from public, anon, authenticated;

drop trigger if exists profiles_log_role_change on public.profiles;
create trigger profiles_log_role_change
  after update of role on public.profiles
  for each row execute procedure public.profiles_log_role_change();
