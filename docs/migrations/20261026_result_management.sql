-- Result management (issue 8).
--
-- 1. Grading scale requested by the school, for every level, with a remark shown beside each grade:
--      80–100 A Excellent · 70–79 B Very Good · 60–69 C Good · 50–59 D Pass · 0–49 F Fail
--    Other grades (e.g. E) are switched off, not deleted. Admins can still change it per level under
--    Academics → Grading & layouts.
-- 2. ensure_result_sheet(): opening a class + subject + term that has no sheet yet creates its columns straight away
--    (1st CA 20, 2nd CA 20, Exam (Objective) 30, Exam (Theory) 30, or the saved layout), so there is no set-up step.
--    It runs with the caller's permissions, so teachers can only create sheets for subjects they teach, and the
--    columns are recorded in the results history like any other change.
-- Run after 20261025_messaging.sql.

alter table public.grading_scales add column if not exists remark text;

insert into public.grading_scales (level, grade, min_score, max_score, remark, active)
select lvl, g.grade, g.min_score, g.max_score, g.remark, true
from unnest(array['creche', 'primary', 'secondary']::public.school_level[]) as lvl
cross join (
  values
    ('A', 80::numeric, 100::numeric, 'Excellent'),
    ('B', 70, 79.99, 'Very Good'),
    ('C', 60, 69.99, 'Good'),
    ('D', 50, 59.99, 'Pass'),
    ('F', 0, 49.99, 'Fail')
) as g(grade, min_score, max_score, remark)
on conflict (level, grade) do update
  set min_score = excluded.min_score,
      max_score = excluded.max_score,
      remark = excluded.remark,
      active = true,
      updated_at = now();

update public.grading_scales
set active = false, updated_at = now()
where grade not in ('A', 'B', 'C', 'D', 'F') and active;

-- Creates the sheet's columns if it has none yet. p_columns: [{"label": "1st CA", "group": "ca", "max": 20}, ...]
-- Returns how many columns were created (0 if the sheet already had columns or is locked).
create or replace function public.ensure_result_sheet(p_class uuid, p_subject uuid, p_term uuid, p_columns jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  year_id uuid;
  col jsonb;
  pos int := 0;
begin
  if jsonb_typeof(p_columns) <> 'array' or jsonb_array_length(p_columns) = 0 then
    return 0;
  end if;
  -- Two people opening the same new sheet at once must not create the columns twice.
  perform pg_advisory_xact_lock(hashtext('result_sheet:' || p_class || ':' || p_subject || ':' || p_term));
  if exists (
    select 1 from public.academic_assessments
    where class_id = p_class and subject_id = p_subject and academic_term_id = p_term and on_result_sheet
  ) then
    return 0;
  end if;
  if public.result_sheet_locked(p_class, p_subject, p_term) then
    return 0;
  end if;

  select academic_year_id into year_id from public.academic_terms where id = p_term;
  for col in select * from jsonb_array_elements(p_columns) loop
    pos := pos + 1;
    insert into public.academic_assessments (
      class_id, subject_id, academic_year_id, academic_term_id, on_result_sheet,
      title, assessment_type, component_group, max_score, position, created_by
    )
    values (
      p_class, p_subject, year_id, p_term, true,
      left(btrim(col->>'label'), 60),
      coalesce(nullif(col->>'group', ''), 'other'),
      case when col->>'group' in ('ca', 'exam', 'other') then col->>'group' else 'other' end,
      greatest(0.5, least(1000, (col->>'max')::numeric)),
      pos,
      auth.uid()
    );
  end loop;
  return pos;
end;
$$;

revoke all on function public.ensure_result_sheet(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.ensure_result_sheet(uuid, uuid, uuid, jsonb) to authenticated;
