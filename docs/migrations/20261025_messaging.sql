-- Messaging between teachers and parents, and between parents of the same class.
--
-- Who can talk to whom is worked out from enrolment, so access follows the pupil: when a child moves class, their
-- parents leave the old class's spaces and join the new one automatically.
--
--  * Class announcements (one per class): teachers of the class (class teacher + subject teachers) and admins post;
--    the class's parents read.
--  * Class parents' chat (one per class): the class's parents talk to each other. It is a school space: the class
--    teacher and admins can read it and moderate, and every parent is told so on screen.
--  * Teacher <-> parent direct messages: a teacher (or admin) and a parent of a pupil in a class the teacher teaches.
--    Kept as a school record: admins can read them.
--  * Parent <-> parent direct messages: only between parents of the same class, and only if the parent being messaged
--    has switched on "Let other parents message me" (off by default). Private to the two parents; admins see a
--    message only if it is reported. Either parent can block the other.
--
-- Records: messages are never deleted. "Unsend" (within 15 minutes) and moderation hide a message from the chat but
-- keep the original in chat_message_archive, which only admins can read.
-- Students have no access. Phone numbers and email addresses are never shown.
-- Run after the earlier migrations, in the Supabase SQL editor.

-- ---------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('class_announcements', 'class_parents', 'direct')),
  class_id uuid references public.classes(id) on delete cascade,
  direct_kind text check (direct_kind in ('teacher_parent', 'parent_parent')),
  direct_key text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint chat_conversations_shape check (
    (kind = 'direct' and class_id is null and direct_kind is not null and direct_key is not null)
    or (kind <> 'direct' and class_id is not null and direct_kind is null and direct_key is null)
  )
);

create unique index if not exists chat_conversations_class_kind_uidx on public.chat_conversations(kind, class_id) where class_id is not null;

create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists chat_members_user_idx on public.chat_members(user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_name text,
  sender_label text,
  body text,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removal_kind text check (removal_kind in ('unsent', 'moderated')),
  constraint chat_messages_body check (
    (removed_at is null and body is not null and length(btrim(body)) between 1 and 2000)
    or (removed_at is not null and body is null)
  )
);

create index if not exists chat_messages_conversation_idx on public.chat_messages(conversation_id, created_at desc);
create index if not exists chat_messages_sender_idx on public.chat_messages(sender_id, created_at desc);

-- Originals of unsent / moderated messages. Admins only.
create table if not exists public.chat_message_archive (
  message_id uuid primary key references public.chat_messages(id) on delete cascade,
  body text not null,
  removal_kind text not null,
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz not null default now(),
  reason text
);

create table if not exists public.chat_reads (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  reported_by uuid references auth.users(id) on delete set null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  unique (message_id, reported_by)
);

