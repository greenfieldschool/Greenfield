-- Assignments and classwork (5 Nov 2026). Run AFTER 20261104_welfare_compulsory_weeks.sql.
--
-- Teachers set an assignment or a piece of classwork for a class (and subject): instructions, an optional worksheet,
-- a due date and the marks. Pupils see it on the portal and hand it in by typing an answer and/or uploading a photo
-- or file of their work. Teachers mark it (score and comment), also for work handed in on paper. Parents see what is
-- due, what is late and the marks. Marks can be sent to a result sheet column from the app, which goes through the
-- result sheet's own rules (locks and history).
--
-- 1. assignments: who can see and change them follows the result sheets: the class's subject teacher or class
--    teacher, or an admin (can_manage_results). Parents and pupils of the class can read them.
-- 2. assignment_submissions: one row per pupil and assignment. Nobody writes it directly: pupils hand in with
--    submit_assignment() (only their own work, only for their class, not once it's marked, not after the due date
--    unless late work is accepted) and teachers mark with mark_submission() (never above the marks).
-- 3. Storage bucket "assignment-files" is PRIVATE (10 MB per file). Worksheets: briefs/<assignment>/…, pupils' work:
--    work/<assignment>/<pupil>/…. Teachers of the class read and write briefs and read the work; a pupil reads the
--    briefs of their class and reads/writes only their own work; parents read their children's. Files are opened
--    with short-lived signed links.
--
-- Safe to run twice. The Supabase editor may warn about "destructive operations": that is the policies below being
-- replaced (drop policy if exists). Nothing is deleted. Every new table has Row Level Security on.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Assignments
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  kind text not null default 'assignment' check (kind in ('assignment', 'classwork')),
  title text not null check (length(btrim(title)) between 2 and 160),
  instructions text check (instructions is null or length(instructions) <= 20000),
  attachment_path text,
  attachment_name text,
  due_at timestamptz,
  max_score numeric(6,2) check (max_score is null or max_score > 0),
  accepts_late boolean not null default true,
  result_assessment_id uuid references public.academic_assessments(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignments_class_idx on public.assignments (class_id, due_at desc);

alter table public.assignments enable row level security;

-- A parent or pupil linked to a pupil in this class (pupils who have left don't count).
create or replace function public.portal_sees_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    where s.class_id = p_class
      and s.status not in ('withdrawn', 'graduated', 'transferred')
      and (
        exists (select 1 from public.student_user_links sul where sul.user_id = auth.uid() and sul.student_id = s.id)
        or exists (
          select 1
          from public.guardian_user_links gul
          join public.student_guardians sg on sg.guardian_id = gul.guardian_id
          where gul.user_id = auth.uid() and sg.student_id = s.id
        )
      )
  );
$$;

-- The pupil (themselves) or their parent.
create or replace function public.portal_sees_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.student_user_links sul where sul.user_id = auth.uid() and sul.student_id = p_student)
    or exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid() and sg.student_id = p_student
    );
$$;

create or replace function public.can_manage_assignment(p_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.can_manage_results(a.class_id, a.subject_id) from public.assignments a where a.id = p_assignment),
    false
  );
$$;

revoke all on function public.portal_sees_class(uuid) from public, anon;
revoke all on function public.portal_sees_student(uuid) from public, anon;
revoke all on function public.can_manage_assignment(uuid) from public, anon;
grant execute on function public.portal_sees_class(uuid) to authenticated;
grant execute on function public.portal_sees_student(uuid) to authenticated;
grant execute on function public.can_manage_assignment(uuid) to authenticated;

drop policy if exists assignments_staff_all on public.assignments;
create policy assignments_staff_all
  on public.assignments
  for all
  to authenticated
  using (public.can_manage_results(class_id, subject_id))
  with check (public.can_manage_results(class_id, subject_id));

drop policy if exists assignments_portal_select on public.assignments;
create policy assignments_portal_select
  on public.assignments
  for select
  to authenticated
  using (public.portal_sees_class(class_id));

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Submissions
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  body text check (body is null or length(body) <= 20000),
  file_path text,
  file_name text,
  file_type text,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  score numeric(6,2) check (score is null or score >= 0),
  feedback text check (feedback is null or length(feedback) <= 4000),
  marked_at timestamptz,
  marked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create index if not exists assignment_submissions_student_idx on public.assignment_submissions (student_id);

alter table public.assignment_submissions enable row level security;

drop policy if exists assignment_submissions_staff_select on public.assignment_submissions;
create policy assignment_submissions_staff_select
  on public.assignment_submissions
  for select
  to authenticated
  using (public.can_manage_assignment(assignment_id));

drop policy if exists assignment_submissions_portal_select on public.assignment_submissions;
create policy assignment_submissions_portal_select
  on public.assignment_submissions
  for select
  to authenticated
  using (public.portal_sees_student(student_id));

-- Writes only through the two functions below.
revoke insert, update, delete on public.assignment_submissions from anon, authenticated;

