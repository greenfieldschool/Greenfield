-- Fix "infinite recursion detected in policy for relation academic_assessments".
--
-- The result sheet could not be opened or created because two permission rules checked each other in a loop:
--   * result columns (academic_assessments): "parents and pupils may see a column if their child has a score in it"
--     looked up academic_assessment_scores, and
--   * scores (academic_assessment_scores): "teachers may work on a score if they teach that column's subject"
--     looked up academic_assessments.
-- Postgres refuses any query that would go round that loop, so every read of the result columns failed.
--
-- Both look-ups now go through small security definer functions, which read the other table directly instead of
-- through its permission rules, so the loop is gone. Who can do what is unchanged for staff, with one tightening:
-- the old staff rules said "admin, or anyone who is not a teacher, or a teacher of the subject", which also let
-- parents and pupils through. They now need to be staff; parents and pupils keep their own read-only rules.
--
-- Safe to run twice. Run AFTER 20261026_result_management.sql.

-- ---------------------------------------------------------------------------------------------------------------
-- Fix the results permission loop (academic_assessments <-> academic_assessment_scores)
-- ---------------------------------------------------------------------------------------------------------------

-- Staff other than teachers (admins, front desk, nurse) work on every sheet; teachers only on subjects they teach.
create or replace function public.can_manage_results(p_class uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or (coalesce(public.is_staff(), false) and public.current_role() is distinct from 'teacher')
    or (public.current_role() = 'teacher' and coalesce(public.teacher_teaches(p_class, p_subject), false));
$$;

-- Same check for one result column, looked up without going through academic_assessments' own rules.
create or replace function public.can_manage_assessment(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.can_manage_results(a.class_id, a.subject_id) from public.academic_assessments a where a.id = p_assessment),
    false
  );
$$;

-- A parent or pupil may see a result column when their own child (or they themselves) has a score in it.
create or replace function public.portal_can_see_assessment(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academic_assessment_scores s
    where s.assessment_id = p_assessment
      and (
        exists (
          select 1
          from public.guardian_user_links gul
          join public.student_guardians sg on sg.guardian_id = gul.guardian_id
          where gul.user_id = auth.uid() and sg.student_id = s.student_id
        )
        or exists (
          select 1 from public.student_user_links sul
          where sul.user_id = auth.uid() and sul.student_id = s.student_id
        )
      )
  );
$$;

revoke all on function public.can_manage_results(uuid, uuid) from public, anon;
revoke all on function public.can_manage_assessment(uuid) from public, anon;
revoke all on function public.portal_can_see_assessment(uuid) from public, anon;
-- Policies run as the signed-in user, so the user needs execute on the helpers they call.
grant execute on function public.can_manage_results(uuid, uuid) to authenticated;
grant execute on function public.can_manage_assessment(uuid) to authenticated;
grant execute on function public.portal_can_see_assessment(uuid) to authenticated;

drop policy if exists academic_assessments_staff_all on public.academic_assessments;
create policy academic_assessments_staff_all
  on public.academic_assessments
  for all
  to authenticated
  using (public.can_manage_results(class_id, subject_id))
  with check (public.can_manage_results(class_id, subject_id));

drop policy if exists academic_assessments_parent_student_select on public.academic_assessments;
create policy academic_assessments_parent_student_select
  on public.academic_assessments
  for select
  to authenticated
  using (public.portal_can_see_assessment(id));

drop policy if exists academic_assessment_scores_staff_all on public.academic_assessment_scores;
create policy academic_assessment_scores_staff_all
  on public.academic_assessment_scores
  for all
  to authenticated
  using (public.can_manage_assessment(assessment_id))
  with check (public.can_manage_assessment(assessment_id));
