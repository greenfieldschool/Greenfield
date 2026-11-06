-- Published results archive (issue 10, "Published Results").
--
-- When a class's term results are published, the website keeps a copy of exactly what was published: every pupil's
-- subject scores, welfare, final score, grade and position, plus the class and term names. The Published results
-- page reads these copies, so a past term still shows the right pupils after they move up a class, and the scores
-- don't change if a grading scale or welfare criterion is edited later.
--
-- Who can see the copies:
--   * admins and front desk (admissions): every class;
--   * class teachers: their own classes;
--   * nobody else (subject teachers, nurse, parents, pupils). Parents and pupils keep using the portal.
-- Nobody can write them from the browser: the website's server saves them with the school's service key after it
-- has checked that the results are published. Unpublishing keeps the copy but takes it off the list; publishing
-- again replaces it.
--
-- Safe to run twice. Run AFTER 20261105_assignments.sql.

-- ---------------------------------------------------------------------------------------------------------------
-- Published results archive
-- ---------------------------------------------------------------------------------------------------------------

create table if not exists public.published_results (
  id uuid primary key default gen_random_uuid(),
  -- Kept (as null) if the class is later deleted or merged; the names below still say which class it was.
  class_id uuid references public.classes(id) on delete set null,
  class_name text not null,
  class_level text not null,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  term_name text not null,
  year_name text,
  -- Set while the results are published; cleared when they are unpublished (the copy stays for the record).
  publication_id uuid references public.result_publications(id) on delete set null,
  published_at timestamptz not null,
  published_by uuid references auth.users(id) on delete set null,
  -- The whole class report as the website builds it (subjects, pupils, welfare, grades, positions).
  report jsonb not null,
  -- One small entry per pupil for the list and the pupil search: id, name, admission_number, final, grade, position.
  pupils jsonb not null default '[]'::jsonb,
  pupil_count int not null default 0,
  final_average numeric,
  saved_at timestamptz not null default now(),
  unique (class_id, academic_term_id)
);

create index if not exists published_results_term_idx on public.published_results(academic_term_id);
create index if not exists published_results_year_idx on public.published_results(academic_year_id);

alter table public.published_results enable row level security;

-- Admins and front desk see every class; a teacher sees the classes they are class teacher of.
create or replace function public.can_view_published_results(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_admin(), false)
    or public.current_role() = 'front_desk'
    or (public.current_role() = 'teacher' and p_class is not null and coalesce(public.teacher_has_class(p_class), false));
$$;

revoke all on function public.can_view_published_results(uuid) from public, anon;
grant execute on function public.can_view_published_results(uuid) to authenticated;

drop policy if exists published_results_select on public.published_results;
create policy published_results_select
  on public.published_results
  for select
  to authenticated
  using (public.can_view_published_results(class_id));

-- Read-only from the browser. The server writes with the service key (which bypasses these rules).
revoke insert, update, delete on public.published_results from anon, authenticated;
