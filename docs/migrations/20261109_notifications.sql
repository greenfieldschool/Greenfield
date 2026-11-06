-- Notifications for pupils and parents (issue 10, "Notification system"). Run AFTER 20261108_online_classes.sql.
--
-- Pupils and parents get a notification on the portal (bell with an unread count, and a Notifications page) when:
--   * a teacher sets an assignment or classwork for the class;
--   * a teacher marks a pupil's work (to that pupil and their parents only);
--   * a lesson note is published for the class;
--   * an online class is scheduled, moved to another time, cancelled, or put back on.
-- They are written by the database itself (triggers), so every way of doing those things sends them, and nobody can
-- write or fake one from the browser. A problem sending a notification never stops the teacher's change.
--
-- Each person sees only their own notifications. Parents get one per child in the class; the link opens that child.
--
-- Safe to run twice. The Supabase editor may warn about "destructive operations": that is the policies and triggers
-- below being replaced (drop … if exists). Nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text check (link is null or link like '/portal/%'),
  ref_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

-- Written only by the triggers below; read state changes only through mark_notifications_read().
revoke insert, update, delete on public.notifications from anon, authenticated;

create or replace function public.notifications_unread_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null;
$$;

-- Marks the signed-in person's notifications as read: the ones given, or all of them when p_ids is null.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.notifications_unread_count() from public, anon;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.notifications_unread_count() to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------------------------------------------

-- "Thu 12 Nov, 4:00 pm" in Lagos time.
create or replace function public.notify_when(p_at timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select to_char(p_at at time zone 'Africa/Lagos', 'Dy FMDD Mon, FMHH12:MI am');
$$;

-- One notification per (person, pupil) for these pupils: the pupil's own login and each parent's. Parents' links
-- open that child (?student_id=). Skipped when the same thing (kind + ref) was sent to them in the last 12 hours, so
-- publishing, unpublishing and publishing again doesn't send it twice.
create or replace function public.notify_pupils(p_students uuid[], p_kind text, p_title text, p_body text, p_path text, p_ref uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, student_id, kind, title, body, link, ref_id)
  select r.user_id, r.student_id, p_kind, left(p_title, 200), left(p_body, 500),
         p_path || case when r.via = 'parent' then '?student_id=' || r.student_id::text else '' end,
         p_ref
  from (
    select sul.user_id, sul.student_id, 'pupil' as via
    from public.student_user_links sul
    where sul.student_id = any(p_students)
    union
    select gul.user_id, sg.student_id, 'parent' as via
    from public.student_guardians sg
    join public.guardian_user_links gul on gul.guardian_id = sg.guardian_id
    where sg.student_id = any(p_students)
  ) r
  where r.user_id is not null
    and not exists (
      select 1 from public.notifications x
      where x.user_id = r.user_id and x.student_id = r.student_id and x.kind = p_kind and x.ref_id = p_ref
        and x.created_at > now() - interval '12 hours'
    );
exception when others then
  -- Never stop the teacher's change because a notification couldn't be sent.
  raise warning 'notify_pupils failed: %', sqlerrm;
end;
$$;

-- Everyone in a class (pupils still at school).
create or replace function public.notify_class(p_class uuid, p_kind text, p_title text, p_body text, p_path text, p_ref uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select public.notify_pupils(
    array(select s.id from public.students s where s.class_id = p_class and coalesce(s.status::text, 'active') not in ('withdrawn', 'graduated', 'transferred')),
    p_kind, p_title, p_body, p_path, p_ref
  );
$$;

create or replace function public.subject_label(p_subject uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select name from public.subjects where id = p_subject), 'General');
$$;

-- Internal helpers: only the triggers use them.
revoke all on function public.notify_when(timestamptz) from public, anon, authenticated;
revoke all on function public.notify_pupils(uuid[], text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.notify_class(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.subject_label(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------------------------

-- New assignment or classwork.
create or replace function public.notify_assignment_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_class(
    new.class_id,
    'assignment',
    (case when new.kind = 'classwork' then 'New classwork: ' else 'New assignment: ' end) || new.title,
    public.subject_label(new.subject_id) || coalesce(' · Due ' || public.notify_when(new.due_at), ''),
    '/portal/assignments/' || new.id::text,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists assignments_notify on public.assignments;
create trigger assignments_notify
  after insert on public.assignments
  for each row execute function public.notify_assignment_set();

-- Work marked (the first time; changing a mark afterwards doesn't send another).
create or replace function public.notify_submission_marked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.assignments%rowtype;
begin
  if new.marked_at is null or (tg_op = 'UPDATE' and old.marked_at is not null) then
    return new;
  end if;
  select * into a from public.assignments where id = new.assignment_id;
  perform public.notify_pupils(
    array[new.student_id],
    'assignment_marked',
    'Marked: ' || coalesce(a.title, 'your work'),
    public.subject_label(a.subject_id)
      || coalesce(' · ' || rtrim(to_char(new.score, 'FM999990.##'), '.') || coalesce('/' || rtrim(to_char(a.max_score, 'FM999990.##'), '.'), ''), '')
      || case when new.feedback is not null then ' · The teacher left a comment' else '' end,
    '/portal/assignments/' || new.assignment_id::text,
    new.assignment_id
  );
  return new;
end;
$$;

drop trigger if exists assignment_submissions_notify on public.assignment_submissions;
create trigger assignment_submissions_notify
  after insert or update of marked_at on public.assignment_submissions
  for each row execute function public.notify_submission_marked();

-- Lesson note published.
create or replace function public.notify_lesson_note_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then
    return new;
  end if;
  perform public.notify_class(
    new.class_id,
    'lesson_note',
    'New lesson note: ' || new.topic,
    public.subject_label(new.subject_id) || coalesce(' · Week ' || new.week::text, ''),
    '/portal/lesson-notes/' || new.id::text,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists lesson_notes_notify on public.lesson_notes;
create trigger lesson_notes_notify
  after insert or update of status on public.lesson_notes
  for each row execute function public.notify_lesson_note_published();

-- Online class scheduled, moved, cancelled or back on.
create or replace function public.notify_online_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text;
  title text;
  body text := public.subject_label(new.subject_id) || ' · ' || public.notify_when(new.starts_at);
begin
  if tg_op = 'INSERT' then
    if new.status = 'cancelled' then
      return new;
    end if;
    kind := 'online_class';
    title := 'Online class: ' || new.topic;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    kind := 'online_class_cancelled';
    title := 'Cancelled: ' || new.topic;
    body := public.subject_label(new.subject_id) || coalesce(' · ' || new.cancel_reason, '');
  elsif new.status = 'scheduled' and old.status = 'cancelled' then
    kind := 'online_class_on';
    title := 'Back on: ' || new.topic;
  elsif new.status = 'scheduled' and new.starts_at is distinct from old.starts_at then
    kind := 'online_class_moved';
    title := 'New time: ' || new.topic;
    body := body || ' (was ' || public.notify_when(old.starts_at) || ')';
  else
    return new;
  end if;
  perform public.notify_class(new.class_id, kind, title, body, '/portal/online-classes/' || new.id::text, new.id);
  return new;
end;
$$;

drop trigger if exists online_classes_notify on public.online_classes;
create trigger online_classes_notify
  after insert or update of status, starts_at on public.online_classes
  for each row execute function public.notify_online_class();
