create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum (
    'super_admin',
    'admin',
    'teacher',
    'front_desk',
    'nurse',
    'parent',
    'student'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.school_level as enum ('creche','primary','secondary');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.student_status as enum ('applied','enrolled','active','graduated','withdrawn','transferred');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'parent',
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;

create unique index if not exists profiles_email_unique on public.profiles (lower(email));

alter table public.profiles enable row level security;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('super_admin','admin','teacher','front_desk','nurse');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('super_admin','admin');
$$;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_staff_select"
  on public.profiles
  for select
  to authenticated
  using (public.is_staff());

create policy "profiles_update_own_name"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_manage"
  on public.profiles
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, email, full_name)
  values (
    new.id,
    'parent',
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  level public.school_level not null,
  status public.student_status not null default 'applied',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  relationship text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (student_id, guardian_id)
);

create table if not exists public.guardian_user_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.student_user_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_enrollments (
  activity_id uuid not null references public.activities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (activity_id, student_id)
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  status text not null,
  created_at timestamptz not null default now(),
  unique (student_id, date)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  category text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;
alter table public.guardian_user_links enable row level security;
alter table public.student_user_links enable row level security;
alter table public.activities enable row level security;
alter table public.activity_enrollments enable row level security;
alter table public.attendance_records enable row level security;
alter table public.incidents enable row level security;

create policy "students_staff_all"
  on public.students
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "students_parent_select"
  on public.students
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = students.id
    )
  );

create policy "students_student_select"
  on public.students
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = students.id
    )
  );

create policy "guardians_staff_all"
  on public.guardians
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "guardians_parent_select_own"
  on public.guardians
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.guardian_user_links gul
      where gul.user_id = auth.uid()
        and gul.guardian_id = guardians.id
    )
  );

create policy "student_guardians_staff_all"
  on public.student_guardians
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "student_guardians_parent_select"
  on public.student_guardians
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.guardian_user_links gul
      where gul.user_id = auth.uid()
        and gul.guardian_id = student_guardians.guardian_id
    )
  );

create policy "guardian_user_links_staff_all"
  on public.guardian_user_links
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "guardian_user_links_select_own"
  on public.guardian_user_links
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "student_user_links_staff_all"
  on public.student_user_links
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "student_user_links_select_own"
  on public.student_user_links
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "activities_staff_all"
  on public.activities
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "activities_portal_select"
  on public.activities
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.activity_enrollments ae
      join public.students s on s.id = ae.student_id
      where ae.activity_id = activities.id
        and (
          exists (
            select 1
            from public.student_user_links sul
            where sul.user_id = auth.uid()
              and sul.student_id = s.id
          )
          or exists (
            select 1
            from public.guardian_user_links gul
            join public.student_guardians sg on sg.guardian_id = gul.guardian_id
            where gul.user_id = auth.uid()
              and sg.student_id = s.id
          )
        )
    )
  );

create policy "activity_enrollments_staff_all"
  on public.activity_enrollments
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "activity_enrollments_portal_select"
  on public.activity_enrollments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = activity_enrollments.student_id
    )
    or exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = activity_enrollments.student_id
    )
  );

create policy "attendance_staff_all"
  on public.attendance_records
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "attendance_portal_select"
  on public.attendance_records
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = attendance_records.student_id
    )
    or exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = attendance_records.student_id
    )
  );

create policy "incidents_staff_all"
  on public.incidents
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "incidents_portal_select"
  on public.incidents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = incidents.student_id
    )
    or exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = incidents.student_id
    )
  );

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
  before update on public.students
  for each row execute procedure public.set_updated_at();

drop trigger if exists guardians_set_updated_at on public.guardians;
create trigger guardians_set_updated_at
  before update on public.guardians
  for each row execute procedure public.set_updated_at();

drop trigger if exists activities_set_updated_at on public.activities;
create trigger activities_set_updated_at
  before update on public.activities
  for each row execute procedure public.set_updated_at();

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  source text not null default 'web',
  created_at timestamptz not null default now()
);

alter table public.inquiries enable row level security;

drop policy if exists inquiries_insert_public on public.inquiries;
create policy inquiries_insert_public
  on public.inquiries
  for insert
  to public
  with check (true);

drop policy if exists inquiries_select_staff on public.inquiries;
create policy inquiries_select_staff
  on public.inquiries
  for select
  to authenticated
  using (public.is_staff());

create table if not exists public.admissions_applications (
  id uuid primary key default gen_random_uuid(),
  resume_token uuid not null unique default gen_random_uuid(),
  status text not null default 'lead',
  section public.school_level,
  parent_name text,
  phone text,
  email text,
  desired_start text,
  preferred_contact text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admissions_applications enable row level security;

drop policy if exists admissions_applications_insert_public on public.admissions_applications;
create policy admissions_applications_insert_public
  on public.admissions_applications
  for insert
  to public
  with check (true);

drop policy if exists admissions_applications_select_staff on public.admissions_applications;
create policy admissions_applications_select_staff
  on public.admissions_applications
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists admissions_applications_update_staff on public.admissions_applications;
create policy admissions_applications_update_staff
  on public.admissions_applications
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop trigger if exists admissions_applications_set_updated_at on public.admissions_applications;
create trigger admissions_applications_set_updated_at
  before update on public.admissions_applications
  for each row execute procedure public.set_updated_at();

create table if not exists public.career_jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  location text not null,
  employment_type text not null,
  summary text not null,
  responsibilities text[] not null default '{}'::text[],
  requirements text[] not null default '{}'::text[],
  reports_to text,
  compensation text,
  apply_email text,
  apply_whatsapp text,
  apply_link text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.career_jobs enable row level security;

drop policy if exists career_jobs_select_public_published on public.career_jobs;
create policy career_jobs_select_public_published
  on public.career_jobs
  for select
  to public
  using (published = true);

drop policy if exists career_jobs_select_staff on public.career_jobs;
create policy career_jobs_select_staff
  on public.career_jobs
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists career_jobs_insert_staff on public.career_jobs;
create policy career_jobs_insert_staff
  on public.career_jobs
  for insert
  to authenticated
  with check (public.is_staff());

drop policy if exists career_jobs_update_staff on public.career_jobs;
create policy career_jobs_update_staff
  on public.career_jobs
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists career_jobs_delete_staff on public.career_jobs;
create policy career_jobs_delete_staff
  on public.career_jobs
  for delete
  to authenticated
  using (public.is_staff());

drop trigger if exists career_jobs_set_updated_at on public.career_jobs;
create trigger career_jobs_set_updated_at
  before update on public.career_jobs
  for each row execute procedure public.set_updated_at();
