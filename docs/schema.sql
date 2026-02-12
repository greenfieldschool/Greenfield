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
  class_id uuid,
  status public.student_status not null default 'applied',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students
  add column if not exists class_id uuid;

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
