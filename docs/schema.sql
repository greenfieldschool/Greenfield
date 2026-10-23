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
  updated_at timestamptz not null default now(),
  profile_photo_url text
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

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'teacher';
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
  middle_name text,
  last_name text not null,
  admission_number text,
  date_of_birth date,
  sex text,
  religion text,
  passport_photo_url text,
  profile_photo_url text,
  hobbies text[] not null default '{}'::text[],
  favorite_sports text,
  future_aspiration text,
  child_with text,
  admissions_application_id uuid,
  level public.school_level not null,
  class_id uuid,
  status public.student_status not null default 'applied',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students
  add column if not exists class_id uuid;

alter table public.students
  add column if not exists admission_number text;

alter table public.students
  add column if not exists middle_name text;

alter table public.students
  add column if not exists sex text;

alter table public.students
  add column if not exists religion text;

alter table public.students
  add column if not exists passport_photo_url text;

alter table public.students
  add column if not exists profile_photo_url text;

alter table public.students
  add column if not exists hobbies text[] not null default '{}'::text[];

alter table public.students
  add column if not exists favorite_sports text;

alter table public.students
  add column if not exists future_aspiration text;

alter table public.students
  add column if not exists child_with text;

alter table public.students
  add column if not exists admissions_application_id uuid;

create unique index if not exists students_admission_number_key on public.students(admission_number);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  level public.school_level not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level, name)
);

create table if not exists public.teacher_class_assignments (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id)
);

create index if not exists teacher_class_assignments_class_idx on public.teacher_class_assignments(class_id);

alter table public.teacher_class_assignments enable row level security;

create or replace function public.teacher_has_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.teacher_class_assignments tca
    where tca.teacher_id = auth.uid()
      and tca.class_id = target_class_id
      and tca.active = true
  );
$$;

alter table public.students
  drop constraint if exists students_class_id_fkey;

alter table public.students
  add constraint students_class_id_fkey
  foreign key (class_id) references public.classes(id) on delete set null;

alter table public.students
  drop constraint if exists students_admissions_application_id_fkey;

alter table public.students
  add constraint students_admissions_application_id_fkey
  foreign key (admissions_application_id) references public.admissions_applications(id) on delete set null;

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  profile_photo_url text,
  interests text[] not null default '{}'::text[],
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

-- Performance indexes for RLS policy lookups
create index if not exists student_user_links_student_id_idx on public.student_user_links(student_id);
create index if not exists guardian_user_links_guardian_id_idx on public.guardian_user_links(guardian_id);
create index if not exists profiles_id_role_idx on public.profiles(id, role);

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
alter table public.classes enable row level security;
alter table public.teacher_class_assignments enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;
alter table public.guardian_user_links enable row level security;
alter table public.student_user_links enable row level security;
alter table public.activities enable row level security;
alter table public.activity_enrollments enable row level security;
alter table public.attendance_records enable row level security;
alter table public.incidents enable row level security;

drop policy if exists "students_staff_all" on public.students;
create policy "students_staff_all"
  on public.students
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "classes_staff_all" on public.classes;
create policy "classes_staff_all"
  on public.classes
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

create table if not exists public.career_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.career_jobs(id) on delete set null,
  job_slug text,
  job_title text,
  applicant_name text not null,
  applicant_email text not null,
  applicant_phone text,
  message text,
  cv_path text,
  cv_filename text,
  cv_content_type text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.career_applications enable row level security;

drop policy if exists career_applications_insert_public on public.career_applications;
create policy career_applications_insert_public
  on public.career_applications
  for insert
  to public
  with check (true);

