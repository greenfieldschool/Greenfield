alter table public.students
  add column if not exists profile_photo_url text;

alter table public.students
  add column if not exists hobbies text[] not null default '{}'::text[];

alter table public.guardians
  add column if not exists profile_photo_url text;

alter table public.guardians
  add column if not exists interests text[] not null default '{}'::text[];
