-- Teachers assigned to several classes and to subjects
--
-- Until now a teacher was assigned to classes only, and a teacher could open every exam test. Now:
--
--   Class teacher    (teacher_class_assignments, one row per class, as before)
--                    Sees the class's students, takes its attendance and works on every subject the class
--                    offers (Academics > Class subjects; every subject if the class has none set up).
--   Subject teacher  (teacher_subject_assignments, one row per class + subject)
--                    Sees the students of that class and works on that subject only: result scores,
--                    assessments, and the CBT tests / questions for that subject. No attendance, no
--                    editing students, no publishing results.
--
-- A teacher can be both, e.g. class teacher of Year 1 and the French teacher in every class.
-- The pages are managed by admins at Academics > Teacher assignments.
-- Teachers with only class assignments keep working as before; they just get the class's subjects.
--
-- This file also:
--  - limits teachers to the CBT tests, questions, solutions and sessions of the subjects they teach
--    (tests they created themselves stay theirs); admins and other staff are unchanged,
--  - fills exam_tests.created_by automatically,
--  - teaches merge_subjects, class_usage and merge_classes about subject assignments.
-- Run the whole file once in the Supabase SQL editor. Re-running is harmless.
-- Needs 20261009_subject_management.sql and 20261016_class_delete_merge.sql to have been run first.

-- ---------------------------------------------------------------------------------------------------------------
-- Subject assignments
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.teacher_subject_assignments (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id, subject_id)
);

create index if not exists teacher_subject_assignments_class_idx on public.teacher_subject_assignments(class_id);
create index if not exists teacher_subject_assignments_subject_idx on public.teacher_subject_assignments(subject_id);

alter table public.teacher_subject_assignments enable row level security;

drop policy if exists teacher_subject_assignments_admin_all on public.teacher_subject_assignments;
create policy teacher_subject_assignments_admin_all
  on public.teacher_subject_assignments
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists teacher_subject_assignments_teacher_select on public.teacher_subject_assignments;
create policy teacher_subject_assignments_teacher_select
  on public.teacher_subject_assignments
  for select
  to authenticated
  using (teacher_id = auth.uid());

-- ---------------------------------------------------------------------------------------------------------------
-- Who may work on what
-- ---------------------------------------------------------------------------------------------------------------

-- Does the signed-in teacher teach this subject in this class? (class teacher: any subject the class offers)
create or replace function public.teacher_teaches(p_class uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.teacher_subject_assignments a
      where a.teacher_id = auth.uid() and a.active = true
        and a.class_id = p_class and a.subject_id = p_subject
    )
    or (
      public.teacher_has_class(p_class)
      and (
        p_subject is null
        or not exists (select 1 from public.class_subjects cs where cs.class_id = p_class)
        or exists (select 1 from public.class_subjects cs where cs.class_id = p_class and cs.subject_id = p_subject)
      )
    );
$$;

