-- Term reports: flexible result-sheet columns, welfare scored out of 100, and report card comments.
--
-- 1. Result sheet columns are no longer fixed to 1st CA / 2nd CA / Objective / Theory. Each class + subject + term
--    has its own columns (academic_assessments with on_result_sheet = true), e.g. "1st CA (Obj)", "Assignment 2",
--    "Exam (Theory)". A subject's score is (sum of scores / sum of column max scores) x 100.
--    result_layouts holds the default columns new sheets start with: school-wide, per level, per class, or per
--    class + subject (most specific wins).
-- 2. Welfare is scored out of 100 from welfare_criteria (per level). Each criterion is either rated 1-5 by the class
--    teacher (welfare_ratings) or worked out from records: attendance, punctuality, uniform checks, conduct.
-- 3. report_card_comments holds the class teacher's and head teacher's comments per student per term.
-- Term total on the report card = average of the academic average and the welfare score.
-- 4. Merging subjects or classes now matches sheet columns by name and carries the new data along.
-- Run the whole file once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Result sheet columns
-- ---------------------------------------------------------------------------------------------------------------

alter table public.academic_assessments add column if not exists on_result_sheet boolean not null default false;
alter table public.academic_assessments add column if not exists position int not null default 0;
alter table public.academic_assessments add column if not exists component_group text;

alter table public.academic_assessments drop constraint if exists academic_assessments_component_group_check;
alter table public.academic_assessments
  add constraint academic_assessments_component_group_check
  check (component_group is null or component_group in ('ca', 'exam', 'other'));

-- Existing sheets (the four fixed columns) become ordinary sheet columns.
update public.academic_assessments
set
  on_result_sheet = true,
  position = case assessment_type
    when 'first_ca' then 1
    when 'second_ca' then 2
    when 'exam_objective' then 3
    when 'exam_theory' then 4
  end,
  component_group = case when assessment_type in ('first_ca', 'second_ca') then 'ca' else 'exam' end
where assessment_type in ('first_ca', 'second_ca', 'exam_objective', 'exam_theory')
  and on_result_sheet = false;

create index if not exists academic_assessments_sheet_idx
  on public.academic_assessments(class_id, subject_id, academic_term_id)
  where on_result_sheet;

-- Default columns for new sheets. components: [{"label": "1st CA", "group": "ca", "max": 20}, ...]
create table if not exists public.result_layouts (
  id uuid primary key default gen_random_uuid(),
  level public.school_level,
  class_id uuid references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  components jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint result_layouts_scope_uniq unique nulls not distinct (level, class_id, subject_id),
  constraint result_layouts_components_is_array check (jsonb_typeof(components) = 'array')
);

alter table public.result_layouts enable row level security;

drop policy if exists result_layouts_staff_select on public.result_layouts;
create policy result_layouts_staff_select
  on public.result_layouts
  for select
  to authenticated
  using (public.is_staff());

drop policy if exists result_layouts_admin_all on public.result_layouts;
create policy result_layouts_admin_all
  on public.result_layouts
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Teachers may save the layout for a class + subject they teach.
drop policy if exists result_layouts_teacher_write on public.result_layouts;
create policy result_layouts_teacher_write
  on public.result_layouts
  for all
  to authenticated
  using (class_id is not null and subject_id is not null and public.teacher_teaches(class_id, subject_id))
  with check (class_id is not null and subject_id is not null and public.teacher_teaches(class_id, subject_id));

-- School-wide default: the previous fixed layout.
insert into public.result_layouts (level, class_id, subject_id, components)
values (
  null, null, null,
  '[{"label": "1st CA", "group": "ca", "max": 20},
    {"label": "2nd CA", "group": "ca", "max": 20},
    {"label": "Exam (Objective)", "group": "exam", "max": 30},
    {"label": "Exam (Theory)", "group": "exam", "max": 30}]'::jsonb
)
on conflict on constraint result_layouts_scope_uniq do nothing;

