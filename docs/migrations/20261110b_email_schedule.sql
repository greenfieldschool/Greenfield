-- Sends waiting school emails every 5 minutes (optional but recommended). Run AFTER 20261110_email.sql, once Gmail
-- is connected. Before running it, replace PASTE_CRON_SECRET_HERE with the CRON_SECRET set on Vercel.
--
-- Supabase calls the website's sending job (/api/email/send). Without this, emails still go once a day (Vercel's
-- daily job) and straight away when an admin sends an announcement or a test.
--
-- Safe to run twice: it replaces the job. To stop it: select cron.unschedule('send-school-emails');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'send-school-emails';

select cron.schedule(
  'send-school-emails',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://greenfieldschool.ng/api/email/send',
    headers := jsonb_build_object('Authorization', 'Bearer PASTE_CRON_SECRET_HERE', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
