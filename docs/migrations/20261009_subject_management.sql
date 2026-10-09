-- Subject management: admin-only subjects, merging duplicates, and subjects assigned to classes.
--
-- 1. Only admins can create, edit or delete subjects (everyone signed in can still read them).
-- 2. merge_subjects(source, target) moves every result, CBT test and class assignment from a duplicate subject
--    onto the subject being kept, then deletes the duplicate. Used by the "Merge" action on /admin/academics/subjects.
-- 3. Exact duplicates that already exist (same name ignoring case/extra spaces, same level) are merged here, and a
--    unique index stops new ones from being created.
-- 4. class_subjects lists the subjects each class offers. The result sheet only offers those subjects for a class.
-- Run the whole file once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------------------------------------------
-- Subjects offered by each class
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.class_subjects (
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, subject_id)
);

create index if not exists class_subjects_subject_idx on public.class_subjects(subject_id);

alter table public.class_subjects enable row level security;

drop policy if exists class_subjects_admin_all on public.class_subjects;
create policy class_subjects_admin_all
  on public.class_subjects
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists class_subjects_select on public.class_subjects;
create policy class_subjects_select
  on public.class_subjects
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------------------------------------------
-- Subjects: admins write, everyone signed in reads
-- ---------------------------------------------------------------------------------------------------------------

drop policy if exists subjects_staff_all on public.subjects;
drop policy if exists subjects_admin_all on public.subjects;
create policy subjects_admin_all
  on public.subjects
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- subjects_portal_select (select for all authenticated users) is unchanged.

-- ---------------------------------------------------------------------------------------------------------------
-- Usage counts shown next to each subject
-- ---------------------------------------------------------------------------------------------------------------

create or replace view public.subject_usage
with (security_invoker = true)
as
select
  s.id as subject_id,
  (select count(*) from public.academic_assessments a where a.subject_id = s.id) as assessment_count,
  (
    select count(*)
    from public.academic_assessment_scores sc
    join public.academic_assessments a on a.id = sc.assessment_id
    where a.subject_id = s.id
  ) as score_count,
  (select count(*) from public.exam_tests t where t.subject_id = s.id) as test_count,
  (select count(*) from public.class_subjects cs where cs.subject_id = s.id) as class_count
from public.subjects s;

-- ---------------------------------------------------------------------------------------------------------------
-- Merging
-- ---------------------------------------------------------------------------------------------------------------

-- Name used to detect duplicates: lower case, trimmed, inner whitespace collapsed.
create or replace function public.subject_name_key(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

-- Does the work without a permission check. Not callable through the API; use merge_subjects instead.
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

  -- Results: if the kept subject already has the same column (class, term, type), copy the scores across
  -- (scores already on the kept subject win), otherwise just re-point the assessment.
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

  -- Keep the subject active if either one was.
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

create or replace function public.merge_subjects(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can merge subjects';
  end if;
  return public.merge_subjects_unchecked(p_source, p_target);
end;
$$;

revoke all on function public.merge_subjects(uuid, uuid) from public, anon;
grant execute on function public.merge_subjects(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Clean up exact duplicates that already exist, then block new ones
-- ---------------------------------------------------------------------------------------------------------------

-- Keeps the active one with the most results (oldest first on a tie) and merges the rest into it.
do $$
declare
  dup record;
begin
  for dup in
    with ranked as (
      select
        s.id,
        first_value(s.id) over (
          partition by public.subject_name_key(s.name), s.level
          order by s.active desc,
            (select count(*) from public.academic_assessments a where a.subject_id = s.id) desc,
            s.created_at asc
        ) as keep_id
      from public.subjects s
    )
    select id, keep_id from ranked where id <> keep_id
  loop
    perform public.merge_subjects_unchecked(dup.id, dup.keep_id);
  end loop;
end;
$$;

create unique index if not exists subjects_name_key_level_uidx
  on public.subjects (public.subject_name_key(name), level) nulls not distinct;
