-- Online video classes (issue 10, "Online video class management"). Run AFTER 20261107_lesson_notes.sql.
--
-- Teachers schedule a virtual lesson for a class (and subject): date, start time, length, topic, a description and a
-- Zoom / Google Meet / Microsoft Teams link (and passcode if any), optionally linked to a published lesson note. They
-- can reschedule it, cancel it (with a reason pupils see) or delete it. Pupils and parents of the class see it on the
-- portal and join from there. Joining records attendance: the first time a pupil (or a parent, for their child) taps
-- Join, the pupil is marked "joined" with the time. The teacher can then mark each pupil present, late or absent.
--
-- Who can do what follows result sheets, assignments and lesson notes: the class's subject teacher or class teacher,
-- or an admin (can_manage_results). Parents and pupils of the class read the classes; they see attendance only for
-- themselves / their own children, and only record it through join_online_class().
--
-- Safe to run twice. The Supabase editor may warn about "destructive operations": that is the policies below being
-- replaced (drop policy if exists). Nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------
-- Online classes
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.online_classes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  topic text not null check (length(btrim(topic)) between 2 and 160),
  description text check (description is null or length(description) <= 5000),
  starts_at timestamptz not null,
  duration_minutes int not null default 40 check (duration_minutes between 5 and 300),
  platform text not null default 'other' check (platform in ('zoom', 'meet', 'teams', 'other')),
  meeting_url text not null check (meeting_url ~ '^https://[^\s/]+\.[^\s]+$' and length(meeting_url) <= 1000),
  meeting_code text check (meeting_code is null or length(meeting_code) <= 100),
  lesson_note_id uuid references public.lesson_notes(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 500),
  author_name text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists online_classes_class_time_idx on public.online_classes (class_id, starts_at desc);

alter table public.online_classes enable row level security;

drop policy if exists online_classes_staff_all on public.online_classes;
create policy online_classes_staff_all
  on public.online_classes
  for all
  to authenticated
  using (public.can_manage_results(class_id, subject_id))
  with check (public.can_manage_results(class_id, subject_id));

drop policy if exists online_classes_portal_select on public.online_classes;
create policy online_classes_portal_select
  on public.online_classes
  for select
  to authenticated
  using (public.portal_sees_class(class_id));

create or replace function public.can_manage_online_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.can_manage_results(o.class_id, o.subject_id) from public.online_classes o where o.id = p_class),
    false
  );
$$;

revoke all on function public.can_manage_online_class(uuid) from public, anon;
grant execute on function public.can_manage_online_class(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.online_class_attendance (
  online_class_id uuid not null references public.online_classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  joined_at timestamptz,
  joined_by uuid references auth.users(id) on delete set null,
  status text check (status is null or status in ('present', 'late', 'absent')),
  marked_by uuid references auth.users(id) on delete set null,
  marked_at timestamptz,
  primary key (online_class_id, student_id)
);

alter table public.online_class_attendance enable row level security;

drop policy if exists online_class_attendance_staff_all on public.online_class_attendance;
create policy online_class_attendance_staff_all
  on public.online_class_attendance
  for all
  to authenticated
  using (public.can_manage_online_class(online_class_id))
  with check (
    public.can_manage_online_class(online_class_id)
    and exists (
      select 1 from public.online_classes o join public.students s on s.class_id = o.class_id
      where o.id = online_class_id and s.id = student_id
    )
  );

drop policy if exists online_class_attendance_portal_select on public.online_class_attendance;
create policy online_class_attendance_portal_select
  on public.online_class_attendance
  for select
  to authenticated
  using (public.portal_sees_student(student_id));

-- A pupil (or their parent, for them) taps Join: records the first join and returns the meeting link. Open from
-- 15 minutes before the start until the end; never for a cancelled class.
create or replace function public.join_online_class(p_class uuid, p_student uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.online_classes%rowtype;
begin
  if not coalesce(public.portal_sees_student(p_student), false) then
    raise exception 'You can only join for yourself or your own child';
  end if;
  select * into o from public.online_classes where id = p_class;
  if o.id is null then
    raise exception 'This online class has been removed';
  end if;
  if not exists (select 1 from public.students s where s.id = p_student and s.class_id = o.class_id) then
    raise exception 'This online class is for another class';
  end if;
  if o.status = 'cancelled' then
    raise exception 'This online class has been cancelled';
  end if;
  if now() < o.starts_at - interval '15 minutes' then
    raise exception 'It opens 15 minutes before the start time';
  end if;
  if now() > o.starts_at + make_interval(mins => o.duration_minutes) then
    raise exception 'This online class has ended';
  end if;

  insert into public.online_class_attendance (online_class_id, student_id, joined_at, joined_by)
  values (p_class, p_student, now(), auth.uid())
  on conflict (online_class_id, student_id) do update
    set joined_at = coalesce(online_class_attendance.joined_at, excluded.joined_at),
        joined_by = coalesce(online_class_attendance.joined_by, excluded.joined_by);
  return o.meeting_url;
end;
$$;

revoke all on function public.join_online_class(uuid, uuid) from public, anon;
grant execute on function public.join_online_class(uuid, uuid) to authenticated;
