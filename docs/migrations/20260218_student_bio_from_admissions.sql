alter table public.students
  add column if not exists middle_name text;

alter table public.students
  add column if not exists sex text;

alter table public.students
  add column if not exists religion text;

alter table public.students
  add column if not exists passport_photo_url text;

alter table public.students
  add column if not exists favorite_sports text;

alter table public.students
  add column if not exists future_aspiration text;

alter table public.students
  add column if not exists child_with text;

alter table public.students
  add column if not exists admissions_application_id uuid;

alter table public.students
  drop constraint if exists students_admissions_application_id_fkey;

alter table public.students
  add constraint students_admissions_application_id_fkey
  foreign key (admissions_application_id)
  references public.admissions_applications(id)
  on delete set null;
