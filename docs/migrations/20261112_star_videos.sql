-- Star of the week videos. Each week, for each class, teachers share a video of a pupil who did well in each of the
-- class's two major subjects. Leadership sees them in the management pack; the pupil and their parents see their own
-- child's videos on the portal (and get a notification). Run AFTER 20261109_notifications.sql.
--
-- 1. Class subjects get a "major subject" mark. An admin chooses at most two per class.
-- 2. star_videos: one video per class, major subject and week (Monday to Sunday). The video itself stays where the
--    teacher put it (Google Drive, YouTube …); the school stores the link.
--
-- Who can do what:
--   * Admins: everything. Teachers: the classes and subjects they teach (same rule as results and assignments).
--   * Pupils and parents: read their own child's videos only. Nobody else's child.
--
-- Safe to run twice. The SQL editor may warn about "destructive operations": that is only the
-- "drop policy/trigger if exists" lines, which replace the rules with the same rules.

-- ----------------------------------------------------------------------------------------------------------------
alter table public.class_subjects add column if not exists is_major boolean not null default false;

-- At most two major subjects per class.
create or replace function public.class_subjects_major_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_major and (
    select count(*) from public.class_subjects
    where class_id = new.class_id and is_major and subject_id <> new.subject_id
  ) >= 2 then
    raise exception 'A class can have at most two major subjects';
  end if;
  return new;
end;
$$;

drop trigger if exists class_subjects_major_limit on public.class_subjects;
create trigger class_subjects_major_limit
  before insert or update of is_major on public.class_subjects
  for each row execute function public.class_subjects_major_limit();

-- Admins set a class's major subjects in one go (clears the old ones first, so swapping never trips the limit).
create or replace function public.set_class_major_subjects(p_class uuid, p_subjects uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted uuid[] := coalesce(p_subjects, '{}'::uuid[]);
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can choose major subjects';
  end if;
  if cardinality(wanted) > 2 then
    raise exception 'A class can have at most two major subjects';
  end if;
  if exists (
    select 1 from unnest(wanted) w(id)
    where not exists (select 1 from public.class_subjects cs where cs.class_id = p_class and cs.subject_id = w.id)
  ) then
    raise exception 'Choose subjects this class takes';
  end if;
  update public.class_subjects set is_major = false where class_id = p_class and is_major;
  update public.class_subjects set is_major = true where class_id = p_class and subject_id = any(wanted);
end;
$$;

revoke all on function public.set_class_major_subjects(uuid, uuid[]) from public, anon;
grant execute on function public.set_class_major_subjects(uuid, uuid[]) to authenticated;

create table if not exists public.star_videos (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  -- The Monday of the week (Lagos).
  week_start date not null check (extract(isodow from week_start) = 1),
  student_id uuid not null references public.students(id) on delete cascade,
  video_url text not null check (video_url ~* '^https://[^[:space:]]+$' and length(video_url) <= 1000),
  reason text check (reason is null or length(reason) <= 500),
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  author_name text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, subject_id, week_start)
);

create index if not exists star_videos_week_idx on public.star_videos(week_start);
create index if not exists star_videos_student_idx on public.star_videos(student_id);

drop trigger if exists star_videos_set_updated_at on public.star_videos;
create trigger star_videos_set_updated_at
  before update on public.star_videos
  for each row execute procedure public.set_updated_at();

-- A video must be for one of the class's major subjects and a pupil in that class.
create or replace function public.star_video_valid(p_class uuid, p_subject uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.class_subjects where class_id = p_class and subject_id = p_subject and is_major)
     and exists (select 1 from public.students where id = p_student and class_id = p_class);
$$;

revoke all on function public.star_video_valid(uuid, uuid, uuid) from public, anon;
grant execute on function public.star_video_valid(uuid, uuid, uuid) to authenticated;

alter table public.star_videos enable row level security;

drop policy if exists star_videos_staff_select on public.star_videos;
create policy star_videos_staff_select on public.star_videos
  for select to authenticated
  using (public.can_manage_results(class_id, subject_id));

drop policy if exists star_videos_staff_insert on public.star_videos;
create policy star_videos_staff_insert on public.star_videos
  for insert to authenticated
  with check (public.can_manage_results(class_id, subject_id) and public.star_video_valid(class_id, subject_id, student_id));

drop policy if exists star_videos_staff_update on public.star_videos;
create policy star_videos_staff_update on public.star_videos
  for update to authenticated
  using (public.can_manage_results(class_id, subject_id))
  with check (public.can_manage_results(class_id, subject_id) and public.star_video_valid(class_id, subject_id, student_id));

drop policy if exists star_videos_staff_delete on public.star_videos;
create policy star_videos_staff_delete on public.star_videos
  for delete to authenticated
  using (public.can_manage_results(class_id, subject_id));

drop policy if exists star_videos_portal_select on public.star_videos;
create policy star_videos_portal_select on public.star_videos
  for select to authenticated
  using (public.portal_sees_student(student_id));

revoke all on public.star_videos from anon;

-- Tell the pupil and their parents (bell, email, phone) when their child is chosen, or when the video changes to
-- another child. A new link for the same child doesn't notify again.
create or replace function public.notify_star_video()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_name text;
  subject text := public.subject_label(new.subject_id);
begin
  if tg_op = 'UPDATE' and old.student_id = new.student_id then
    return new;
  end if;
  select s.first_name into first_name from public.students s where s.id = new.student_id;
  perform public.notify_pupils(
    array[new.student_id],
    'star_video',
    coalesce(first_name, 'Your child') || ' is a star of the week in ' || subject || '!',
    coalesce(nullif(new.reason, ''), coalesce(new.author_name, 'The teacher') || ' shared a video of ' || coalesce(first_name, 'your child') || ' doing well this week.'),
    '/portal/star-videos',
    new.id
  );
  return new;
exception when others then
  raise warning 'notify_star_video failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists star_videos_notify on public.star_videos;
create trigger star_videos_notify
  after insert or update of student_id on public.star_videos
  for each row execute function public.notify_star_video();
