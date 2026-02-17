create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level public.school_level,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, level)
);

create table if not exists public.grading_scales (
  id uuid primary key default gen_random_uuid(),
  level public.school_level not null,
  grade text not null,
  min_score numeric(5,2) not null,
  max_score numeric(5,2) not null,
  gpa_points numeric(4,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level, grade)
);

create table if not exists public.assessment_weights (
  id uuid primary key default gen_random_uuid(),
  level public.school_level not null,
  assessment_type text not null,
  weight numeric(5,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level, assessment_type)
);

create table if not exists public.academic_assessments (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  class_id uuid references public.classes(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete restrict,
  assessment_type text not null,
  title text,
  max_score numeric(6,2) not null default 100,
  held_on date,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academic_assessments_term_class_subject_idx on public.academic_assessments(academic_year_id, academic_term_id, class_id, subject_id);

create table if not exists public.academic_assessment_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.academic_assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric(6,2) not null,
  remarks text,
  graded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_id)
);

create index if not exists academic_assessment_scores_student_idx on public.academic_assessment_scores(student_id);

create table if not exists public.student_attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  date date not null,
  status text not null,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists student_attendance_term_student_idx on public.student_attendance(academic_year_id, academic_term_id, student_id);

create table if not exists public.welfare_incidents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  incident_type text not null,
  description text not null,
  action_taken text,
  severity int not null default 1,
  resolved boolean not null default false,
  reported_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists welfare_incidents_term_student_idx on public.welfare_incidents(academic_year_id, academic_term_id, student_id);

create table if not exists public.welfare_discipline_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  category text,
  description text not null,
  severity int not null default 1,
  sanction text,
  reported_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists welfare_discipline_term_student_idx on public.welfare_discipline_records(academic_year_id, academic_term_id, student_id);

create table if not exists public.student_uniform_checks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  date date not null,
  ok boolean not null default true,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists student_uniform_checks_term_student_idx on public.student_uniform_checks(academic_year_id, academic_term_id, student_id);

create table if not exists public.welfare_scoring_rules (
  id uuid primary key default gen_random_uuid(),
  level public.school_level not null,
  absent_penalty numeric(6,2) not null default 2,
  late_penalty numeric(6,2) not null default 1,
  discipline_severity_penalty numeric(6,2) not null default 1,
  incident_severity_penalty numeric(6,2) not null default 1,
  uniform_fail_penalty numeric(6,2) not null default 1,
  gold_min numeric(6,2) not null default 85,
  silver_min numeric(6,2) not null default 70,
  bronze_min numeric(6,2) not null default 50,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (level)
);

create table if not exists public.result_publications (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  academic_year_id uuid references public.academic_years(id) on delete cascade,
  academic_term_id uuid references public.academic_terms(id) on delete cascade,
  level public.school_level,
  class_id uuid references public.classes(id) on delete set null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, academic_year_id, academic_term_id, level, class_id)
);

alter table public.subjects enable row level security;
alter table public.grading_scales enable row level security;
alter table public.assessment_weights enable row level security;
alter table public.academic_assessments enable row level security;
alter table public.academic_assessment_scores enable row level security;
alter table public.student_attendance enable row level security;
alter table public.welfare_incidents enable row level security;
alter table public.welfare_discipline_records enable row level security;
alter table public.student_uniform_checks enable row level security;
alter table public.welfare_scoring_rules enable row level security;
alter table public.result_publications enable row level security;

drop policy if exists subjects_staff_all on public.subjects;
create policy subjects_staff_all
  on public.subjects
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists subjects_portal_select on public.subjects;
create policy subjects_portal_select
  on public.subjects
  for select
  to authenticated
  using (true);

drop policy if exists grading_scales_staff_all on public.grading_scales;
create policy grading_scales_staff_all
  on public.grading_scales
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists grading_scales_portal_select on public.grading_scales;
create policy grading_scales_portal_select
  on public.grading_scales
  for select
  to authenticated
  using (true);

drop policy if exists assessment_weights_staff_all on public.assessment_weights;
create policy assessment_weights_staff_all
  on public.assessment_weights
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists assessment_weights_portal_select on public.assessment_weights;
create policy assessment_weights_portal_select
  on public.assessment_weights
  for select
  to authenticated
  using (true);

drop policy if exists welfare_scoring_rules_staff_all on public.welfare_scoring_rules;
create policy welfare_scoring_rules_staff_all
  on public.welfare_scoring_rules
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists welfare_scoring_rules_portal_select on public.welfare_scoring_rules;
create policy welfare_scoring_rules_portal_select
  on public.welfare_scoring_rules
  for select
  to authenticated
  using (true);

