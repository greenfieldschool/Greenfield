-- Email through the school's Gmail account. Run AFTER 20261109_notifications.sql.
--
-- 1. email_settings: the connected Gmail account (one row). Its access key is stored encrypted by the website and
--    only the website's server can read it (no rules let anyone else).
-- 2. email_preferences: what each person wants by email: notifications (new work, marks, lesson notes, online
--    classes), new messages, school announcements. All on unless they switch them off (portal, or the link in
--    every email).
-- 3. email_outbox: emails waiting to go. Filled by the database only:
--      * every portal notification to a PARENT (pupils get the bell only), once per parent per thing in 12 hours;
--      * a new private message, or a post in a class's announcements, to the people who should read it (not the
--        class parents' chat): at most one email per conversation every 2 hours, and skipped at sending time if
--        they've already read it. The email says who wrote, never the message itself;
--      * school announcements from the dashboard, if "also email parents" was ticked.
--    The website sends them through Gmail every few minutes, most important first (messages, then notifications,
--    then announcements), and keeps under Gmail's daily limit: the rest wait until the next day.
-- 4. announcements: admins send a message to the whole school, a level or a class. It shows on the portal (with a
--    notification) and can also be emailed to parents.
--
-- Safe to run twice. The Supabase editor may warn about "destructive operations": that is policies and triggers
-- being replaced (drop … if exists). Nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. The connected Gmail account
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.email_settings (
  id boolean primary key default true,
  sender_email text not null,
  refresh_token_enc text not null,
  connected_at timestamptz not null default now(),
  connected_by uuid references auth.users(id) on delete set null,
  last_error text,
  last_error_at timestamptz,
  constraint email_settings_one_row check (id)
);

alter table public.email_settings enable row level security;
revoke all on public.email_settings from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. What each person wants by email
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications boolean not null default true,
  messages boolean not null default true,
  announcements boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.email_preferences enable row level security;

drop policy if exists email_preferences_own on public.email_preferences;
create policy email_preferences_own
  on public.email_preferences
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------------------------
-- 3. The outbox
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  to_email text not null,
  to_name text,
  category text not null check (category in ('notification', 'message', 'announcement', 'test')),
  subject text not null,
  heading text not null,
  body text,
  link text check (link is null or link like '/portal/%' or link like '/admin/%'),
  ref_id uuid,
  conversation_id uuid,
  message_at timestamptz,
  priority int not null default 2,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  gmail_id text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);

alter table public.email_outbox add column if not exists claimed_at timestamptz;

create index if not exists email_outbox_queue_idx on public.email_outbox (priority, created_at) where status = 'queued';
create index if not exists email_outbox_sent_idx on public.email_outbox (sent_at) where status = 'sent';
create index if not exists email_outbox_user_ref_idx on public.email_outbox (user_id, ref_id, created_at desc);

alter table public.email_outbox enable row level security;
-- Only the website's server (service key) reads and writes it. Admins see the totals through email_status().
revoke all on public.email_outbox from anon, authenticated;

-- The person's email address, if they have one and want this kind of email.
create or replace function public.email_address_for(p_user uuid, p_category text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from auth.users u
  left join public.email_preferences p on p.user_id = u.id
  where u.id = p_user
    and u.email is not null and u.email like '%@%'
    and case p_category
          when 'notification' then coalesce(p.notifications, true)
          when 'message' then coalesce(p.messages, true)
          when 'announcement' then coalesce(p.announcements, true)
          else true
        end;
$$;

create or replace function public.email_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(coalesce(
    (select full_name from public.profiles where id = p_user),
    (select g.full_name from public.guardian_user_links gul join public.guardians g on g.id = gul.guardian_id where gul.user_id = p_user limit 1),
    ''
  )), '');
$$;

