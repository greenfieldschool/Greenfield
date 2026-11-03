-- Compulsory welfare weeks (4 Nov 2026). Run AFTER 20261103_staff_signatures.sql (and 20261102_weekly_welfare.sql).
--
-- An admin chooses, for each term, which weeks class teachers must fill on the welfare score sheet (for example every
-- week except the mid-term break). The score sheet marks those weeks and lists any still to fill, and report cards
-- can't be published for a class until every pupil has been scored for every compulsory week. A term with no weeks
-- chosen works as before: nothing is compulsory.
--
-- welfare_compulsory_weeks: one row per term + week (the Monday the week starts). Staff can read it; it is changed
-- only through set_welfare_compulsory_weeks(), which checks the caller is an admin and replaces the term's list in one
-- go.
--
-- Safe to run twice. The Supabase editor may warn about "destructive operations": that is the policy below being
-- replaced (drop policy if exists). Nothing is deleted. The table has Row Level Security on.

-- ---------------------------------------------------------------------------------------------------------------
-- Compulsory welfare weeks
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.welfare_compulsory_weeks (
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  week_start date not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (academic_term_id, week_start),
  constraint welfare_compulsory_weeks_monday check (extract(isodow from week_start) = 1)
);

alter table public.welfare_compulsory_weeks enable row level security;

drop policy if exists welfare_compulsory_weeks_staff_select on public.welfare_compulsory_weeks;
create policy welfare_compulsory_weeks_staff_select
  on public.welfare_compulsory_weeks
  for select
  to authenticated
  using (coalesce(public.is_staff(), false));

-- Changes go through the function below only.
revoke insert, update, delete on public.welfare_compulsory_weeks from anon, authenticated;

-- Replaces the compulsory weeks of a term with p_weeks (Mondays). An empty list means nothing is compulsory.
create or replace function public.set_welfare_compulsory_weeks(p_term uuid, p_weeks date[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  saved integer;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can choose the compulsory welfare weeks';
  end if;
  if p_term is null or not exists (select 1 from public.academic_terms where id = p_term) then
    raise exception 'Term not found';
  end if;
  if exists (select 1 from unnest(coalesce(p_weeks, '{}'::date[])) as w(d) where extract(isodow from w.d) <> 1) then
    raise exception 'Each week must start on a Monday';
  end if;

  delete from public.welfare_compulsory_weeks where academic_term_id = p_term;
  insert into public.welfare_compulsory_weeks (academic_term_id, week_start)
  select distinct p_term, w.d from unnest(coalesce(p_weeks, '{}'::date[])) as w(d)
  on conflict do nothing;
  get diagnostics saved = row_count;
  return saved;
end;
$$;

revoke all on function public.set_welfare_compulsory_weeks(uuid, date[]) from public, anon;
grant execute on function public.set_welfare_compulsory_weeks(uuid, date[]) to authenticated;