drop policy if exists career_applications_select_staff on public.career_applications;
create policy career_applications_select_staff
  on public.career_applications
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists career_applications_update_staff on public.career_applications;
create policy career_applications_update_staff
  on public.career_applications
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop trigger if exists career_applications_set_updated_at on public.career_applications;
create trigger career_applications_set_updated_at
  before update on public.career_applications
  for each row execute procedure public.set_updated_at();

 do $$
 begin
   create type public.finance_invoice_status as enum ('draft','issued','partially_paid','paid','void');
 exception
   when duplicate_object then null;
 end
 $$;

 do $$
 begin
   create type public.finance_adjustment_type as enum ('discount','waiver','penalty','writeoff');
 exception
   when duplicate_object then null;
 end
 $$;

 do $$
 begin
   create type public.finance_transaction_direction as enum ('inflow','outflow');
 exception
   when duplicate_object then null;
 end
 $$;

 do $$
 begin
   create type public.finance_transaction_status as enum ('posted','void');
 exception
   when duplicate_object then null;
 end
 $$;

 create table if not exists public.academic_years (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   starts_on date,
   ends_on date,
   is_active boolean not null default false,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (name)
 );

 create table if not exists public.academic_terms (
   id uuid primary key default gen_random_uuid(),
   academic_year_id uuid not null references public.academic_years(id) on delete cascade,
   name text not null,
   starts_on date,
   ends_on date,
   is_active boolean not null default false,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (academic_year_id, name)
 );

 create table if not exists public.classes (
   id uuid primary key default gen_random_uuid(),
   level public.school_level not null,
   name text not null,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (level, name)
 );

 create table if not exists public.revenue_categories (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   description text,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (name)
 );

 create table if not exists public.fee_components (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   description text,
   revenue_category_id uuid references public.revenue_categories(id) on delete set null,
   expense_category_id uuid,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (name)
 );

 create table if not exists public.fee_schedules (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   academic_year_id uuid not null references public.academic_years(id) on delete restrict,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   class_id uuid not null references public.classes(id) on delete restrict,
   currency text not null default 'NGN',
   notes text,
   active boolean not null default true,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (academic_year_id, academic_term_id, class_id)
 );

 create table if not exists public.fee_schedule_lines (
   id uuid primary key default gen_random_uuid(),
   fee_schedule_id uuid not null references public.fee_schedules(id) on delete cascade,
   fee_component_id uuid not null references public.fee_components(id) on delete restrict,
   amount numeric(12,2) not null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (fee_schedule_id, fee_component_id)
 );

 create index if not exists fee_schedules_year_term_class_idx on public.fee_schedules(academic_year_id, academic_term_id, class_id);
 create index if not exists fee_schedule_lines_fee_schedule_id_idx on public.fee_schedule_lines(fee_schedule_id);

 create table if not exists public.finance_invoices (
   id uuid primary key default gen_random_uuid(),
   invoice_no text,
   bill_to_guardian_id uuid not null references public.guardians(id) on delete restrict,
   student_id uuid references public.students(id) on delete set null,
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   issue_date date not null default (now()::date),
   due_date date,
   status public.finance_invoice_status not null default 'draft',
   currency text not null default 'NGN',
   notes text,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (invoice_no)
 );

 alter table public.finance_invoices alter column invoice_no drop not null;

 create index if not exists finance_invoices_bill_to_guardian_id_idx on public.finance_invoices(bill_to_guardian_id);
 create index if not exists finance_invoices_student_id_idx on public.finance_invoices(student_id);
 create index if not exists finance_invoices_term_idx on public.finance_invoices(academic_year_id, academic_term_id);

 create table if not exists public.finance_invoice_items (
   id uuid primary key default gen_random_uuid(),
   invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
   revenue_category_id uuid references public.revenue_categories(id) on delete set null,
   description text not null,
   quantity numeric(12,2) not null default 1,
   unit_amount numeric(12,2) not null default 0,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create index if not exists finance_invoice_items_invoice_id_idx on public.finance_invoice_items(invoice_id);

 create table if not exists public.finance_invoice_adjustments (
   id uuid primary key default gen_random_uuid(),
   invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
   type public.finance_adjustment_type not null,
   amount numeric(12,2) not null,
   notes text,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create index if not exists finance_invoice_adjustments_invoice_id_idx on public.finance_invoice_adjustments(invoice_id);

 create table if not exists public.finance_payment_transactions (
   id uuid primary key default gen_random_uuid(),
   direction public.finance_transaction_direction not null default 'inflow',
   guardian_id uuid references public.guardians(id) on delete set null,
   student_id uuid references public.students(id) on delete set null,
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   amount numeric(12,2) not null,
   currency text not null default 'NGN',
   provider text,
   provider_txn_id text,
   method text,
   reference text,
   notes text,
   paid_at timestamptz not null default now(),
   status public.finance_transaction_status not null default 'posted',
   received_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create index if not exists finance_payment_transactions_guardian_id_idx on public.finance_payment_transactions(guardian_id);
 create index if not exists finance_payment_transactions_student_id_idx on public.finance_payment_transactions(student_id);
 create index if not exists finance_payment_transactions_term_idx on public.finance_payment_transactions(academic_year_id, academic_term_id);
 create index if not exists finance_payment_transactions_paid_at_idx on public.finance_payment_transactions(paid_at);
 create index if not exists finance_payment_transactions_provider_idx on public.finance_payment_transactions(provider, provider_txn_id);
 create unique index if not exists finance_payment_transactions_provider_unique on public.finance_payment_transactions(provider, provider_txn_id);

 create table if not exists public.finance_payment_allocations (
   id uuid primary key default gen_random_uuid(),
   payment_transaction_id uuid not null references public.finance_payment_transactions(id) on delete cascade,
   invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
   amount numeric(12,2) not null,
   created_at timestamptz not null default now(),
   unique (payment_transaction_id, invoice_id)
 );

 create index if not exists finance_payment_allocations_invoice_id_idx on public.finance_payment_allocations(invoice_id);

 create table if not exists public.expense_categories (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   description text,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (name)
 );

 alter table public.fee_components
   drop constraint if exists fee_components_expense_category_id_fkey;

 alter table public.fee_components
   add constraint fee_components_expense_category_id_fkey
   foreign key (expense_category_id) references public.expense_categories(id) on delete set null;

 create table if not exists public.finance_expenses (
   id uuid primary key default gen_random_uuid(),
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   category_id uuid references public.expense_categories(id) on delete set null,
   vendor_name text,
   description text,
   amount numeric(12,2) not null,
   currency text not null default 'NGN',
   method text,
   reference text,
   spent_at timestamptz not null default now(),
   attachment_path text,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create index if not exists finance_expenses_term_idx on public.finance_expenses(academic_year_id, academic_term_id);
 create index if not exists finance_expenses_spent_at_idx on public.finance_expenses(spent_at);

 create table if not exists public.finance_budgets (
   id uuid primary key default gen_random_uuid(),
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   name text not null,
   notes text,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create index if not exists finance_budgets_term_idx on public.finance_budgets(academic_year_id, academic_term_id);

 create table if not exists public.finance_budget_lines (
   id uuid primary key default gen_random_uuid(),
   budget_id uuid not null references public.finance_budgets(id) on delete cascade,
   expense_category_id uuid not null references public.expense_categories(id) on delete restrict,
   budgeted_amount numeric(12,2) not null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (budget_id, expense_category_id)
 );

 alter table public.academic_years enable row level security;
 alter table public.academic_terms enable row level security;
 alter table public.classes enable row level security;
 alter table public.students enable row level security;
 alter table public.revenue_categories enable row level security;
 alter table public.fee_components enable row level security;
 alter table public.fee_schedules enable row level security;
 alter table public.fee_schedule_lines enable row level security;
 alter table public.finance_invoices enable row level security;
 alter table public.finance_invoice_items enable row level security;
 alter table public.finance_invoice_adjustments enable row level security;
 alter table public.finance_payment_transactions enable row level security;
 alter table public.finance_payment_allocations enable row level security;
 alter table public.expense_categories enable row level security;
 alter table public.finance_expenses enable row level security;
 alter table public.finance_budgets enable row level security;
 alter table public.finance_budget_lines enable row level security;

 create table if not exists public.finance_invoice_counters (
   year int primary key,
   last_no int not null default 0,
   updated_at timestamptz not null default now()
 );

 create table if not exists public.finance_payment_intents (
   id uuid primary key default gen_random_uuid(),
   provider text not null,
   reference text not null,
   invoice_id uuid references public.finance_invoices(id) on delete set null,
   guardian_id uuid references public.guardians(id) on delete set null,
   student_id uuid references public.students(id) on delete set null,
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   amount numeric(12,2) not null,
   currency text not null default 'NGN',
   provider_intent_id text,
   checkout_url text,
   status text not null default 'created',
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (provider, reference)
 );

 create index if not exists finance_payment_intents_invoice_id_idx on public.finance_payment_intents(invoice_id);

 create table if not exists public.finance_payment_events (
   id uuid primary key default gen_random_uuid(),
   provider text not null,
   event_type text,
   provider_event_id text,
   reference text,
   payload jsonb not null,
   headers jsonb not null default '{}'::jsonb,
   received_at timestamptz not null default now(),
   processed_at timestamptz,
   payment_transaction_id uuid references public.finance_payment_transactions(id) on delete set null,
   unique (provider, provider_event_id)
 );

 create index if not exists finance_payment_events_reference_idx on public.finance_payment_events(provider, reference);

 alter table public.finance_invoice_counters enable row level security;
 alter table public.finance_payment_intents enable row level security;
 alter table public.finance_payment_events enable row level security;

 drop policy if exists finance_invoice_counters_staff_all on public.finance_invoice_counters;
 create policy finance_invoice_counters_staff_all
   on public.finance_invoice_counters
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_payment_intents_staff_all on public.finance_payment_intents;
 create policy finance_payment_intents_staff_all
   on public.finance_payment_intents
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_payment_intents_parent_select_own on public.finance_payment_intents;
 create policy finance_payment_intents_parent_select_own
   on public.finance_payment_intents
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.guardian_user_links gul
       where gul.user_id = auth.uid()
         and gul.guardian_id = finance_payment_intents.guardian_id
     )
   );

 drop policy if exists finance_payment_intents_parent_insert_own on public.finance_payment_intents;
 create policy finance_payment_intents_parent_insert_own
   on public.finance_payment_intents
   for insert
   to authenticated
   with check (
     provider = 'moniepoint'
     and exists (
       select 1
       from public.guardian_user_links gul
       where gul.user_id = auth.uid()
         and gul.guardian_id = finance_payment_intents.guardian_id
     )
   );

 drop policy if exists finance_payment_events_staff_select on public.finance_payment_events;
 create policy finance_payment_events_staff_select
   on public.finance_payment_events
   for select
   to authenticated
   using (public.is_staff());

 drop policy if exists finance_payment_events_staff_insert on public.finance_payment_events;
 create policy finance_payment_events_staff_insert
   on public.finance_payment_events
   for insert
   to authenticated
   with check (public.is_staff());

 drop policy if exists finance_payment_events_staff_update on public.finance_payment_events;
 create policy finance_payment_events_staff_update
   on public.finance_payment_events
   for update
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 create or replace function public.generate_invoice_no()
 returns text
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   y int;
   next_no int;
 begin
   y := extract(year from now())::int;

   perform pg_advisory_xact_lock( ('x' || substr(md5('finance_invoice_' || y::text), 1, 16))::bit(64)::bigint );

   insert into public.finance_invoice_counters (year, last_no)
   values (y, 0)
   on conflict (year) do nothing;

   update public.finance_invoice_counters
     set last_no = last_no + 1,
         updated_at = now()
     where year = y
     returning last_no into next_no;

   return 'INV-' || y::text || '-' || lpad(next_no::text, 5, '0');
 end;
 $$;

 create or replace function public.finance_invoices_set_invoice_no()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
 as $$
 begin
   if new.invoice_no is null or length(trim(new.invoice_no)) = 0 then
     new.invoice_no := public.generate_invoice_no();
   end if;
   return new;
 end;
 $$;

 drop trigger if exists finance_invoices_set_invoice_no on public.finance_invoices;
 create trigger finance_invoices_set_invoice_no
   before insert on public.finance_invoices
   for each row execute procedure public.finance_invoices_set_invoice_no();

 drop trigger if exists finance_invoice_counters_set_updated_at on public.finance_invoice_counters;
 create trigger finance_invoice_counters_set_updated_at
   before update on public.finance_invoice_counters
   for each row execute procedure public.set_updated_at();

 drop trigger if exists finance_payment_intents_set_updated_at on public.finance_payment_intents;
 create trigger finance_payment_intents_set_updated_at
   before update on public.finance_payment_intents
   for each row execute procedure public.set_updated_at();

 drop policy if exists academic_years_staff_all on public.academic_years;
 create policy academic_years_staff_all
   on public.academic_years
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists academic_terms_staff_all on public.academic_terms;
 create policy academic_terms_staff_all
   on public.academic_terms
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists classes_staff_all on public.classes;
 create policy classes_staff_all
   on public.classes
   for all
   to authenticated
   using (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(id)
   )
   with check (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(id)
   );

 drop policy if exists students_staff_all on public.students;
 create policy students_staff_all
   on public.students
   for all
   to authenticated
   using (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(class_id)
   )
   with check (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(class_id)
   );

 drop policy if exists revenue_categories_staff_all on public.revenue_categories;
 create policy revenue_categories_staff_all
   on public.revenue_categories
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists fee_components_staff_all on public.fee_components;
 create policy fee_components_staff_all
   on public.fee_components
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists fee_schedules_staff_all on public.fee_schedules;
 create policy fee_schedules_staff_all
   on public.fee_schedules
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists fee_schedule_lines_staff_all on public.fee_schedule_lines;
 create policy fee_schedule_lines_staff_all
   on public.fee_schedule_lines
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists expense_categories_staff_all on public.expense_categories;
 create policy expense_categories_staff_all
   on public.expense_categories
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_invoices_staff_all on public.finance_invoices;
 create policy finance_invoices_staff_all
   on public.finance_invoices
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_invoices_parent_select_own on public.finance_invoices;
 create policy finance_invoices_parent_select_own
   on public.finance_invoices
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.guardian_user_links gul
       where gul.user_id = auth.uid()
         and gul.guardian_id = finance_invoices.bill_to_guardian_id
     )
   );

 drop policy if exists finance_invoice_items_staff_all on public.finance_invoice_items;
 create policy finance_invoice_items_staff_all
   on public.finance_invoice_items
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_invoice_items_parent_select_own on public.finance_invoice_items;
 create policy finance_invoice_items_parent_select_own
   on public.finance_invoice_items
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.finance_invoices i
       join public.guardian_user_links gul on gul.guardian_id = i.bill_to_guardian_id
       where i.id = finance_invoice_items.invoice_id
         and gul.user_id = auth.uid()
     )
   );

 drop policy if exists finance_invoice_adjustments_staff_all on public.finance_invoice_adjustments;
 create policy finance_invoice_adjustments_staff_all
   on public.finance_invoice_adjustments
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_invoice_adjustments_parent_select_own on public.finance_invoice_adjustments;
 create policy finance_invoice_adjustments_parent_select_own
   on public.finance_invoice_adjustments
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.finance_invoices i
       join public.guardian_user_links gul on gul.guardian_id = i.bill_to_guardian_id
       where i.id = finance_invoice_adjustments.invoice_id
         and gul.user_id = auth.uid()
     )
   );

 drop policy if exists finance_payment_transactions_staff_all on public.finance_payment_transactions;
 create policy finance_payment_transactions_staff_all
   on public.finance_payment_transactions
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_payment_transactions_parent_select_own on public.finance_payment_transactions;
 create policy finance_payment_transactions_parent_select_own
   on public.finance_payment_transactions
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.guardian_user_links gul
       where gul.user_id = auth.uid()
         and gul.guardian_id = finance_payment_transactions.guardian_id
     )
   );

 drop policy if exists finance_payment_allocations_staff_all on public.finance_payment_allocations;
 create policy finance_payment_allocations_staff_all
   on public.finance_payment_allocations
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_payment_allocations_parent_select_own on public.finance_payment_allocations;
 create policy finance_payment_allocations_parent_select_own
   on public.finance_payment_allocations
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.finance_invoices i
       join public.guardian_user_links gul on gul.guardian_id = i.bill_to_guardian_id
       where i.id = finance_payment_allocations.invoice_id
         and gul.user_id = auth.uid()
     )
   );

 drop policy if exists finance_expenses_staff_all on public.finance_expenses;
 create policy finance_expenses_staff_all
   on public.finance_expenses
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_budgets_staff_all on public.finance_budgets;
 create policy finance_budgets_staff_all
   on public.finance_budgets
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists finance_budget_lines_staff_all on public.finance_budget_lines;
 create policy finance_budget_lines_staff_all
   on public.finance_budget_lines
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop trigger if exists academic_years_set_updated_at on public.academic_years;
 create trigger academic_years_set_updated_at
   before update on public.academic_years
   for each row execute procedure public.set_updated_at();

 drop trigger if exists academic_terms_set_updated_at on public.academic_terms;
 create trigger academic_terms_set_updated_at
   before update on public.academic_terms
   for each row execute procedure public.set_updated_at();

 drop trigger if exists classes_set_updated_at on public.classes;
 create trigger classes_set_updated_at
   before update on public.classes
   for each row execute procedure public.set_updated_at();

 drop trigger if exists students_set_updated_at on public.students;
 create trigger students_set_updated_at
   before update on public.students
   for each row execute procedure public.set_updated_at();

 drop trigger if exists revenue_categories_set_updated_at on public.revenue_categories;
 create trigger revenue_categories_set_updated_at
   before update on public.revenue_categories
   for each row execute procedure public.set_updated_at();

 drop trigger if exists fee_components_set_updated_at on public.fee_components;
 create trigger fee_components_set_updated_at
   before update on public.fee_components
   for each row execute procedure public.set_updated_at();

 drop trigger if exists fee_schedules_set_updated_at on public.fee_schedules;
 create trigger fee_schedules_set_updated_at
   before update on public.fee_schedules
   for each row execute procedure public.set_updated_at();

 drop trigger if exists fee_schedule_lines_set_updated_at on public.fee_schedule_lines;
 create trigger fee_schedule_lines_set_updated_at
   before update on public.fee_schedule_lines
   for each row execute procedure public.set_updated_at();

 drop trigger if exists finance_invoices_set_updated_at on public.finance_invoices;
 create trigger finance_invoices_set_updated_at
   before update on public.finance_invoices
   for each row execute procedure public.set_updated_at();

 drop trigger if exists finance_invoice_items_set_updated_at on public.finance_invoice_items;
 create trigger finance_invoice_items_set_updated_at
   before update on public.finance_invoice_items
   for each row execute procedure public.set_updated_at();

 drop trigger if exists finance_invoice_adjustments_set_updated_at on public.finance_invoice_adjustments;
 create trigger finance_invoice_adjustments_set_updated_at
   before update on public.finance_invoice_adjustments
   for each row execute procedure public.set_updated_at();

 drop trigger if exists finance_payment_transactions_set_updated_at on public.finance_payment_transactions;
 create trigger finance_payment_transactions_set_updated_at
   before update on public.finance_payment_transactions
   for each row execute procedure public.set_updated_at();

 drop trigger if exists expense_categories_set_updated_at on public.expense_categories;
 create trigger expense_categories_set_updated_at
   before update on public.expense_categories
   for each row execute procedure public.set_updated_at();

 drop trigger if exists finance_expenses_set_updated_at on public.finance_expenses;
 create trigger finance_expenses_set_updated_at
   before update on public.finance_expenses
   for each row execute procedure public.set_updated_at();

 drop trigger if exists finance_budgets_set_updated_at on public.finance_budgets;
 create trigger finance_budgets_set_updated_at
   before update on public.finance_budgets
   for each row execute procedure public.set_updated_at();

 drop trigger if exists finance_budget_lines_set_updated_at on public.finance_budget_lines;
 create trigger finance_budget_lines_set_updated_at
   before update on public.finance_budget_lines
   for each row execute procedure public.set_updated_at();

 create or replace view public.finance_invoice_totals as
 select
   i.id as invoice_id,
   i.invoice_no,
   i.bill_to_guardian_id,
   i.student_id,
   i.academic_year_id,
   i.academic_term_id,
   i.issue_date,
   i.due_date,
   i.status,
   i.currency,
   coalesce(
     (
       select sum(ii.quantity * ii.unit_amount)
       from public.finance_invoice_items ii
       where ii.invoice_id = i.id
     ),
     0
   ) as items_total,
   coalesce(
     (
       select sum(a.amount)
       from public.finance_invoice_adjustments a
       where a.invoice_id = i.id
         and a.type in ('discount','waiver','writeoff')
     ),
     0
   ) as adjustments_minus_total,
   coalesce(
     (
       select sum(a.amount)
       from public.finance_invoice_adjustments a
       where a.invoice_id = i.id
         and a.type = 'penalty'
     ),
     0
   ) as adjustments_plus_total
 from public.finance_invoices i;

 create or replace view public.finance_invoice_balances as
 select
   t.invoice_id,
   t.invoice_no,
   t.bill_to_guardian_id,
   t.student_id,
   t.academic_year_id,
   t.academic_term_id,
   t.issue_date,
   t.due_date,
   t.status,
   t.currency,
   (t.items_total - t.adjustments_minus_total + t.adjustments_plus_total) as invoice_total,
   coalesce(
     (
       select sum(pa.amount)
       from public.finance_payment_allocations pa
       join public.finance_payment_transactions pt on pt.id = pa.payment_transaction_id
       where pa.invoice_id = t.invoice_id
         and pt.status = 'posted'
     ),
     0
   ) as allocated_total,
   (t.items_total - t.adjustments_minus_total + t.adjustments_plus_total)
   - coalesce(
     (
       select sum(pa.amount)
       from public.finance_payment_allocations pa
       join public.finance_payment_transactions pt on pt.id = pa.payment_transaction_id
       where pa.invoice_id = t.invoice_id
         and pt.status = 'posted'
     ),
     0
   ) as balance
 from public.finance_invoice_totals t;

 create or replace view public.finance_guardian_balances as
 select
   g.id as guardian_id,
   g.full_name,
   g.email,
   g.phone,
   coalesce(sum(b.invoice_total), 0) as invoiced_total,
   coalesce(sum(b.allocated_total), 0) as paid_total,
   coalesce(sum(b.balance), 0) as outstanding_total
 from public.guardians g
 left join public.finance_invoice_balances b on b.bill_to_guardian_id = g.id
 where b.status is null or b.status <> 'void'
 group by g.id, g.full_name, g.email, g.phone;


 create table if not exists public.subjects (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   level public.school_level,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (name, level)
 );

 create table if not exists public.grading_scales (
   id uuid primary key default gen_random_uuid(),
   level public.school_level not null,
   grade text not null,
   min_score numeric(5,2) not null,
   max_score numeric(5,2) not null,
   gpa_points numeric(4,2),
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (level, grade)
 );

 create table if not exists public.assessment_weights (
   id uuid primary key default gen_random_uuid(),
   level public.school_level not null,
   assessment_type text not null,
   weight numeric(5,2) not null,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (level, assessment_type)
 );

 create table if not exists public.academic_assessments (
   id uuid primary key default gen_random_uuid(),
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   class_id uuid references public.classes(id) on delete set null,
   subject_id uuid references public.subjects(id) on delete restrict,
   assessment_type text not null,
   title text,
   max_score numeric(6,2) not null default 100,
   held_on date,
   published boolean not null default false,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create index if not exists academic_assessments_term_class_subject_idx on public.academic_assessments(academic_year_id, academic_term_id, class_id, subject_id);

 create table if not exists public.academic_assessment_scores (
   id uuid primary key default gen_random_uuid(),
   assessment_id uuid not null references public.academic_assessments(id) on delete cascade,
   student_id uuid not null references public.students(id) on delete cascade,
   score numeric(6,2) not null,
   remarks text,
   graded_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (assessment_id, student_id)
 );

 create index if not exists academic_assessment_scores_student_idx on public.academic_assessment_scores(student_id);

 create table if not exists public.student_attendance (
   id uuid primary key default gen_random_uuid(),
   student_id uuid not null references public.students(id) on delete cascade,
   class_id uuid references public.classes(id) on delete set null,
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   date date not null,
   status text not null,
   recorded_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (student_id, date)
 );

 create index if not exists student_attendance_term_student_idx on public.student_attendance(academic_year_id, academic_term_id, student_id);

 create table if not exists public.welfare_incidents (
   id uuid primary key default gen_random_uuid(),
   student_id uuid not null references public.students(id) on delete cascade,
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   incident_type text not null,
   description text not null,
   action_taken text,
   severity int not null default 1,
   resolved boolean not null default false,
   reported_by uuid references auth.users(id) on delete set null,
   occurred_at timestamptz not null default now(),
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create index if not exists welfare_incidents_term_student_idx on public.welfare_incidents(academic_year_id, academic_term_id, student_id);

 create table if not exists public.welfare_discipline_records (
   id uuid primary key default gen_random_uuid(),
   student_id uuid not null references public.students(id) on delete cascade,
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   category text,
   description text not null,
   severity int not null default 1,
   sanction text,
   reported_by uuid references auth.users(id) on delete set null,
   occurred_at timestamptz not null default now(),
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );

 create index if not exists welfare_discipline_term_student_idx on public.welfare_discipline_records(academic_year_id, academic_term_id, student_id);

 create table if not exists public.student_uniform_checks (
   id uuid primary key default gen_random_uuid(),
   student_id uuid not null references public.students(id) on delete cascade,
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   date date not null,
   ok boolean not null default true,
   notes text,
   recorded_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (student_id, date)
 );

 create index if not exists student_uniform_checks_term_student_idx on public.student_uniform_checks(academic_year_id, academic_term_id, student_id);

 create table if not exists public.welfare_scoring_rules (
   id uuid primary key default gen_random_uuid(),
   level public.school_level not null,
   absent_penalty numeric(6,2) not null default 2,
   late_penalty numeric(6,2) not null default 1,
   discipline_severity_penalty numeric(6,2) not null default 1,
   incident_severity_penalty numeric(6,2) not null default 1,
   uniform_fail_penalty numeric(6,2) not null default 1,
   gold_min numeric(6,2) not null default 85,
   silver_min numeric(6,2) not null default 70,
   bronze_min numeric(6,2) not null default 50,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (level)
 );

 create table if not exists public.result_publications (
   id uuid primary key default gen_random_uuid(),
   scope text not null,
   academic_year_id uuid references public.academic_years(id) on delete cascade,
   academic_term_id uuid references public.academic_terms(id) on delete cascade,
   level public.school_level,
   class_id uuid references public.classes(id) on delete set null,
   published_at timestamptz not null default now(),
   published_by uuid references auth.users(id) on delete set null,
   notes text,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (scope, academic_year_id, academic_term_id, level, class_id)
 );

 alter table public.subjects enable row level security;
 alter table public.grading_scales enable row level security;
 alter table public.assessment_weights enable row level security;
 alter table public.academic_assessments enable row level security;
 alter table public.academic_assessment_scores enable row level security;
 alter table public.student_attendance enable row level security;
 alter table public.welfare_incidents enable row level security;
 alter table public.welfare_discipline_records enable row level security;
 alter table public.student_uniform_checks enable row level security;
 alter table public.welfare_scoring_rules enable row level security;
 alter table public.result_publications enable row level security;

 drop policy if exists subjects_staff_all on public.subjects;
 drop policy if exists subjects_admin_all on public.subjects;
 create policy subjects_admin_all
   on public.subjects
   for all
   to authenticated
   using (public.is_admin())
   with check (public.is_admin());

 drop policy if exists subjects_portal_select on public.subjects;
 create policy subjects_portal_select
   on public.subjects
   for select
   to authenticated
   using (true);

 drop policy if exists grading_scales_staff_all on public.grading_scales;
 create policy grading_scales_staff_all
   on public.grading_scales
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists grading_scales_portal_select on public.grading_scales;
 create policy grading_scales_portal_select
   on public.grading_scales
   for select
   to authenticated
   using (true);

 drop policy if exists assessment_weights_staff_all on public.assessment_weights;
 create policy assessment_weights_staff_all
   on public.assessment_weights
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists assessment_weights_portal_select on public.assessment_weights;
 create policy assessment_weights_portal_select
   on public.assessment_weights
   for select
   to authenticated
   using (true);

 drop policy if exists welfare_scoring_rules_staff_all on public.welfare_scoring_rules;
 create policy welfare_scoring_rules_staff_all
   on public.welfare_scoring_rules
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists welfare_scoring_rules_portal_select on public.welfare_scoring_rules;
 create policy welfare_scoring_rules_portal_select
   on public.welfare_scoring_rules
   for select
   to authenticated
   using (true);

 drop policy if exists academic_assessments_staff_all on public.academic_assessments;
 create policy academic_assessments_staff_all
   on public.academic_assessments
   for all
   to authenticated
   using (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(class_id)
   )
   with check (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(class_id)
   );

 drop policy if exists academic_assessments_parent_student_select on public.academic_assessments;
 create policy academic_assessments_parent_student_select
   on public.academic_assessments
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.academic_assessment_scores s
       join public.students st on st.id = s.student_id
       left join public.guardian_user_links gul on gul.user_id = auth.uid()
       left join public.student_guardians sg on sg.guardian_id = gul.guardian_id and sg.student_id = st.id
       left join public.student_user_links sul on sul.user_id = auth.uid() and sul.student_id = st.id
       where s.assessment_id = academic_assessments.id
         and (sg.student_id is not null or sul.student_id is not null)
     )
   );

 drop policy if exists academic_assessment_scores_staff_all on public.academic_assessment_scores;
 create policy academic_assessment_scores_staff_all
   on public.academic_assessment_scores
   for all
   to authenticated
   using (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or exists (
       select 1
       from public.academic_assessments a
       where a.id = academic_assessment_scores.assessment_id
         and public.teacher_has_class(a.class_id)
     )
   )
   with check (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or exists (
       select 1
       from public.academic_assessments a
       where a.id = academic_assessment_scores.assessment_id
         and public.teacher_has_class(a.class_id)
     )
   );

 drop policy if exists academic_assessment_scores_parent_select on public.academic_assessment_scores;
 create policy academic_assessment_scores_parent_select
   on public.academic_assessment_scores
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.guardian_user_links gul
       join public.student_guardians sg on sg.guardian_id = gul.guardian_id
       where gul.user_id = auth.uid()
         and sg.student_id = academic_assessment_scores.student_id
     )
   );

 drop policy if exists academic_assessment_scores_student_select on public.academic_assessment_scores;
 create policy academic_assessment_scores_student_select
   on public.academic_assessment_scores
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.student_user_links sul
       where sul.user_id = auth.uid()
         and sul.student_id = academic_assessment_scores.student_id
     )
   );

 drop policy if exists student_attendance_staff_all on public.student_attendance;
 create policy student_attendance_staff_all
   on public.student_attendance
   for all
   to authenticated
   using (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(class_id)
   )
   with check (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(class_id)
   );

 drop policy if exists student_attendance_parent_select on public.student_attendance;
 create policy student_attendance_parent_select
   on public.student_attendance
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.guardian_user_links gul
       join public.student_guardians sg on sg.guardian_id = gul.guardian_id
       where gul.user_id = auth.uid()
         and sg.student_id = student_attendance.student_id
     )
   );

 drop policy if exists student_attendance_student_select on public.student_attendance;
 create policy student_attendance_student_select
   on public.student_attendance
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.student_user_links sul
       where sul.user_id = auth.uid()
         and sul.student_id = student_attendance.student_id
     )
   );

 drop policy if exists welfare_incidents_staff_all on public.welfare_incidents;
 create policy welfare_incidents_staff_all
   on public.welfare_incidents
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists welfare_incidents_parent_select on public.welfare_incidents;
 create policy welfare_incidents_parent_select
   on public.welfare_incidents
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.guardian_user_links gul
       join public.student_guardians sg on sg.guardian_id = gul.guardian_id
       where gul.user_id = auth.uid()
         and sg.student_id = welfare_incidents.student_id
     )
   );

 drop policy if exists welfare_incidents_student_select on public.welfare_incidents;
 create policy welfare_incidents_student_select
   on public.welfare_incidents
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.student_user_links sul
       where sul.user_id = auth.uid()
         and sul.student_id = welfare_incidents.student_id
     )
   );

 drop policy if exists welfare_discipline_staff_all on public.welfare_discipline_records;
 create policy welfare_discipline_staff_all
   on public.welfare_discipline_records
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists welfare_discipline_parent_select on public.welfare_discipline_records;
 create policy welfare_discipline_parent_select
   on public.welfare_discipline_records
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.guardian_user_links gul
       join public.student_guardians sg on sg.guardian_id = gul.guardian_id
       where gul.user_id = auth.uid()
         and sg.student_id = welfare_discipline_records.student_id
     )
   );

 drop policy if exists welfare_discipline_student_select on public.welfare_discipline_records;
 create policy welfare_discipline_student_select
   on public.welfare_discipline_records
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.student_user_links sul
       where sul.user_id = auth.uid()
         and sul.student_id = welfare_discipline_records.student_id
     )
   );

 drop policy if exists student_uniform_checks_staff_all on public.student_uniform_checks;
 create policy student_uniform_checks_staff_all
   on public.student_uniform_checks
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists student_uniform_checks_parent_select on public.student_uniform_checks;
 create policy student_uniform_checks_parent_select
   on public.student_uniform_checks
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.guardian_user_links gul
       join public.student_guardians sg on sg.guardian_id = gul.guardian_id
       where gul.user_id = auth.uid()
         and sg.student_id = student_uniform_checks.student_id
     )
   );

 drop policy if exists student_uniform_checks_student_select on public.student_uniform_checks;
 create policy student_uniform_checks_student_select
   on public.student_uniform_checks
   for select
   to authenticated
   using (
     exists (
       select 1
       from public.student_user_links sul
       where sul.user_id = auth.uid()
         and sul.student_id = student_uniform_checks.student_id
     )
   );

 drop policy if exists result_publications_staff_all on public.result_publications;
 create policy result_publications_staff_all
   on public.result_publications
   for all
   to authenticated
   using (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(class_id)
   )
   with check (
     public.is_admin()
     or public.current_role() <> 'teacher'
     or public.teacher_has_class(class_id)
   );

 drop policy if exists result_publications_portal_select on public.result_publications;
 create policy result_publications_portal_select
   on public.result_publications
   for select
   to authenticated
   using (true);

 drop trigger if exists subjects_set_updated_at on public.subjects;
 create trigger subjects_set_updated_at
   before update on public.subjects
   for each row execute procedure public.set_updated_at();

 drop trigger if exists grading_scales_set_updated_at on public.grading_scales;
 create trigger grading_scales_set_updated_at
   before update on public.grading_scales
   for each row execute procedure public.set_updated_at();

 drop trigger if exists assessment_weights_set_updated_at on public.assessment_weights;
 create trigger assessment_weights_set_updated_at
   before update on public.assessment_weights
   for each row execute procedure public.set_updated_at();

 drop trigger if exists academic_assessments_set_updated_at on public.academic_assessments;
 create trigger academic_assessments_set_updated_at
   before update on public.academic_assessments
   for each row execute procedure public.set_updated_at();

 drop trigger if exists academic_assessment_scores_set_updated_at on public.academic_assessment_scores;
 create trigger academic_assessment_scores_set_updated_at
   before update on public.academic_assessment_scores
   for each row execute procedure public.set_updated_at();

 drop trigger if exists student_attendance_set_updated_at on public.student_attendance;
 create trigger student_attendance_set_updated_at
   before update on public.student_attendance
   for each row execute procedure public.set_updated_at();

 drop trigger if exists welfare_incidents_set_updated_at on public.welfare_incidents;
 create trigger welfare_incidents_set_updated_at
   before update on public.welfare_incidents
   for each row execute procedure public.set_updated_at();

 drop trigger if exists welfare_discipline_records_set_updated_at on public.welfare_discipline_records;
 create trigger welfare_discipline_records_set_updated_at
   before update on public.welfare_discipline_records
   for each row execute procedure public.set_updated_at();

 drop trigger if exists student_uniform_checks_set_updated_at on public.student_uniform_checks;
 create trigger student_uniform_checks_set_updated_at
   before update on public.student_uniform_checks
   for each row execute procedure public.set_updated_at();

 drop trigger if exists welfare_scoring_rules_set_updated_at on public.welfare_scoring_rules;
 create trigger welfare_scoring_rules_set_updated_at
   before update on public.welfare_scoring_rules
   for each row execute procedure public.set_updated_at();

 drop trigger if exists result_publications_set_updated_at on public.result_publications;
 create trigger result_publications_set_updated_at
   before update on public.result_publications
   for each row execute procedure public.set_updated_at();

 create or replace view public.academic_student_subject_term_summary as
 with base as (
   select
     s.id as student_id,
     a.academic_year_id,
     a.academic_term_id,
     a.class_id,
     c.level as class_level,
     a.subject_id,
     sub.name as subject_name,
     coalesce(
       sum(
         case
           when w.weight is not null then (sc.score / nullif(a.max_score, 0)) * 100 * (w.weight / 100)
           when a.assessment_type in ('first_ca', 'second_ca', 'exam_objective', 'exam_theory') then sc.score
           else 0
         end
       ),
       0
     ) as weighted_score
   from public.academic_assessment_scores sc
   join public.academic_assessments a on a.id = sc.assessment_id
   join public.students s on s.id = sc.student_id
   left join public.classes c on c.id = s.class_id
   join public.subjects sub on sub.id = a.subject_id
   left join public.assessment_weights w
     on w.active = true
    and w.level = c.level
    and w.assessment_type = a.assessment_type
   group by s.id, a.academic_year_id, a.academic_term_id, a.class_id, c.level, a.subject_id, sub.name
 )
 select
   b.student_id,
   b.academic_year_id,
   b.academic_term_id,
   b.class_id,
   b.class_level,
   b.subject_id,
   b.subject_name,
   b.weighted_score,
   gs.grade
 from base b
 left join public.grading_scales gs
   on gs.active = true
  and gs.level = b.class_level
  and b.weighted_score between gs.min_score and gs.max_score;

 create or replace view public.academic_student_term_summary as
 select
   student_id,
   academic_year_id,
   academic_term_id,
   class_id,
   class_level,
   coalesce(avg(weighted_score), 0) as average_score
 from public.academic_student_subject_term_summary
 group by student_id, academic_year_id, academic_term_id, class_id, class_level;

 create or replace view public.welfare_student_term_summary as
 with st as (
   select
     s.id as student_id,
     s.class_id,
     c.level as class_level,
     t.academic_year_id,
     t.academic_term_id,
     coalesce(sum(case when t.status = 'present' then 1 else 0 end), 0) as present_days,
     coalesce(sum(case when t.status = 'absent' then 1 else 0 end), 0) as absent_days,
     coalesce(sum(case when t.status = 'late' then 1 else 0 end), 0) as late_days
   from public.students s
   left join public.classes c on c.id = s.class_id
   left join public.student_attendance t on t.student_id = s.id
   group by s.id, s.class_id, c.level, t.academic_year_id, t.academic_term_id
 ), dis as (
   select
     student_id,
     academic_year_id,
     academic_term_id,
     count(*) as discipline_count,
     coalesce(sum(severity), 0) as discipline_severity_total
   from public.welfare_discipline_records
   group by student_id, academic_year_id, academic_term_id
 ), inc as (
   select
     student_id,
     academic_year_id,
     academic_term_id,
     count(*) as incident_count,
     coalesce(sum(severity), 0) as incident_severity_total
   from public.welfare_incidents
   group by student_id, academic_year_id, academic_term_id
 ), uni as (
   select
     student_id,
     academic_year_id,
     academic_term_id,
     count(*) as uniform_checks,
     coalesce(sum(case when ok = false then 1 else 0 end), 0) as uniform_failures
   from public.student_uniform_checks
   group by student_id, academic_year_id, academic_term_id
 )
 select
   st.student_id,
   st.academic_year_id,
   st.academic_term_id,
   st.class_id,
   st.class_level,
   st.present_days,
   st.absent_days,
   st.late_days,
   coalesce(dis.discipline_count, 0) as discipline_count,
   coalesce(dis.discipline_severity_total, 0) as discipline_severity_total,
   coalesce(inc.incident_count, 0) as incident_count,
   coalesce(inc.incident_severity_total, 0) as incident_severity_total,
   coalesce(uni.uniform_checks, 0) as uniform_checks,
   coalesce(uni.uniform_failures, 0) as uniform_failures,
   greatest(
     0,
     least(
       100,
       100
       - (coalesce(st.absent_days, 0) * r.absent_penalty)
       - (coalesce(st.late_days, 0) * r.late_penalty)
       - (coalesce(dis.discipline_severity_total, 0) * r.discipline_severity_penalty)
       - (coalesce(inc.incident_severity_total, 0) * r.incident_severity_penalty)
       - (coalesce(uni.uniform_failures, 0) * r.uniform_fail_penalty)
     )
   ) as welfare_score,
   case
     when greatest(
       0,
       least(
         100,
         100
         - (coalesce(st.absent_days, 0) * r.absent_penalty)
         - (coalesce(st.late_days, 0) * r.late_penalty)
         - (coalesce(dis.discipline_severity_total, 0) * r.discipline_severity_penalty)
         - (coalesce(inc.incident_severity_total, 0) * r.incident_severity_penalty)
         - (coalesce(uni.uniform_failures, 0) * r.uniform_fail_penalty)
       )
     ) >= r.gold_min then 'gold'
     when greatest(
       0,
       least(
         100,
         100
         - (coalesce(st.absent_days, 0) * r.absent_penalty)
         - (coalesce(st.late_days, 0) * r.late_penalty)
         - (coalesce(dis.discipline_severity_total, 0) * r.discipline_severity_penalty)
         - (coalesce(inc.incident_severity_total, 0) * r.incident_severity_penalty)
         - (coalesce(uni.uniform_failures, 0) * r.uniform_fail_penalty)
       )
     ) >= r.silver_min then 'silver'
     when greatest(
       0,
       least(
         100,
         100
         - (coalesce(st.absent_days, 0) * r.absent_penalty)
         - (coalesce(st.late_days, 0) * r.late_penalty)
         - (coalesce(dis.discipline_severity_total, 0) * r.discipline_severity_penalty)
         - (coalesce(inc.incident_severity_total, 0) * r.incident_severity_penalty)
         - (coalesce(uni.uniform_failures, 0) * r.uniform_fail_penalty)
       )
     ) >= r.bronze_min then 'bronze'
     else 'none'
   end as welfare_badge
 from st
 left join dis on dis.student_id = st.student_id and dis.academic_year_id is not distinct from st.academic_year_id and dis.academic_term_id is not distinct from st.academic_term_id
 left join inc on inc.student_id = st.student_id and inc.academic_year_id is not distinct from st.academic_year_id and inc.academic_term_id is not distinct from st.academic_term_id
 left join uni on uni.student_id = st.student_id and uni.academic_year_id is not distinct from st.academic_year_id and uni.academic_term_id is not distinct from st.academic_term_id
 left join public.welfare_scoring_rules r on r.active = true and r.level = st.class_level;

 insert into public.welfare_scoring_rules (level)
 values ('creche'), ('primary'), ('secondary')
 on conflict (level) do nothing;

 insert into public.assessment_weights (level, assessment_type, weight)
 values
   ('creche', 'weekly_test', 20),
   ('creche', 'mid_term', 20),
   ('creche', 'exam', 60),
   ('primary', 'weekly_test', 20),
   ('primary', 'mid_term', 20),
   ('primary', 'exam', 60),
   ('secondary', 'weekly_test', 20),
   ('secondary', 'mid_term', 20),
   ('secondary', 'exam', 60)
 on conflict (level, assessment_type) do nothing;

 insert into public.grading_scales (level, grade, min_score, max_score)
 values
   ('primary', 'A', 70, 100),
   ('primary', 'B', 60, 69.99),
   ('primary', 'C', 50, 59.99),
   ('primary', 'D', 45, 49.99),
   ('primary', 'E', 40, 44.99),
   ('primary', 'F', 0, 39.99),
   ('secondary', 'A', 70, 100),
   ('secondary', 'B', 60, 69.99),
   ('secondary', 'C', 50, 59.99),
   ('secondary', 'D', 45, 49.99),
   ('secondary', 'E', 40, 44.99),
   ('secondary', 'F', 0, 39.99)

 on conflict (level, grade) do nothing;


 create table if not exists public.exam_tests (
   id uuid primary key default gen_random_uuid(),
   subject_id uuid references public.subjects(id) on delete set null,
   name text not null,
   description text,
   duration_minutes int not null default 60,
   active boolean not null default true,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );
 
 create index if not exists exam_tests_subject_idx on public.exam_tests(subject_id);
 
 create table if not exists public.exam_questions (
   id uuid primary key default gen_random_uuid(),
   test_id uuid not null references public.exam_tests(id) on delete cascade,
   question_type text not null,
   prompt text not null,
   options jsonb,
   correct_answer jsonb,
   marks numeric(8,2) not null default 1,
   explanation text,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );
 
 alter table public.exam_questions drop column if exists correct_answer;
 alter table public.exam_questions drop column if exists explanation;
 
 create table if not exists public.exam_question_solutions (
   question_id uuid primary key references public.exam_questions(id) on delete cascade,
   correct_answer jsonb,
   explanation text,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );
 
 create index if not exists exam_questions_test_idx on public.exam_questions(test_id);
 
 create table if not exists public.exam_test_sessions (
   id uuid primary key default gen_random_uuid(),
   test_id uuid not null references public.exam_tests(id) on delete cascade,
   class_id uuid references public.classes(id) on delete set null,
   academic_year_id uuid references public.academic_years(id) on delete set null,
   academic_term_id uuid references public.academic_terms(id) on delete set null,
   starts_at timestamptz,
   ends_at timestamptz,
   status text not null default 'draft',
   requires_secret_code boolean not null default false,
   secret_code text,
   results_released_at timestamptz,
   results_released_by uuid references auth.users(id) on delete set null,
   results_release_note text,
   active boolean not null default true,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );
 
 create index if not exists exam_test_sessions_test_idx on public.exam_test_sessions(test_id);
 create index if not exists exam_test_sessions_class_idx on public.exam_test_sessions(class_id);
 
 create table if not exists public.exam_conductors (
   id uuid primary key default gen_random_uuid(),
   full_name text not null,
   email text,
   phone text,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
 );
 
 create table if not exists public.exam_conductor_user_links (
   conductor_id uuid not null references public.exam_conductors(id) on delete cascade,
   user_id uuid not null references auth.users(id) on delete cascade,
   created_at timestamptz not null default now(),
   primary key (conductor_id, user_id),
   unique (user_id)
 );
 
 create table if not exists public.exam_session_conductors (
   session_id uuid not null references public.exam_test_sessions(id) on delete cascade,
   conductor_id uuid not null references public.exam_conductors(id) on delete cascade,
   created_at timestamptz not null default now(),
   primary key (session_id, conductor_id)
 );
 
 create table if not exists public.exam_attempts (
   id uuid primary key default gen_random_uuid(),
   session_id uuid not null references public.exam_test_sessions(id) on delete cascade,
   student_id uuid not null references public.students(id) on delete cascade,
   status text not null default 'in_progress',
   started_at timestamptz not null default now(),
   submitted_at timestamptz,
   graded_at timestamptz,
   obtained_marks numeric(10,2) not null default 0,
   max_marks numeric(10,2) not null default 0,
   percent numeric(6,2) not null default 0,
   secret_code_verified boolean not null default false,
   locked_at timestamptz,
   locked_reason text,
   lock_count int not null default 0,
   unlocked_at timestamptz,
   unlocked_by uuid references auth.users(id) on delete set null,
   unlock_note text,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (session_id, student_id)
 );
 
 create index if not exists exam_attempts_session_idx on public.exam_attempts(session_id);
 create index if not exists exam_attempts_student_idx on public.exam_attempts(student_id);
 
 create table if not exists public.exam_attempt_answers (
   id uuid primary key default gen_random_uuid(),
   attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
   question_id uuid not null references public.exam_questions(id) on delete cascade,
   answer jsonb,
   is_correct boolean,
   awarded_marks numeric(10,2) not null default 0,
   feedback text,
   marked_by uuid references auth.users(id) on delete set null,
   marked_at timestamptz,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (attempt_id, question_id)
 );
 
 create index if not exists exam_attempt_answers_attempt_idx on public.exam_attempt_answers(attempt_id);
 
 create table if not exists public.exam_malpractice_events (
   id uuid primary key default gen_random_uuid(),
   attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
   event_type text not null,
   event_data jsonb,
   created_at timestamptz not null default now()
 );
 
 create index if not exists exam_malpractice_attempt_idx on public.exam_malpractice_events(attempt_id);

