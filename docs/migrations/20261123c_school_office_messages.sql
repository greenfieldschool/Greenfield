-- Parents can message the school office (23 Nov 2026). Run after 20261123_discipline_ladder.sql. Safe to run twice.
--
-- Decisions (the user): the office is the front desk and admins (admin, super_admin).
--
-- * One "School office" conversation per parent (kind 'office', direct_key 'office:<parent user id>'). Only the
--   parent is a member; office staff read and reply because of their role, so it is a shared inbox.
-- * Front desk gets the chat role 'office': it sees office conversations only (never class spaces or
--   teacher-parent messages) and can't start private messages.
-- * Office staff replies show the person's name and the label "School office". The parent is emailed when the office
--   replies (same rules as other messages: at most one email every 2 hours, skipped if already read).
-- * Unread for office staff: the parent's messages after the later of their own last read and the last office reply,
--   so once one person replies, it stops showing as unread for the others.
-- * Fixes a bug that stopped every message email (teacher-parent messages and class announcements too).
-- * Parents start it; the office can't open one with a parent who hasn't written (admins can still message any
--   parent privately, as before).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Conversation kind
-- ---------------------------------------------------------------------------------------------------------------

alter table public.chat_conversations drop constraint if exists chat_conversations_kind_check;
alter table public.chat_conversations add constraint chat_conversations_kind_check
  check (kind in ('class_announcements', 'class_parents', 'direct', 'office'));

alter table public.chat_conversations drop constraint if exists chat_conversations_shape;
alter table public.chat_conversations add constraint chat_conversations_shape check (
  (kind = 'direct' and class_id is null and direct_kind is not null and direct_key is not null)
  or (kind = 'office' and class_id is null and direct_kind is null and direct_key like 'office:%')
  or (kind in ('class_announcements', 'class_parents') and class_id is not null and direct_kind is null and direct_key is null)
);

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Roles
-- ---------------------------------------------------------------------------------------------------------------

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
    when p.role::text = 'front_desk' then 'office'
    when exists (select 1 from public.guardian_user_links g where g.user_id = p_user) then 'parent'
    else 'none'
  end
  from public.profiles p
  where p.id = p_user;
$$;

-- Front desk and admins: the people who read and answer the school office's messages.
create or replace function public.chat_is_office(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.chat_role(p_user) in ('admin', 'office'), false);
$$;

revoke all on function public.chat_is_office(uuid) from public, anon;
grant execute on function public.chat_is_office(uuid) to authenticated;

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
      when r.role = 'office' then 'School office'
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
-- 3. Who can read and post
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

  if c.kind = 'office' then
    return my_role in ('admin', 'office')
      or exists (select 1 from public.chat_members where conversation_id = c.id and user_id = me);
  end if;

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

  if c.kind = 'office' then
    if my_role in ('admin', 'office') then return true; end if;
    -- The parent who owns it, while they are still a parent at the school.
    return my_role = 'parent' and exists (select 1 from public.chat_members where conversation_id = c.id and user_id = me);
  end if;

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

-- Staff replying in an office conversation are labelled "School office", whatever their own role.
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
  new.sender_label := case
    when conv.kind = 'office' and not exists (
      select 1 from public.chat_members m where m.conversation_id = conv.id and m.user_id = new.sender_id
    ) then 'School office'
    else who.label
  end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Starting it (parents only)
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.chat_start_office()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  key text;
  conv uuid;
begin
  if me is null or coalesce(public.chat_role(me), 'none') <> 'parent' then
    raise exception 'Only parents can message the school office from here.';
  end if;
  key := 'office:' || me::text;
  select id into conv from public.chat_conversations where direct_key = key;
  if conv is null then
    insert into public.chat_conversations (kind, direct_key, created_by)
    values ('office', key, me)
    on conflict (direct_key) do nothing
    returning id into conv;
    if conv is null then
      select id into conv from public.chat_conversations where direct_key = key;
    else
      insert into public.chat_members (conversation_id, user_id) values (conv, me) on conflict do nothing;
    end if;
  end if;
  return conv;
end;
$$;

revoke all on function public.chat_start_office() from public, anon;
grant execute on function public.chat_start_office() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Inbox
-- ---------------------------------------------------------------------------------------------------------------

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
        c.kind in ('direct', 'office') and exists (select 1 from public.chat_members m where m.conversation_id = c.id and m.user_id = me.id)
      )
      or (
        -- The office's shared inbox: every parent's office conversation that has a message.
        c.kind = 'office' and me.role in ('admin', 'office') and c.last_message_at is not null
      )
      or (
        c.kind in ('class_announcements', 'class_parents') and (
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
      when c.kind = 'office' and o.user_id is null then 'School office'
      else (select i.display_name from public.chat_identity(o.user_id) i)
    end,
    case
      when c.kind = 'class_announcements' then 'From the teachers'
      when c.kind = 'class_parents' then 'Class parents'' chat'
      when c.kind = 'office' and o.user_id is null then 'Front desk and school admins'
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
        and (
          -- Office staff: only the parent's messages that no one in the office has answered yet.
          c.kind <> 'office' or o.user_id is null or (
            x.sender_id = o.user_id
            and x.created_at > coalesce((
              select max(y.created_at) from public.chat_messages y
              where y.conversation_id = c.id and y.sender_id is distinct from o.user_id
            ), '-infinity')
          )
        )
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

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Email: the parent hears when the office replies (office staff see the Messages badge instead).
--    Also fixes message emails for everyone (see the comment on the role below).
-- ---------------------------------------------------------------------------------------------------------------

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
  if c.kind = 'office' then
    who := 'The school office';
  end if;

  for r in
    -- role as text: profiles.role is an enum, and comparing it with staff_roles (text[]) raised an error that the
    -- handler below swallowed, so no message email was ever queued before this fix.
    select distinct x.user_id, p.role::text as role
    from (
      select m.user_id from public.chat_members m where c.kind in ('direct', 'office') and m.conversation_id = c.id
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
      case when c.kind in ('direct', 'office') then who || ' sent you a message' else 'New class announcement from ' || who end,
      case when c.kind in ('direct', 'office') then who || ' sent you a message' else who || ' posted in the class announcements' end,
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
