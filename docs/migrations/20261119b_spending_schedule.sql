-- Spending requests: daily reminders and the 7:00 summary
--
-- Runs public.spending_daily_run() at 07:00 Lagos time (06:00 UTC), Monday to Friday. It queues reminder emails for
-- advances due soon or overdue (and tells the cashier and approvers after 3 days, and the top approvers after 7),
-- reminds approvers about requests waiting more than a working day, and sends the morning summary to cashiers and top
-- approvers. The emails go out with the school's other emails (20261110b_email_schedule.sql sends the queue every
-- 5 minutes).
--
-- Run AFTER 20261119_spending_requests.sql. Needs pg_cron (Database → Extensions in Supabase). Safe to run twice.

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'spending-daily';

select cron.schedule('spending-daily', '0 6 * * 1-5', $$ select public.spending_daily_run(); $$);