-- Performance indexes for exam RLS policy lookups
create index if not exists exam_conductor_user_links_user_id_idx on public.exam_conductor_user_links(user_id);
create index if not exists exam_session_conductors_conductor_id_idx on public.exam_session_conductors(conductor_id);
create index if not exists exam_test_sessions_active_status_idx on public.exam_test_sessions(active, status) where active = true;
create index if not exists exam_test_sessions_class_active_idx on public.exam_test_sessions(class_id, active) where active = true;
create index if not exists exam_attempts_session_student_idx on public.exam_attempts(session_id, student_id);

 alter table public.exam_tests enable row level security;
 alter table public.exam_questions enable row level security;
 alter table public.exam_question_solutions enable row level security;
 alter table public.exam_test_sessions enable row level security;
 alter table public.exam_conductors enable row level security;
 alter table public.exam_conductor_user_links enable row level security;
 alter table public.exam_session_conductors enable row level security;
 alter table public.exam_attempts enable row level security;
 alter table public.exam_attempt_answers enable row level security;
 alter table public.exam_malpractice_events enable row level security;
 
 create or replace function public.is_exam_conductor() returns boolean
 language sql stable
 as $$
   select exists(
     select 1
     from public.exam_conductor_user_links l
     where l.user_id = auth.uid()
   );
 $$;
 
 create or replace function public.can_student_view_session_results(session_uuid uuid) returns boolean
 language sql stable parallel safe
 as $$
  select exists(
    select 1
    from public.exam_test_sessions s
    inner join public.student_user_links sul on sul.user_id = auth.uid()
    inner join public.students st on st.id = sul.student_id
    where s.id = session_uuid
      and s.active = true
      and (s.class_id is null or s.class_id = st.class_id)
      and s.results_released_at is not null
  );
$$;
 
 create or replace function public.can_student_view_session(session_uuid uuid) returns boolean
 language sql stable parallel safe
 as $$
  select exists(
    select 1
    from public.exam_test_sessions s
    inner join public.student_user_links sul on sul.user_id = auth.uid()
    inner join public.students st on st.id = sul.student_id
    where s.id = session_uuid
      and s.active = true
      and (s.class_id is null or s.class_id = st.class_id)
      and (
        (s.status = 'active' and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at >= now()))
        or s.results_released_at is not null
      )
  );
$$;
 
 create or replace function public.can_conduct_session(session_uuid uuid) returns boolean
 language sql stable parallel safe
 as $$
  select exists(
    select 1
    from public.exam_conductor_user_links l
    inner join public.exam_session_conductors sc on sc.conductor_id = l.conductor_id
    where l.user_id = auth.uid()
      and sc.session_id = session_uuid
  );
$$;
 
 create or replace function public.current_student_id() returns uuid
 language sql stable parallel safe
 as $$
  select sul.student_id
  from public.student_user_links sul
  where sul.user_id = auth.uid()
  limit 1;
