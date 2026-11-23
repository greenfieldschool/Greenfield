-- Row checks on five summary views (23 Nov 2026).
--
-- Why: a Postgres view runs with its owner's rights unless it says otherwise, so it skips the row rules (RLS) on
-- the tables underneath. These five views had no row check of their own and the public key (signed out, "anon")
-- could select from them, so anyone could read every pupil's term averages, subject grades, attendance,
-- discipline and incident counts, exam marks and names. Children's data falls under NDPA 2023.
--
-- What this does:
--   * Result and welfare summaries (academic_student_subject_term_summary, academic_student_term_summary,
--     welfare_student_term_summary): nothing in the app reads them, and the tables underneath already have the
--     right row rules for every role, so the views now run with the reader's own rights (security_invoker).
--     Each reader sees exactly the scores, attendance and records they could already read from the tables.
--   * Exam views (exam_attempt_list_v, exam_session_summary_v): read by the staff exam pages and the exam
--     conductor page. Conductors may not be staff and cannot read pupils' names from the students table, so
--     these views keep running as the owner but only return rows for staff, or for a conductor assigned to
--     that session (can_see_exam_session, a definite true/false).
--   * The signed-out key can no longer select from any of the five.
--
-- Safe to run twice. No order needed against other migrations (works before or after 20261122_payment_plans).
-- The SQL editor may warn about "destructive operations": the views are replaced with the same columns, and
-- nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------
-- View row checks: result, welfare and exam summaries (see docs/migrations/20261123_view_row_checks.sql)
-- ---------------------------------------------------------------------------------------------------------------

-- 1. Result and welfare summaries: run as the reader, so the tables' row rules apply.
alter view public.academic_student_subject_term_summary set (security_invoker = true);
alter view public.academic_student_term_summary set (security_invoker = true);
alter view public.welfare_student_term_summary set (security_invoker = true);

-- 2. Exam views: staff, or a conductor assigned to the session.
create or replace function public.can_see_exam_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_staff(), false)
      or exists (
        select 1
        from public.exam_conductor_user_links l
        join public.exam_session_conductors sc on sc.conductor_id = l.conductor_id
        where l.user_id = auth.uid()
          and sc.session_id = p_session
      );
$$;
revoke all on function public.can_see_exam_session(uuid) from public, anon;
grant execute on function public.can_see_exam_session(uuid) to authenticated;

create or replace view public.exam_attempt_list_v as
select
  a.id as attempt_id,
  a.session_id,
  a.student_id,
  st.admission_number,
  st.first_name,
  st.last_name,
  a.obtained_marks,
  a.max_marks,
  a.percent,
  a.status,
  a.locked_at,
  a.lock_count,
  a.started_at,
  a.submitted_at
from public.exam_attempts a
join public.students st on st.id = a.student_id
where public.can_see_exam_session(a.session_id);

create or replace view public.exam_session_summary_v as
select
  s.id as session_id,
  s.test_id,
  t.name as test_name,
  t.subject_id,
  sub.name as subject_name,
  s.class_id,
  c.level as class_level,
  c.name as class_name,
  s.starts_at,
  s.ends_at,
  s.status,
  count(a.id) filter (where a.submitted_at is not null) as completions,
  count(a.id) filter (where a.submitted_at is null) as pending,
  count(a.id) filter (where a.locked_at is not null) as locked,
  coalesce(avg(a.percent), 0) as average_percent,
  coalesce(max(a.percent), 0) as highest_percent,
  coalesce(min(a.percent), 0) as lowest_percent
from public.exam_test_sessions s
join public.exam_tests t on t.id = s.test_id
left join public.subjects sub on sub.id = t.subject_id
left join public.classes c on c.id = s.class_id
left join public.exam_attempts a on a.session_id = s.id
where public.can_see_exam_session(s.id)
group by s.id, s.test_id, t.name, t.subject_id, sub.name, s.class_id, c.level, c.name, s.starts_at, s.ends_at, s.status;

-- 3. Nobody signed out reads any of them.
revoke all on public.academic_student_subject_term_summary from anon, authenticated;
revoke all on public.academic_student_term_summary from anon, authenticated;
revoke all on public.welfare_student_term_summary from anon, authenticated;
revoke all on public.exam_attempt_list_v from anon, authenticated;
revoke all on public.exam_session_summary_v from anon, authenticated;
grant select on public.academic_student_subject_term_summary to authenticated;
grant select on public.academic_student_term_summary to authenticated;
grant select on public.welfare_student_term_summary to authenticated;
grant select on public.exam_attempt_list_v to authenticated;
grant select on public.exam_session_summary_v to authenticated;
