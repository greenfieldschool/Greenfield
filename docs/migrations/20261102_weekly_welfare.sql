-- Weekly welfare scores (2 Nov 2026). Run AFTER 20261024_result_corrections.sql.
--
-- The class teacher now scores welfare every week, out of 100. At the end of term the weekly scores are averaged
-- into one welfare score out of 100, and the final score on the report card is (academic average + welfare) / 2.
--
-- 1. welfare_ratings.week_start: the Monday of the week a rating is for. Ratings saved before this change have no
--    week (they were for the whole term); report cards use them only for terms with no weekly ratings at all.
-- 2. One rating per pupil, criterion and week (replaces one per pupil, criterion and term).
-- 3. The lock/audit trigger recognises a re-saved rating for the same week, and the history names the week.
-- 4. The school's welfare criteria and marks (100 in all):
--      Attendance 15, Punctuality 10, Uniform & appearance 10, Conduct 15, Politeness & respect 10, Honesty 5,
--      Cooperation & relationship with others 5, Attentiveness & self-control 5, Leadership & responsibility 5,
--      Participation (sports, clubs, crafts) 20.
--    Any other criterion (e.g. Neatness) is turned off, not deleted. Admins can still change these under
--    Welfare -> Welfare criteria. Report cards are worked out live, so this also changes any term already published.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------------------------
-- 1-2. Week column and one rating per pupil, criterion and week
-- ---------------------------------------------------------------------------------------------------------------

alter table public.welfare_ratings add column if not exists week_start date;

do $$
declare
  c record;
begin
  -- The old one-per-term unique constraint (its name depends on how the table was created).
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.welfare_ratings'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(con.conkey) k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['academic_term_id', 'criterion_id', 'student_id']
  loop
    execute format('alter table public.welfare_ratings drop constraint %I', c.conname);
  end loop;
end;
$$;

create unique index if not exists welfare_ratings_week_key
  on public.welfare_ratings (student_id, academic_term_id, criterion_id, week_start) nulls not distinct;

create index if not exists welfare_ratings_class_week_idx on public.welfare_ratings (class_id, academic_term_id, week_start);

do $$
begin
  alter table public.welfare_ratings
    add constraint welfare_ratings_week_is_monday check (week_start is null or extract(isodow from week_start) = 1);
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Lock and history trigger
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.welfare_ratings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.welfare_ratings%rowtype := case when tg_op = 'DELETE' then old else new end;
  label text;
begin
  if not public.result_lock_bypassed() and (
    public.result_term_published(r.class_id, r.academic_term_id)
    or (tg_op = 'UPDATE' and public.result_term_published(old.class_id, old.academic_term_id))
  ) then
    raise exception 'These report cards are published, so welfare ratings are locked. An admin must unpublish them (giving a reason) first.';
  end if;
  if tg_op = 'UPDATE' and new.rating is not distinct from old.rating then
    return new;
  end if;
  -- An upsert of an existing rating fires this insert trigger first, then becomes an update (recorded then).
  if tg_op = 'INSERT' and exists (
    select 1 from public.welfare_ratings x
    where x.student_id = new.student_id
      and x.academic_term_id = new.academic_term_id
      and x.criterion_id = new.criterion_id
      and x.week_start is not distinct from new.week_start
  ) then
    return new;
  end if;
  select name into label from public.welfare_criteria where id = r.criterion_id;
  label := coalesce(label, 'Welfare');
  if r.week_start is not null then
    label := label || ' · week of ' || to_char(r.week_start, 'FMDD Mon YYYY');
  end if;
  perform public.log_result_event(
    case tg_op when 'INSERT' then 'rating_added' when 'UPDATE' then 'rating_changed' else 'rating_deleted' end,
    r.class_id, null, r.academic_term_id, null, r.student_id, r.criterion_id, label,
    case when tg_op = 'INSERT' then null else old.rating end,
    case when tg_op = 'DELETE' then null else new.rating end
  );
  return r;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. The school's criteria and marks, for every level
-- ---------------------------------------------------------------------------------------------------------------

drop table if exists pg_temp._welfare_wanted;
create temporary table _welfare_wanted (name text, description text, source text, max_points numeric, position int);
insert into _welfare_wanted values
  ('Attendance', 'Days present out of the days attendance was taken that week.', 'attendance', 15, 1),
  ('Punctuality', 'Days on time out of the days present that week (from "late" attendance marks).', 'punctuality', 10, 2),
  ('Uniform & appearance', 'Uniform checks passed out of the checks done that week.', 'uniform', 10, 3),
  ('Conduct', 'Starts full each week; discipline records that week take points off by severity.', 'conduct', 15, 4),
  ('Politeness & respect', 'Greets, listens and speaks respectfully to staff and pupils.', 'rating', 10, 5),
  ('Honesty', 'Tells the truth and owns up to mistakes.', 'rating', 5, 6),
  ('Cooperation & relationship with others', 'Works and plays well with others; kind and helpful.', 'rating', 5, 7),
  ('Attentiveness & self-control', 'Pays attention in class and manages own behaviour.', 'rating', 5, 8),
  ('Leadership & responsibility', 'Takes on duties, keeps promises, leads by example.', 'rating', 5, 9),
  ('Participation (sports, clubs, crafts)', 'Takes part in sports, clubs, crafts and school activities.', 'rating', 20, 10);

update public.welfare_criteria c
set max_points = w.max_points,
    position = w.position,
    active = true,
    description = case when c.source = w.source then w.description else c.description end,
    updated_at = now()
from _welfare_wanted w
where c.name = w.name
  and (c.max_points is distinct from w.max_points or c.position is distinct from w.position or not c.active
       or (c.source = w.source and c.description is distinct from w.description));

insert into public.welfare_criteria (level, name, description, source, max_points, position)
select lvl, w.name, w.description, w.source, w.max_points, w.position
from unnest(array['creche', 'primary', 'secondary']::public.school_level[]) as lvl
cross join _welfare_wanted w
on conflict (level, name) do nothing;

update public.welfare_criteria c
set active = false, updated_at = now()
where c.active and not exists (select 1 from _welfare_wanted w where w.name = c.name);

drop table if exists pg_temp._welfare_wanted;
