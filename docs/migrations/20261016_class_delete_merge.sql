-- Deleting and merging classes
--
-- 1. class_usage(class) counts everything that points at a class, shown on /admin/classes/[id].
-- 2. delete_class(class) deletes a class only when nothing uses it: no students (any status), fee schedules,
--    results, attendance, result publications or exam sessions. Its subject list and teacher assignments
--    are setup only and go with it.
-- 3. merge_classes(source, target) moves everything from a duplicate class onto the class being kept, then
--    deletes the duplicate:
--    - students move (and take the kept class's level), as do attendance and exam sessions
--    - results: a column (subject, term, type) that the kept class already has gets the duplicate's scores
--      copied in (scores already on the kept class win); otherwise the column is moved
--    - subjects offered and teacher assignments are added to the kept class
--    - result publications move unless the kept class already has the same one
--    - fee schedules move; if both classes have a schedule for the same year and term the merge stops, because
--      two fee schedules cannot be combined automatically. Fix that schedule first.
-- Only admins can run 2 and 3. Run the whole file once in the Supabase SQL editor. Re-running is harmless.

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
    'teachers', (select count(*) from public.teacher_class_assignments where class_id = p_class)
  )
  where coalesce(public.is_staff(), false);
$$;

revoke all on function public.class_usage(uuid) from public, anon;
grant execute on function public.class_usage(uuid) to authenticated;

create or replace function public.delete_class(p_class uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  usage jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can delete classes';
  end if;
  if not exists (select 1 from public.classes where id = p_class) then
    raise exception 'This class no longer exists';
  end if;

  usage := public.class_usage(p_class);
  if (usage->>'students')::int > 0
    or (usage->>'fee_schedules')::int > 0
    or (usage->>'assessments')::int > 0
    or (usage->>'attendance')::int > 0
    or (usage->>'publications')::int > 0
    or (usage->>'exam_sessions')::int > 0 then
    raise exception 'This class is in use (students, fees, results, attendance or exams). Merge it into another class or deactivate it instead.';
  end if;

  delete from public.classes where id = p_class;
end;
$$;

revoke all on function public.delete_class(uuid) from public, anon;
grant execute on function public.delete_class(uuid) to authenticated;

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

  -- Keep the class active if either one was.
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