$$;

 create or replace function public.portal_identity()
 returns table (
   role text,
   student_id uuid,
   guardian_id uuid
 )
 language sql
 stable
 security definer
 set search_path = public
 as $$
   select
     (select p.role from public.profiles p where p.id = auth.uid() limit 1) as role,
     (select sul.student_id from public.student_user_links sul where sul.user_id = auth.uid() limit 1) as student_id,
     (select gul.guardian_id from public.guardian_user_links gul where gul.user_id = auth.uid() limit 1) as guardian_id;
 $$;

 grant execute on function public.portal_identity() to authenticated;

 create or replace function public.auto_link_student_by_email()
 returns uuid
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   v_user_id uuid;
   v_email text;
   v_role text;
   v_existing_student_id uuid;
   v_admission_number text;
   v_matched_student_id uuid;
   v_at_pos int;
 begin
   v_user_id := auth.uid();
   if v_user_id is null then
     return null;
   end if;

   select p.role into v_role
   from public.profiles p
   where p.id = v_user_id;

   if v_role is distinct from 'student' then
     return null;
   end if;

   select sul.student_id into v_existing_student_id
   from public.student_user_links sul
   where sul.user_id = v_user_id;

   if v_existing_student_id is not null then
     return v_existing_student_id;
   end if;

   select u.email into v_email
   from auth.users u
   where u.id = v_user_id;

   if v_email is null or v_email = '' then
     return null;
   end if;

   v_at_pos := position('@' in v_email);
   if v_at_pos < 2 then
     return null;
   end if;

   v_admission_number := lower(substring(v_email from 1 for v_at_pos - 1));

   select s.id into v_matched_student_id
   from public.students s
   where lower(s.admission_number) = v_admission_number
   limit 1;

   if v_matched_student_id is null then
     return null;
   end if;

   insert into public.student_user_links (user_id, student_id)
   values (v_user_id, v_matched_student_id)
   on conflict (user_id) do update set student_id = excluded.student_id;

   return v_matched_student_id;
 end;
 $$;

 grant execute on function public.auto_link_student_by_email() to authenticated;
 
 create or replace function public.can_student_access_session(session_uuid uuid) returns boolean
 language sql stable parallel safe
 as $$
  select exists(
    select 1
    from public.exam_test_sessions s
    inner join public.student_user_links sul on sul.user_id = auth.uid()
    inner join public.students st on st.id = sul.student_id
    where s.id = session_uuid
      and s.active = true
      and s.status = 'active'
      and (s.class_id is null or s.class_id = st.class_id)
      and (s.starts_at is null or s.starts_at <= now())
      and (s.ends_at is null or s.ends_at >= now())
  );
$$;
 
 create or replace function public.start_exam_attempt(session_uuid uuid, secret_code_input text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   v_student_id uuid;
   v_attempt_id uuid;
   v_requires boolean;
   v_secret text;
 begin
   v_student_id := public.current_student_id();
   if v_student_id is null then
     raise exception 'Not a student user';
   end if;
 
   if not public.can_student_access_session(session_uuid) then
     raise exception 'Session not accessible';
   end if;
 
   select s.requires_secret_code, s.secret_code
   into v_requires, v_secret
   from public.exam_test_sessions s
   where s.id = session_uuid;
 
   if coalesce(v_requires, false) = true then
     if secret_code_input is null or length(btrim(secret_code_input)) = 0 then
       raise exception 'Secret code required';
     end if;
 
     if btrim(secret_code_input) <> coalesce(v_secret, '') then
       raise exception 'Invalid secret code';
     end if;
   end if;
 
   select a.id into v_attempt_id
   from public.exam_attempts a
   where a.session_id = session_uuid
     and a.student_id = v_student_id;
 
   if v_attempt_id is null then
     insert into public.exam_attempts (session_id, student_id, secret_code_verified)
     values (session_uuid, v_student_id, coalesce(v_requires, false) = false or btrim(secret_code_input) = coalesce(v_secret, ''))
     returning id into v_attempt_id;
   else
     update public.exam_attempts
       set secret_code_verified = true
     where id = v_attempt_id
       and coalesce(v_requires, false) = true
       and btrim(secret_code_input) = coalesce(v_secret, '');
   end if;
 
   insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
   values (v_attempt_id, 'start', jsonb_build_object('secret_code_required', coalesce(v_requires, false)));
 
   return v_attempt_id;
 end;
 $$;
 
 create or replace function public.submit_exam_attempt(attempt_uuid uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   v_student_id uuid;
   v_session_id uuid;
   v_test_id uuid;
   v_requires boolean;
   v_verified boolean;
   v_has_manual boolean;
   v_max numeric(10,2);
   v_obt numeric(10,2);
 begin
   v_student_id := public.current_student_id();
   if v_student_id is null then
     raise exception 'Not a student user';
   end if;
 
   select a.session_id, s.test_id, a.secret_code_verified, s.requires_secret_code
   into v_session_id, v_test_id, v_verified, v_requires
   from public.exam_attempts a
   join public.exam_test_sessions s on s.id = a.session_id
   where a.id = attempt_uuid
     and a.student_id = v_student_id;
 
   if v_session_id is null then
     raise exception 'Attempt not found';
   end if;
 
   if not public.can_student_access_session(v_session_id) then
     raise exception 'Session not accessible';
   end if;
 
   if coalesce(v_requires, false) = true and coalesce(v_verified, false) = false then
     raise exception 'Secret code not verified';
   end if;
 
   update public.exam_attempts
     set submitted_at = now(), status = 'submitted'
   where id = attempt_uuid
     and submitted_at is null
     and locked_at is null;
 
   with qs as (
     select id, question_type, marks
     from public.exam_questions
     where test_id = v_test_id
       and active = true
   ), sol as (
     select question_id, correct_answer
     from public.exam_question_solutions
   ), ans as (
     select question_id, answer
     from public.exam_attempt_answers
     where attempt_id = attempt_uuid
   ), scored as (
     select
       qs.id as question_id,
       qs.question_type,
       qs.marks,
       sol.correct_answer,
       ans.answer,
       case
         when qs.question_type in ('mcq_single', 'true_false') then
           (coalesce(ans.answer->>'value','') = coalesce(sol.correct_answer->>'value',''))
         when qs.question_type = 'fill_blank' then
           lower(btrim(coalesce(ans.answer->>'value',''))) = lower(btrim(coalesce(sol.correct_answer->>'value','')))
         else null
       end as is_correct
     from qs
     left join sol on sol.question_id = qs.id
     left join ans on ans.question_id = qs.id
   )
   update public.exam_attempt_answers a
   set
     is_correct = s.is_correct,
     awarded_marks = case when s.is_correct = true then s.marks else 0 end,
     marked_at = case when s.is_correct is not null then now() else a.marked_at end
   from scored s
   where a.attempt_id = attempt_uuid
     and a.question_id = s.question_id
     and s.is_correct is not null;
 
   select
     coalesce(sum(q.marks), 0),
     coalesce(sum(case when a.is_correct = true then q.marks else 0 end), 0),
     bool_or(q.question_type in ('short_answer','essay','mcq_multi'))
   into v_max, v_obt, v_has_manual
   from public.exam_questions q
   left join public.exam_attempt_answers a
     on a.question_id = q.id and a.attempt_id = attempt_uuid
   where q.test_id = v_test_id
     and q.active = true;
 
   update public.exam_attempts
   set
     max_marks = v_max,
     obtained_marks = v_obt,
     percent = case when v_max > 0 then (v_obt / v_max) * 100 else 0 end,
     graded_at = case when v_has_manual = false then now() else graded_at end,
     status = case when v_has_manual = false then 'graded' else status end
   where id = attempt_uuid;
 
   insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
   values (attempt_uuid, 'submit', jsonb_build_object('auto_graded', (v_has_manual = false)));
 end;
 $$;
 
 create or replace function public.lock_exam_attempt(attempt_uuid uuid, reason text, event_data jsonb default '{}'::jsonb)
 returns void
 language plpgsql
 security definer
 set search_path = public
 as $$
 declare
   v_student_id uuid;
   v_session_id uuid;
 begin
   v_student_id := public.current_student_id();
   if v_student_id is null then
     raise exception 'Not a student user';
   end if;
 
   select a.session_id into v_session_id
   from public.exam_attempts a
   where a.id = attempt_uuid
     and a.student_id = v_student_id;
 
   if v_session_id is null then
     raise exception 'Attempt not found';
   end if;
 
   if not public.can_student_access_session(v_session_id) then
     raise exception 'Session not accessible';
   end if;
 
   update public.exam_attempts
   set
     locked_at = now(),
     locked_reason = reason,
     lock_count = lock_count + 1,
     status = 'locked'
   where id = attempt_uuid
     and locked_at is null;
 
   insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
   values (attempt_uuid, 'lock', jsonb_build_object('reason', reason) || coalesce(event_data, '{}'::jsonb));
 end;
 $$;
 
 drop policy if exists exam_tests_staff_all on public.exam_tests;
 create policy exam_tests_staff_all
   on public.exam_tests
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_tests_student_select on public.exam_tests;
 create policy exam_tests_student_select
   on public.exam_tests
   for select
   to authenticated
   using (true);
 
 drop policy if exists exam_questions_staff_all on public.exam_questions;
 create policy exam_questions_staff_all
   on public.exam_questions
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_questions_student_select on public.exam_questions;
 create policy exam_questions_student_select
   on public.exam_questions
   for select
   to authenticated
   using (
     exists(
       select 1
       from public.exam_test_sessions s
       where s.test_id = exam_questions.test_id
         and public.can_student_view_session(s.id)
     )
   );
 
 drop policy if exists exam_question_solutions_staff_all on public.exam_question_solutions;
 create policy exam_question_solutions_staff_all
   on public.exam_question_solutions
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_question_solutions_student_select on public.exam_question_solutions;
 create policy exam_question_solutions_student_select
   on public.exam_question_solutions
   for select
   to authenticated
   using (
     exists(
       select 1
       from public.exam_questions q
       join public.exam_test_sessions s on s.test_id = q.test_id
       where q.id = exam_question_solutions.question_id
         and public.can_student_view_session_results(s.id)
     )
   );
 
 drop policy if exists exam_sessions_staff_all on public.exam_test_sessions;
 create policy exam_sessions_staff_all
   on public.exam_test_sessions
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_conductors_staff_all on public.exam_conductors;
 create policy exam_conductors_staff_all
   on public.exam_conductors
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_conductor_user_links_staff_all on public.exam_conductor_user_links;
 create policy exam_conductor_user_links_staff_all
   on public.exam_conductor_user_links
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_session_conductors_staff_all on public.exam_session_conductors;
 create policy exam_session_conductors_staff_all
   on public.exam_session_conductors
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_sessions_conductor_select on public.exam_test_sessions;
 create policy exam_sessions_conductor_select
   on public.exam_test_sessions
   for select
   to authenticated
   using (public.can_conduct_session(exam_test_sessions.id));
 
 drop policy if exists exam_sessions_student_select on public.exam_test_sessions;
 create policy exam_sessions_student_select
   on public.exam_test_sessions
   for select
   to authenticated
   using (public.can_student_view_session(exam_test_sessions.id));
 
 drop policy if exists exam_attempts_staff_all on public.exam_attempts;
 create policy exam_attempts_staff_all
   on public.exam_attempts
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_attempts_conductor_select on public.exam_attempts;
 create policy exam_attempts_conductor_select
   on public.exam_attempts
   for select
   to authenticated
   using (public.can_conduct_session(exam_attempts.session_id));
 
 drop policy if exists exam_attempts_conductor_unlock on public.exam_attempts;
 create policy exam_attempts_conductor_unlock
   on public.exam_attempts
   for update
   to authenticated
   using (public.can_conduct_session(exam_attempts.session_id))
   with check (public.can_conduct_session(exam_attempts.session_id));
 
 drop policy if exists exam_attempts_student_own on public.exam_attempts;
 create policy exam_attempts_student_own
   on public.exam_attempts
   for select
   to authenticated
   using (
     exists(
       select 1
       from public.student_user_links sul
       where sul.user_id = auth.uid()
         and sul.student_id = exam_attempts.student_id
     )
   );
 
 drop policy if exists exam_attempts_student_insert on public.exam_attempts;
 
 
 drop policy if exists exam_attempts_student_update on public.exam_attempts;
 
 
 drop policy if exists exam_attempt_answers_staff_all on public.exam_attempt_answers;
 create policy exam_attempt_answers_staff_all
   on public.exam_attempt_answers
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_attempt_answers_student_own on public.exam_attempt_answers;
 create policy exam_attempt_answers_student_own
   on public.exam_attempt_answers
   for all
   to authenticated
   using (
     exists(
       select 1
       from public.exam_attempts a
       join public.student_user_links sul on sul.student_id = a.student_id
       where a.id = exam_attempt_answers.attempt_id
         and sul.user_id = auth.uid()
         and a.locked_at is null
         and a.submitted_at is null
     )
   )
   with check (
     exists(
       select 1
       from public.exam_attempts a
       join public.student_user_links sul on sul.student_id = a.student_id
       where a.id = exam_attempt_answers.attempt_id
         and sul.user_id = auth.uid()
         and a.locked_at is null
         and a.submitted_at is null
     )
   );
 
 drop policy if exists exam_attempt_answers_student_select on public.exam_attempt_answers;
 create policy exam_attempt_answers_student_select
   on public.exam_attempt_answers
   for select
   to authenticated
   using (
     exists(
       select 1
       from public.exam_attempts a
       join public.student_user_links sul on sul.student_id = a.student_id
       where a.id = exam_attempt_answers.attempt_id
         and sul.user_id = auth.uid()
     )
   );
 
 drop policy if exists exam_malpractice_staff_all on public.exam_malpractice_events;
 create policy exam_malpractice_staff_all
   on public.exam_malpractice_events
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());
 
 drop policy if exists exam_malpractice_conductor_all on public.exam_malpractice_events;
 create policy exam_malpractice_conductor_all
   on public.exam_malpractice_events
   for all
   to authenticated
   using (
     exists(
       select 1
       from public.exam_attempts a
       where a.id = exam_malpractice_events.attempt_id
         and public.can_conduct_session(a.session_id)
     )
   )
   with check (
     exists(
       select 1
       from public.exam_attempts a
       where a.id = exam_malpractice_events.attempt_id
         and public.can_conduct_session(a.session_id)
     )
   );
 
 drop trigger if exists exam_tests_set_updated_at on public.exam_tests;
 create trigger exam_tests_set_updated_at
   before update on public.exam_tests
   for each row execute procedure public.set_updated_at();
 
 drop trigger if exists exam_questions_set_updated_at on public.exam_questions;
 create trigger exam_questions_set_updated_at
   before update on public.exam_questions
   for each row execute procedure public.set_updated_at();
 
 drop trigger if exists exam_question_solutions_set_updated_at on public.exam_question_solutions;
 create trigger exam_question_solutions_set_updated_at
   before update on public.exam_question_solutions
   for each row execute procedure public.set_updated_at();
 
 drop trigger if exists exam_test_sessions_set_updated_at on public.exam_test_sessions;
 create trigger exam_test_sessions_set_updated_at
   before update on public.exam_test_sessions
   for each row execute procedure public.set_updated_at();
 
 drop trigger if exists exam_conductors_set_updated_at on public.exam_conductors;
 create trigger exam_conductors_set_updated_at
   before update on public.exam_conductors
   for each row execute procedure public.set_updated_at();
 
 drop trigger if exists exam_attempts_set_updated_at on public.exam_attempts;
 create trigger exam_attempts_set_updated_at
   before update on public.exam_attempts
   for each row execute procedure public.set_updated_at();
 
 drop trigger if exists exam_attempt_answers_set_updated_at on public.exam_attempt_answers;
 create trigger exam_attempt_answers_set_updated_at
   before update on public.exam_attempt_answers
   for each row execute procedure public.set_updated_at();
 
 create or replace view public.exam_attempt_list_v as
 select
   a.id as attempt_id,
   a.session_id,
   a.student_id,
   st.admission_number,
   st.first_name,
   st.last_name,
   a.obtained_marks,
   a.max_marks,
   a.percent,
   a.status,
   a.locked_at,
   a.lock_count,
   a.started_at,
   a.submitted_at
 from public.exam_attempts a
 join public.students st on st.id = a.student_id;
 
 create or replace view public.exam_session_summary_v as
 select
   s.id as session_id,
   s.test_id,
   t.name as test_name,
   t.subject_id,
   sub.name as subject_name,
   s.class_id,
   c.level as class_level,
   c.name as class_name,
   s.starts_at,
   s.ends_at,
   s.status,
   count(a.id) filter (where a.submitted_at is not null) as completions,
   count(a.id) filter (where a.submitted_at is null) as pending,
   count(a.id) filter (where a.locked_at is not null) as locked,
   coalesce(avg(a.percent), 0) as average_percent,
   coalesce(max(a.percent), 0) as highest_percent,
   coalesce(min(a.percent), 0) as lowest_percent
 from public.exam_test_sessions s
 join public.exam_tests t on t.id = s.test_id
 left join public.subjects sub on sub.id = t.subject_id
 left join public.classes c on c.id = s.class_id
 left join public.exam_attempts a on a.session_id = s.id
 group by s.id, s.test_id, t.name, t.subject_id, sub.name, s.class_id, c.level, c.name, s.starts_at, s.ends_at, s.status;

-- Subject management (see docs/migrations/20261009_subject_management.sql)

-- ---------------------------------------------------------------------------------------------------------------
-- Subjects offered by each class
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.class_subjects (
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, subject_id)
);

create index if not exists class_subjects_subject_idx on public.class_subjects(subject_id);

alter table public.class_subjects enable row level security;

drop policy if exists class_subjects_admin_all on public.class_subjects;
create policy class_subjects_admin_all
  on public.class_subjects
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists class_subjects_select on public.class_subjects;
create policy class_subjects_select
  on public.class_subjects
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------------------------------------------
-- Usage counts shown next to each subject
-- ---------------------------------------------------------------------------------------------------------------

create or replace view public.subject_usage
with (security_invoker = true)
as
select
  s.id as subject_id,
  (select count(*) from public.academic_assessments a where a.subject_id = s.id) as assessment_count,
  (
    select count(*)
    from public.academic_assessment_scores sc
    join public.academic_assessments a on a.id = sc.assessment_id
    where a.subject_id = s.id
  ) as score_count,
  (select count(*) from public.exam_tests t where t.subject_id = s.id) as test_count,
  (select count(*) from public.class_subjects cs where cs.subject_id = s.id) as class_count
from public.subjects s;

-- ---------------------------------------------------------------------------------------------------------------
-- Merging
-- ---------------------------------------------------------------------------------------------------------------