-- Adds one email to the queue. Never raises: a problem queueing an email must not stop what caused it.
create or replace function public.email_enqueue(
  p_user uuid, p_category text, p_subject text, p_heading text, p_body text, p_link text, p_ref uuid,
  p_priority int, p_conversation uuid default null, p_message_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  addr text := public.email_address_for(p_user, p_category);
begin
  if addr is null then
    return;
  end if;
  insert into public.email_outbox (user_id, to_email, to_name, category, subject, heading, body, link, ref_id, priority, conversation_id, message_at)
  values (p_user, addr, public.email_display_name(p_user), p_category, left(p_subject, 200), left(p_heading, 200), left(p_body, 5000), p_link, p_ref, p_priority, p_conversation, p_message_at);
exception when others then
  raise warning 'email_enqueue failed: %', sqlerrm;
end;
$$;

-- Portal notifications → email, for parents only (pupils have the bell). One per parent per thing in 12 hours
-- (a parent of two children in the class gets one email, not two). Announcements are emailed by their own trigger.
create or replace function public.email_from_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'announcement' then
    return new;
  end if;
  if not exists (select 1 from public.profiles where id = new.user_id and role = 'parent') then
    return new;
  end if;
  if exists (
    select 1 from public.email_outbox o
    where o.user_id = new.user_id and o.ref_id = new.ref_id and o.category = 'notification' and o.created_at > now() - interval '12 hours'
  ) then
    return new;
  end if;
  perform public.email_enqueue(new.user_id, 'notification', new.title, new.title, new.body, new.link, new.ref_id, 2);
  return new;
exception when others then
  raise warning 'email_from_notification failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notifications_email on public.notifications;
create trigger notifications_email
  after insert on public.notifications
  for each row execute function public.email_from_notification();

-- New message → email to the people who should read it: the other people in a private conversation, or the parents
-- of the class for a post in its announcements space. Not for the class parents' chat (too many). At most one per
-- conversation every 2 hours per person; skipped at sending time if they've read it by then.
create or replace function public.email_from_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.chat_conversations%rowtype;
  r record;
  staff_roles constant text[] := array['super_admin', 'admin', 'teacher', 'front_desk', 'nurse'];
  who text := coalesce(nullif(btrim(new.sender_name), ''), 'Someone at school');
begin
  if new.removed_at is not null then
    return new;
  end if;
  select * into c from public.chat_conversations where id = new.conversation_id;
  if c.id is null or c.kind = 'class_parents' then
    return new;
  end if;

  for r in
    select distinct x.user_id, p.role
    from (
      select m.user_id from public.chat_members m where c.kind = 'direct' and m.conversation_id = c.id
      union
      select gul.user_id
      from public.students s
      join public.student_guardians sg on sg.student_id = s.id
      join public.guardian_user_links gul on gul.guardian_id = sg.guardian_id
      where c.kind = 'class_announcements' and s.class_id = c.class_id and s.status in ('enrolled', 'active')
    ) x
    left join public.profiles p on p.id = x.user_id
    where x.user_id is distinct from new.sender_id
  loop
    if exists (
      select 1 from public.email_outbox o
      where o.user_id = r.user_id and o.conversation_id = c.id and o.category = 'message' and o.created_at > now() - interval '2 hours'
    ) then
      continue;
    end if;
    perform public.email_enqueue(
      r.user_id,
      'message',
      case when c.kind = 'direct' then who || ' sent you a message' else 'New class announcement from ' || who end,
      case when c.kind = 'direct' then who || ' sent you a message' else who || ' posted in the class announcements' end,
      'Open it on the school portal to read it and reply.',
      case when r.role = any(staff_roles) then '/admin/messages/' else '/portal/messages/' end || c.id::text,
      new.id,
      1,
      c.id,
      new.created_at
    );
  end loop;
  return new;
exception when others then
  raise warning 'email_from_chat_message failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists chat_messages_email on public.chat_messages;
create trigger chat_messages_email
  after insert on public.chat_messages
  for each row execute function public.email_from_chat_message();

-- For the website's sending job (service key only): takes up to p_limit queued emails, most important first, and
-- marks them as being sent so two runs never send the same email.
create or replace function public.email_claim(p_limit int)
returns setof public.email_outbox
language sql
security definer
set search_path = public
as $$
  update public.email_outbox o
  set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
  where o.id in (
    select id from public.email_outbox
    where status = 'queued'
    order by priority, created_at
    limit greatest(0, least(p_limit, 100))
    for update skip locked
  )
  returning o.*;
$$;

-- Emails stuck in "sending" (the job stopped half way) go back in the queue after 15 minutes; after 3 tries they fail.
create or replace function public.email_requeue_stuck()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.email_outbox
  set status = case when attempts >= 3 then 'failed' else 'queued' end,
      last_error = coalesce(last_error, 'Stopped while sending')
  where status = 'sending' and claimed_at < now() - interval '15 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- For admins: is Gmail connected, and how is sending going?
create or replace function public.email_status()
returns table (sender_email text, connected_at timestamptz, last_error text, last_error_at timestamptz, sent_24h int, queued int, failed_7d int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can see email settings';
  end if;
  return query
  select s.sender_email, s.connected_at, s.last_error, s.last_error_at,
         (select count(*)::int from public.email_outbox where status = 'sent' and sent_at > now() - interval '24 hours'),
         (select count(*)::int from public.email_outbox where status in ('queued', 'sending')),
         (select count(*)::int from public.email_outbox where status = 'failed' and created_at > now() - interval '7 days')
  from (select 1) one
  left join public.email_settings s on true;
end;
$$;

revoke all on function public.email_address_for(uuid, text) from public, anon, authenticated;
revoke all on function public.email_display_name(uuid) from public, anon, authenticated;
revoke all on function public.email_enqueue(uuid, text, text, text, text, text, uuid, int, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.email_claim(int) from public, anon, authenticated;
revoke all on function public.email_requeue_stuck() from public, anon, authenticated;
revoke all on function public.email_status() from public, anon;
grant execute on function public.email_status() to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.email_claim(int) to service_role;
    grant execute on function public.email_requeue_stuck() to service_role;
    grant execute on function public.email_enqueue(uuid, text, text, text, text, text, uuid, int, uuid, timestamptz) to service_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. School announcements
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 160),
  body text not null check (length(btrim(body)) between 2 and 10000),
  audience text not null check (audience in ('school', 'level', 'class')),
  level public.school_level,
  class_id uuid references public.classes(id) on delete cascade,
  send_email boolean not null default true,
  author_name text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint announcements_audience_shape check (
    (audience = 'school' and level is null and class_id is null)
    or (audience = 'level' and level is not null and class_id is null)
    or (audience = 'class' and class_id is not null)
  )
);

create index if not exists announcements_created_idx on public.announcements (created_at desc);

alter table public.announcements enable row level security;

-- The pupils an announcement is for (still at school).
create or replace function public.announcement_pupils(p_audience text, p_level public.school_level, p_class uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.students s
  left join public.classes c on c.id = s.class_id
  where s.status in ('enrolled', 'active')
    and (
      p_audience = 'school'
      or (p_audience = 'level' and c.level = p_level)
      or (p_audience = 'class' and s.class_id = p_class)
    );
$$;

create or replace function public.portal_sees_announcement(p_announcement uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.announcements a
    cross join lateral public.announcement_pupils(a.audience, a.level, a.class_id) as pupil(id)
    where a.id = p_announcement and coalesce(public.portal_sees_student(pupil.id), false)
  );
$$;

revoke all on function public.announcement_pupils(text, public.school_level, uuid) from public, anon, authenticated;
revoke all on function public.portal_sees_announcement(uuid) from public, anon;
grant execute on function public.portal_sees_announcement(uuid) to authenticated;

drop policy if exists announcements_admin_all on public.announcements;
create policy announcements_admin_all
  on public.announcements
  for all
  to authenticated
  using (coalesce(public.is_admin(), false))
  with check (coalesce(public.is_admin(), false));

drop policy if exists announcements_staff_select on public.announcements;
create policy announcements_staff_select
  on public.announcements
  for select
  to authenticated
  using (coalesce(public.is_staff(), false));

drop policy if exists announcements_portal_select on public.announcements;
create policy announcements_portal_select
  on public.announcements
  for select
  to authenticated
  using (public.portal_sees_announcement(id));

-- A new announcement: a portal notification for every pupil (and parent) it's for, and, if ticked, an email to each
-- parent once (not once per child).
create or replace function public.announcement_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pupils uuid[] := array(select public.announcement_pupils(new.audience, new.level, new.class_id));
  r record;
begin
  perform public.notify_pupils(pupils, 'announcement', new.title, left(regexp_replace(new.body, '\s+', ' ', 'g'), 160), '/portal/announcements/' || new.id::text, new.id);
  if new.send_email then
    for r in
      select distinct gul.user_id
      from public.student_guardians sg
      join public.guardian_user_links gul on gul.guardian_id = sg.guardian_id
      where sg.student_id = any(pupils)
    loop
      perform public.email_enqueue(r.user_id, 'announcement', new.title, new.title, new.body, '/portal/announcements/' || new.id::text, new.id, 3);
    end loop;
  end if;
  return new;
exception when others then
  raise warning 'announcement_sent failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists announcements_sent on public.announcements;
create trigger announcements_sent
  after insert on public.announcements
  for each row execute function public.announcement_sent();

-- How many parents an announcement would email (shown before sending).
create or replace function public.announcement_reach(p_audience text, p_level public.school_level, p_class uuid)
returns table (pupils int, parents int, parents_with_email int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can send announcements';
  end if;
  return query
  with p as (select public.announcement_pupils(p_audience, p_level, p_class) as id),
  parents as (
    select distinct gul.user_id
    from p join public.student_guardians sg on sg.student_id = p.id
    join public.guardian_user_links gul on gul.guardian_id = sg.guardian_id
  )
  select (select count(*)::int from p),
         (select count(*)::int from parents),
         (select count(*)::int from parents where public.email_address_for(parents.user_id, 'announcement') is not null);
end;
$$;

revoke all on function public.announcement_reach(text, public.school_level, uuid) from public, anon;
grant execute on function public.announcement_reach(text, public.school_level, uuid) to authenticated;