-- Subject score per student per term. Sheet columns: score / max x 100. Older weighted assessments (not on a
-- sheet) keep their weighted calculation, and are only used when the subject has no sheet that term.
create or replace view public.academic_student_subject_term_summary as
with sheet_max as (
  select a.academic_year_id, a.academic_term_id, a.class_id, a.subject_id, sum(a.max_score) as max_total
  from public.academic_assessments a
  where a.on_result_sheet
  group by a.academic_year_id, a.academic_term_id, a.class_id, a.subject_id
),
sheet as (
  select
    sc.student_id,
    a.academic_year_id,
    a.academic_term_id,
    a.class_id,
    a.subject_id,
    sum(sc.score) / nullif(m.max_total, 0) * 100 as weighted_score
  from public.academic_assessment_scores sc
  join public.academic_assessments a on a.id = sc.assessment_id and a.on_result_sheet
  join sheet_max m
    on m.class_id is not distinct from a.class_id
   and m.subject_id = a.subject_id
   and m.academic_year_id is not distinct from a.academic_year_id
   and m.academic_term_id is not distinct from a.academic_term_id
  group by sc.student_id, a.academic_year_id, a.academic_term_id, a.class_id, a.subject_id, m.max_total
),
legacy as (
  select
    sc.student_id,
    a.academic_year_id,
    a.academic_term_id,
    a.class_id,
    a.subject_id,
    coalesce(sum(case when w.weight is not null then (sc.score / nullif(a.max_score, 0)) * 100 * (w.weight / 100) else 0 end), 0)
      as weighted_score
  from public.academic_assessment_scores sc
  join public.academic_assessments a on a.id = sc.assessment_id and not a.on_result_sheet
  left join public.classes c on c.id = a.class_id
  left join public.assessment_weights w
    on w.active = true
   and w.level = c.level
   and w.assessment_type = a.assessment_type
  group by sc.student_id, a.academic_year_id, a.academic_term_id, a.class_id, a.subject_id
),
combined as (
  select * from sheet
  union all
  select l.*
  from legacy l
  where not exists (
    select 1 from sheet s
    where s.student_id = l.student_id
      and s.subject_id = l.subject_id
      and s.class_id is not distinct from l.class_id
      and s.academic_year_id is not distinct from l.academic_year_id
      and s.academic_term_id is not distinct from l.academic_term_id
  )
)
select
  b.student_id,
  b.academic_year_id,
  b.academic_term_id,
  b.class_id,
  c.level as class_level,
  b.subject_id,
  sub.name as subject_name,
  round(b.weighted_score, 2) as weighted_score,
  gs.grade
from combined b
join public.subjects sub on sub.id = b.subject_id
left join public.classes c on c.id = b.class_id
left join public.grading_scales gs
  on gs.active = true
 and gs.level = c.level
 and round(b.weighted_score, 2) between gs.min_score and gs.max_score;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Welfare criteria and ratings
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.welfare_criteria (
  id uuid primary key default gen_random_uuid(),
  level public.school_level not null,
  name text not null,
  description text,
  -- rating: class teacher rates 1-5. attendance/punctuality/uniform/conduct: worked out from the welfare records.
  source text not null check (source in ('rating', 'attendance', 'punctuality', 'uniform', 'conduct')),
  max_points numeric(6,2) not null check (max_points > 0),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level, name)
);

alter table public.welfare_criteria enable row level security;

drop policy if exists welfare_criteria_select on public.welfare_criteria;
create policy welfare_criteria_select
  on public.welfare_criteria
  for select
  to authenticated
  using (true);

drop policy if exists welfare_criteria_admin_all on public.welfare_criteria;
create policy welfare_criteria_admin_all
  on public.welfare_criteria
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Default criteria for every level (100 points). Admins can change them under Welfare -> Welfare criteria.
insert into public.welfare_criteria (level, name, description, source, max_points, position)
select lvl, d.name, d.description, d.source, d.max_points, d.position
from unnest(array['creche', 'primary', 'secondary']::public.school_level[]) as lvl
cross join (
  values
    ('Attendance', 'Days present out of the days attendance was taken this term.', 'attendance', 20, 1),
    ('Punctuality', 'Days on time out of the days present (from "late" attendance marks).', 'punctuality', 10, 2),
    ('Uniform & appearance', 'Uniform checks passed out of the checks done this term.', 'uniform', 10, 3),
    ('Conduct', 'Starts full; discipline records and incidents take points off by severity.', 'conduct', 15, 4),
    ('Neatness', 'Rated 1-5 by the class teacher.', 'rating', 5, 5),
    ('Politeness & respect', 'Rated 1-5 by the class teacher.', 'rating', 10, 6),
    ('Honesty', 'Rated 1-5 by the class teacher.', 'rating', 5, 7),
    ('Cooperation & relationship with others', 'Rated 1-5 by the class teacher.', 'rating', 10, 8),
    ('Attentiveness & self-control', 'Rated 1-5 by the class teacher.', 'rating', 5, 9),
    ('Leadership & responsibility', 'Rated 1-5 by the class teacher.', 'rating', 5, 10),
    ('Participation (sports, clubs, crafts)', 'Rated 1-5 by the class teacher.', 'rating', 5, 11)
) as d(name, description, source, max_points, position)
on conflict (level, name) do nothing;

