create table if not exists public.teacher_class_assignments (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (teacher_id, class_id)
);

create index if not exists teacher_class_assignments_class_idx on public.teacher_class_assignments(class_id);

alter table public.teacher_class_assignments enable row level security;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'teacher';
$$;

create or replace function public.teacher_has_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.teacher_class_assignments tca
    where tca.teacher_id = auth.uid()
      and tca.class_id = target_class_id
      and tca.active = true
  );
$$;

drop policy if exists teacher_class_assignments_admin_all on public.teacher_class_assignments;
create policy teacher_class_assignments_admin_all
  on public.teacher_class_assignments
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists teacher_class_assignments_teacher_select on public.teacher_class_assignments;
create policy teacher_class_assignments_teacher_select
  on public.teacher_class_assignments
  for select
  to authenticated
  using (teacher_id = auth.uid());

drop policy if exists classes_staff_all on public.classes;
create policy classes_staff_all
  on public.classes
  for all
  to authenticated
  using (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(id)
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(id)
  );

drop policy if exists students_staff_all on public.students;
create policy students_staff_all
  on public.students
  for all
  to authenticated
  using (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(class_id)
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(class_id)
  );

drop policy if exists student_attendance_staff_all on public.student_attendance;
create policy student_attendance_staff_all
  on public.student_attendance
  for all
  to authenticated
  using (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(class_id)
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(class_id)
  );

drop policy if exists academic_assessments_staff_all on public.academic_assessments;
create policy academic_assessments_staff_all
  on public.academic_assessments
  for all
  to authenticated
  using (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(class_id)
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(class_id)
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
        and public.teacher_has_class(a.class_id)
    )
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or exists (
      select 1
      from public.academic_assessments a
      where a.id = academic_assessment_scores.assessment_id
        and public.teacher_has_class(a.class_id)
    )
  );

drop policy if exists result_publications_staff_all on public.result_publications;
create policy result_publications_staff_all
  on public.result_publications
  for all
  to authenticated
  using (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(class_id)
  )
  with check (
    public.is_admin()
    or public.current_role() <> 'teacher'
    or public.teacher_has_class(class_id)
  );
