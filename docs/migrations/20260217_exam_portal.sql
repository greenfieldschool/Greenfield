create table if not exists public.exam_tests (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete set null,
  name text not null,
  description text,
  duration_minutes int not null default 60,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exam_tests_subject_idx on public.exam_tests(subject_id);

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.exam_tests(id) on delete cascade,
  question_type text not null,
  prompt text not null,
  options jsonb,
  correct_answer jsonb,
  marks numeric(8,2) not null default 1,
  explanation text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exam_questions drop column if exists correct_answer;
alter table public.exam_questions drop column if exists explanation;

create table if not exists public.exam_question_solutions (
  question_id uuid primary key references public.exam_questions(id) on delete cascade,
  correct_answer jsonb,
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exam_questions_test_idx on public.exam_questions(test_id);

create table if not exists public.exam_test_sessions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.exam_tests(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  academic_term_id uuid references public.academic_terms(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft',
  requires_secret_code boolean not null default false,
  secret_code text,
  results_released_at timestamptz,
  results_released_by uuid references auth.users(id) on delete set null,
  results_release_note text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exam_test_sessions_test_idx on public.exam_test_sessions(test_id);
create index if not exists exam_test_sessions_class_idx on public.exam_test_sessions(class_id);

create table if not exists public.exam_conductors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_conductor_user_links (
  conductor_id uuid not null references public.exam_conductors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conductor_id, user_id),
  unique (user_id)
);

create table if not exists public.exam_session_conductors (
  session_id uuid not null references public.exam_test_sessions(id) on delete cascade,
  conductor_id uuid not null references public.exam_conductors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, conductor_id)
);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.exam_test_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  obtained_marks numeric(10,2) not null default 0,
  max_marks numeric(10,2) not null default 0,
  percent numeric(6,2) not null default 0,
  secret_code_verified boolean not null default false,
  locked_at timestamptz,
  locked_reason text,
  lock_count int not null default 0,
  unlocked_at timestamptz,
  unlocked_by uuid references auth.users(id) on delete set null,
  unlock_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create index if not exists exam_attempts_session_idx on public.exam_attempts(session_id);
create index if not exists exam_attempts_student_idx on public.exam_attempts(student_id);

create table if not exists public.exam_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  answer jsonb,
  is_correct boolean,
  awarded_marks numeric(10,2) not null default 0,
  feedback text,
  marked_by uuid references auth.users(id) on delete set null,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists exam_attempt_answers_attempt_idx on public.exam_attempt_answers(attempt_id);

create table if not exists public.exam_malpractice_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  event_type text not null,
  event_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists exam_malpractice_attempt_idx on public.exam_malpractice_events(attempt_id);

alter table public.exam_tests enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_question_solutions enable row level security;
alter table public.exam_test_sessions enable row level security;
alter table public.exam_conductors enable row level security;
alter table public.exam_conductor_user_links enable row level security;
alter table public.exam_session_conductors enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_attempt_answers enable row level security;
alter table public.exam_malpractice_events enable row level security;

create or replace function public.is_exam_conductor() returns boolean
language sql stable
as $$
  select exists(
    select 1
    from public.exam_conductor_user_links l
    where l.user_id = auth.uid()
  );
$$;

create or replace function public.can_student_view_session_results(session_uuid uuid) returns boolean
language sql stable
as $$
  select exists(
    select 1
    from public.exam_test_sessions s
    join public.students st on st.id = public.current_student_id()
    where s.id = session_uuid
      and s.active = true
      and (s.class_id is null or s.class_id = st.class_id)
      and s.results_released_at is not null
  );
$$;

create or replace function public.can_student_view_session(session_uuid uuid) returns boolean
language sql stable
as $$
  select public.can_student_access_session(session_uuid)
     or public.can_student_view_session_results(session_uuid);
$$;

create or replace function public.can_conduct_session(session_uuid uuid) returns boolean
language sql stable
as $$
  select exists(
    select 1
    from public.exam_conductor_user_links l
    join public.exam_session_conductors sc on sc.conductor_id = l.conductor_id
    where l.user_id = auth.uid()
      and sc.session_id = session_uuid
  );
$$;

create or replace function public.current_student_id() returns uuid
language sql stable
as $$
  select sul.student_id
  from public.student_user_links sul
  where sul.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_student_access_session(session_uuid uuid) returns boolean
language sql stable
as $$
  select exists(
    select 1
    from public.exam_test_sessions s
    join public.students st on st.id = public.current_student_id()
    where s.id = session_uuid
      and s.active = true
      and s.status = 'active'
      and (s.class_id is null or s.class_id = st.class_id)
      and (s.starts_at is null or s.starts_at <= now())
      and (s.ends_at is null or s.ends_at >= now())
  );
$$;

create or replace function public.start_exam_attempt(session_uuid uuid, secret_code_input text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_attempt_id uuid;
  v_requires boolean;
  v_secret text;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'Not a student user';
  end if;

  if not public.can_student_access_session(session_uuid) then
    raise exception 'Session not accessible';
  end if;

  select s.requires_secret_code, s.secret_code
  into v_requires, v_secret
  from public.exam_test_sessions s
  where s.id = session_uuid;

  if coalesce(v_requires, false) = true then
    if secret_code_input is null or length(btrim(secret_code_input)) = 0 then
      raise exception 'Secret code required';
    end if;

    if btrim(secret_code_input) <> coalesce(v_secret, '') then
      raise exception 'Invalid secret code';
    end if;
  end if;

  select a.id into v_attempt_id
  from public.exam_attempts a
  where a.session_id = session_uuid
    and a.student_id = v_student_id;

  if v_attempt_id is null then
    insert into public.exam_attempts (session_id, student_id, secret_code_verified)
    values (session_uuid, v_student_id, coalesce(v_requires, false) = false or btrim(secret_code_input) = coalesce(v_secret, ''))
    returning id into v_attempt_id;
  else
    update public.exam_attempts
      set secret_code_verified = true
    where id = v_attempt_id
      and coalesce(v_requires, false) = true
      and btrim(secret_code_input) = coalesce(v_secret, '');
  end if;

  insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
  values (v_attempt_id, 'start', jsonb_build_object('secret_code_required', coalesce(v_requires, false)));

  return v_attempt_id;
end;
$$;

create or replace function public.submit_exam_attempt(attempt_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_session_id uuid;
  v_test_id uuid;
  v_requires boolean;
  v_verified boolean;
  v_has_manual boolean;
  v_max numeric(10,2);
  v_obt numeric(10,2);
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'Not a student user';
  end if;

  select a.session_id, s.test_id, a.secret_code_verified, s.requires_secret_code
  into v_session_id, v_test_id, v_verified, v_requires
  from public.exam_attempts a
  join public.exam_test_sessions s on s.id = a.session_id
  where a.id = attempt_uuid
    and a.student_id = v_student_id;

  if v_session_id is null then
    raise exception 'Attempt not found';
  end if;

  if not public.can_student_access_session(v_session_id) then
    raise exception 'Session not accessible';
  end if;

  if coalesce(v_requires, false) = true and coalesce(v_verified, false) = false then
    raise exception 'Secret code not verified';
  end if;

  update public.exam_attempts
    set submitted_at = now(), status = 'submitted'
  where id = attempt_uuid
    and submitted_at is null
    and locked_at is null;

  with qs as (
    select id, question_type, marks
    from public.exam_questions
    where test_id = v_test_id
      and active = true
  ), sol as (
    select question_id, correct_answer
    from public.exam_question_solutions
  ), ans as (
    select question_id, answer
    from public.exam_attempt_answers
    where attempt_id = attempt_uuid
  ), scored as (
    select
      qs.id as question_id,
      qs.question_type,
      qs.marks,
      sol.correct_answer,
      ans.answer,
      case
        when qs.question_type in ('mcq_single', 'true_false') then
          (coalesce(ans.answer->>'value','') = coalesce(sol.correct_answer->>'value',''))
        when qs.question_type = 'fill_blank' then
          lower(btrim(coalesce(ans.answer->>'value',''))) = lower(btrim(coalesce(sol.correct_answer->>'value','')))
        else null
      end as is_correct
    from qs
    left join sol on sol.question_id = qs.id
    left join ans on ans.question_id = qs.id
  )
  update public.exam_attempt_answers a
  set
    is_correct = s.is_correct,
    awarded_marks = case when s.is_correct = true then s.marks else 0 end,
    marked_at = case when s.is_correct is not null then now() else a.marked_at end
  from scored s
  where a.attempt_id = attempt_uuid
    and a.question_id = s.question_id
    and s.is_correct is not null;

  select
    coalesce(sum(q.marks), 0),
    coalesce(sum(case when a.is_correct = true then q.marks else 0 end), 0),
    bool_or(q.question_type in ('short_answer','essay','mcq_multi'))
  into v_max, v_obt, v_has_manual
  from public.exam_questions q
  left join public.exam_attempt_answers a
    on a.question_id = q.id and a.attempt_id = attempt_uuid
  where q.test_id = v_test_id
    and q.active = true;

  update public.exam_attempts
  set
    max_marks = v_max,
    obtained_marks = v_obt,
    percent = case when v_max > 0 then (v_obt / v_max) * 100 else 0 end,
    graded_at = case when v_has_manual = false then now() else graded_at end,
    status = case when v_has_manual = false then 'graded' else status end
  where id = attempt_uuid;

  insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
  values (attempt_uuid, 'submit', jsonb_build_object('auto_graded', (v_has_manual = false)));
end;
$$;

create or replace function public.lock_exam_attempt(attempt_uuid uuid, reason text, event_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_session_id uuid;
begin
  v_student_id := public.current_student_id();
  if v_student_id is null then
    raise exception 'Not a student user';
  end if;

  select a.session_id into v_session_id
  from public.exam_attempts a
  where a.id = attempt_uuid
    and a.student_id = v_student_id;

  if v_session_id is null then
    raise exception 'Attempt not found';
  end if;

  if not public.can_student_access_session(v_session_id) then
    raise exception 'Session not accessible';
  end if;

  update public.exam_attempts
  set
    locked_at = now(),
    locked_reason = reason,
    lock_count = lock_count + 1,
    status = 'locked'
  where id = attempt_uuid
    and locked_at is null;

  insert into public.exam_malpractice_events (attempt_id, event_type, event_data)
  values (attempt_uuid, 'lock', jsonb_build_object('reason', reason) || coalesce(event_data, '{}'::jsonb));
end;
$$;

drop policy if exists exam_tests_staff_all on public.exam_tests;
create policy exam_tests_staff_all
  on public.exam_tests
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_tests_student_select on public.exam_tests;
create policy exam_tests_student_select
  on public.exam_tests
  for select
  to authenticated
  using (true);

drop policy if exists exam_questions_staff_all on public.exam_questions;
create policy exam_questions_staff_all
  on public.exam_questions
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_questions_student_select on public.exam_questions;
create policy exam_questions_student_select
  on public.exam_questions
  for select
  to authenticated
  using (
    exists(
      select 1
      from public.exam_test_sessions s
      where s.test_id = exam_questions.test_id
        and public.can_student_view_session(s.id)
    )
  );

drop policy if exists exam_question_solutions_staff_all on public.exam_question_solutions;
create policy exam_question_solutions_staff_all
  on public.exam_question_solutions
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_question_solutions_student_select on public.exam_question_solutions;
create policy exam_question_solutions_student_select
  on public.exam_question_solutions
  for select
  to authenticated
  using (
    exists(
      select 1
      from public.exam_questions q
      join public.exam_test_sessions s on s.test_id = q.test_id
      where q.id = exam_question_solutions.question_id
        and public.can_student_view_session_results(s.id)
    )
  );

drop policy if exists exam_sessions_staff_all on public.exam_test_sessions;
create policy exam_sessions_staff_all
  on public.exam_test_sessions
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_conductors_staff_all on public.exam_conductors;
create policy exam_conductors_staff_all
  on public.exam_conductors
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_conductor_user_links_staff_all on public.exam_conductor_user_links;
create policy exam_conductor_user_links_staff_all
  on public.exam_conductor_user_links
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_session_conductors_staff_all on public.exam_session_conductors;
create policy exam_session_conductors_staff_all
  on public.exam_session_conductors
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_sessions_conductor_select on public.exam_test_sessions;
create policy exam_sessions_conductor_select
  on public.exam_test_sessions
  for select
  to authenticated
  using (public.can_conduct_session(exam_test_sessions.id));

drop policy if exists exam_sessions_student_select on public.exam_test_sessions;
create policy exam_sessions_student_select
  on public.exam_test_sessions
  for select
  to authenticated
  using (public.can_student_view_session(exam_test_sessions.id));

drop policy if exists exam_attempts_staff_all on public.exam_attempts;
create policy exam_attempts_staff_all
  on public.exam_attempts
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_attempts_conductor_select on public.exam_attempts;
create policy exam_attempts_conductor_select
  on public.exam_attempts
  for select
  to authenticated
  using (public.can_conduct_session(exam_attempts.session_id));

drop policy if exists exam_attempts_conductor_unlock on public.exam_attempts;
create policy exam_attempts_conductor_unlock
  on public.exam_attempts
  for update
  to authenticated
  using (public.can_conduct_session(exam_attempts.session_id))
  with check (public.can_conduct_session(exam_attempts.session_id));

drop policy if exists exam_attempts_student_own on public.exam_attempts;
create policy exam_attempts_student_own
  on public.exam_attempts
  for select
  to authenticated
  using (
    exists(
      select 1
      from public.student_user_links sul
      where sul.user_id = auth.uid()
        and sul.student_id = exam_attempts.student_id
    )
  );

drop policy if exists exam_attempts_student_insert on public.exam_attempts;


drop policy if exists exam_attempts_student_update on public.exam_attempts;


drop policy if exists exam_attempt_answers_staff_all on public.exam_attempt_answers;
create policy exam_attempt_answers_staff_all
  on public.exam_attempt_answers
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_attempt_answers_student_own on public.exam_attempt_answers;
create policy exam_attempt_answers_student_own
  on public.exam_attempt_answers
  for all
  to authenticated
  using (
    exists(
      select 1
      from public.exam_attempts a
      join public.student_user_links sul on sul.student_id = a.student_id
      where a.id = exam_attempt_answers.attempt_id
        and sul.user_id = auth.uid()
        and a.locked_at is null
        and a.submitted_at is null
    )
  )
  with check (
    exists(
      select 1
      from public.exam_attempts a
      join public.student_user_links sul on sul.student_id = a.student_id
      where a.id = exam_attempt_answers.attempt_id
        and sul.user_id = auth.uid()
        and a.locked_at is null
        and a.submitted_at is null
    )
  );

drop policy if exists exam_attempt_answers_student_select on public.exam_attempt_answers;
create policy exam_attempt_answers_student_select
  on public.exam_attempt_answers
  for select
  to authenticated
  using (
    exists(
      select 1
      from public.exam_attempts a
      join public.student_user_links sul on sul.student_id = a.student_id
      where a.id = exam_attempt_answers.attempt_id
        and sul.user_id = auth.uid()
    )
  );

drop policy if exists exam_malpractice_staff_all on public.exam_malpractice_events;
create policy exam_malpractice_staff_all
  on public.exam_malpractice_events
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists exam_malpractice_conductor_all on public.exam_malpractice_events;
create policy exam_malpractice_conductor_all
  on public.exam_malpractice_events
  for all
  to authenticated
  using (
    exists(
      select 1
      from public.exam_attempts a
      where a.id = exam_malpractice_events.attempt_id
        and public.can_conduct_session(a.session_id)
    )
  )
  with check (
    exists(
      select 1
      from public.exam_attempts a
      where a.id = exam_malpractice_events.attempt_id
        and public.can_conduct_session(a.session_id)
    )
  );

drop trigger if exists exam_tests_set_updated_at on public.exam_tests;
create trigger exam_tests_set_updated_at
  before update on public.exam_tests
  for each row execute procedure public.set_updated_at();

drop trigger if exists exam_questions_set_updated_at on public.exam_questions;
create trigger exam_questions_set_updated_at
  before update on public.exam_questions
  for each row execute procedure public.set_updated_at();

drop trigger if exists exam_question_solutions_set_updated_at on public.exam_question_solutions;
create trigger exam_question_solutions_set_updated_at
  before update on public.exam_question_solutions
  for each row execute procedure public.set_updated_at();

drop trigger if exists exam_test_sessions_set_updated_at on public.exam_test_sessions;
create trigger exam_test_sessions_set_updated_at
  before update on public.exam_test_sessions
  for each row execute procedure public.set_updated_at();

drop trigger if exists exam_conductors_set_updated_at on public.exam_conductors;
create trigger exam_conductors_set_updated_at
  before update on public.exam_conductors
  for each row execute procedure public.set_updated_at();

drop trigger if exists exam_attempts_set_updated_at on public.exam_attempts;
create trigger exam_attempts_set_updated_at
  before update on public.exam_attempts
  for each row execute procedure public.set_updated_at();

drop trigger if exists exam_attempt_answers_set_updated_at on public.exam_attempt_answers;
create trigger exam_attempt_answers_set_updated_at
  before update on public.exam_attempt_answers
  for each row execute procedure public.set_updated_at();

create or replace view public.exam_attempt_list_v as
select
  a.id as attempt_id,
  a.session_id,
  a.student_id,
  st.admission_number,
  st.first_name,
  st.last_name,
  a.obtained_marks,
  a.max_marks,
  a.percent,
  a.status,
  a.locked_at,
  a.lock_count,
  a.started_at,
  a.submitted_at
from public.exam_attempts a
join public.students st on st.id = a.student_id;

create or replace view public.exam_session_summary_v as
select
  s.id as session_id,
  s.test_id,
  t.name as test_name,
  t.subject_id,
  sub.name as subject_name,
  s.class_id,
  c.level as class_level,
  c.name as class_name,
  s.starts_at,
  s.ends_at,
  s.status,
  count(a.id) filter (where a.submitted_at is not null) as completions,
  count(a.id) filter (where a.submitted_at is null) as pending,
  count(a.id) filter (where a.locked_at is not null) as locked,
  coalesce(avg(a.percent), 0) as average_percent,
  coalesce(max(a.percent), 0) as highest_percent,
  coalesce(min(a.percent), 0) as lowest_percent
from public.exam_test_sessions s
join public.exam_tests t on t.id = s.test_id
left join public.subjects sub on sub.id = t.subject_id
left join public.classes c on c.id = s.class_id
left join public.exam_attempts a on a.session_id = s.id
group by s.id, s.test_id, t.name, t.subject_id, sub.name, s.class_id, c.level, c.name, s.starts_at, s.ends_at, s.status;
