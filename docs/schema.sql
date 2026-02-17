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
  admission_number text,
  date_of_birth date,
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

alter table public.students
  drop constraint if exists students_class_id_fkey;

alter table public.students
  add constraint students_class_id_fkey
  foreign key (class_id) references public.classes(id) on delete set null;

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
alter table public.classes enable row level security;
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
   using (public.is_staff())
   with check (public.is_staff());

 drop policy if exists students_staff_all on public.students;
 create policy students_staff_all
   on public.students
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

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
 create policy subjects_staff_all
   on public.subjects
   for all
   to authenticated
   using (public.is_staff())
   with check (public.is_staff());

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
   using (public.is_staff())
   with check (public.is_staff());

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
   using (public.is_staff())
   with check (public.is_staff());

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
   using (public.is_staff())
   with check (public.is_staff());

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
   using (public.is_staff())
   with check (public.is_staff());

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
     coalesce(sum((sc.score / nullif(a.max_score, 0)) * 100 * (w.weight / 100)), 0) as weighted_score
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
 language sql stable
 as $$
   select exists(
     select 1
     from public.exam_test_sessions s
     join public.students st on st.id = public.current_student_id()
     where s.id = session_uuid
       and s.active = true
       and (s.class_id is null or s.class_id = st.class_id)
       and s.results_released_at is not null
   );
 $$;
 
 create or replace function public.can_student_view_session(session_uuid uuid) returns boolean
 language sql stable
 as $$
   select public.can_student_access_session(session_uuid)
      or public.can_student_view_session_results(session_uuid);
 $$;
 
 create or replace function public.can_conduct_session(session_uuid uuid) returns boolean
 language sql stable
 as $$
   select exists(
     select 1
     from public.exam_conductor_user_links l
     join public.exam_session_conductors sc on sc.conductor_id = l.conductor_id
     where l.user_id = auth.uid()
       and sc.session_id = session_uuid
   );
 $$;
 
 create or replace function public.current_student_id() returns uuid
 language sql stable
 as $$
   select sul.student_id
   from public.student_user_links sul
   where sul.user_id = auth.uid()
   limit 1;
 $$;
 
 create or replace function public.can_student_access_session(session_uuid uuid) returns boolean
 language sql stable
 as $$
   select exists(
     select 1
     from public.exam_test_sessions s
     join public.students st on st.id = public.current_student_id()
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