drop policy if exists academic_assessments_staff_all on public.academic_assessments;
create policy academic_assessments_staff_all
  on public.academic_assessments
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists academic_assessments_parent_student_select on public.academic_assessments;
create policy academic_assessments_parent_student_select
  on public.academic_assessments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.academic_assessment_scores s
      join public.students st on st.id = s.student_id
      left join public.guardian_user_links gul on gul.user_id = auth.uid()
      left join public.student_guardians sg on sg.guardian_id = gul.guardian_id and sg.student_id = st.id
      left join public.student_user_links sul on sul.user_id = auth.uid() and sul.student_id = st.id
      where s.assessment_id = academic_assessments.id
        and (sg.student_id is not null or sul.student_id is not null)
    )
  );

drop policy if exists academic_assessment_scores_staff_all on public.academic_assessment_scores;
create policy academic_assessment_scores_staff_all
  on public.academic_assessment_scores
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists academic_assessment_scores_parent_select on public.academic_assessment_scores;
create policy academic_assessment_scores_parent_select
  on public.academic_assessment_scores
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = academic_assessment_scores.student_id
    )
  );

drop policy if exists academic_assessment_scores_student_select on public.academic_assessment_scores;
create policy academic_assessment_scores_student_select
  on public.academic_assessment_scores
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = academic_assessment_scores.student_id
    )
  );

drop policy if exists student_attendance_staff_all on public.student_attendance;
create policy student_attendance_staff_all
  on public.student_attendance
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists student_attendance_parent_select on public.student_attendance;
create policy student_attendance_parent_select
  on public.student_attendance
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = student_attendance.student_id
    )
  );

drop policy if exists student_attendance_student_select on public.student_attendance;
create policy student_attendance_student_select
  on public.student_attendance
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = student_attendance.student_id
    )
  );

drop policy if exists welfare_incidents_staff_all on public.welfare_incidents;
create policy welfare_incidents_staff_all
  on public.welfare_incidents
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists welfare_incidents_parent_select on public.welfare_incidents;
create policy welfare_incidents_parent_select
  on public.welfare_incidents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = welfare_incidents.student_id
    )
  );

drop policy if exists welfare_incidents_student_select on public.welfare_incidents;
create policy welfare_incidents_student_select
  on public.welfare_incidents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = welfare_incidents.student_id
    )
  );

drop policy if exists welfare_discipline_staff_all on public.welfare_discipline_records;
create policy welfare_discipline_staff_all
  on public.welfare_discipline_records
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists welfare_discipline_parent_select on public.welfare_discipline_records;
create policy welfare_discipline_parent_select
  on public.welfare_discipline_records
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = welfare_discipline_records.student_id
    )
  );

drop policy if exists welfare_discipline_student_select on public.welfare_discipline_records;
create policy welfare_discipline_student_select
  on public.welfare_discipline_records
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = welfare_discipline_records.student_id
    )
  );

drop policy if exists student_uniform_checks_staff_all on public.student_uniform_checks;
create policy student_uniform_checks_staff_all
  on public.student_uniform_checks
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists student_uniform_checks_parent_select on public.student_uniform_checks;
create policy student_uniform_checks_parent_select
  on public.student_uniform_checks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.guardian_user_links gul
      join public.student_guardians sg on sg.guardian_id = gul.guardian_id
      where gul.user_id = auth.uid()
        and sg.student_id = student_uniform_checks.student_id
    )
  );

drop policy if exists student_uniform_checks_student_select on public.student_uniform_checks;
create policy student_uniform_checks_student_select
  on public.student_uniform_checks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = student_uniform_checks.student_id
    )
  );

drop policy if exists result_publications_staff_all on public.result_publications;
create policy result_publications_staff_all
  on public.result_publications
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists result_publications_portal_select on public.result_publications;
create policy result_publications_portal_select
  on public.result_publications
  for select
  to authenticated
  using (true);

drop trigger if exists subjects_set_updated_at on public.subjects;
create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute procedure public.set_updated_at();

drop trigger if exists grading_scales_set_updated_at on public.grading_scales;
create trigger grading_scales_set_updated_at
  before update on public.grading_scales
  for each row execute procedure public.set_updated_at();

drop trigger if exists assessment_weights_set_updated_at on public.assessment_weights;
create trigger assessment_weights_set_updated_at
  before update on public.assessment_weights
  for each row execute procedure public.set_updated_at();

drop trigger if exists academic_assessments_set_updated_at on public.academic_assessments;
create trigger academic_assessments_set_updated_at
  before update on public.academic_assessments
  for each row execute procedure public.set_updated_at();

