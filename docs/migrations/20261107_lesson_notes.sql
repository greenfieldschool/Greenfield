-- Lesson notes (issue 10, "Online lesson note management"). Run AFTER 20261106_published_results_archive.sql.
--
-- Teachers prepare lesson notes for a class and subject, by term, week and topic: typed notes and/or a file (PDF,
-- Word, PowerPoint, Excel, pictures). A note starts as a draft that only staff can see; publishing it shows it to the
-- class's pupils and their parents on the portal, where they can read, open and download it. A note can be updated,
-- its file replaced, taken back to draft, or deleted.
--
-- Who can do what follows the result sheets and assignments: the class's subject teacher or class teacher, or an
-- admin (can_manage_results). A note with no subject ("General") is for the class teacher or an admin. Parents and
-- pupils of the class read published notes only.
--
-- Files: storage bucket "lesson-notes" is PRIVATE (20 MB per file), path notes/<note id>/<file>. Staff who can
-- manage the note read and write it; parents and pupils of the class read it once the note is published. Files are
-- opened with short-lived signed links.
--
-- Safe to run twice. The Supabase editor may warn about "destructive operations": that is the policies below being
-- replaced (drop policy if exists). Nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------
-- Lesson notes
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.lesson_notes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  week smallint check (week is null or week between 1 and 30),
  topic text not null check (length(btrim(topic)) between 2 and 160),
  body text check (body is null or length(body) <= 50000),
  file_path text,
  file_name text,
  file_type text,
  file_size bigint,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  author_name text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A published note has something to read.
  constraint lesson_notes_published_has_content check (status = 'draft' or file_path is not null or nullif(btrim(coalesce(body, '')), '') is not null),
  -- Its file lives in its own folder.
  constraint lesson_notes_file_folder check (file_path is null or file_path like 'notes/' || id::text || '/%')
);

create index if not exists lesson_notes_class_term_idx on public.lesson_notes (class_id, academic_term_id, week);

alter table public.lesson_notes enable row level security;

drop policy if exists lesson_notes_staff_all on public.lesson_notes;
create policy lesson_notes_staff_all
  on public.lesson_notes
  for all
  to authenticated
  using (public.can_manage_results(class_id, subject_id))
  with check (public.can_manage_results(class_id, subject_id));

drop policy if exists lesson_notes_portal_select on public.lesson_notes;
create policy lesson_notes_portal_select
  on public.lesson_notes
  for select
  to authenticated
  using (status = 'published' and public.portal_sees_class(class_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Files (private bucket)
-- ---------------------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-notes',
  'lesson-notes',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/rtf', 'text/plain',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Who may read (p_write = false) or write (p_write = true) a file at this path in the lesson-notes bucket.
create or replace function public.lesson_note_file_allowed(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  n public.lesson_notes%rowtype;
begin
  if coalesce(array_length(parts, 1), 0) < 3 or parts[1] <> 'notes'
     or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  select * into n from public.lesson_notes where id = parts[2]::uuid;
  if n.id is null then
    return false;
  end if;
  if coalesce(public.can_manage_results(n.class_id, n.subject_id), false) then
    return true;
  end if;
  return not p_write and n.status = 'published' and coalesce(public.portal_sees_class(n.class_id), false);
end;
$$;

revoke all on function public.lesson_note_file_allowed(text, boolean) from public, anon;
grant execute on function public.lesson_note_file_allowed(text, boolean) to authenticated;

drop policy if exists lesson_note_files_select on storage.objects;
create policy lesson_note_files_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'lesson-notes' and public.lesson_note_file_allowed(name, false));

drop policy if exists lesson_note_files_insert on storage.objects;
create policy lesson_note_files_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'lesson-notes' and public.lesson_note_file_allowed(name, true));

drop policy if exists lesson_note_files_update on storage.objects;
create policy lesson_note_files_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'lesson-notes' and public.lesson_note_file_allowed(name, true))
  with check (bucket_id = 'lesson-notes' and public.lesson_note_file_allowed(name, true));

drop policy if exists lesson_note_files_delete on storage.objects;
create policy lesson_note_files_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'lesson-notes' and public.lesson_note_file_allowed(name, true));
