-- Phone notifications (Web Push) for parents and pupils. Run AFTER 20261109_notifications.sql (and the email
-- update 20261110_email.sql if you use it; the order between those two doesn't matter for this file).
--
-- When a parent or pupil taps "Turn on phone notifications" on the portal, their phone gives the website an address
-- to send alerts to. This file keeps those addresses and lines up an alert for every new portal notification:
--   1. push_subscriptions: one row per phone (or computer) that has turned alerts on. Each person sees and removes
--      only their own; saving one goes through push_subscribe() so a shared phone moves to whoever turned it on.
--   2. push_outbox: alerts waiting to be sent. Filled by a trigger on notifications (only for people with a phone
--      turned on); read and emptied by the website's sending job (/api/push/send) with the server key only.
--   3. push_kick(): asks the website to send straight away. It does nothing until 20261111b_push_sending.sql is run
--      (that file stores the website address and the CRON_SECRET in Supabase Vault and adds a 5-minute backup job).
-- A problem lining up an alert never stops the teacher's change or the notification itself.
--
-- Safe to run twice. The Supabase editor may warn about "destructive operations": that is the policies, functions
-- and triggers below being replaced (drop … if exists). Nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------
-- Phone notifications
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Saved only through push_subscribe(); people can read and remove their own.
revoke insert, update on public.push_subscriptions from anon, authenticated;
revoke all on public.push_subscriptions from anon;
grant select, delete on public.push_subscriptions to authenticated;

-- Saves this phone for the signed-in person. If the phone was saved for someone else (a shared phone, or a sign-out
-- and sign-in), it moves to this person. p_old_endpoint: the phone's previous address when the phone renewed it.
-- Keeps at most 10 phones per person (the oldest go first).
create or replace function public.push_subscribe(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null,
  p_old_endpoint text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Please sign in again.';
  end if;
  if p_old_endpoint is not null and p_old_endpoint <> p_endpoint then
    delete from public.push_subscriptions where endpoint = p_old_endpoint and user_id = me;
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        created_at = case when push_subscriptions.user_id = excluded.user_id then push_subscriptions.created_at else now() end;
  delete from public.push_subscriptions
  where user_id = me
    and id not in (select id from public.push_subscriptions where user_id = me order by created_at desc limit 10);
  return true;
end;
$$;

revoke all on function public.push_subscribe(text, text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text, text) to authenticated;

-- Alerts waiting to be sent (server only: no grants for signed-in people).
create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts int not null default 0
);

create index if not exists push_outbox_waiting_idx on public.push_outbox (created_at);

alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

-- Asks the website to send waiting alerts now (once per database transaction, so a class of 30 is one request).
-- Needs pg_net and the two Vault entries made by 20261111b_push_sending.sql; until then it quietly does nothing and
-- the alerts wait. p_force: skip the once-per-transaction check (the backup job uses it).
create or replace function public.push_kick(p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not p_force then
    if coalesce(current_setting('app.push_kicked', true), '') = 'on' then
      return;
    end if;
    perform set_config('app.push_kicked', 'on', true);
  end if;
  if not exists (select 1 from public.push_outbox) then
    return;
  end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'greenfield_push_send_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'greenfield_cron_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then
    return;
  end if;
  -- pg_net sends after this transaction commits, so the website sees the new alerts.
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    using v_url,
          jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
          '{}'::jsonb;
exception when others then
  raise warning 'push_kick failed: %', sqlerrm;
end;
$$;

revoke all on function public.push_kick(boolean) from public, anon, authenticated;

-- New portal notification → an alert on each phone the person has turned on.
create or replace function public.push_from_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    return new;
  end if;
  insert into public.push_outbox (notification_id, user_id) values (new.id, new.user_id)
  on conflict (notification_id) do nothing;
  perform public.push_kick(false);
  return new;
exception when others then
  raise warning 'push_from_notification failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.push_from_notification() from public, anon, authenticated;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.push_from_notification();

-- The sending job takes up to p_limit waiting alerts (other runs skip them), with what to show and the person's
-- unread count for the app badge. Alerts older than a day, already read, or tried 3 times are dropped first.
-- A taken alert that isn't finished within 2 minutes can be taken again.
create or replace function public.push_claim(p_limit int default 100)
returns table (
  outbox_id uuid,
  notification_id uuid,
  user_id uuid,
  kind text,
  title text,
  body text,
  ref_id uuid,
  unread int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_outbox o
  where o.created_at < now() - interval '1 day'
     or o.attempts >= 3
     or exists (select 1 from public.notifications n where n.id = o.notification_id and n.read_at is not null);

  return query
  with picked as (
    select o.id
    from public.push_outbox o
    where o.claimed_at is null or o.claimed_at < now() - interval '2 minutes'
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  ),
  taken as (
    update public.push_outbox o
    set claimed_at = now(), attempts = o.attempts + 1
    from picked
    where o.id = picked.id
    returning o.id, o.notification_id, o.user_id
  )
  select t.id, n.id, t.user_id, n.kind, n.title, n.body, n.ref_id,
         (select count(*)::int from public.notifications u where u.user_id = t.user_id and u.read_at is null)
  from taken t
  join public.notifications n on n.id = t.notification_id;
end;
$$;

-- Finished alerts (sent, or the phone is gone) are removed; the rest stay to be tried again.
create or replace function public.push_done(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_outbox where id = any(p_ids);
$$;

revoke all on function public.push_claim(int) from public, anon, authenticated;
revoke all on function public.push_done(uuid[]) from public, anon, authenticated;
grant execute on function public.push_claim(int) to service_role;
grant execute on function public.push_done(uuid[]) to service_role;
grant select, update, delete on public.push_subscriptions to service_role;