drop trigger if exists academic_assessment_scores_set_updated_at on public.academic_assessment_scores;
create trigger academic_assessment_scores_set_updated_at
  before update on public.academic_assessment_scores
  for each row execute procedure public.set_updated_at();

drop trigger if exists student_attendance_set_updated_at on public.student_attendance;
create trigger student_attendance_set_updated_at
  before update on public.student_attendance
  for each row execute procedure public.set_updated_at();

drop trigger if exists welfare_incidents_set_updated_at on public.welfare_incidents;
create trigger welfare_incidents_set_updated_at
  before update on public.welfare_incidents
  for each row execute procedure public.set_updated_at();

drop trigger if exists welfare_discipline_records_set_updated_at on public.welfare_discipline_records;
create trigger welfare_discipline_records_set_updated_at
  before update on public.welfare_discipline_records
  for each row execute procedure public.set_updated_at();

drop trigger if exists student_uniform_checks_set_updated_at on public.student_uniform_checks;
create trigger student_uniform_checks_set_updated_at
  before update on public.student_uniform_checks
  for each row execute procedure public.set_updated_at();

drop trigger if exists welfare_scoring_rules_set_updated_at on public.welfare_scoring_rules;
create trigger welfare_scoring_rules_set_updated_at
  before update on public.welfare_scoring_rules
  for each row execute procedure public.set_updated_at();

drop trigger if exists result_publications_set_updated_at on public.result_publications;
create trigger result_publications_set_updated_at
  before update on public.result_publications
  for each row execute procedure public.set_updated_at();

create or replace view public.academic_student_subject_term_summary as
with base as (
  select
    s.id as student_id,
    a.academic_year_id,
    a.academic_term_id,
    a.class_id,
    c.level as class_level,
    a.subject_id,
    sub.name as subject_name,
    coalesce(sum((sc.score / nullif(a.max_score, 0)) * 100 * (w.weight / 100)), 0) as weighted_score
  from public.academic_assessment_scores sc
  join public.academic_assessments a on a.id = sc.assessment_id
  join public.students s on s.id = sc.student_id
  left join public.classes c on c.id = s.class_id
  join public.subjects sub on sub.id = a.subject_id
  left join public.assessment_weights w
    on w.active = true
   and w.level = c.level
   and w.assessment_type = a.assessment_type
  group by s.id, a.academic_year_id, a.academic_term_id, a.class_id, c.level, a.subject_id, sub.name
)
select
  b.student_id,
  b.academic_year_id,
  b.academic_term_id,
  b.class_id,
  b.class_level,
  b.subject_id,
  b.subject_name,
  b.weighted_score,
  gs.grade
from base b
left join public.grading_scales gs
  on gs.active = true
 and gs.level = b.class_level
 and b.weighted_score between gs.min_score and gs.max_score;

create or replace view public.academic_student_term_summary as
select
  student_id,
  academic_year_id,
  academic_term_id,
  class_id,
  class_level,
  coalesce(avg(weighted_score), 0) as average_score
from public.academic_student_subject_term_summary
group by student_id, academic_year_id, academic_term_id, class_id, class_level;

