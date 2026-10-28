-- Close a gap that let parents and pupils read and change school records directly.
--
-- Since 20260224_teacher_class_assignments.sql the staff rules on classes, students and student_attendance read
-- "admin, or anyone who is not a teacher, or a teacher of the class". A parent or pupil is "not a teacher", so a
-- signed-in parent could list every pupil, edit any pupil's record or attendance, and rename or delete classes.
-- The website never offered this, but the database allowed it to anyone who called it directly.
--
-- Now:
--   * students and student_attendance: staff only (teachers for their own classes, as before). Parents and
--     pupils keep their existing read-only rules for their own children / themselves.
--   * classes: parents, pupils and exam conductors may read class names (the portal, class chats and the
--     conductor screens show them); only staff may add, change or delete classes. Teachers still see only their
--     own classes.
-- result_publications had the same problem and was already fixed by 20261023_result_audit.sql.
--
-- Safe to run twice. Can run before or after 20261028_fix_results_policy_loop.sql.

-- ---------------------------------------------------------------------------------------------------------------
-- Close the parent/pupil access gap on classes, students and attendance
-- ---------------------------------------------------------------------------------------------------------------

-- Admins and non-teaching staff (front desk, nurse) work on every class; teachers only on their own classes.
-- Parents, pupils and unknown roles get a definite false.
create or replace function public.staff_can_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or (coalesce(public.is_staff(), false) and public.current_role() is distinct from 'teacher')
    or (public.current_role() = 'teacher' and coalesce(public.teacher_has_class(p_class), false));
$$;

revoke all on function public.staff_can_class(uuid) from public, anon;
-- Policies run as the signed-in user, so the user needs execute on it.
grant execute on function public.staff_can_class(uuid) to authenticated;

drop policy if exists classes_staff_all on public.classes;
create policy classes_staff_all
  on public.classes
  for all
  to authenticated
  using (public.staff_can_class(id))
  with check (public.staff_can_class(id));

-- Parents, pupils and exam conductors read class names. Staff are covered above, and teachers keep seeing only
-- their own classes so their class lists don't change.
drop policy if exists classes_portal_select on public.classes;
create policy classes_portal_select
  on public.classes
  for select
  to authenticated
  using (not coalesce(public.is_staff(), false));

drop policy if exists students_staff_all on public.students;
create policy students_staff_all
  on public.students
  for all
  to authenticated
  using (public.staff_can_class(class_id))
  with check (public.staff_can_class(class_id));

drop policy if exists student_attendance_staff_all on public.student_attendance;
create policy student_attendance_staff_all
  on public.student_attendance
  for all
  to authenticated
  using (public.staff_can_class(class_id))
  with check (public.staff_can_class(class_id));