-- Name used to detect duplicates: lower case, trimmed, inner whitespace collapsed.
create or replace function public.subject_name_key(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

-- Does the work without a permission check. Not callable through the API; use merge_subjects instead.
create or replace function public.merge_subjects_unchecked(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  src_assessment record;
  match_id uuid;
  moved_assessments int := 0;
  combined_assessments int := 0;
  moved_tests int := 0;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'Choose two different subjects to merge';
  end if;
  if not exists (select 1 from public.subjects where id = p_source) then
    raise exception 'The subject to remove no longer exists';
  end if;
  if not exists (select 1 from public.subjects where id = p_target) then
    raise exception 'The subject to keep no longer exists';
  end if;

  -- Results: if the kept subject already has the same column (class, term, type), copy the scores across
  -- (scores already on the kept subject win), otherwise just re-point the assessment.
  for src_assessment in
    select * from public.academic_assessments where subject_id = p_source
  loop
    select a.id into match_id
    from public.academic_assessments a
    where a.subject_id = p_target
      and a.class_id is not distinct from src_assessment.class_id
      and a.academic_year_id is not distinct from src_assessment.academic_year_id
      and a.academic_term_id is not distinct from src_assessment.academic_term_id
      and a.assessment_type = src_assessment.assessment_type
    order by a.created_at
    limit 1;

    if match_id is null then
      update public.academic_assessments set subject_id = p_target where id = src_assessment.id;
      moved_assessments := moved_assessments + 1;
    else
      insert into public.academic_assessment_scores (assessment_id, student_id, score, remarks, graded_by)
      select match_id, sc.student_id, sc.score, sc.remarks, sc.graded_by
      from public.academic_assessment_scores sc
      where sc.assessment_id = src_assessment.id
      on conflict (assessment_id, student_id) do nothing;

      delete from public.academic_assessments where id = src_assessment.id;
      combined_assessments := combined_assessments + 1;
    end if;
  end loop;

  update public.exam_tests set subject_id = p_target where subject_id = p_source;
  get diagnostics moved_tests = row_count;

  insert into public.class_subjects (class_id, subject_id)
  select cs.class_id, p_target from public.class_subjects cs where cs.subject_id = p_source
  on conflict do nothing;

  -- Keep the subject active if either one was.
  update public.subjects t
  set active = t.active or s.active
  from public.subjects s
  where t.id = p_target and s.id = p_source;

  delete from public.subjects where id = p_source;

  return jsonb_build_object(
    'moved_assessments', moved_assessments,
    'combined_assessments', combined_assessments,
    'moved_tests', moved_tests
  );
end;
$$;

revoke all on function public.merge_subjects_unchecked(uuid, uuid) from public, anon, authenticated;

create or replace function public.merge_subjects(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can merge subjects';
  end if;
  return public.merge_subjects_unchecked(p_source, p_target);
end;
$$;

revoke all on function public.merge_subjects(uuid, uuid) from public, anon;
grant execute on function public.merge_subjects(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Clean up exact duplicates that already exist, then block new ones
-- ---------------------------------------------------------------------------------------------------------------

-- Keeps the active one with the most results (oldest first on a tie) and merges the rest into it.
do $$
declare
  dup record;
begin
  for dup in
    with ranked as (
      select
        s.id,
        first_value(s.id) over (
          partition by public.subject_name_key(s.name), s.level
          order by s.active desc,
            (select count(*) from public.academic_assessments a where a.subject_id = s.id) desc,
            s.created_at asc
        ) as keep_id
      from public.subjects s
    )
    select id, keep_id from ranked where id <> keep_id
  loop
    perform public.merge_subjects_unchecked(dup.id, dup.keep_id);
  end loop;
end;
$$;

create unique index if not exists subjects_name_key_level_uidx
  on public.subjects (public.subject_name_key(name), level) nulls not distinct;


-- ===== From migrations/20261015_portal_exam_sessions.sql =====
-- Student exam list: fast, single-call lookup
--
-- The portal Exams page used to read exam_test_sessions directly under the student RLS policy. On some
-- databases that policy still calls public.can_student_view_session(), which itself reads
-- exam_test_sessions (and so re-enters the policy for every row). The page then hit its timeout and
-- showed "Exams temporarily unavailable — timeout" with no sessions listed.
--
-- 1. portal_student_exam_sessions() returns the sessions the signed-in student can sit right now, with
--    the test name, duration and class, in one call. It runs as security definer and applies the same
--    rules as the RLS policy (active, status = 'active', inside the date window, class matches or blank).
-- 2. The student select policies on exam_test_sessions, exam_questions and exam_question_solutions are
--    re-created in their inlined, non-recursive form (same as 20260310_exam_session_performance.sql) in
--    case that migration was never applied. Re-running is harmless.

create or replace function public.portal_student_exam_sessions()
returns table (
  id uuid,
  test_id uuid,
  test_name text,
  duration_minutes int,
  class_id uuid,
  class_level text,
  class_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  requires_secret_code boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.test_id,
    t.name as test_name,
    t.duration_minutes,
    s.class_id,
    c.level::text as class_level,
    c.name as class_name,
    s.starts_at,
    s.ends_at,
    s.requires_secret_code
  from public.student_user_links sul
  join public.students st on st.id = sul.student_id
  join public.exam_test_sessions s
    on s.active = true
   and s.status = 'active'
   and (s.class_id is null or s.class_id = st.class_id)
   and (s.starts_at is null or s.starts_at <= now())
   and (s.ends_at is null or s.ends_at >= now())
  join public.exam_tests t on t.id = s.test_id
  left join public.classes c on c.id = s.class_id
  where sul.user_id = auth.uid()
  order by s.starts_at desc nulls last, t.name
  limit 100;
$$;

revoke all on function public.portal_student_exam_sessions() from public;
grant execute on function public.portal_student_exam_sessions() to authenticated;

drop policy if exists exam_sessions_student_select on public.exam_test_sessions;
create policy exam_sessions_student_select
  on public.exam_test_sessions
  for select
  to authenticated
  using (
    exists(
      select 1
      from public.student_user_links sul
      inner join public.students st on st.id = sul.student_id
      where sul.user_id = auth.uid()
        and exam_test_sessions.active = true
        and (exam_test_sessions.class_id is null or exam_test_sessions.class_id = st.class_id)
        and (
          (exam_test_sessions.status = 'active'
            and (exam_test_sessions.starts_at is null or exam_test_sessions.starts_at <= now())
            and (exam_test_sessions.ends_at is null or exam_test_sessions.ends_at >= now()))
          or exam_test_sessions.results_released_at is not null
        )
    )
  );

drop policy if exists exam_questions_student_select on public.exam_questions;
create policy exam_questions_student_select
  on public.exam_questions
  for select
  to authenticated
  using (
    public.is_staff()
    or exists(
      select 1
      from public.exam_test_sessions s
      inner join public.student_user_links sul on sul.user_id = auth.uid()
      inner join public.students st on st.id = sul.student_id
      where s.test_id = exam_questions.test_id
        and s.active = true
        and (s.class_id is null or s.class_id = st.class_id)
        and (
          (s.status = 'active' and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at >= now()))
          or s.results_released_at is not null
        )
    )
  );

-- For exam_question_solutions: Inline the check instead of function call
drop policy if exists exam_question_solutions_student_select on public.exam_question_solutions;
create policy exam_question_solutions_student_select
  on public.exam_question_solutions
  for select
  to authenticated
  using (
    public.is_staff()
    or exists(
      select 1
      from public.exam_questions q
      inner join public.exam_test_sessions s on s.test_id = q.test_id
      inner join public.student_user_links sul on sul.user_id = auth.uid()
      inner join public.students st on st.id = sul.student_id
      where q.id = exam_question_solutions.question_id
        and s.active = true
        and (s.class_id is null or s.class_id = st.class_id)
        and s.results_released_at is not null
    )
  );

create index if not exists student_user_links_user_id_idx on public.student_user_links(user_id);

-- ===== From migrations/20261016_exam_question_images.sql =====
-- Pictures on exam questions
--
-- Teachers can attach one image (diagram, map, chart, photo) to a question. The image is uploaded
-- from the browser straight to the public "exam-images" storage bucket and the question keeps its URL.
--
-- 1. exam_questions.image_url holds the public URL of the picture (null when there is none).
-- 2. The "exam-images" bucket is public (students read pictures by URL), accepts PNG / JPG / WEBP / GIF
--    up to 2 MB, and only staff can upload, replace or delete files in it.
-- Re-running is harmless.

alter table public.exam_questions add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-images', 'exam-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exam_images_public_read on storage.objects;
create policy exam_images_public_read
  on storage.objects
  for select
  using (bucket_id = 'exam-images');

drop policy if exists exam_images_staff_insert on storage.objects;
create policy exam_images_staff_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'exam-images' and public.is_staff());

drop policy if exists exam_images_staff_update on storage.objects;
create policy exam_images_staff_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'exam-images' and public.is_staff())
  with check (bucket_id = 'exam-images' and public.is_staff());

drop policy if exists exam_images_staff_delete on storage.objects;
create policy exam_images_staff_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'exam-images' and public.is_staff());

-- ===== From migrations/20261016_class_delete_merge.sql =====
-- Deleting and merging classes
--
-- 1. class_usage(class) counts everything that points at a class, shown on /admin/classes/[id].
-- 2. delete_class(class) deletes a class only when nothing uses it: no students (any status), fee schedules,
--    results, attendance, result publications or exam sessions. Its subject list and teacher assignments
--    are setup only and go with it.
-- 3. merge_classes(source, target) moves everything from a duplicate class onto the class being kept, then
--    deletes the duplicate:
--    - students move (and take the kept class's level), as do attendance and exam sessions
--    - results: a column (subject, term, type) that the kept class already has gets the duplicate's scores
--      copied in (scores already on the kept class win); otherwise the column is moved
--    - subjects offered and teacher assignments are added to the kept class
--    - result publications move unless the kept class already has the same one
--    - fee schedules move; if both classes have a schedule for the same year and term the merge stops, because
--      two fee schedules cannot be combined automatically. Fix that schedule first.
-- Only admins can run 2 and 3. Run the whole file once in the Supabase SQL editor. Re-running is harmless.

create or replace function public.class_usage(p_class uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'students', (select count(*) from public.students where class_id = p_class),
    'fee_schedules', (select count(*) from public.fee_schedules where class_id = p_class),
    'assessments', (select count(*) from public.academic_assessments where class_id = p_class),
    'attendance', (select count(*) from public.student_attendance where class_id = p_class),
    'publications', (select count(*) from public.result_publications where class_id = p_class),
    'exam_sessions', (select count(*) from public.exam_test_sessions where class_id = p_class),
    'subjects', (select count(*) from public.class_subjects where class_id = p_class),
    'teachers', (select count(*) from public.teacher_class_assignments where class_id = p_class)
  )
  where coalesce(public.is_staff(), false);
$$;

revoke all on function public.class_usage(uuid) from public, anon;
grant execute on function public.class_usage(uuid) to authenticated;

create or replace function public.delete_class(p_class uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  usage jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can delete classes';
  end if;
  if not exists (select 1 from public.classes where id = p_class) then
    raise exception 'This class no longer exists';
  end if;

  usage := public.class_usage(p_class);
  if (usage->>'students')::int > 0
    or (usage->>'fee_schedules')::int > 0
    or (usage->>'assessments')::int > 0
    or (usage->>'attendance')::int > 0
    or (usage->>'publications')::int > 0
    or (usage->>'exam_sessions')::int > 0 then
    raise exception 'This class is in use (students, fees, results, attendance or exams). Merge it into another class or deactivate it instead.';
  end if;

  delete from public.classes where id = p_class;
end;
$$;

revoke all on function public.delete_class(uuid) from public, anon;
grant execute on function public.delete_class(uuid) to authenticated;

create or replace function public.merge_classes(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_level public.school_level;
  src_assessment record;
  match_id uuid;
  moved_students int := 0;
  moved_assessments int := 0;
  combined_assessments int := 0;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can merge classes';
  end if;
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'Choose two different classes to merge';
  end if;
  if not exists (select 1 from public.classes where id = p_source) then
    raise exception 'The class to remove no longer exists';
  end if;
  select level into target_level from public.classes where id = p_target;
  if target_level is null then
    raise exception 'The class to keep no longer exists';
  end if;

  if exists (
    select 1
    from public.fee_schedules s
    join public.fee_schedules t
      on t.class_id = p_target
     and t.academic_year_id = s.academic_year_id
     and t.academic_term_id is not distinct from s.academic_term_id
    where s.class_id = p_source
  ) then
    raise exception 'Both classes have a fee schedule for the same year and term. Delete or fix the duplicate fee schedule first, then merge.';
  end if;

  update public.students set class_id = p_target, level = target_level where class_id = p_source;
  get diagnostics moved_students = row_count;

  update public.fee_schedules set class_id = p_target where class_id = p_source;

  for src_assessment in
    select * from public.academic_assessments where class_id = p_source
  loop
    select a.id into match_id
    from public.academic_assessments a
    where a.class_id = p_target
      and a.subject_id is not distinct from src_assessment.subject_id
      and a.academic_year_id is not distinct from src_assessment.academic_year_id
      and a.academic_term_id is not distinct from src_assessment.academic_term_id
      and a.assessment_type = src_assessment.assessment_type
    order by a.created_at
    limit 1;

    if match_id is null then
      update public.academic_assessments set class_id = p_target where id = src_assessment.id;
      moved_assessments := moved_assessments + 1;
    else
      insert into public.academic_assessment_scores (assessment_id, student_id, score, remarks, graded_by)
      select match_id, sc.student_id, sc.score, sc.remarks, sc.graded_by
      from public.academic_assessment_scores sc
      where sc.assessment_id = src_assessment.id
      on conflict (assessment_id, student_id) do nothing;

      delete from public.academic_assessments where id = src_assessment.id;
      combined_assessments := combined_assessments + 1;
    end if;
  end loop;

  update public.student_attendance set class_id = p_target where class_id = p_source;
  update public.exam_test_sessions set class_id = p_target where class_id = p_source;

  update public.result_publications p
  set class_id = p_target
  where p.class_id = p_source
    and not exists (
      select 1
      from public.result_publications t
      where t.class_id = p_target
        and t.scope = p.scope
        and t.academic_year_id is not distinct from p.academic_year_id
        and t.academic_term_id is not distinct from p.academic_term_id
        and t.level is not distinct from p.level
    );
  delete from public.result_publications where class_id = p_source;

  insert into public.class_subjects (class_id, subject_id)
  select p_target, cs.subject_id from public.class_subjects cs where cs.class_id = p_source
  on conflict do nothing;

  insert into public.teacher_class_assignments (teacher_id, class_id, active)
  select tca.teacher_id, p_target, tca.active from public.teacher_class_assignments tca where tca.class_id = p_source
  on conflict (teacher_id, class_id) do update
    set active = public.teacher_class_assignments.active or excluded.active;

  -- Keep the class active if either one was.
  update public.classes t
  set active = t.active or s.active
  from public.classes s
  where t.id = p_target and s.id = p_source;

  delete from public.classes where id = p_source;

  return jsonb_build_object(
    'moved_students', moved_students,
    'moved_assessments', moved_assessments,
    'combined_assessments', combined_assessments
  );
end;
$$;

revoke all on function public.merge_classes(uuid, uuid) from public, anon;
grant execute on function public.merge_classes(uuid, uuid) to authenticated;

-- ===== From migrations/20261019_teacher_subject_assignments.sql =====
-- Teachers assigned to several classes and to subjects
--
-- Until now a teacher was assigned to classes only, and a teacher could open every exam test. Now:
--
--   Class teacher    (teacher_class_assignments, one row per class, as before)
--                    Sees the class's students, takes its attendance and works on every subject the class
--                    offers (Academics > Class subjects; every subject if the class has none set up).
--   Subject teacher  (teacher_subject_assignments, one row per class + subject)
--                    Sees the students of that class and works on that subject only: result scores,
--                    assessments, and the CBT tests / questions for that subject. No attendance, no
--                    editing students, no publishing results.
--
-- A teacher can be both, e.g. class teacher of Year 1 and the French teacher in every class.
-- The pages are managed by admins at Academics > Teacher assignments.
-- Teachers with only class assignments keep working as before; they just get the class's subjects.
--
-- This file also:
--  - limits teachers to the CBT tests, questions, solutions and sessions of the subjects they teach
--    (tests they created themselves stay theirs); admins and other staff are unchanged,
--  - fills exam_tests.created_by automatically,
--  - teaches merge_subjects, class_usage and merge_classes about subject assignments.
-- Run the whole file once in the Supabase SQL editor. Re-running is harmless.
-- Needs 20261009_subject_management.sql and 20261016_class_delete_merge.sql to have been run first.

-- ---------------------------------------------------------------------------------------------------------------
-- Subject assignments
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.teacher_subject_assignments (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id, subject_id)
);

create index if not exists teacher_subject_assignments_class_idx on public.teacher_subject_assignments(class_id);
create index if not exists teacher_subject_assignments_subject_idx on public.teacher_subject_assignments(subject_id);

alter table public.teacher_subject_assignments enable row level security;

drop policy if exists teacher_subject_assignments_admin_all on public.teacher_subject_assignments;
create policy teacher_subject_assignments_admin_all
  on public.teacher_subject_assignments
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists teacher_subject_assignments_teacher_select on public.teacher_subject_assignments;
create policy teacher_subject_assignments_teacher_select
  on public.teacher_subject_assignments
  for select
  to authenticated
  using (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------------------------------------------
-- Who may work on what
-- ---------------------------------------------------------------------------------------------------------------

-- Does the signed-in teacher teach this subject in this class? (class teacher: any subject the class offers)
create or replace function public.teacher_teaches(p_class uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.teacher_subject_assignments a
      where a.teacher_id = auth.uid() and a.active = true
        and a.class_id = p_class and a.subject_id = p_subject
    )
    or (
      public.teacher_has_class(p_class)
      and (
        p_subject is null
        or not exists (select 1 from public.class_subjects cs where cs.class_id = p_class)
        or exists (select 1 from public.class_subjects cs where cs.class_id = p_class and cs.subject_id = p_subject)
      )
    );
$$;

-- Class teacher of this class, or teaches any subject in it (enough to see the class and its students).
create or replace function public.teacher_has_class_or_subject(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.teacher_has_class(p_class)
    or exists (
      select 1
      from public.teacher_subject_assignments a
      where a.teacher_id = auth.uid() and a.active = true and a.class_id = p_class
    );
$$;

-- Does the signed-in teacher teach this subject in any class? (decides who may set its CBT tests)
create or replace function public.teacher_teaches_subject(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_subject is not null
    and (
      exists (
        select 1
        from public.teacher_subject_assignments a
        where a.teacher_id = auth.uid() and a.active = true and a.subject_id = p_subject
      )
      or exists (
        select 1
        from public.teacher_class_assignments tca
        where tca.teacher_id = auth.uid() and tca.active = true
          and (
            not exists (select 1 from public.class_subjects cs where cs.class_id = tca.class_id)
            or exists (select 1 from public.class_subjects cs where cs.class_id = tca.class_id and cs.subject_id = p_subject)
          )
      )
    );
$$;

-- May the signed-in staff member edit this test (and its questions, solutions and sessions)?
create or replace function public.can_manage_test(p_test uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(public.is_admin(), false)
    or (coalesce(public.is_staff(), false) and public.current_role() <> 'teacher')
    or (
      public.current_role() = 'teacher'
      and exists (
        select 1
        from public.exam_tests t
        where t.id = p_test
          and (t.created_by = auth.uid() or public.teacher_teaches_subject(t.subject_id))
      )
    );
$$;

revoke all on function public.teacher_teaches(uuid, uuid) from public, anon;
revoke all on function public.teacher_has_class_or_subject(uuid) from public, anon;
revoke all on function public.teacher_teaches_subject(uuid) from public, anon;
revoke all on function public.can_manage_test(uuid) from public, anon;
grant execute on function public.teacher_teaches(uuid, uuid) to authenticated;
grant execute on function public.teacher_has_class_or_subject(uuid) to authenticated;
grant execute on function public.teacher_teaches_subject(uuid) to authenticated;
grant execute on function public.can_manage_test(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Classes and students: subject teachers can read their classes (class teachers keep full access)
-- ---------------------------------------------------------------------------------------------------------------

drop policy if exists classes_subject_teacher_select on public.classes;
create policy classes_subject_teacher_select
  on public.classes
  for select
  to authenticated
  using (public.teacher_has_class_or_subject(id));

drop policy if exists students_subject_teacher_select on public.students;
create policy students_subject_teacher_select
  on public.students
  for select
  to authenticated
  using (public.teacher_has_class_or_subject(class_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Results: teachers work only on the subjects they teach in each class
-- ---------------------------------------------------------------------------------------------------------------

drop policy if exists academic_assessments_staff_all on public.academic_assessments;
create policy academic_assessments_staff_all
  on public.academic_assessments
  for all
  to authenticated
  using (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_teaches(class_id, subject_id)
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_teaches(class_id, subject_id)
  );

drop policy if exists academic_assessment_scores_staff_all on public.academic_assessment_scores;
create policy academic_assessment_scores_staff_all
  on public.academic_assessment_scores
  for all
  to authenticated
  using (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or exists (
      select 1
      from public.academic_assessments a
      where a.id = academic_assessment_scores.assessment_id
        and public.teacher_teaches(a.class_id, a.subject_id)
    )
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or exists (
      select 1
      from public.academic_assessments a
      where a.id = academic_assessment_scores.assessment_id
        and public.teacher_teaches(a.class_id, a.subject_id)
    )
  );

-- ---------------------------------------------------------------------------------------------------------------
-- CBT: teachers set tests and questions only for the subjects they teach
-- ---------------------------------------------------------------------------------------------------------------

alter table public.exam_tests alter column created_by set default auth.uid();

drop policy if exists exam_tests_staff_all on public.exam_tests;
create policy exam_tests_staff_all
  on public.exam_tests
  for all
  to authenticated
  using (
    public.is_admin()
    or (public.is_staff() and public.current_role() <> 'teacher')
    or (public.current_role() = 'teacher' and (created_by = auth.uid() or public.teacher_teaches_subject(subject_id)))
  )
  with check (
    public.is_admin()
    or (public.is_staff() and public.current_role() <> 'teacher')
    or (public.current_role() = 'teacher' and public.teacher_teaches_subject(subject_id))
  );

drop policy if exists exam_questions_staff_all on public.exam_questions;
create policy exam_questions_staff_all
  on public.exam_questions
  for all
  to authenticated
  using (public.can_manage_test(test_id))
  with check (public.can_manage_test(test_id));

drop policy if exists exam_question_solutions_staff_all on public.exam_question_solutions;
create policy exam_question_solutions_staff_all
  on public.exam_question_solutions
  for all
  to authenticated
  using (
    exists (select 1 from public.exam_questions q where q.id = exam_question_solutions.question_id and public.can_manage_test(q.test_id))
  )
  with check (
    exists (select 1 from public.exam_questions q where q.id = exam_question_solutions.question_id and public.can_manage_test(q.test_id))
  );

drop policy if exists exam_sessions_staff_all on public.exam_test_sessions;
create policy exam_sessions_staff_all
  on public.exam_test_sessions
  for all
  to authenticated
  using (public.can_manage_test(test_id))
  with check (public.can_manage_test(test_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Merging and deleting keep subject assignments in step
-- ---------------------------------------------------------------------------------------------------------------

-- Same as before, plus: teachers assigned to the duplicate subject are assigned to the kept one.
create or replace function public.merge_subjects_unchecked(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  src_assessment record;
  match_id uuid;
  moved_assessments int := 0;
  combined_assessments int := 0;
  moved_tests int := 0;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'Choose two different subjects to merge';
  end if;
  if not exists (select 1 from public.subjects where id = p_source) then
    raise exception 'The subject to remove no longer exists';
  end if;
  if not exists (select 1 from public.subjects where id = p_target) then
    raise exception 'The subject to keep no longer exists';
  end if;

  for src_assessment in
    select * from public.academic_assessments where subject_id = p_source
  loop
    select a.id into match_id
    from public.academic_assessments a
    where a.subject_id = p_target
      and a.class_id is not distinct from src_assessment.class_id
      and a.academic_year_id is not distinct from src_assessment.academic_year_id
      and a.academic_term_id is not distinct from src_assessment.academic_term_id
      and a.assessment_type = src_assessment.assessment_type
    order by a.created_at
    limit 1;

    if match_id is null then
      update public.academic_assessments set subject_id = p_target where id = src_assessment.id;
      moved_assessments := moved_assessments + 1;
    else
      insert into public.academic_assessment_scores (assessment_id, student_id, score, remarks, graded_by)
      select match_id, sc.student_id, sc.score, sc.remarks, sc.graded_by
      from public.academic_assessment_scores sc
      where sc.assessment_id = src_assessment.id
      on conflict (assessment_id, student_id) do nothing;

      delete from public.academic_assessments where id = src_assessment.id;
      combined_assessments := combined_assessments + 1;
    end if;
  end loop;

  update public.exam_tests set subject_id = p_target where subject_id = p_source;
  get diagnostics moved_tests = row_count;

  insert into public.class_subjects (class_id, subject_id)
  select cs.class_id, p_target from public.class_subjects cs where cs.subject_id = p_source
  on conflict do nothing;

  insert into public.teacher_subject_assignments (teacher_id, class_id, subject_id, active)
  select tsa.teacher_id, tsa.class_id, p_target, tsa.active
  from public.teacher_subject_assignments tsa
  where tsa.subject_id = p_source
  on conflict (teacher_id, class_id, subject_id) do update
    set active = public.teacher_subject_assignments.active or excluded.active;

  update public.subjects t
  set active = t.active or s.active
  from public.subjects s
  where t.id = p_target and s.id = p_source;

  delete from public.subjects where id = p_source;

  return jsonb_build_object(
    'moved_assessments', moved_assessments,
    'combined_assessments', combined_assessments,
    'moved_tests', moved_tests
  );
end;
$$;

revoke all on function public.merge_subjects_unchecked(uuid, uuid) from public, anon, authenticated;

-- class_usage / delete_class / merge_classes (from 20261016_class_delete_merge.sql) with subject assignments.
create or replace function public.class_usage(p_class uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'students', (select count(*) from public.students where class_id = p_class),
    'fee_schedules', (select count(*) from public.fee_schedules where class_id = p_class),
    'assessments', (select count(*) from public.academic_assessments where class_id = p_class),
    'attendance', (select count(*) from public.student_attendance where class_id = p_class),
    'publications', (select count(*) from public.result_publications where class_id = p_class),
    'exam_sessions', (select count(*) from public.exam_test_sessions where class_id = p_class),
    'subjects', (select count(*) from public.class_subjects where class_id = p_class),
    'teachers', (select count(*) from public.teacher_class_assignments where class_id = p_class),
    'teacher_subjects', (select count(*) from public.teacher_subject_assignments where class_id = p_class)
  )
  where coalesce(public.is_staff(), false);
$$;

revoke all on function public.class_usage(uuid) from public, anon;
grant execute on function public.class_usage(uuid) to authenticated;

create or replace function public.merge_classes(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_level public.school_level;
  src_assessment record;
  match_id uuid;
  moved_students int := 0;
  moved_assessments int := 0;
  combined_assessments int := 0;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can merge classes';
  end if;
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'Choose two different classes to merge';
  end if;
  if not exists (select 1 from public.classes where id = p_source) then
    raise exception 'The class to remove no longer exists';
  end if;
  select level into target_level from public.classes where id = p_target;
  if target_level is null then
    raise exception 'The class to keep no longer exists';
  end if;

  if exists (
    select 1
    from public.fee_schedules s
    join public.fee_schedules t
      on t.class_id = p_target
     and t.academic_year_id = s.academic_year_id
     and t.academic_term_id is not distinct from s.academic_term_id
    where s.class_id = p_source
  ) then
    raise exception 'Both classes have a fee schedule for the same year and term. Delete or fix the duplicate fee schedule first, then merge.';
  end if;

  update public.students set class_id = p_target, level = target_level where class_id = p_source;
  get diagnostics moved_students = row_count;

  update public.fee_schedules set class_id = p_target where class_id = p_source;

  for src_assessment in
    select * from public.academic_assessments where class_id = p_source
  loop
    select a.id into match_id
    from public.academic_assessments a
    where a.class_id = p_target
      and a.subject_id is not distinct from src_assessment.subject_id
      and a.academic_year_id is not distinct from src_assessment.academic_year_id
      and a.academic_term_id is not distinct from src_assessment.academic_term_id
      and a.assessment_type = src_assessment.assessment_type
    order by a.created_at
    limit 1;

    if match_id is null then
      update public.academic_assessments set class_id = p_target where id = src_assessment.id;
      moved_assessments := moved_assessments + 1;
    else
      insert into public.academic_assessment_scores (assessment_id, student_id, score, remarks, graded_by)
      select match_id, sc.student_id, sc.score, sc.remarks, sc.graded_by
      from public.academic_assessment_scores sc
      where sc.assessment_id = src_assessment.id
      on conflict (assessment_id, student_id) do nothing;

      delete from public.academic_assessments where id = src_assessment.id;
      combined_assessments := combined_assessments + 1;
    end if;
  end loop;

  update public.student_attendance set class_id = p_target where class_id = p_source;
  update public.exam_test_sessions set class_id = p_target where class_id = p_source;

  update public.result_publications p
  set class_id = p_target
  where p.class_id = p_source
    and not exists (
      select 1
      from public.result_publications t
      where t.class_id = p_target
        and t.scope = p.scope
        and t.academic_year_id is not distinct from p.academic_year_id
        and t.academic_term_id is not distinct from p.academic_term_id
        and t.level is not distinct from p.level
    );
  delete from public.result_publications where class_id = p_source;

  insert into public.class_subjects (class_id, subject_id)
  select p_target, cs.subject_id from public.class_subjects cs where cs.class_id = p_source
  on conflict do nothing;

  insert into public.teacher_class_assignments (teacher_id, class_id, active)
  select tca.teacher_id, p_target, tca.active from public.teacher_class_assignments tca where tca.class_id = p_source
  on conflict (teacher_id, class_id) do update
    set active = public.teacher_class_assignments.active or excluded.active;

  insert into public.teacher_subject_assignments (teacher_id, class_id, subject_id, active)
  select tsa.teacher_id, p_target, tsa.subject_id, tsa.active
  from public.teacher_subject_assignments tsa
  where tsa.class_id = p_source
  on conflict (teacher_id, class_id, subject_id) do update
    set active = public.teacher_subject_assignments.active or excluded.active;

  update public.classes t
  set active = t.active or s.active
  from public.classes s
  where t.id = p_target and s.id = p_source;

  delete from public.classes where id = p_source;

  return jsonb_build_object(
    'moved_students', moved_students,
    'moved_assessments', moved_assessments,
    'combined_assessments', combined_assessments
  );
end;
$$;

revoke all on function public.merge_classes(uuid, uuid) from public, anon;
grant execute on function public.merge_classes(uuid, uuid) to authenticated;

-- Term reports (see docs/migrations/20261022_term_reports.sql)

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Result sheet columns
-- ---------------------------------------------------------------------------------------------------------------

alter table public.academic_assessments add column if not exists on_result_sheet boolean not null default false;
alter table public.academic_assessments add column if not exists position int not null default 0;
alter table public.academic_assessments add column if not exists component_group text;

alter table public.academic_assessments drop constraint if exists academic_assessments_component_group_check;
alter table public.academic_assessments
  add constraint academic_assessments_component_group_check
  check (component_group is null or component_group in ('ca', 'exam', 'other'));

-- Existing sheets (the four fixed columns) become ordinary sheet columns.
update public.academic_assessments
set
  on_result_sheet = true,
  position = case assessment_type
    when 'first_ca' then 1
    when 'second_ca' then 2
    when 'exam_objective' then 3
    when 'exam_theory' then 4
  end,
  component_group = case when assessment_type in ('first_ca', 'second_ca') then 'ca' else 'exam' end
where assessment_type in ('first_ca', 'second_ca', 'exam_objective', 'exam_theory')
  and on_result_sheet = false;

create index if not exists academic_assessments_sheet_idx
  on public.academic_assessments(class_id, subject_id, academic_term_id)
  where on_result_sheet;

-- Default columns for new sheets. components: [{"label": "1st CA", "group": "ca", "max": 20}, ...]
create table if not exists public.result_layouts (
  id uuid primary key default gen_random_uuid(),
  level public.school_level,
  class_id uuid references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  components jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint result_layouts_scope_uniq unique nulls not distinct (level, class_id, subject_id),
  constraint result_layouts_components_is_array check (jsonb_typeof(components) = 'array')
);

alter table public.result_layouts enable row level security;

drop policy if exists result_layouts_staff_select on public.result_layouts;
create policy result_layouts_staff_select
  on public.result_layouts
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists result_layouts_admin_all on public.result_layouts;
create policy result_layouts_admin_all
  on public.result_layouts
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Teachers may save the layout for a class + subject they teach.
drop policy if exists result_layouts_teacher_write on public.result_layouts;
create policy result_layouts_teacher_write
  on public.result_layouts
  for all
  to authenticated
  using (class_id is not null and subject_id is not null and public.teacher_teaches(class_id, subject_id))
  with check (class_id is not null and subject_id is not null and public.teacher_teaches(class_id, subject_id));

-- School-wide default: the previous fixed layout.
insert into public.result_layouts (level, class_id, subject_id, components)
values (
  null, null, null,
  '[{"label": "1st CA", "group": "ca", "max": 20},
    {"label": "2nd CA", "group": "ca", "max": 20},
    {"label": "Exam (Objective)", "group": "exam", "max": 30},
    {"label": "Exam (Theory)", "group": "exam", "max": 30}]'::jsonb
)
on conflict on constraint result_layouts_scope_uniq do nothing;

-- Subject score per student per term. Sheet columns: score / max x 100. Older weighted assessments (not on a
-- sheet) keep their weighted calculation, and are only used when the subject has no sheet that term.
create or replace view public.academic_student_subject_term_summary as
with sheet_max as (
  select a.academic_year_id, a.academic_term_id, a.class_id, a.subject_id, sum(a.max_score) as max_total
  from public.academic_assessments a
  where a.on_result_sheet
  group by a.academic_year_id, a.academic_term_id, a.class_id, a.subject_id
),
sheet as (
  select
    sc.student_id,
    a.academic_year_id,
    a.academic_term_id,
    a.class_id,
    a.subject_id,
    sum(sc.score) / nullif(m.max_total, 0) * 100 as weighted_score
  from public.academic_assessment_scores sc
  join public.academic_assessments a on a.id = sc.assessment_id and a.on_result_sheet
  join sheet_max m
    on m.class_id is not distinct from a.class_id
   and m.subject_id = a.subject_id
   and m.academic_year_id is not distinct from a.academic_year_id
   and m.academic_term_id is not distinct from a.academic_term_id
  group by sc.student_id, a.academic_year_id, a.academic_term_id, a.class_id, a.subject_id, m.max_total
),
legacy as (
  select
    sc.student_id,
    a.academic_year_id,
    a.academic_term_id,
    a.class_id,
    a.subject_id,
    coalesce(sum(case when w.weight is not null then (sc.score / nullif(a.max_score, 0)) * 100 * (w.weight / 100) else 0 end), 0)
      as weighted_score
  from public.academic_assessment_scores sc
  join public.academic_assessments a on a.id = sc.assessment_id and not a.on_result_sheet
  left join public.classes c on c.id = a.class_id
  left join public.assessment_weights w
    on w.active = true
   and w.level = c.level
   and w.assessment_type = a.assessment_type
  group by sc.student_id, a.academic_year_id, a.academic_term_id, a.class_id, a.subject_id
),
combined as (
  select * from sheet
  union all
  select l.*
  from legacy l
  where not exists (
    select 1 from sheet s
    where s.student_id = l.student_id
      and s.subject_id = l.subject_id
      and s.class_id is not distinct from l.class_id
      and s.academic_year_id is not distinct from l.academic_year_id
      and s.academic_term_id is not distinct from l.academic_term_id
  )
)
select
  b.student_id,
  b.academic_year_id,
  b.academic_term_id,
  b.class_id,
  c.level as class_level,
  b.subject_id,
  sub.name as subject_name,
  round(b.weighted_score, 2) as weighted_score,
  gs.grade
from combined b
join public.subjects sub on sub.id = b.subject_id
left join public.classes c on c.id = b.class_id
left join public.grading_scales gs
  on gs.active = true
 and gs.level = c.level
 and round(b.weighted_score, 2) between gs.min_score and gs.max_score;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Welfare criteria and ratings
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.welfare_criteria (
  id uuid primary key default gen_random_uuid(),
  level public.school_level not null,
  name text not null,
  description text,
  -- rating: class teacher rates 1-5. attendance/punctuality/uniform/conduct: worked out from the welfare records.
  source text not null check (source in ('rating', 'attendance', 'punctuality', 'uniform', 'conduct')),
  max_points numeric(6,2) not null check (max_points > 0),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level, name)
);

alter table public.welfare_criteria enable row level security;

drop policy if exists welfare_criteria_select on public.welfare_criteria;
create policy welfare_criteria_select
  on public.welfare_criteria
  for select
  to authenticated
  using (true);

drop policy if exists welfare_criteria_admin_all on public.welfare_criteria;
create policy welfare_criteria_admin_all
  on public.welfare_criteria
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Default criteria for every level (100 points). Admins can change them under Welfare -> Welfare criteria.
insert into public.welfare_criteria (level, name, description, source, max_points, position)
select lvl, d.name, d.description, d.source, d.max_points, d.position
from unnest(array['creche', 'primary', 'secondary']::public.school_level[]) as lvl
cross join (
  values
    ('Attendance', 'Days present out of the days attendance was taken this term.', 'attendance', 20, 1),
    ('Punctuality', 'Days on time out of the days present (from "late" attendance marks).', 'punctuality', 10, 2),
    ('Uniform & appearance', 'Uniform checks passed out of the checks done this term.', 'uniform', 10, 3),
    ('Conduct', 'Starts full; discipline records and incidents take points off by severity.', 'conduct', 15, 4),
    ('Neatness', 'Rated 1-5 by the class teacher.', 'rating', 5, 5),
    ('Politeness & respect', 'Rated 1-5 by the class teacher.', 'rating', 10, 6),
    ('Honesty', 'Rated 1-5 by the class teacher.', 'rating', 5, 7),
    ('Cooperation & relationship with others', 'Rated 1-5 by the class teacher.', 'rating', 10, 8),
    ('Attentiveness & self-control', 'Rated 1-5 by the class teacher.', 'rating', 5, 9),
    ('Leadership & responsibility', 'Rated 1-5 by the class teacher.', 'rating', 5, 10),
    ('Participation (sports, clubs, crafts)', 'Rated 1-5 by the class teacher.', 'rating', 5, 11)
) as d(name, description, source, max_points, position)
on conflict (level, name) do nothing;

create table if not exists public.welfare_ratings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  criterion_id uuid not null references public.welfare_criteria(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  rated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_term_id, criterion_id)
);

create index if not exists welfare_ratings_class_term_idx on public.welfare_ratings(class_id, academic_term_id);

alter table public.welfare_ratings enable row level security;

-- Admins and non-teaching staff: everything. Teachers: the classes they are class teacher of.
drop policy if exists welfare_ratings_staff_all on public.welfare_ratings;
create policy welfare_ratings_staff_all
  on public.welfare_ratings
  for all
  to authenticated
  using (
    public.is_admin()
    or (public.is_staff() and public.current_role() <> 'teacher')
    or public.teacher_has_class(class_id)
  )
  with check (
    public.is_admin()
    or (public.is_staff() and public.current_role() <> 'teacher')
    or public.teacher_has_class(class_id)
  );

drop policy if exists welfare_ratings_portal_select on public.welfare_ratings;
create policy welfare_ratings_portal_select
  on public.welfare_ratings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid() and sg.student_id = welfare_ratings.student_id
    )
    or exists (
      select 1 from public.student_user_links sul
      where sul.user_id = auth.uid() and sul.student_id = welfare_ratings.student_id
    )
  );

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Report card comments
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.report_card_comments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  class_teacher_comment text,
  head_comment text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_term_id)
);

alter table public.report_card_comments enable row level security;

drop policy if exists report_card_comments_staff_all on public.report_card_comments;
create policy report_card_comments_staff_all
  on public.report_card_comments
  for all
  to authenticated
  using (public.is_admin() or public.teacher_has_class(class_id))
  with check (public.is_admin() or public.teacher_has_class(class_id));

drop policy if exists report_card_comments_portal_select on public.report_card_comments;
create policy report_card_comments_portal_select
  on public.report_card_comments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid() and sg.student_id = report_card_comments.student_id
    )
    or exists (
      select 1 from public.student_user_links sul
      where sul.user_id = auth.uid() and sul.student_id = report_card_comments.student_id
    )
  );

-- Only admins write the head teacher's comment.
create or replace function public.report_card_comments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    if tg_op = 'INSERT' and new.head_comment is not null then
      raise exception 'Only an admin can write the head teacher''s comment';
    end if;
    if tg_op = 'UPDATE' and new.head_comment is distinct from old.head_comment then
      raise exception 'Only an admin can write the head teacher''s comment';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists report_card_comments_guard on public.report_card_comments;
create trigger report_card_comments_guard
  before insert or update on public.report_card_comments
  for each row execute function public.report_card_comments_guard();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Merging subjects and classes keeps sheet columns, layouts, welfare ratings and comments
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.merge_subjects_unchecked(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  src_assessment record;
  match_id uuid;
  moved_assessments int := 0;
  combined_assessments int := 0;
  moved_tests int := 0;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'Choose two different subjects to merge';
  end if;
  -- Moves results without changing any score, so locked (final/published) sheets may be moved. Every move is still
  -- recorded in result_audit_log (20261023_result_audit.sql).
  perform set_config('app.result_lock_bypass', 'on', true);
  if not exists (select 1 from public.subjects where id = p_source) then
    raise exception 'The subject to remove no longer exists';
  end if;
  if not exists (select 1 from public.subjects where id = p_target) then
    raise exception 'The subject to keep no longer exists';
  end if;

  for src_assessment in
    select * from public.academic_assessments where subject_id = p_source
  loop
    select a.id into match_id
    from public.academic_assessments a
    where a.subject_id = p_target
      and a.class_id is not distinct from src_assessment.class_id
      and a.academic_year_id is not distinct from src_assessment.academic_year_id
      and a.academic_term_id is not distinct from src_assessment.academic_term_id
      and a.on_result_sheet = src_assessment.on_result_sheet
      -- Sheet columns match by name (several columns can be of the same kind); older assessments by type.
      and case
        when src_assessment.on_result_sheet then lower(coalesce(a.title, '')) = lower(coalesce(src_assessment.title, ''))
        else a.assessment_type = src_assessment.assessment_type
      end
    order by a.created_at
    limit 1;

    if match_id is null then
      update public.academic_assessments set subject_id = p_target where id = src_assessment.id;
      moved_assessments := moved_assessments + 1;
    else
      insert into public.academic_assessment_scores (assessment_id, student_id, score, remarks, graded_by)
      select match_id, sc.student_id, sc.score, sc.remarks, sc.graded_by
      from public.academic_assessment_scores sc
      where sc.assessment_id = src_assessment.id
      on conflict (assessment_id, student_id) do nothing;

      delete from public.academic_assessments where id = src_assessment.id;
      combined_assessments := combined_assessments + 1;
    end if;
  end loop;

  update public.exam_tests set subject_id = p_target where subject_id = p_source;
  get diagnostics moved_tests = row_count;

  insert into public.class_subjects (class_id, subject_id)
  select cs.class_id, p_target from public.class_subjects cs where cs.subject_id = p_source
  on conflict do nothing;

  insert into public.teacher_subject_assignments (teacher_id, class_id, subject_id, active)
  select tsa.teacher_id, tsa.class_id, p_target, tsa.active
  from public.teacher_subject_assignments tsa
  where tsa.subject_id = p_source
  on conflict (teacher_id, class_id, subject_id) do update
    set active = public.teacher_subject_assignments.active or excluded.active;

  -- Saved result-sheet layouts follow the subject unless the kept subject already has one for the same scope.
  update public.result_layouts l
  set subject_id = p_target
  where l.subject_id = p_source
    and not exists (
      select 1 from public.result_layouts t
      where t.subject_id = p_target
        and t.class_id is not distinct from l.class_id
        and t.level is not distinct from l.level
    );

  update public.subjects t
  set active = t.active or s.active
  from public.subjects s
  where t.id = p_target and s.id = p_source;

  delete from public.subjects where id = p_source;

  return jsonb_build_object(
    'moved_assessments', moved_assessments,
    'combined_assessments', combined_assessments,
    'moved_tests', moved_tests
  );
end;
$$;

revoke all on function public.merge_subjects_unchecked(uuid, uuid) from public, anon, authenticated;

create or replace function public.merge_classes(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_level public.school_level;
  src_assessment record;
  match_id uuid;
  moved_students int := 0;
  moved_assessments int := 0;
  combined_assessments int := 0;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can merge classes';
  end if;
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'Choose two different classes to merge';
  end if;
  -- Moves results without changing any score, so locked (final/published) sheets may be moved. Every move is still
  -- recorded in result_audit_log (20261023_result_audit.sql).
  perform set_config('app.result_lock_bypass', 'on', true);
  if not exists (select 1 from public.classes where id = p_source) then
    raise exception 'The class to remove no longer exists';
  end if;
  select level into target_level from public.classes where id = p_target;
  if target_level is null then
    raise exception 'The class to keep no longer exists';
  end if;

  if exists (
    select 1
    from public.fee_schedules s
    join public.fee_schedules t
      on t.class_id = p_target
     and t.academic_year_id = s.academic_year_id
     and t.academic_term_id is not distinct from s.academic_term_id
    where s.class_id = p_source
  ) then
    raise exception 'Both classes have a fee schedule for the same year and term. Delete or fix the duplicate fee schedule first, then merge.';
  end if;

  update public.students set class_id = p_target, level = target_level where class_id = p_source;
  get diagnostics moved_students = row_count;

  update public.fee_schedules set class_id = p_target where class_id = p_source;

  for src_assessment in
    select * from public.academic_assessments where class_id = p_source
  loop
    select a.id into match_id
    from public.academic_assessments a
    where a.class_id = p_target
      and a.subject_id is not distinct from src_assessment.subject_id
      and a.academic_year_id is not distinct from src_assessment.academic_year_id
      and a.academic_term_id is not distinct from src_assessment.academic_term_id
      and a.on_result_sheet = src_assessment.on_result_sheet
      -- Sheet columns match by name (several columns can be of the same kind); older assessments by type.
      and case
        when src_assessment.on_result_sheet then lower(coalesce(a.title, '')) = lower(coalesce(src_assessment.title, ''))
        else a.assessment_type = src_assessment.assessment_type
      end
    order by a.created_at
    limit 1;

    if match_id is null then
      update public.academic_assessments set class_id = p_target where id = src_assessment.id;
      moved_assessments := moved_assessments + 1;
    else
      insert into public.academic_assessment_scores (assessment_id, student_id, score, remarks, graded_by)
      select match_id, sc.student_id, sc.score, sc.remarks, sc.graded_by
      from public.academic_assessment_scores sc
      where sc.assessment_id = src_assessment.id
      on conflict (assessment_id, student_id) do nothing;

      delete from public.academic_assessments where id = src_assessment.id;
      combined_assessments := combined_assessments + 1;
    end if;
  end loop;

  update public.student_attendance set class_id = p_target where class_id = p_source;
  update public.exam_test_sessions set class_id = p_target where class_id = p_source;

  update public.result_publications p
  set class_id = p_target
  where p.class_id = p_source
    and not exists (
      select 1
      from public.result_publications t
      where t.class_id = p_target
        and t.scope = p.scope
        and t.academic_year_id is not distinct from p.academic_year_id
        and t.academic_term_id is not distinct from p.academic_term_id
        and t.level is not distinct from p.level
    );
  delete from public.result_publications where class_id = p_source;

  insert into public.class_subjects (class_id, subject_id)
  select p_target, cs.subject_id from public.class_subjects cs where cs.class_id = p_source
  on conflict do nothing;

  insert into public.teacher_class_assignments (teacher_id, class_id, active)
  select tca.teacher_id, p_target, tca.active from public.teacher_class_assignments tca where tca.class_id = p_source
  on conflict (teacher_id, class_id) do update
    set active = public.teacher_class_assignments.active or excluded.active;

  insert into public.teacher_subject_assignments (teacher_id, class_id, subject_id, active)
  select tsa.teacher_id, p_target, tsa.subject_id, tsa.active
  from public.teacher_subject_assignments tsa
  where tsa.class_id = p_source
  on conflict (teacher_id, class_id, subject_id) do update
    set active = public.teacher_subject_assignments.active or excluded.active;

  update public.welfare_ratings set class_id = p_target where class_id = p_source;
  update public.report_card_comments set class_id = p_target where class_id = p_source;
  update public.result_layouts l
  set class_id = p_target
  where l.class_id = p_source
    and not exists (
      select 1 from public.result_layouts t
      where t.class_id = p_target
        and t.subject_id is not distinct from l.subject_id
        and t.level is not distinct from l.level
    );

  update public.classes t
  set active = t.active or s.active
  from public.classes s
  where t.id = p_target and s.id = p_source;

  delete from public.classes where id = p_source;

  return jsonb_build_object(
    'moved_students', moved_students,
    'moved_assessments', moved_assessments,
    'combined_assessments', combined_assessments
  );
end;
$$;

revoke all on function public.merge_classes(uuid, uuid) from public, anon;
grant execute on function public.merge_classes(uuid, uuid) to authenticated;

-- Result integrity: locks and audit log (see docs/migrations/20261023_result_audit.sql)

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

-- Correction requests and teachers' results history (see docs/migrations/20261024_result_corrections.sql)

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

-- Messaging (see docs/migrations/20261025_messaging.sql)

-- ---------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('class_announcements', 'class_parents', 'direct')),
  class_id uuid references public.classes(id) on delete cascade,
  direct_kind text check (direct_kind in ('teacher_parent', 'parent_parent')),
  direct_key text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint chat_conversations_shape check (
    (kind = 'direct' and class_id is null and direct_kind is not null and direct_key is not null)
    or (kind <> 'direct' and class_id is not null and direct_kind is null and direct_key is null)
  )
);

create unique index if not exists chat_conversations_class_kind_uidx on public.chat_conversations(kind, class_id) where class_id is not null;

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists chat_members_user_idx on public.chat_members(user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text,
  sender_label text,
  body text,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removal_kind text check (removal_kind in ('unsent', 'moderated')),
  constraint chat_messages_body check (
    (removed_at is null and body is not null and length(btrim(body)) between 1 and 2000)
    or (removed_at is not null and body is null)
  )
);

create index if not exists chat_messages_conversation_idx on public.chat_messages(conversation_id, created_at desc);
create index if not exists chat_messages_sender_idx on public.chat_messages(sender_id, created_at desc);

-- Originals of unsent / moderated messages. Admins only.
create table if not exists public.chat_message_archive (
  message_id uuid primary key references public.chat_messages(id) on delete cascade,
  body text not null,
  removal_kind text not null,
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz not null default now(),
  reason text
);

create table if not exists public.chat_reads (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  reported_by uuid references auth.users(id) on delete set null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  unique (message_id, reported_by)
);

create table if not exists public.chat_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Parents: may other parents in my children's classes message me privately?
  allow_parent_dm boolean not null default false,
  -- Teachers: when I usually reply (shown to parents; messages are never blocked).
  reply_from time not null default '08:00',
  reply_to time not null default '16:00',
  reply_weekdays_only boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.chat_mutes (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted_until timestamptz not null,
  muted_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Who is who
-- ---------------------------------------------------------------------------------------------------------------

-- Classes a parent account has a current pupil in.
create or replace function public.chat_parent_class_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct s.class_id
  from public.guardian_user_links gul
  join public.student_guardians sg on sg.guardian_id = gul.guardian_id
  join public.students s on s.id = sg.student_id
  where gul.user_id = p_user
    and s.class_id is not null
    and s.status in ('enrolled', 'active');
$$;

-- Classes a teacher teaches: class teacher or a subject teacher.
create or replace function public.chat_teacher_class_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tca.class_id from public.teacher_class_assignments tca where tca.teacher_id = p_user and tca.active
  union
  select tsa.class_id from public.teacher_subject_assignments tsa where tsa.teacher_id = p_user and tsa.active;
$$;

create or replace function public.chat_role(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.role::text in ('admin', 'super_admin') then 'admin'
    when p.role::text = 'teacher' then 'teacher'
    when exists (select 1 from public.guardian_user_links g where g.user_id = p_user) then 'parent'
    else 'none'
  end
  from public.profiles p
  where p.id = p_user;
$$;

create or replace function public.chat_is_class_teacher(p_user uuid, p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teacher_class_assignments
    where teacher_id = p_user and class_id = p_class and active
  );
$$;

-- Name and a short context label, e.g. ("Mrs Adeyemi", "Parent of Tolu") or ("Mr Bello", "Teacher").
create or replace function public.chat_identity(p_user uuid, p_class uuid default null)
returns table (display_name text, label text)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select public.chat_role(p_user) as role)
  select
    case
      when r.role = 'parent' then (
        select g.full_name from public.guardian_user_links gul join public.guardians g on g.id = gul.guardian_id
        where gul.user_id = p_user
      )
      else (select coalesce(p.full_name, 'Staff') from public.profiles p where p.id = p_user)
    end,
    case
      when r.role = 'admin' then 'School admin'
      when r.role = 'teacher' then 'Teacher'
      when r.role = 'parent' then coalesce(
        'Parent of ' || (
          select string_agg(distinct s.first_name, ', ')
          from public.guardian_user_links gul
          join public.student_guardians sg on sg.guardian_id = gul.guardian_id
          join public.students s on s.id = sg.student_id
          where gul.user_id = p_user
            and s.status in ('enrolled', 'active')
            and (p_class is null or s.class_id = p_class)
        ),
        'Parent'
      )
      else 'Member'
    end
  from r;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.chat_can_read(p_conversation uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.chat_conversations%rowtype;
  me uuid := auth.uid();
  my_role text;
begin
  if me is null then return false; end if;
  select * into c from public.chat_conversations where id = p_conversation;
  if not found then return false; end if;
  my_role := coalesce(public.chat_role(me), 'none');

  if c.kind = 'direct' then
    if exists (select 1 from public.chat_members where conversation_id = c.id and user_id = me) then
      return true;
    end if;
    -- Teacher-parent messages are a school record; parent-parent messages stay private.
    return my_role = 'admin' and c.direct_kind = 'teacher_parent';
  end if;

  if my_role = 'admin' then return true; end if;
  if my_role = 'teacher' then return c.class_id in (select public.chat_teacher_class_ids(me)); end if;
  if my_role = 'parent' then return c.class_id in (select public.chat_parent_class_ids(me)); end if;
  return false;
end;
$$;

create or replace function public.chat_dm_kind(p_target uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_role text := coalesce(public.chat_role(auth.uid()), 'none');
  their_role text := coalesce(public.chat_role(p_target), 'none');
begin
  if me is null or p_target is null or me = p_target then return null; end if;

  if my_role = 'admin' and their_role = 'parent' then return 'teacher_parent'; end if;
  if my_role = 'parent' and their_role = 'admin' then return null; end if; -- parents reach the school through teachers

  if my_role = 'teacher' and their_role = 'parent'
     and exists (select 1 from public.chat_teacher_class_ids(me) t where t in (select public.chat_parent_class_ids(p_target))) then
    return 'teacher_parent';
  end if;
  if my_role = 'parent' and their_role = 'teacher'
     and exists (select 1 from public.chat_parent_class_ids(me) c where c in (select public.chat_teacher_class_ids(p_target))) then
    return 'teacher_parent';
  end if;

  if my_role = 'parent' and their_role = 'parent'
     and exists (select 1 from public.chat_parent_class_ids(me) c where c in (select public.chat_parent_class_ids(p_target)))
     and coalesce((select allow_parent_dm from public.chat_settings where user_id = p_target), false)
     and not exists (
       select 1 from public.chat_blocks
       where (blocker_id = me and blocked_id = p_target) or (blocker_id = p_target and blocked_id = me)
     ) then
    return 'parent_parent';
  end if;
  return null;
end;
$$;

create or replace function public.chat_can_post(p_conversation uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.chat_conversations%rowtype;
  me uuid := auth.uid();
  my_role text;
  other uuid;
begin
  if me is null then return false; end if;
  select * into c from public.chat_conversations where id = p_conversation;
  if not found then return false; end if;
  my_role := coalesce(public.chat_role(me), 'none');

  if c.kind = 'class_announcements' then
    return my_role = 'admin' or (my_role = 'teacher' and c.class_id in (select public.chat_teacher_class_ids(me)));
  end if;

  if c.kind = 'class_parents' then
    if my_role = 'admin' then return true; end if;
    if my_role = 'teacher' then return c.class_id in (select public.chat_teacher_class_ids(me)); end if;
    return my_role = 'parent'
      and c.class_id in (select public.chat_parent_class_ids(me))
      and not exists (select 1 from public.chat_mutes m where m.class_id = c.class_id and m.user_id = me and m.muted_until > now());
  end if;

  -- Direct: still a member, and the relationship still holds (e.g. the teacher still teaches the child's class).
  if not exists (select 1 from public.chat_members where conversation_id = c.id and user_id = me) then return false; end if;
  select user_id into other from public.chat_members where conversation_id = c.id and user_id <> me limit 1;
  return coalesce(other is not null and public.chat_dm_kind(other) = c.direct_kind, false);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Row level security (writes go through the functions below, or the insert trigger)
-- ---------------------------------------------------------------------------------------------------------------

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_archive enable row level security;
alter table public.chat_reads enable row level security;
alter table public.chat_reports enable row level security;
alter table public.chat_settings enable row level security;
alter table public.chat_blocks enable row level security;
alter table public.chat_mutes enable row level security;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations
  for select to authenticated using (public.chat_can_read(id));

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members
  for select to authenticated using (public.chat_can_read(conversation_id));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (
    public.chat_can_read(conversation_id)
    or (coalesce(public.is_admin(), false) and exists (select 1 from public.chat_reports r where r.message_id = chat_messages.id))
  );

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.chat_can_post(conversation_id));

drop policy if exists chat_message_archive_admin on public.chat_message_archive;
create policy chat_message_archive_admin on public.chat_message_archive
  for select to authenticated using (coalesce(public.is_admin(), false));

drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads
  for select to authenticated using (user_id = auth.uid());

drop policy if exists chat_reports_select on public.chat_reports;
create policy chat_reports_select on public.chat_reports
  for select to authenticated using (reported_by = auth.uid() or coalesce(public.is_admin(), false));

drop policy if exists chat_settings_own on public.chat_settings;
create policy chat_settings_own on public.chat_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chat_blocks_own on public.chat_blocks;
create policy chat_blocks_own on public.chat_blocks
  for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

drop policy if exists chat_mutes_select on public.chat_mutes;
create policy chat_mutes_select on public.chat_mutes
  for select to authenticated
  using (user_id = auth.uid() or coalesce(public.is_admin(), false) or public.chat_is_class_teacher(auth.uid(), class_id));

revoke insert, update, delete, truncate on
  public.chat_conversations, public.chat_members, public.chat_message_archive, public.chat_reads,
  public.chat_reports, public.chat_mutes
  from anon, authenticated;
revoke update, delete, truncate on public.chat_messages from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.chat_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.chat_conversations%rowtype;
  who record;
begin
  new.sender_id := auth.uid();
  new.created_at := now();
  new.removed_at := null;
  new.removal_kind := null;
  new.body := btrim(new.body);
  if not coalesce(public.chat_can_post(new.conversation_id), false) then
    raise exception 'You can''t post in this conversation';
  end if;
  -- Simple flood protection.
  if (select count(*) from public.chat_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You are sending messages too quickly. Please wait a moment.';
  end if;
  select * into conv from public.chat_conversations where id = new.conversation_id;
  select * into who from public.chat_identity(new.sender_id, conv.class_id);
  new.sender_name := who.display_name;
  new.sender_label := who.label;
  return new;
end;
$$;

drop trigger if exists chat_messages_before_insert on public.chat_messages;
create trigger chat_messages_before_insert
  before insert on public.chat_messages
  for each row execute function public.chat_messages_before_insert();

create or replace function public.chat_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_conversations set last_message_at = new.created_at where id = new.conversation_id;
  insert into public.chat_reads (conversation_id, user_id, last_read_at)
  values (new.conversation_id, new.sender_id, new.created_at)
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  return null;
end;
$$;

drop trigger if exists chat_messages_after_insert on public.chat_messages;
create trigger chat_messages_after_insert
  after insert on public.chat_messages
  for each row execute function public.chat_messages_after_insert();

-- ---------------------------------------------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------------------------------------------

-- Makes sure the class spaces exist for every class the signed-in person belongs to.
create or replace function public.chat_ensure_class_spaces()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_role text := coalesce(public.chat_role(auth.uid()), 'none');
begin
  if me is null then return; end if;
  insert into public.chat_conversations (kind, class_id)
  select k, c.id
  from public.classes c
  cross join (values ('class_announcements'), ('class_parents')) as kinds(k)
  where c.active
    and (
      my_role = 'admin'
      or (my_role = 'teacher' and c.id in (select public.chat_teacher_class_ids(me)))
      or (my_role = 'parent' and c.id in (select public.chat_parent_class_ids(me)))
    )
  on conflict (kind, class_id) where class_id is not null do nothing;
end;
$$;

create or replace function public.chat_start_direct(p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  k text := public.chat_dm_kind(p_target);
  key text;
  conv uuid;
begin
  if k is null then
    raise exception 'You can''t message this person';
  end if;
  key := least(me::text, p_target::text) || ':' || greatest(me::text, p_target::text);
  select id into conv from public.chat_conversations where direct_key = key;
  if conv is null then
    insert into public.chat_conversations (kind, direct_kind, direct_key, created_by)
    values ('direct', k, key, me)
    returning id into conv;
    insert into public.chat_members (conversation_id, user_id) values (conv, me), (conv, p_target);
  end if;
  return conv;
end;
$$;

create or replace function public.chat_mark_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.chat_can_read(p_conversation), false) then return; end if;
  insert into public.chat_reads (conversation_id, user_id, last_read_at)
  values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- Sender only, within 15 minutes. The original is kept in the archive for the school.
create or replace function public.chat_unsend(p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.chat_messages%rowtype;
begin
  select * into m from public.chat_messages where id = p_message for update;
  if not found or m.sender_id is distinct from auth.uid() then
    raise exception 'You can only unsend your own messages';
  end if;
  if m.removed_at is not null then return; end if;
  if m.created_at < now() - interval '15 minutes' then
    raise exception 'Messages can only be unsent within 15 minutes';
  end if;
  insert into public.chat_message_archive (message_id, body, removal_kind, removed_by)
  values (m.id, m.body, 'unsent', auth.uid());
  update public.chat_messages set body = null, removed_at = now(), removal_kind = 'unsent' where id = m.id;
end;
$$;

create or replace function public.chat_report(p_message uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conv uuid;
begin
  select conversation_id into conv from public.chat_messages where id = p_message;
  if conv is null or not coalesce(public.chat_can_read(conv), false) then
    raise exception 'Message not found';
  end if;
  insert into public.chat_reports (message_id, reported_by, reason)
  values (p_message, auth.uid(), btrim(p_reason))
  on conflict (message_id, reported_by) do update set reason = excluded.reason, status = 'open', created_at = now();
end;
$$;

-- Admins, or the class teacher for messages in their class spaces.
create or replace function public.chat_can_moderate(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or exists (
      select 1 from public.chat_conversations c
      where c.id = p_conversation and c.class_id is not null and public.chat_is_class_teacher(auth.uid(), c.class_id)
    );
$$;

create or replace function public.chat_remove_message(p_message uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.chat_messages%rowtype;
begin
  select * into m from public.chat_messages where id = p_message for update;
  if not found then raise exception 'Message not found'; end if;
  if not (coalesce(public.chat_can_moderate(m.conversation_id), false)
          or (coalesce(public.is_admin(), false) and exists (select 1 from public.chat_reports where message_id = m.id))) then
    raise exception 'Only an admin or the class teacher can remove messages';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for removing the message'; end if;
  if m.removed_at is null then
    insert into public.chat_message_archive (message_id, body, removal_kind, removed_by, reason)
    values (m.id, m.body, 'moderated', auth.uid(), btrim(p_reason));
    update public.chat_messages set body = null, removed_at = now(), removal_kind = 'moderated' where id = m.id;
  end if;
  update public.chat_reports
  set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_note = btrim(p_reason)
  where message_id = m.id and status = 'open';
end;
$$;

create or replace function public.chat_dismiss_report(p_report uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only an admin can dismiss reports'; end if;
  update public.chat_reports
  set status = 'dismissed', resolved_by = auth.uid(), resolved_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_report;
end;
$$;

-- Stops a parent posting in a class parents' chat for a while (admins and the class teacher).
create or replace function public.chat_mute(p_class uuid, p_user uuid, p_days int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(public.is_admin(), false) or public.chat_is_class_teacher(auth.uid(), p_class)) then
    raise exception 'Only an admin or the class teacher can mute members';
  end if;
  if p_days is null or p_days <= 0 then
    delete from public.chat_mutes where class_id = p_class and user_id = p_user;
    return;
  end if;
  insert into public.chat_mutes (class_id, user_id, muted_until, muted_by, reason)
  values (p_class, p_user, now() + make_interval(days => least(p_days, 365)), auth.uid(), nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (class_id, user_id) do update
    set muted_until = excluded.muted_until, muted_by = excluded.muted_by, reason = excluded.reason;
end;
$$;

-- The signed-in person's conversations with titles, last message and unread counts.
create or replace function public.chat_inbox()
returns table (
  conversation_id uuid,
  kind text,
  direct_kind text,
  class_id uuid,
  class_name text,
  title text,
  subtitle text,
  other_user_id uuid,
  last_message_at timestamptz,
  last_preview text,
  last_sender text,
  unread int,
  can_post boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id, public.chat_role(auth.uid()) as role),
  convs as (
    select c.*
    from public.chat_conversations c, me
    where (
        c.kind = 'direct' and exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.user_id = me.id)
      )
      or (
        c.kind <> 'direct' and (
          (me.role = 'teacher' and c.class_id in (select public.chat_teacher_class_ids(me.id)))
          or (me.role = 'parent' and c.class_id in (select public.chat_parent_class_ids(me.id)))
          or (me.role = 'admin' and c.last_message_at is not null)
        )
      )
  )
  select
    c.id,
    c.kind,
    c.direct_kind,
    c.class_id,
    cl.name,
    case
      when c.kind = 'class_announcements' then cl.name || ' · Announcements'
      when c.kind = 'class_parents' then cl.name || ' · Parents'
      else (select i.display_name from public.chat_identity(o.user_id) i)
    end,
    case
      when c.kind = 'class_announcements' then 'From the teachers'
      when c.kind = 'class_parents' then 'Class parents'' chat'
      else (select i.label from public.chat_identity(o.user_id) i)
    end,
    o.user_id,
    c.last_message_at,
    lm.preview,
    lm.sender_name,
    (
      select count(*)::int from public.chat_messages x
      where x.conversation_id = c.id
        and x.sender_id is distinct from (select id from me)
        and x.created_at > coalesce((select r.last_read_at from public.chat_reads r where r.conversation_id = c.id and r.user_id = (select id from me)), '-infinity')
    ),
    coalesce(public.chat_can_post(c.id), false)
  from convs c
  left join public.classes cl on cl.id = c.class_id
  left join lateral (
    select m.user_id from public.chat_members m where m.conversation_id = c.id and m.user_id <> (select id from me) limit 1
  ) o on true
  left join lateral (
    select case when x.removed_at is null then left(x.body, 120) else 'Message removed' end as preview, x.sender_name
    from public.chat_messages x where x.conversation_id = c.id order by x.created_at desc limit 1
  ) lm on true
  order by c.last_message_at desc nulls last, c.kind;
$$;

-- People the signed-in person can start a private conversation with.
create or replace function public.chat_contacts()
returns table (user_id uuid, display_name text, label text, kind text, class_names text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id, public.chat_role(auth.uid()) as role),
  candidates as (
    -- Parents of pupils in classes I teach (teachers) or in any class (admins), and parents in my children's classes.
    select distinct gul.user_id, s.class_id
    from public.guardian_user_links gul
    join public.student_guardians sg on sg.guardian_id = gul.guardian_id
    join public.students s on s.id = sg.student_id, me
    where s.class_id is not null and s.status in ('enrolled', 'active')
      and (
        me.role = 'admin'
        or (me.role = 'teacher' and s.class_id in (select public.chat_teacher_class_ids(me.id)))
        or (me.role = 'parent' and s.class_id in (select public.chat_parent_class_ids(me.id)))
      )
    union
    -- Teachers of my children's classes.
    select t.teacher_id, t.class_id
    from (
      select teacher_id, class_id from public.teacher_class_assignments where active
      union
      select teacher_id, class_id from public.teacher_subject_assignments where active
    ) t, me
    where me.role = 'parent' and t.class_id in (select public.chat_parent_class_ids(me.id))
  )
  select
    c.user_id,
    (select i.display_name from public.chat_identity(c.user_id) i),
    (select i.label from public.chat_identity(c.user_id) i),
    public.chat_dm_kind(c.user_id),
    string_agg(distinct cl.name, ', ')
  from candidates c
  join public.classes cl on cl.id = c.class_id
  where c.user_id <> (select id from me) and public.chat_dm_kind(c.user_id) is not null
  group by c.user_id
  order by 4, 2;
$$;

-- When does this teacher usually reply? (Shown to parents.)
create or replace function public.chat_reply_hours(p_user uuid)
returns table (reply_from time, reply_to time, weekdays_only boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(s.reply_from, '08:00'), coalesce(s.reply_to, '16:00'), coalesce(s.reply_weekdays_only, true)
  from (select 1) one
  left join public.chat_settings s on s.user_id = p_user
  where public.chat_role(p_user) in ('teacher', 'admin');
$$;

-- For "Seen" under your last direct message: when the other person last read the conversation.
create or replace function public.chat_other_read_at(p_conversation uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select r.last_read_at
  from public.chat_conversations c
  join public.chat_members m on m.conversation_id = c.id and m.user_id <> auth.uid()
  left join public.chat_reads r on r.conversation_id = c.id and r.user_id = m.user_id
  where c.id = p_conversation and c.kind = 'direct'
    and exists (select 1 from public.chat_members me where me.conversation_id = c.id and me.user_id = auth.uid())
  limit 1;
$$;

-- Unread messages across all conversations (the badge on "Messages").
create or replace function public.chat_unread_total()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(unread), 0)::int from public.chat_inbox();
$$;

-- Names of the people in a conversation (for admins looking over teacher-parent messages).
create or replace function public.chat_conversation_people(p_conversation uuid)
returns table (user_id uuid, display_name text, label text)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, i.display_name, i.label
  from public.chat_members m
  cross join lateral public.chat_identity(m.user_id) i
  where m.conversation_id = p_conversation and coalesce(public.chat_can_read(p_conversation), false);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'chat_parent_class_ids(uuid)', 'chat_teacher_class_ids(uuid)', 'chat_role(uuid)', 'chat_is_class_teacher(uuid, uuid)',
    'chat_identity(uuid, uuid)', 'chat_can_read(uuid)', 'chat_dm_kind(uuid)', 'chat_can_post(uuid)',
    'chat_ensure_class_spaces()', 'chat_start_direct(uuid)', 'chat_mark_read(uuid)', 'chat_unsend(uuid)',
    'chat_report(uuid, text)', 'chat_can_moderate(uuid)', 'chat_remove_message(uuid, text)', 'chat_dismiss_report(uuid, text)',
    'chat_mute(uuid, uuid, int, text)', 'chat_inbox()', 'chat_contacts()', 'chat_reply_hours(uuid)',
    'chat_other_read_at(uuid)', 'chat_unread_total()', 'chat_conversation_people(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- Result management (see docs/migrations/20261026_result_management.sql)

alter table public.grading_scales add column if not exists remark text;

insert into public.grading_scales (level, grade, min_score, max_score, remark, active)
select lvl, g.grade, g.min_score, g.max_score, g.remark, true
from unnest(array['creche', 'primary', 'secondary']::public.school_level[]) as lvl
cross join (
  values
    ('A', 80::numeric, 100::numeric, 'Excellent'),
    ('B', 70, 79.99, 'Very Good'),
    ('C', 60, 69.99, 'Good'),
    ('D', 50, 59.99, 'Pass'),
    ('F', 0, 49.99, 'Fail')
) as g(grade, min_score, max_score, remark)
on conflict (level, grade) do update
  set min_score = excluded.min_score,
      max_score = excluded.max_score,
      remark = excluded.remark,
      active = true,
      updated_at = now();

update public.grading_scales
set active = false, updated_at = now()
where grade not in ('A', 'B', 'C', 'D', 'F') and active;

-- Creates the sheet's columns if it has none yet. p_columns: [{"label": "1st CA", "group": "ca", "max": 20}, ...]
-- Returns how many columns were created (0 if the sheet already had columns or is locked).
create or replace function public.ensure_result_sheet(p_class uuid, p_subject uuid, p_term uuid, p_columns jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  year_id uuid;
  col jsonb;
  pos int := 0;
begin
  if jsonb_typeof(p_columns) <> 'array' or jsonb_array_length(p_columns) = 0 then
    return 0;
  end if;
  -- Two people opening the same new sheet at once must not create the columns twice.
  perform pg_advisory_xact_lock(hashtext('result_sheet:' || p_class || ':' || p_subject || ':' || p_term));
  if exists (
    select 1 from public.academic_assessments
    where class_id = p_class and subject_id = p_subject and academic_term_id = p_term and on_result_sheet
  ) then
    return 0;
  end if;
  if public.result_sheet_locked(p_class, p_subject, p_term) then
    return 0;
  end if;

  select academic_year_id into year_id from public.academic_terms where id = p_term;
  for col in select * from jsonb_array_elements(p_columns) loop
    pos := pos + 1;
    insert into public.academic_assessments (
      class_id, subject_id, academic_year_id, academic_term_id, on_result_sheet,
      title, assessment_type, component_group, max_score, position, created_by
    )
    values (
      p_class, p_subject, year_id, p_term, true,
      left(btrim(col->>'label'), 60),
      coalesce(nullif(col->>'group', ''), 'other'),
      case when col->>'group' in ('ca', 'exam', 'other') then col->>'group' else 'other' end,
      greatest(0.5, least(1000, (col->>'max')::numeric)),
      pos,
      auth.uid()
    );
  end loop;
  return pos;
end;
$$;

revoke all on function public.ensure_result_sheet(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.ensure_result_sheet(uuid, uuid, uuid, jsonb) to authenticated;
