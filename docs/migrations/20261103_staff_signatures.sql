-- Staff signatures for certificates (3 Nov 2026). Run AFTER 20261102_weekly_welfare.sql.
--
-- 1. staff_signatures: each member of staff draws (or uploads) their signature once on their profile page. It is
--    kept as a small PNG picture with the name to print under it. Only that person can add, change or remove it;
--    other staff can see it (a class teacher prints certificates signed by the head teacher). Parents only ever see it
--    printed on their child's certificate.
-- 2. school_settings: one row for the whole school. head_teacher_id = whose signature goes on the "Head teacher" line
--    of every certificate, and head_teacher_title = the words under it ("Head teacher", "Principal" ...). Only admins
--    can change it (Admin → Settings).
--
-- Safe to run twice. The Supabase editor may warn about "destructive operations": that is the policies below being
-- replaced (drop policy if exists). Nothing is deleted. Both tables have Row Level Security on.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Signatures
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.staff_signatures (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signature text not null,
  signed_name text not null,
  updated_at timestamptz not null default now(),
  constraint staff_signatures_png check (signature like 'data:image/png;base64,%' and length(signature) <= 400000),
  constraint staff_signatures_name check (length(btrim(signed_name)) between 2 and 80)
);

alter table public.staff_signatures enable row level security;

drop policy if exists staff_signatures_staff_select on public.staff_signatures;
create policy staff_signatures_staff_select
  on public.staff_signatures
  for select
  to authenticated
  using (coalesce(public.is_staff(), false));

drop policy if exists staff_signatures_own_insert on public.staff_signatures;
create policy staff_signatures_own_insert
  on public.staff_signatures
  for insert
  to authenticated
  with check (user_id = auth.uid() and coalesce(public.is_staff(), false));

drop policy if exists staff_signatures_own_update on public.staff_signatures;
create policy staff_signatures_own_update
  on public.staff_signatures
  for update
  to authenticated
  using (user_id = auth.uid() and coalesce(public.is_staff(), false))
  with check (user_id = auth.uid() and coalesce(public.is_staff(), false));

drop policy if exists staff_signatures_own_delete on public.staff_signatures;
create policy staff_signatures_own_delete
  on public.staff_signatures
  for delete
  to authenticated
  using (user_id = auth.uid() and coalesce(public.is_staff(), false));

-- ---------------------------------------------------------------------------------------------------------------
-- 2. School settings (one row)
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.school_settings (
  id boolean primary key default true,
  head_teacher_id uuid references auth.users(id) on delete set null,
  head_teacher_title text not null default 'Head teacher',
  updated_at timestamptz not null default now(),
  constraint school_settings_one_row check (id),
  constraint school_settings_title check (length(btrim(head_teacher_title)) between 2 and 40)
);

insert into public.school_settings (id) values (true) on conflict (id) do nothing;

alter table public.school_settings enable row level security;

drop policy if exists school_settings_staff_select on public.school_settings;
create policy school_settings_staff_select
  on public.school_settings
  for select
  to authenticated
  using (coalesce(public.is_staff(), false));

drop policy if exists school_settings_admin_update on public.school_settings;
create policy school_settings_admin_update
  on public.school_settings
  for update
  to authenticated
  using (coalesce(public.is_admin(), false))
  with check (coalesce(public.is_admin(), false));