create or replace view public.welfare_student_term_summary as
with st as (
  select
    s.id as student_id,
    s.class_id,
    c.level as class_level,
    t.academic_year_id,
    t.academic_term_id,
    coalesce(sum(case when t.status = 'present' then 1 else 0 end), 0) as present_days,
    coalesce(sum(case when t.status = 'absent' then 1 else 0 end), 0) as absent_days,
    coalesce(sum(case when t.status = 'late' then 1 else 0 end), 0) as late_days
  from public.students s
  left join public.classes c on c.id = s.class_id
  left join public.student_attendance t on t.student_id = s.id
  group by s.id, s.class_id, c.level, t.academic_year_id, t.academic_term_id
), dis as (
  select
    student_id,
    academic_year_id,
    academic_term_id,
    count(*) as discipline_count,
    coalesce(sum(severity), 0) as discipline_severity_total
  from public.welfare_discipline_records
  group by student_id, academic_year_id, academic_term_id
), inc as (
  select
    student_id,
    academic_year_id,
    academic_term_id,
    count(*) as incident_count,
    coalesce(sum(severity), 0) as incident_severity_total
  from public.welfare_incidents
  group by student_id, academic_year_id, academic_term_id
), uni as (
  select
    student_id,
    academic_year_id,
    academic_term_id,
    count(*) as uniform_checks,
    coalesce(sum(case when ok = false then 1 else 0 end), 0) as uniform_failures
  from public.student_uniform_checks
  group by student_id, academic_year_id, academic_term_id
)
select
  st.student_id,
  st.academic_year_id,
  st.academic_term_id,
  st.class_id,
  st.class_level,
  st.present_days,
  st.absent_days,
  st.late_days,
  coalesce(dis.discipline_count, 0) as discipline_count,
  coalesce(dis.discipline_severity_total, 0) as discipline_severity_total,
  coalesce(inc.incident_count, 0) as incident_count,
  coalesce(inc.incident_severity_total, 0) as incident_severity_total,
  coalesce(uni.uniform_checks, 0) as uniform_checks,
  coalesce(uni.uniform_failures, 0) as uniform_failures,
  greatest(
    0,
    least(
      100,
      100
      - (coalesce(st.absent_days, 0) * r.absent_penalty)
      - (coalesce(st.late_days, 0) * r.late_penalty)
      - (coalesce(dis.discipline_severity_total, 0) * r.discipline_severity_penalty)
      - (coalesce(inc.incident_severity_total, 0) * r.incident_severity_penalty)
      - (coalesce(uni.uniform_failures, 0) * r.uniform_fail_penalty)
    )
  ) as welfare_score,
  case
    when greatest(
      0,
      least(
        100,
        100
        - (coalesce(st.absent_days, 0) * r.absent_penalty)
        - (coalesce(st.late_days, 0) * r.late_penalty)
        - (coalesce(dis.discipline_severity_total, 0) * r.discipline_severity_penalty)
        - (coalesce(inc.incident_severity_total, 0) * r.incident_severity_penalty)
        - (coalesce(uni.uniform_failures, 0) * r.uniform_fail_penalty)
      )
    ) >= r.gold_min then 'gold'
    when greatest(
      0,
      least(
        100,
        100
        - (coalesce(st.absent_days, 0) * r.absent_penalty)
        - (coalesce(st.late_days, 0) * r.late_penalty)
        - (coalesce(dis.discipline_severity_total, 0) * r.discipline_severity_penalty)
        - (coalesce(inc.incident_severity_total, 0) * r.incident_severity_penalty)
        - (coalesce(uni.uniform_failures, 0) * r.uniform_fail_penalty)
      )
    ) >= r.silver_min then 'silver'
    when greatest(
      0,
      least(
        100,
        100
        - (coalesce(st.absent_days, 0) * r.absent_penalty)
        - (coalesce(st.late_days, 0) * r.late_penalty)
        - (coalesce(dis.discipline_severity_total, 0) * r.discipline_severity_penalty)
        - (coalesce(inc.incident_severity_total, 0) * r.incident_severity_penalty)
        - (coalesce(uni.uniform_failures, 0) * r.uniform_fail_penalty)
      )
    ) >= r.bronze_min then 'bronze'
    else 'none'
  end as welfare_badge
from st
left join dis on dis.student_id = st.student_id and dis.academic_year_id is not distinct from st.academic_year_id and dis.academic_term_id is not distinct from st.academic_term_id
left join inc on inc.student_id = st.student_id and inc.academic_year_id is not distinct from st.academic_year_id and inc.academic_term_id is not distinct from st.academic_term_id
left join uni on uni.student_id = st.student_id and uni.academic_year_id is not distinct from st.academic_year_id and uni.academic_term_id is not distinct from st.academic_term_id
left join public.welfare_scoring_rules r on r.active = true and r.level = st.class_level;

insert into public.welfare_scoring_rules (level)
values ('creche'), ('primary'), ('secondary')
on conflict (level) do nothing;

insert into public.assessment_weights (level, assessment_type, weight)
values
  ('creche', 'weekly_test', 20),
  ('creche', 'mid_term', 20),
  ('creche', 'exam', 60),
  ('primary', 'weekly_test', 20),
  ('primary', 'mid_term', 20),
  ('primary', 'exam', 60),
  ('secondary', 'weekly_test', 20),
  ('secondary', 'mid_term', 20),
  ('secondary', 'exam', 60)
on conflict (level, assessment_type) do nothing;

insert into public.grading_scales (level, grade, min_score, max_score)
values
  ('primary', 'A', 70, 100),
  ('primary', 'B', 60, 69.99),
  ('primary', 'C', 50, 59.99),
  ('primary', 'D', 45, 49.99),
  ('primary', 'E', 40, 44.99),
  ('primary', 'F', 0, 39.99),
  ('secondary', 'A', 70, 100),
  ('secondary', 'B', 60, 69.99),
  ('secondary', 'C', 50, 59.99),
  ('secondary', 'D', 45, 49.99),
  ('secondary', 'E', 40, 44.99),
  ('secondary', 'F', 0, 39.99)
on conflict (level, grade) do nothing;
