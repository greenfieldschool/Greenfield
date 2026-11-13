-- Class teachers can see their own class assignments (13 Nov 2026). Safe to run at any time, and safe to run twice.
--
-- The website works out who is a class teacher by reading teacher_class_assignments as the signed-in teacher. That
-- needs the rule "a teacher can see their own assignment rows" (first added in 20260224_teacher_class_assignments.sql).
-- docs/schema.sql never had it, so a database set up from schema.sql (or one where the rule was lost) hides the rows:
-- the teacher is then not recognised as a class teacher, and pages such as the welfare score sheet say "Only the class
-- teacher or an admin can ..." even though the assignment is there. Admins aren't affected.
--
-- This puts both rules back exactly as they were meant to be: teachers see their own rows; only admins add, change or
-- remove assignments. Nothing else changes and no data is touched. The Supabase editor may warn about "destructive
-- operations": that is only "drop policy if exists", which replaces each rule with the same one. Press Run.

-- ---------------------------------------------------------------------------------------------------------------
-- Teacher class assignments: rules
-- ---------------------------------------------------------------------------------------------------------------

alter table public.teacher_class_assignments enable row level security;

drop policy if exists teacher_class_assignments_admin_all on public.teacher_class_assignments;
create policy teacher_class_assignments_admin_all
  on public.teacher_class_assignments
  for all
  to authenticated
  using (coalesce(public.is_admin(), false))
  with check (coalesce(public.is_admin(), false));

drop policy if exists teacher_class_assignments_teacher_select on public.teacher_class_assignments;
create policy teacher_class_assignments_teacher_select
  on public.teacher_class_assignments
  for select
  to authenticated
  using (teacher_id = auth.uid());