-- Class teacher of this class, or teaches any subject in it (enough to see the class and its students).
create or replace function public.teacher_has_class_or_subject(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.teacher_has_class(p_class)
    or exists (
      select 1
      from public.teacher_subject_assignments a
      where a.teacher_id = auth.uid() and a.active = true and a.class_id = p_class
    );
$$;

-- Does the signed-in teacher teach this subject in any class? (decides who may set its CBT tests)
create or replace function public.teacher_teaches_subject(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_subject is not null
    and (
      exists (
        select 1
        from public.teacher_subject_assignments a
        where a.teacher_id = auth.uid() and a.active = true and a.subject_id = p_subject
      )
      or exists (
        select 1
        from public.teacher_class_assignments tca
        where tca.teacher_id = auth.uid() and tca.active = true
          and (
            not exists (select 1 from public.class_subjects cs where cs.class_id = tca.class_id)
            or exists (select 1 from public.class_subjects cs where cs.class_id = tca.class_id and cs.subject_id = p_subject)
          )
      )
    );
$$;

-- May the signed-in staff member edit this test (and its questions, solutions and sessions)?
create or replace function public.can_manage_test(p_test uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(public.is_admin(), false)
    or (coalesce(public.is_staff(), false) and public.current_role() <> 'teacher')
    or (
      public.current_role() = 'teacher'
      and exists (
        select 1
        from public.exam_tests t
        where t.id = p_test
          and (t.created_by = auth.uid() or public.teacher_teaches_subject(t.subject_id))
      )
    );
$$;

revoke all on function public.teacher_teaches(uuid, uuid) from public, anon;
revoke all on function public.teacher_has_class_or_subject(uuid) from public, anon;
revoke all on function public.teacher_teaches_subject(uuid) from public, anon;
revoke all on function public.can_manage_test(uuid) from public, anon;
grant execute on function public.teacher_teaches(uuid, uuid) to authenticated;
grant execute on function public.teacher_has_class_or_subject(uuid) to authenticated;
grant execute on function public.teacher_teaches_subject(uuid) to authenticated;
grant execute on function public.can_manage_test(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Classes and students: subject teachers can read their classes (class teachers keep full access)
-- ---------------------------------------------------------------------------------------------------------------

drop policy if exists classes_subject_teacher_select on public.classes;
create policy classes_subject_teacher_select
  on public.classes
  for select
  to authenticated
  using (public.teacher_has_class_or_subject(id));

drop policy if exists students_subject_teacher_select on public.students;
create policy students_subject_teacher_select
  on public.students
  for select
  to authenticated
  using (public.teacher_has_class_or_subject(class_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Results: teachers work only on the subjects they teach in each class
-- ---------------------------------------------------------------------------------------------------------------

drop policy if exists academic_assessments_staff_all on public.academic_assessments;
create policy academic_assessments_staff_all
  on public.academic_assessments
  for all
  to authenticated
  using (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_teaches(class_id, subject_id)
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_teaches(class_id, subject_id)
  );

drop policy if exists academic_assessment_scores_staff_all on public.academic_assessment_scores;
create policy academic_assessment_scores_staff_all
  on public.academic_assessment_scores
  for all
  to authenticated
  using (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or exists (
      select 1
      from public.academic_assessments a
      where a.id = academic_assessment_scores.assessment_id
        and public.teacher_teaches(a.class_id, a.subject_id)
    )
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or exists (
      select 1
      from public.academic_assessments a
      where a.id = academic_assessment_scores.assessment_id
        and public.teacher_teaches(a.class_id, a.subject_id)
    )
  );

-- ---------------------------------------------------------------------------------------------------------------
-- CBT: teachers set tests and questions only for the subjects they teach
-- ---------------------------------------------------------------------------------------------------------------

alter table public.exam_tests alter column created_by set default auth.uid();

drop policy if exists exam_tests_staff_all on public.exam_tests;
create policy exam_tests_staff_all
  on public.exam_tests
  for all
  to authenticated
  using (
    public.is_admin()
    or (public.is_staff() and public.current_role() <> 'teacher')
    or (public.current_role() = 'teacher' and (created_by = auth.uid() or public.teacher_teaches_subject(subject_id)))
  )
  with check (
    public.is_admin()
    or (public.is_staff() and public.current_role() <> 'teacher')
    or (public.current_role() = 'teacher' and public.teacher_teaches_subject(subject_id))
  );

drop policy if exists exam_questions_staff_all on public.exam_questions;
create policy exam_questions_staff_all
  on public.exam_questions
  for all
  to authenticated
  using (public.can_manage_test(test_id))
  with check (public.can_manage_test(test_id));

drop policy if exists exam_question_solutions_staff_all on public.exam_question_solutions;
create policy exam_question_solutions_staff_all
  on public.exam_question_solutions
  for all
  to authenticated
  using (
    exists (select 1 from public.exam_questions q where q.id = exam_question_solutions.question_id and public.can_manage_test(q.test_id))
  )
  with check (
    exists (select 1 from public.exam_questions q where q.id = exam_question_solutions.question_id and public.can_manage_test(q.test_id))
  );

drop policy if exists exam_sessions_staff_all on public.exam_test_sessions;
create policy exam_sessions_staff_all
  on public.exam_test_sessions
  for all
  to authenticated
  using (public.can_manage_test(test_id))
  with check (public.can_manage_test(test_id));

-- ---------------------------------------------------------------------------------------------------------------
-- Merging and deleting keep subject assignments in step
-- ---------------------------------------------------------------------------------------------------------------

-- Same as before, plus: teachers assigned to the duplicate subject are assigned to the kept one.
create or replace function public.merge_subjects_unchecked(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  src_assessment record;
  match_id uuid;
  moved_assessments int := 0;
  combined_assessments int := 0;
  moved_tests int := 0;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'Choose two different subjects to merge';
  end if;
  if not exists (select 1 from public.subjects where id = p_source) then
    raise exception 'The subject to remove no longer exists';
  end if;
  if not exists (select 1 from public.subjects where id = p_target) then
    raise exception 'The subject to keep no longer exists';
  end if;

  for src_assessment in
    select * from public.academic_assessments where subject_id = p_source
  loop
    select a.id into match_id
    from public.academic_assessments a
    where a.subject_id = p_target
      and a.class_id is not distinct from src_assessment.class_id
      and a.academic_year_id is not distinct from src_assessment.academic_year_id
      and a.academic_term_id is not distinct from src_assessment.academic_term_id
      and a.assessment_type = src_assessment.assessment_type
    order by a.created_at
    limit 1;

    if match_id is null then
      update public.academic_assessments set subject_id = p_target where id = src_assessment.id;
      moved_assessments := moved_assessments + 1;
    else
      insert into public.academic_assessment_scores (assessment_id, student_id, score, remarks, graded_by)
      select match_id, sc.student_id, sc.score, sc.remarks, sc.graded_by
      from public.academic_assessment_scores sc
      where sc.assessment_id = src_assessment.id
      on conflict (assessment_id, student_id) do nothing;

      delete from public.academic_assessments where id = src_assessment.id;
      combined_assessments := combined_assessments + 1;
    end if;
  end loop;

  update public.exam_tests set subject_id = p_target where subject_id = p_source;
  get diagnostics moved_tests = row_count;

  insert into public.class_subjects (class_id, subject_id)
  select cs.class_id, p_target from public.class_subjects cs where cs.subject_id = p_source
  on conflict do nothing;

  insert into public.teacher_subject_assignments (teacher_id, class_id, subject_id, active)
  select tsa.teacher_id, tsa.class_id, p_target, tsa.active
  from public.teacher_subject_assignments tsa
  where tsa.subject_id = p_source
  on conflict (teacher_id, class_id, subject_id) do update
    set active = public.teacher_subject_assignments.active or excluded.active;

  update public.subjects t
  set active = t.active or s.active
  from public.subjects s
  where t.id = p_target and s.id = p_source;

  delete from public.subjects where id = p_source;

  return jsonb_build_object(
    'moved_assessments', moved_assessments,
    'combined_assessments', combined_assessments,
    'moved_tests', moved_tests
  );
end;
$$;

revoke all on function public.merge_subjects_unchecked(uuid, uuid) from public, anon, authenticated;

-- class_usage / delete_class / merge_classes (from 20261016_class_delete_merge.sql) with subject assignments.
create or replace function public.class_usage(p_class uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'students', (select count(*) from public.students where class_id = p_class),
    'fee_schedules', (select count(*) from public.fee_schedules where class_id = p_class),
    'assessments', (select count(*) from public.academic_assessments where class_id = p_class),
    'attendance', (select count(*) from public.student_attendance where class_id = p_class),
    'publications', (select count(*) from public.result_publications where class_id = p_class),
    'exam_sessions', (select count(*) from public.exam_test_sessions where class_id = p_class),
    'subjects', (select count(*) from public.class_subjects where class_id = p_class),
    'teachers', (select count(*) from public.teacher_class_assignments where class_id = p_class),
    'teacher_subjects', (select count(*) from public.teacher_subject_assignments where class_id = p_class)
  )
  where coalesce(public.is_staff(), false);
$$;

revoke all on function public.class_usage(uuid) from public, anon;
grant execute on function public.class_usage(uuid) to authenticated;

create or replace function public.merge_classes(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_level public.school_level;
  src_assessment record;
  match_id uuid;
  moved_students int := 0;
  moved_assessments int := 0;
  combined_assessments int := 0;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can merge classes';
  end if;
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'Choose two different classes to merge';
  end if;
  if not exists (select 1 from public.classes where id = p_source) then
    raise exception 'The class to remove no longer exists';
  end if;
  select level into target_level from public.classes where id = p_target;
  if target_level is null then
    raise exception 'The class to keep no longer exists';
  end if;

  if exists (
    select 1
    from public.fee_schedules s
    join public.fee_schedules t
      on t.class_id = p_target
     and t.academic_year_id = s.academic_year_id
     and t.academic_term_id is not distinct from s.academic_term_id
    where s.class_id = p_source
  ) then
    raise exception 'Both classes have a fee schedule for the same year and term. Delete or fix the duplicate fee schedule first, then merge.';
  end if;

  update public.students set class_id = p_target, level = target_level where class_id = p_source;
  get diagnostics moved_students = row_count;

  update public.fee_schedules set class_id = p_target where class_id = p_source;

  for src_assessment in
    select * from public.academic_assessments where class_id = p_source
  loop
    select a.id into match_id
    from public.academic_assessments a
    where a.class_id = p_target
      and a.subject_id is not distinct from src_assessment.subject_id
      and a.academic_year_id is not distinct from src_assessment.academic_year_id
      and a.academic_term_id is not distinct from src_assessment.academic_term_id
      and a.assessment_type = src_assessment.assessment_type
    order by a.created_at
    limit 1;

    if match_id is null then
      update public.academic_assessments set class_id = p_target where id = src_assessment.id;
      moved_assessments := moved_assessments + 1;
    else
      insert into public.academic_assessment_scores (assessment_id, student_id, score, remarks, graded_by)
      select match_id, sc.student_id, sc.score, sc.remarks, sc.graded_by
      from public.academic_assessment_scores sc
      where sc.assessment_id = src_assessment.id
      on conflict (assessment_id, student_id) do nothing;

      delete from public.academic_assessments where id = src_assessment.id;
      combined_assessments := combined_assessments + 1;
    end if;
  end loop;

  update public.student_attendance set class_id = p_target where class_id = p_source;
  update public.exam_test_sessions set class_id = p_target where class_id = p_source;

  update public.result_publications p
  set class_id = p_target
  where p.class_id = p_source
    and not exists (
      select 1
      from public.result_publications t
      where t.class_id = p_target
        and t.scope = p.scope
        and t.academic_year_id is not distinct from p.academic_year_id
        and t.academic_term_id is not distinct from p.academic_term_id
        and t.level is not distinct from p.level
    );
  delete from public.result_publications where class_id = p_source;

  insert into public.class_subjects (class_id, subject_id)
  select p_target, cs.subject_id from public.class_subjects cs where cs.class_id = p_source
  on conflict do nothing;

  insert into public.teacher_class_assignments (teacher_id, class_id, active)
  select tca.teacher_id, p_target, tca.active from public.teacher_class_assignments tca where tca.class_id = p_source
  on conflict (teacher_id, class_id) do update
    set active = public.teacher_class_assignments.active or excluded.active;

  insert into public.teacher_subject_assignments (teacher_id, class_id, subject_id, active)
  select tsa.teacher_id, p_target, tsa.subject_id, tsa.active
  from public.teacher_subject_assignments tsa
  where tsa.class_id = p_source
  on conflict (teacher_id, class_id, subject_id) do update
    set active = public.teacher_subject_assignments.active or excluded.active;

  update public.classes t
  set active = t.active or s.active
  from public.classes s
  where t.id = p_target and s.id = p_source;

  delete from public.classes where id = p_source;

  return jsonb_build_object(
    'moved_students', moved_students,
    'moved_assessments', moved_assessments,
    'combined_assessments', combined_assessments
  );
end;
$$;

revoke all on function public.merge_classes(uuid, uuid) from public, anon;
grant execute on function public.merge_classes(uuid, uuid) to authenticated;
