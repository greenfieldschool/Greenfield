-- Sends phone notifications straight away. Run AFTER 20261111_push_notifications.sql, once the VAPID keys are set on
-- Vercel. Before running it, replace PASTE_CRON_SECRET_HERE with the CRON_SECRET set on Vercel (the same one the
-- email job uses). The address must be the final one (www.): Supabase doesn't follow redirects.
--
-- It keeps the website address and the secret in Supabase Vault (encrypted, not readable from the website), so the
-- database can ask the website to send alerts the moment a notification is created. A backup job every 5 minutes
-- sends anything that was missed.
--
-- Safe to run twice: it updates the Vault entries and replaces the job. To stop the backup job:
--   select cron.unschedule('send-phone-notifications');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_secret text := 'PASTE_CRON_SECRET_HERE';
  v_url text := 'https://www.greenfieldschool.ng/api/push/send';
  sid uuid;
begin
  if v_secret = 'PASTE_CRON_SECRET_HERE' or length(v_secret) < 16 then
    raise exception 'Replace PASTE_CRON_SECRET_HERE with the CRON_SECRET from Vercel, then run this again.';
  end if;

  select id into sid from vault.secrets where name = 'greenfield_cron_secret';
  if sid is null then
    perform vault.create_secret(v_secret, 'greenfield_cron_secret', 'CRON_SECRET for the website''s sending jobs');
  else
    perform vault.update_secret(sid, v_secret);
  end if;

  sid := null;
  select id into sid from vault.secrets where name = 'greenfield_push_send_url';
  if sid is null then
    perform vault.create_secret(v_url, 'greenfield_push_send_url', 'Website job that sends phone notifications');
  else
    perform vault.update_secret(sid, v_url);
  end if;
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'send-phone-notifications';

select cron.schedule('send-phone-notifications', '*/5 * * * *', $$ select public.push_kick(true); $$);
