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
  add column if not exists class_id uuid;

alter table public.students
  drop constraint if exists students_class_id_fkey;

alter table public.students
  add constraint students_class_id_fkey
  foreign key (class_id) references public.classes(id) on delete set null;

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

alter table public.fee_components
  drop constraint if exists fee_components_expense_category_id_fkey;

alter table public.fee_components
  add constraint fee_components_expense_category_id_fkey
  foreign key (expense_category_id) references public.expense_categories(id) on delete set null;

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

alter table public.classes enable row level security;
alter table public.fee_components enable row level security;
alter table public.fee_schedules enable row level security;
alter table public.fee_schedule_lines enable row level security;

drop policy if exists classes_staff_all on public.classes;
create policy classes_staff_all
  on public.classes
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

drop trigger if exists classes_set_updated_at on public.classes;
create trigger classes_set_updated_at
  before update on public.classes
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