-- A pupil hands in (or changes) their work. Text, a file, or both.
create or replace function public.submit_assignment(p_assignment uuid, p_body text, p_file_path text, p_file_name text, p_file_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments%rowtype;
  me uuid;
  existing public.assignment_submissions%rowtype;
  body text := nullif(btrim(coalesce(p_body, '')), '');
  saved uuid;
begin
  select sul.student_id into me from public.student_user_links sul where sul.user_id = auth.uid();
  if me is null then
    raise exception 'Only pupils can hand in work';
  end if;
  select * into a from public.assignments where id = p_assignment;
  if a.id is null then
    raise exception 'Assignment not found';
  end if;
  if not exists (select 1 from public.students s where s.id = me and s.class_id = a.class_id) then
    raise exception 'This assignment is for another class';
  end if;
  select * into existing from public.assignment_submissions where assignment_id = p_assignment and student_id = me;
  if existing.marked_at is not null then
    raise exception 'Your teacher has already marked this work, so it can''t be changed';
  end if;
  if a.due_at is not null and now() > a.due_at and not a.accepts_late then
    raise exception 'The due date has passed and this teacher isn''t accepting late work';
  end if;
  if p_file_path is not null and p_file_path not like 'work/' || p_assignment::text || '/' || me::text || '/%' then
    raise exception 'That file belongs to someone else';
  end if;
  if body is null and p_file_path is null then
    raise exception 'Write an answer or add a photo or file of your work';
  end if;

  insert into public.assignment_submissions as s (assignment_id, student_id, body, file_path, file_name, file_type, submitted_at, submitted_by, updated_at)
  values (p_assignment, me, body, p_file_path, nullif(btrim(coalesce(p_file_name, '')), ''), p_file_type, now(), auth.uid(), now())
  on conflict (assignment_id, student_id) do update
    set body = excluded.body,
        file_path = excluded.file_path,
        file_name = excluded.file_name,
        file_type = excluded.file_type,
        submitted_at = now(),
        submitted_by = auth.uid(),
        updated_at = now()
  returning s.id into saved;
  return saved;
end;
$$;

-- A teacher marks a pupil's work (also work handed in on paper, which has no submission yet). Null score and
-- feedback clears the mark.
create or replace function public.mark_submission(p_assignment uuid, p_student uuid, p_score numeric, p_feedback text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments%rowtype;
  feedback text := nullif(btrim(coalesce(p_feedback, '')), '');
  clearing boolean := p_score is null and nullif(btrim(coalesce(p_feedback, '')), '') is null;
  saved uuid;
begin
  if not coalesce(public.can_manage_assignment(p_assignment), false) then
    raise exception 'Only the teacher of this class and subject (or an admin) can mark this work';
  end if;
  select * into a from public.assignments where id = p_assignment;
  if not exists (select 1 from public.students s where s.id = p_student and s.class_id = a.class_id) then
    raise exception 'That pupil isn''t in this class';
  end if;
  if p_score is not null and (p_score < 0 or (a.max_score is not null and p_score > a.max_score)) then
    raise exception 'The mark must be between 0 and %', coalesce(a.max_score::float8::text, 'the total');
  end if;

  insert into public.assignment_submissions as s (assignment_id, student_id, score, feedback, marked_at, marked_by, updated_at)
  values (p_assignment, p_student, p_score, feedback, case when clearing then null else now() end, case when clearing then null else auth.uid() end, now())
  on conflict (assignment_id, student_id) do update
    set score = excluded.score,
        feedback = excluded.feedback,
        marked_at = excluded.marked_at,
        marked_by = excluded.marked_by,
        updated_at = now()
  returning s.id into saved;
  return saved;
end;
$$;

revoke all on function public.submit_assignment(uuid, text, text, text, text) from public, anon;
revoke all on function public.mark_submission(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.submit_assignment(uuid, text, text, text, text) to authenticated;
grant execute on function public.mark_submission(uuid, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Files (private bucket)
-- ---------------------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assignment-files',
  'assignment-files',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Who may read (p_write = false) or write (p_write = true) a file at this path in the assignment-files bucket.
create or replace function public.assignment_file_allowed(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  a public.assignments%rowtype;
  pupil uuid;
begin
  if coalesce(array_length(parts, 1), 0) < 3 or parts[2] !~ uuid_re then
    return false;
  end if;
  select * into a from public.assignments where id = parts[2]::uuid;
  if a.id is null then
    return false;
  end if;
  if parts[1] = 'briefs' then
    return coalesce(public.can_manage_results(a.class_id, a.subject_id), false)
      or (not p_write and coalesce(public.portal_sees_class(a.class_id), false));
  end if;
  if parts[1] = 'work' then
    if coalesce(array_length(parts, 1), 0) < 4 or parts[3] !~ uuid_re then
      return false;
    end if;
    pupil := parts[3]::uuid;
    if not p_write and coalesce(public.can_manage_results(a.class_id, a.subject_id), false) then
      return true;
    end if;
    if p_write then
      -- Only the pupil, in that class, while the work isn't marked yet.
      return exists (select 1 from public.student_user_links sul where sul.user_id = auth.uid() and sul.student_id = pupil)
        and exists (select 1 from public.students s where s.id = pupil and s.class_id = a.class_id)
        and not exists (
          select 1 from public.assignment_submissions x where x.assignment_id = a.id and x.student_id = pupil and x.marked_at is not null
        );
    end if;
    return coalesce(public.portal_sees_student(pupil), false);
  end if;
  return false;
end;
$$;

revoke all on function public.assignment_file_allowed(text, boolean) from public, anon;
grant execute on function public.assignment_file_allowed(text, boolean) to authenticated;

drop policy if exists assignment_files_select on storage.objects;
create policy assignment_files_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'assignment-files' and public.assignment_file_allowed(name, false));

drop policy if exists assignment_files_insert on storage.objects;
create policy assignment_files_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'assignment-files' and public.assignment_file_allowed(name, true));

drop policy if exists assignment_files_update on storage.objects;
create policy assignment_files_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'assignment-files' and public.assignment_file_allowed(name, true))
  with check (bucket_id = 'assignment-files' and public.assignment_file_allowed(name, true));

drop policy if exists assignment_files_delete on storage.objects;
create policy assignment_files_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'assignment-files' and public.assignment_file_allowed(name, true));