create table if not exists public.welfare_ratings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  criterion_id uuid not null references public.welfare_criteria(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  rated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_term_id, criterion_id)
);

create index if not exists welfare_ratings_class_term_idx on public.welfare_ratings(class_id, academic_term_id);

alter table public.welfare_ratings enable row level security;

-- Admins and non-teaching staff: everything. Teachers: the classes they are class teacher of.
drop policy if exists welfare_ratings_staff_all on public.welfare_ratings;
create policy welfare_ratings_staff_all
  on public.welfare_ratings
  for all
  to authenticated
  using (
    public.is_admin()
    or (public.is_staff() and public.current_role() <> 'teacher')
    or public.teacher_has_class(class_id)
  )
  with check (
    public.is_admin()
    or (public.is_staff() and public.current_role() <> 'teacher')
    or public.teacher_has_class(class_id)
  );

drop policy if exists welfare_ratings_portal_select on public.welfare_ratings;
create policy welfare_ratings_portal_select
  on public.welfare_ratings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid() and sg.student_id = welfare_ratings.student_id
    )
    or exists (
      select 1 from public.student_user_links sul
      where sul.user_id = auth.uid() and sul.student_id = welfare_ratings.student_id
    )
  );

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Report card comments
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.report_card_comments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  class_teacher_comment text,
  head_comment text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_term_id)
);

alter table public.report_card_comments enable row level security;

drop policy if exists report_card_comments_staff_all on public.report_card_comments;
create policy report_card_comments_staff_all
  on public.report_card_comments
  for all
  to authenticated
  using (public.is_admin() or public.teacher_has_class(class_id))
  with check (public.is_admin() or public.teacher_has_class(class_id));

drop policy if exists report_card_comments_portal_select on public.report_card_comments;
create policy report_card_comments_portal_select
  on public.report_card_comments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid() and sg.student_id = report_card_comments.student_id
    )
    or exists (
      select 1 from public.student_user_links sul
      where sul.user_id = auth.uid() and sul.student_id = report_card_comments.student_id
    )
  );

-- Only admins write the head teacher's comment.
create or replace function public.report_card_comments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    if tg_op = 'INSERT' and new.head_comment is not null then
      raise exception 'Only an admin can write the head teacher''s comment';
    end if;
    if tg_op = 'UPDATE' and new.head_comment is distinct from old.head_comment then
      raise exception 'Only an admin can write the head teacher''s comment';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists report_card_comments_guard on public.report_card_comments;
create trigger report_card_comments_guard
  before insert or update on public.report_card_comments
  for each row execute function public.report_card_comments_guard();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Merging subjects and classes keeps sheet columns, layouts, welfare ratings and comments
-- ---------------------------------------------------------------------------------------------------------------

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
  -- Moves results without changing any score, so locked (final/published) sheets may be moved. Every move is still
  -- recorded in result_audit_log (20261023_result_audit.sql).
  perform set_config('app.result_lock_bypass', 'on', true);
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
      and a.on_result_sheet = src_assessment.on_result_sheet
      -- Sheet columns match by name (several columns can be of the same kind); older assessments by type.
      and case
        when src_assessment.on_result_sheet then lower(coalesce(a.title, '')) = lower(coalesce(src_assessment.title, ''))
        else a.assessment_type = src_assessment.assessment_type
      end
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

  -- Saved result-sheet layouts follow the subject unless the kept subject already has one for the same scope.
  update public.result_layouts l
  set subject_id = p_target
  where l.subject_id = p_source
    and not exists (
      select 1 from public.result_layouts t
      where t.subject_id = p_target
        and t.class_id is not distinct from l.class_id
        and t.level is not distinct from l.level
    );

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
  -- Moves results without changing any score, so locked (final/published) sheets may be moved. Every move is still
  -- recorded in result_audit_log (20261023_result_audit.sql).
  perform set_config('app.result_lock_bypass', 'on', true);
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
      and a.on_result_sheet = src_assessment.on_result_sheet
      -- Sheet columns match by name (several columns can be of the same kind); older assessments by type.
      and case
        when src_assessment.on_result_sheet then lower(coalesce(a.title, '')) = lower(coalesce(src_assessment.title, ''))
        else a.assessment_type = src_assessment.assessment_type
      end
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

  update public.welfare_ratings set class_id = p_target where class_id = p_source;
  update public.report_card_comments set class_id = p_target where class_id = p_source;
  update public.result_layouts l
  set class_id = p_target
  where l.class_id = p_source
    and not exists (
      select 1 from public.result_layouts t
      where t.class_id = p_target
        and t.subject_id is not distinct from l.subject_id
        and t.level is not distinct from l.level
    );

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