create table if not exists public.chat_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Parents: may other parents in my children's classes message me privately?
  allow_parent_dm boolean not null default false,
  -- Teachers: when I usually reply (shown to parents; messages are never blocked).
  reply_from time not null default '08:00',
  reply_to time not null default '16:00',
  reply_weekdays_only boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.chat_mutes (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted_until timestamptz not null,
  muted_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Who is who
-- ---------------------------------------------------------------------------------------------------------------

-- Classes a parent account has a current pupil in.
create or replace function public.chat_parent_class_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct s.class_id
  from public.guardian_user_links gul
  join public.student_guardians sg on sg.guardian_id = gul.guardian_id
  join public.students s on s.id = sg.student_id
  where gul.user_id = p_user
    and s.class_id is not null
    and s.status in ('enrolled', 'active');
$$;

-- Classes a teacher teaches: class teacher or a subject teacher.
create or replace function public.chat_teacher_class_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tca.class_id from public.teacher_class_assignments tca where tca.teacher_id = p_user and tca.active
  union
  select tsa.class_id from public.teacher_subject_assignments tsa where tsa.teacher_id = p_user and tsa.active;
$$;

create or replace function public.chat_role(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.role::text in ('admin', 'super_admin') then 'admin'
    when p.role::text = 'teacher' then 'teacher'
    when exists (select 1 from public.guardian_user_links g where g.user_id = p_user) then 'parent'
    else 'none'
  end
  from public.profiles p
  where p.id = p_user;
$$;

create or replace function public.chat_is_class_teacher(p_user uuid, p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teacher_class_assignments
    where teacher_id = p_user and class_id = p_class and active
  );
$$;

-- Name and a short context label, e.g. ("Mrs Adeyemi", "Parent of Tolu") or ("Mr Bello", "Teacher").
create or replace function public.chat_identity(p_user uuid, p_class uuid default null)
returns table (display_name text, label text)
language sql
stable
security definer
set search_path = public
as $$
  with r as (select public.chat_role(p_user) as role)
  select
    case
      when r.role = 'parent' then (
        select g.full_name from public.guardian_user_links gul join public.guardians g on g.id = gul.guardian_id
        where gul.user_id = p_user
      )
      else (select coalesce(p.full_name, 'Staff') from public.profiles p where p.id = p_user)
    end,
    case
      when r.role = 'admin' then 'School admin'
      when r.role = 'teacher' then 'Teacher'
      when r.role = 'parent' then coalesce(
        'Parent of ' || (
          select string_agg(distinct s.first_name, ', ')
          from public.guardian_user_links gul
          join public.student_guardians sg on sg.guardian_id = gul.guardian_id
          join public.students s on s.id = sg.student_id
          where gul.user_id = p_user
            and s.status in ('enrolled', 'active')
            and (p_class is null or s.class_id = p_class)
        ),
        'Parent'
      )
      else 'Member'
    end
  from r;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.chat_can_read(p_conversation uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.chat_conversations%rowtype;
  me uuid := auth.uid();
  my_role text;
begin
  if me is null then return false; end if;
  select * into c from public.chat_conversations where id = p_conversation;
  if not found then return false; end if;
  my_role := coalesce(public.chat_role(me), 'none');

  if c.kind = 'direct' then
    if exists (select 1 from public.chat_members where conversation_id = c.id and user_id = me) then
      return true;
    end if;
    -- Teacher-parent messages are a school record; parent-parent messages stay private.
    return my_role = 'admin' and c.direct_kind = 'teacher_parent';
  end if;

  if my_role = 'admin' then return true; end if;
  if my_role = 'teacher' then return c.class_id in (select public.chat_teacher_class_ids(me)); end if;
  if my_role = 'parent' then return c.class_id in (select public.chat_parent_class_ids(me)); end if;
  return false;
end;
$$;

create or replace function public.chat_dm_kind(p_target uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_role text := coalesce(public.chat_role(auth.uid()), 'none');
  their_role text := coalesce(public.chat_role(p_target), 'none');
begin
  if me is null or p_target is null or me = p_target then return null; end if;

  if my_role = 'admin' and their_role = 'parent' then return 'teacher_parent'; end if;
  if my_role = 'parent' and their_role = 'admin' then return null; end if; -- parents reach the school through teachers

  if my_role = 'teacher' and their_role = 'parent'
     and exists (select 1 from public.chat_teacher_class_ids(me) t where t in (select public.chat_parent_class_ids(p_target))) then
    return 'teacher_parent';
  end if;
  if my_role = 'parent' and their_role = 'teacher'
     and exists (select 1 from public.chat_parent_class_ids(me) c where c in (select public.chat_teacher_class_ids(p_target))) then
    return 'teacher_parent';
  end if;

  if my_role = 'parent' and their_role = 'parent'
     and exists (select 1 from public.chat_parent_class_ids(me) c where c in (select public.chat_parent_class_ids(p_target)))
     and coalesce((select allow_parent_dm from public.chat_settings where user_id = p_target), false)
     and not exists (
       select 1 from public.chat_blocks
       where (blocker_id = me and blocked_id = p_target) or (blocker_id = p_target and blocked_id = me)
     ) then
    return 'parent_parent';
  end if;
  return null;
end;
$$;

create or replace function public.chat_can_post(p_conversation uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.chat_conversations%rowtype;
  me uuid := auth.uid();
  my_role text;
  other uuid;
begin
  if me is null then return false; end if;
  select * into c from public.chat_conversations where id = p_conversation;
  if not found then return false; end if;
  my_role := coalesce(public.chat_role(me), 'none');

  if c.kind = 'class_announcements' then
    return my_role = 'admin' or (my_role = 'teacher' and c.class_id in (select public.chat_teacher_class_ids(me)));
  end if;

  if c.kind = 'class_parents' then
    if my_role = 'admin' then return true; end if;
    if my_role = 'teacher' then return c.class_id in (select public.chat_teacher_class_ids(me)); end if;
    return my_role = 'parent'
      and c.class_id in (select public.chat_parent_class_ids(me))
      and not exists (select 1 from public.chat_mutes m where m.class_id = c.class_id and m.user_id = me and m.muted_until > now());
  end if;

  -- Direct: still a member, and the relationship still holds (e.g. the teacher still teaches the child's class).
  if not exists (select 1 from public.chat_members where conversation_id = c.id and user_id = me) then return false; end if;
  select user_id into other from public.chat_members where conversation_id = c.id and user_id <> me limit 1;
  return coalesce(other is not null and public.chat_dm_kind(other) = c.direct_kind, false);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Row level security (writes go through the functions below, or the insert trigger)
-- ---------------------------------------------------------------------------------------------------------------

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_archive enable row level security;
alter table public.chat_reads enable row level security;
alter table public.chat_reports enable row level security;
alter table public.chat_settings enable row level security;
alter table public.chat_blocks enable row level security;
alter table public.chat_mutes enable row level security;

drop policy if exists chat_conversations_select on public.chat_conversations;
create policy chat_conversations_select on public.chat_conversations
  for select to authenticated using (public.chat_can_read(id));

drop policy if exists chat_members_select on public.chat_members;
create policy chat_members_select on public.chat_members
  for select to authenticated using (public.chat_can_read(conversation_id));

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (
    public.chat_can_read(conversation_id)
    or (coalesce(public.is_admin(), false) and exists (select 1 from public.chat_reports r where r.message_id = chat_messages.id))
  );

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.chat_can_post(conversation_id));

drop policy if exists chat_message_archive_admin on public.chat_message_archive;
create policy chat_message_archive_admin on public.chat_message_archive
  for select to authenticated using (coalesce(public.is_admin(), false));

drop policy if exists chat_reads_own on public.chat_reads;
create policy chat_reads_own on public.chat_reads
  for select to authenticated using (user_id = auth.uid());

drop policy if exists chat_reports_select on public.chat_reports;
create policy chat_reports_select on public.chat_reports
  for select to authenticated using (reported_by = auth.uid() or coalesce(public.is_admin(), false));

drop policy if exists chat_settings_own on public.chat_settings;
create policy chat_settings_own on public.chat_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chat_blocks_own on public.chat_blocks;
create policy chat_blocks_own on public.chat_blocks
  for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

drop policy if exists chat_mutes_select on public.chat_mutes;
create policy chat_mutes_select on public.chat_mutes
  for select to authenticated
  using (user_id = auth.uid() or coalesce(public.is_admin(), false) or public.chat_is_class_teacher(auth.uid(), class_id));

revoke insert, update, delete, truncate on
  public.chat_conversations, public.chat_members, public.chat_message_archive, public.chat_reads,
  public.chat_reports, public.chat_mutes
  from anon, authenticated;
revoke update, delete, truncate on public.chat_messages from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.chat_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.chat_conversations%rowtype;
  who record;
begin
  new.sender_id := auth.uid();
  new.created_at := now();
  new.removed_at := null;
  new.removal_kind := null;
  new.body := btrim(new.body);
  if not coalesce(public.chat_can_post(new.conversation_id), false) then
    raise exception 'You can''t post in this conversation';
  end if;
  -- Simple flood protection.
  if (select count(*) from public.chat_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'You are sending messages too quickly. Please wait a moment.';
  end if;
  select * into conv from public.chat_conversations where id = new.conversation_id;
  select * into who from public.chat_identity(new.sender_id, conv.class_id);
  new.sender_name := who.display_name;
  new.sender_label := who.label;
  return new;
end;
$$;

drop trigger if exists chat_messages_before_insert on public.chat_messages;
create trigger chat_messages_before_insert
  before insert on public.chat_messages
  for each row execute function public.chat_messages_before_insert();

create or replace function public.chat_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_conversations set last_message_at = new.created_at where id = new.conversation_id;
  insert into public.chat_reads (conversation_id, user_id, last_read_at)
  values (new.conversation_id, new.sender_id, new.created_at)
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  return null;
end;
$$;

drop trigger if exists chat_messages_after_insert on public.chat_messages;
create trigger chat_messages_after_insert
  after insert on public.chat_messages
  for each row execute function public.chat_messages_after_insert();

-- ---------------------------------------------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------------------------------------------

-- Makes sure the class spaces exist for every class the signed-in person belongs to.
create or replace function public.chat_ensure_class_spaces()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_role text := coalesce(public.chat_role(auth.uid()), 'none');
begin
  if me is null then return; end if;
  insert into public.chat_conversations (kind, class_id)
  select k, c.id
  from public.classes c
  cross join (values ('class_announcements'), ('class_parents')) as kinds(k)
  where c.active
    and (
      my_role = 'admin'
      or (my_role = 'teacher' and c.id in (select public.chat_teacher_class_ids(me)))
      or (my_role = 'parent' and c.id in (select public.chat_parent_class_ids(me)))
    )
  on conflict (kind, class_id) where class_id is not null do nothing;
end;
$$;

create or replace function public.chat_start_direct(p_target uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  k text := public.chat_dm_kind(p_target);
  key text;
  conv uuid;
begin
  if k is null then
    raise exception 'You can''t message this person';
  end if;
  key := least(me::text, p_target::text) || ':' || greatest(me::text, p_target::text);
  select id into conv from public.chat_conversations where direct_key = key;
  if conv is null then
    insert into public.chat_conversations (kind, direct_kind, direct_key, created_by)
    values ('direct', k, key, me)
    returning id into conv;
    insert into public.chat_members (conversation_id, user_id) values (conv, me), (conv, p_target);
  end if;
  return conv;
end;
$$;

create or replace function public.chat_mark_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.chat_can_read(p_conversation), false) then return; end if;
  insert into public.chat_reads (conversation_id, user_id, last_read_at)
  values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- Sender only, within 15 minutes. The original is kept in the archive for the school.
create or replace function public.chat_unsend(p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.chat_messages%rowtype;
begin
  select * into m from public.chat_messages where id = p_message for update;
  if not found or m.sender_id is distinct from auth.uid() then
    raise exception 'You can only unsend your own messages';
  end if;
  if m.removed_at is not null then return; end if;
  if m.created_at < now() - interval '15 minutes' then
    raise exception 'Messages can only be unsent within 15 minutes';
  end if;
  insert into public.chat_message_archive (message_id, body, removal_kind, removed_by)
  values (m.id, m.body, 'unsent', auth.uid());
  update public.chat_messages set body = null, removed_at = now(), removal_kind = 'unsent' where id = m.id;
end;
$$;

create or replace function public.chat_report(p_message uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conv uuid;
begin
  select conversation_id into conv from public.chat_messages where id = p_message;
  if conv is null or not coalesce(public.chat_can_read(conv), false) then
    raise exception 'Message not found';
  end if;
  insert into public.chat_reports (message_id, reported_by, reason)
  values (p_message, auth.uid(), btrim(p_reason))
  on conflict (message_id, reported_by) do update set reason = excluded.reason, status = 'open', created_at = now();
end;
$$;

-- Admins, or the class teacher for messages in their class spaces.
create or replace function public.chat_can_moderate(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or exists (
      select 1 from public.chat_conversations c
      where c.id = p_conversation and c.class_id is not null and public.chat_is_class_teacher(auth.uid(), c.class_id)
    );
$$;

create or replace function public.chat_remove_message(p_message uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.chat_messages%rowtype;
begin
  select * into m from public.chat_messages where id = p_message for update;
  if not found then raise exception 'Message not found'; end if;
  if not (coalesce(public.chat_can_moderate(m.conversation_id), false)
          or (coalesce(public.is_admin(), false) and exists (select 1 from public.chat_reports where message_id = m.id))) then
    raise exception 'Only an admin or the class teacher can remove messages';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for removing the message'; end if;
  if m.removed_at is null then
    insert into public.chat_message_archive (message_id, body, removal_kind, removed_by, reason)
    values (m.id, m.body, 'moderated', auth.uid(), btrim(p_reason));
    update public.chat_messages set body = null, removed_at = now(), removal_kind = 'moderated' where id = m.id;
  end if;
  update public.chat_reports
  set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_note = btrim(p_reason)
  where message_id = m.id and status = 'open';
end;
$$;

create or replace function public.chat_dismiss_report(p_report uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then raise exception 'Only an admin can dismiss reports'; end if;
  update public.chat_reports
  set status = 'dismissed', resolved_by = auth.uid(), resolved_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_report;
end;
$$;

-- Stops a parent posting in a class parents' chat for a while (admins and the class teacher).
create or replace function public.chat_mute(p_class uuid, p_user uuid, p_days int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(public.is_admin(), false) or public.chat_is_class_teacher(auth.uid(), p_class)) then
    raise exception 'Only an admin or the class teacher can mute members';
  end if;
  if p_days is null or p_days <= 0 then
    delete from public.chat_mutes where class_id = p_class and user_id = p_user;
    return;
  end if;
  insert into public.chat_mutes (class_id, user_id, muted_until, muted_by, reason)
  values (p_class, p_user, now() + make_interval(days => least(p_days, 365)), auth.uid(), nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (class_id, user_id) do update
    set muted_until = excluded.muted_until, muted_by = excluded.muted_by, reason = excluded.reason;
end;
$$;

-- The signed-in person's conversations with titles, last message and unread counts.
create or replace function public.chat_inbox()
returns table (
  conversation_id uuid,
  kind text,
  direct_kind text,
  class_id uuid,
  class_name text,
  title text,
  subtitle text,
  other_user_id uuid,
  last_message_at timestamptz,
  last_preview text,
  last_sender text,
  unread int,
  can_post boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id, public.chat_role(auth.uid()) as role),
  convs as (
    select c.*
    from public.chat_conversations c, me
    where (
        c.kind = 'direct' and exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.user_id = me.id)
      )
      or (
        c.kind <> 'direct' and (
          (me.role = 'teacher' and c.class_id in (select public.chat_teacher_class_ids(me.id)))
          or (me.role = 'parent' and c.class_id in (select public.chat_parent_class_ids(me.id)))
          or (me.role = 'admin' and c.last_message_at is not null)
        )
      )
  )
  select
    c.id,
    c.kind,
    c.direct_kind,
    c.class_id,
    cl.name,
    case
      when c.kind = 'class_announcements' then cl.name || ' · Announcements'
      when c.kind = 'class_parents' then cl.name || ' · Parents'
      else (select i.display_name from public.chat_identity(o.user_id) i)
    end,
    case
      when c.kind = 'class_announcements' then 'From the teachers'
      when c.kind = 'class_parents' then 'Class parents'' chat'
      else (select i.label from public.chat_identity(o.user_id) i)
    end,
    o.user_id,
    c.last_message_at,
    lm.preview,
    lm.sender_name,
    (
      select count(*)::int from public.chat_messages x
      where x.conversation_id = c.id
        and x.sender_id is distinct from (select id from me)
        and x.created_at > coalesce((select r.last_read_at from public.chat_reads r where r.conversation_id = c.id and r.user_id = (select id from me)), '-infinity')
    ),
    coalesce(public.chat_can_post(c.id), false)
  from convs c
  left join public.classes cl on cl.id = c.class_id
  left join lateral (
    select m.user_id from public.chat_members m where m.conversation_id = c.id and m.user_id <> (select id from me) limit 1
  ) o on true
  left join lateral (
    select case when x.removed_at is null then left(x.body, 120) else 'Message removed' end as preview, x.sender_name
    from public.chat_messages x where x.conversation_id = c.id order by x.created_at desc limit 1
  ) lm on true
  order by c.last_message_at desc nulls last, c.kind;
$$;

-- People the signed-in person can start a private conversation with.
create or replace function public.chat_contacts()
returns table (user_id uuid, display_name text, label text, kind text, class_names text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id, public.chat_role(auth.uid()) as role),
  candidates as (
    -- Parents of pupils in classes I teach (teachers) or in any class (admins), and parents in my children's classes.
    select distinct gul.user_id, s.class_id
    from public.guardian_user_links gul
    join public.student_guardians sg on sg.guardian_id = gul.guardian_id
    join public.students s on s.id = sg.student_id, me
    where s.class_id is not null and s.status in ('enrolled', 'active')
      and (
        me.role = 'admin'
        or (me.role = 'teacher' and s.class_id in (select public.chat_teacher_class_ids(me.id)))
        or (me.role = 'parent' and s.class_id in (select public.chat_parent_class_ids(me.id)))
      )
    union
    -- Teachers of my children's classes.
    select t.teacher_id, t.class_id
    from (
      select teacher_id, class_id from public.teacher_class_assignments where active
      union
      select teacher_id, class_id from public.teacher_subject_assignments where active
    ) t, me
    where me.role = 'parent' and t.class_id in (select public.chat_parent_class_ids(me.id))
  )
  select
    c.user_id,
    (select i.display_name from public.chat_identity(c.user_id) i),
    (select i.label from public.chat_identity(c.user_id) i),
    public.chat_dm_kind(c.user_id),
    string_agg(distinct cl.name, ', ')
  from candidates c
  join public.classes cl on cl.id = c.class_id
  where c.user_id <> (select id from me) and public.chat_dm_kind(c.user_id) is not null
  group by c.user_id
  order by 4, 2;
$$;

-- When does this teacher usually reply? (Shown to parents.)
create or replace function public.chat_reply_hours(p_user uuid)
returns table (reply_from time, reply_to time, weekdays_only boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(s.reply_from, '08:00'), coalesce(s.reply_to, '16:00'), coalesce(s.reply_weekdays_only, true)
  from (select 1) one
  left join public.chat_settings s on s.user_id = p_user
  where public.chat_role(p_user) in ('teacher', 'admin');
$$;

-- For "Seen" under your last direct message: when the other person last read the conversation.
create or replace function public.chat_other_read_at(p_conversation uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select r.last_read_at
  from public.chat_conversations c
  join public.chat_members m on m.conversation_id = c.id and m.user_id <> auth.uid()
  left join public.chat_reads r on r.conversation_id = c.id and r.user_id = m.user_id
  where c.id = p_conversation and c.kind = 'direct'
    and exists (select 1 from public.chat_members me where me.conversation_id = c.id and me.user_id = auth.uid())
  limit 1;
$$;

-- Unread messages across all conversations (the badge on "Messages").
create or replace function public.chat_unread_total()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(unread), 0)::int from public.chat_inbox();
$$;

-- Names of the people in a conversation (for admins looking over teacher-parent messages).
create or replace function public.chat_conversation_people(p_conversation uuid)
returns table (user_id uuid, display_name text, label text)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, i.display_name, i.label
  from public.chat_members m
  cross join lateral public.chat_identity(m.user_id) i
  where m.conversation_id = p_conversation and coalesce(public.chat_can_read(p_conversation), false);
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'chat_parent_class_ids(uuid)', 'chat_teacher_class_ids(uuid)', 'chat_role(uuid)', 'chat_is_class_teacher(uuid, uuid)',
    'chat_identity(uuid, uuid)', 'chat_can_read(uuid)', 'chat_dm_kind(uuid)', 'chat_can_post(uuid)',
    'chat_ensure_class_spaces()', 'chat_start_direct(uuid)', 'chat_mark_read(uuid)', 'chat_unsend(uuid)',
    'chat_report(uuid, text)', 'chat_can_moderate(uuid)', 'chat_remove_message(uuid, text)', 'chat_dismiss_report(uuid, text)',
    'chat_mute(uuid, uuid, int, text)', 'chat_inbox()', 'chat_contacts()', 'chat_reply_hours(uuid)',
    'chat_other_read_at(uuid)', 'chat_unread_total()', 'chat_conversation_people(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
