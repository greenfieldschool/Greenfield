-- Result sheets: admins and teachers only. Run AFTER 20261111_lock_role_changes.sql (either order works).
--
-- Until now, front desk and nurse accounts could open, fill in and change every result sheet (columns and scores)
-- and publish results, like an admin. The school decided only admins and teachers work on results:
--   * admins: every class and subject (unchanged);
--   * teachers: only the subjects they teach in their classes (unchanged);
--   * front desk and nurse: no access to result sheet columns or scores, and cannot publish results.
-- Front desk can still read the Published results archive (finished, published report cards), as before.
-- Assignments, lesson notes, online classes and star videos are NOT changed by this update.
--
-- Safe to run twice. The SQL editor may warn about "destructive operations": they are the "drop policy if exists"
-- lines that replace the old rules. Nothing is deleted.

-- ---------------------------------------------------------------------------------------------------------------
-- Who may work on a result sheet: admins, and teachers for the subjects they teach in that class.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.can_edit_results(p_class uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or (public.current_role() is not distinct from 'teacher' and coalesce(public.teacher_teaches(p_class, p_subject), false));
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
    (select public.can_edit_results(a.class_id, a.subject_id) from public.academic_assessments a where a.id = p_assessment),
    false
  );
$$;

revoke all on function public.can_edit_results(uuid, uuid) from public, anon;
revoke all on function public.can_manage_assessment(uuid) from public, anon;
-- Policies run as the signed-in user, so the user needs execute on the helpers they call.
grant execute on function public.can_edit_results(uuid, uuid) to authenticated;
grant execute on function public.can_manage_assessment(uuid) to authenticated;

-- Result columns (and the scores below, through can_manage_assessment).
drop policy if exists academic_assessments_staff_all on public.academic_assessments;
create policy academic_assessments_staff_all
  on public.academic_assessments
  for all
  to authenticated
  using (public.can_edit_results(class_id, subject_id))
  with check (public.can_edit_results(class_id, subject_id));

drop policy if exists academic_assessment_scores_staff_all on public.academic_assessment_scores;
create policy academic_assessment_scores_staff_all
  on public.academic_assessment_scores
  for all
  to authenticated
  using (public.can_manage_assessment(assessment_id))
  with check (public.can_manage_assessment(assessment_id));

-- Publishing: admins, or the class teacher. Only admins may unpublish (unpublish_term_results, with a reason).
drop policy if exists result_publications_staff_write on public.result_publications;
create policy result_publications_staff_write
  on public.result_publications
  for insert
  to authenticated
  with check (coalesce(public.is_admin(), false) or coalesce(public.teacher_has_class(class_id), false));

drop policy if exists result_publications_staff_update on public.result_publications;
create policy result_publications_staff_update
  on public.result_publications
  for update
  to authenticated
  using (coalesce(public.is_admin(), false) or coalesce(public.teacher_has_class(class_id), false))
  with check (coalesce(public.is_admin(), false) or coalesce(public.teacher_has_class(class_id), false));
