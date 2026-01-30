create type public.school_level as enum ('creche','primary','secondary');

create type public.student_status as enum ('applied','enrolled','active','graduated','withdrawn','transferred');

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
