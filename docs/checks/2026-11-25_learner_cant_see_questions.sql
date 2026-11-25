-- Read-only check: why can't Test Learner (GRE/2026/489) see the questions of their open exam?
-- Run the whole thing in the Supabase SQL editor and copy back the two result tables. It changes nothing: it only
-- reads, and everything runs inside a transaction that is rolled back.

-- 1. The live rules on exam_questions (as the database has them, not as our files say).
select polname as rule, case when polpermissive then 'allows' else 'RESTRICTS' end as kind,
       pg_get_expr(polqual, polrelid) as who_can_read
from pg_policy
where polrelid = 'public.exam_questions'::regclass;

-- 2. Pretend to be Test Learner and see what they can read, step by step.
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select sul.user_id::text from public.student_user_links sul
          join public.students s on s.id = sul.student_id where s.admission_number = 'GRE/2026/489'),
  'role', 'authenticated')::text, true);
set local role authenticated;

select '1 my sign-in link' as step, count(*)::text as result from public.student_user_links
union all select '2 my learner record', count(*)::text from public.students
union all select '3 my class', coalesce((select class_id::text from public.students limit 1), 'none')
union all select '4 the session (visible to me)', count(*)::text from public.exam_test_sessions where id = 'c5997c16-f0a3-412e-8beb-b65350e925fd'
union all select '5 session class', coalesce((select class_id::text from public.exam_test_sessions where id = 'c5997c16-f0a3-412e-8beb-b65350e925fd'), 'not visible')
union all select '6 test approved', coalesce((select public.exam_test_approved(test_id)::text from public.exam_test_sessions where id = 'c5997c16-f0a3-412e-8beb-b65350e925fd'), 'not visible')
union all select '7 questions I can read', count(*)::text from public.exam_questions
  where test_id = (select test_id from public.exam_test_sessions where id = 'c5997c16-f0a3-412e-8beb-b65350e925fd')
union all select '8 can read the questions table at all', has_table_privilege('authenticated', 'public.exam_questions', 'select')::text;

rollback;
