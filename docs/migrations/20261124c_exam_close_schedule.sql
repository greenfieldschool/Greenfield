-- Hand in open exam attempts after their session closes, every 15 minutes (24 Nov 2026).
-- Run AFTER 20261124b_exam_hand_in_access_approval.sql. Needs pg_cron (Database → Extensions in Supabase).
-- Safe to run twice.

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'exam-close-ended-sessions';

select cron.schedule('exam-close-ended-sessions', '*/15 * * * *', $$ select public.exam_close_ended_sessions(); $$);
