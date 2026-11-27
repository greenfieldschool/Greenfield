-- Unapprove an exam paper (27 Nov 2026). Safe to run twice. Run AFTER 20261125e_exam_session_class_required.sql.
--
-- Why: admins need to take approval back from a paper (and so its questions) when a mistake or problem is found
-- after approving it, and send it back to the teacher to be fixed.
--
-- 1. exam_unapprove_test(test, reason, note): admins only. The reason comes from a fixed list; only "other" takes
--    free text (and needs it). The paper goes to "Sent back" (approval_status 'returned'), so learners can't open it
--    in any session until it is approved again; scheduled sessions stay as they are and open by themselves after the
--    new approval. Logged in exam_test_events as 'unapproved' with the reason and how many learners had sat it.
--    The teacher is emailed.
-- 2. Refused while any learner is still writing (or locked) in a session for the paper, so nobody's work is cut off:
--    wait for them, or use "Hand in everyone" in the exam room first.
-- 3. Decided by the user: a paper learners have already sat can still be unapproved. Their answers, marks and
--    released results are kept exactly as they are. (Questions of a paper that was sat are locked on its page, so
--    the teacher fixes it with Duplicate.)
-- 4. A question learners have answered can no longer be deleted (deleting it used to delete their answers).

-- ---------------------------------------------------------------------------------------------------------------

alter table public.exam_test_events drop constraint if exists exam_test_events_action_check;
alter table public.exam_test_events add constraint exam_test_events_action_check
  check (action in ('submitted', 'approved', 'returned', 'back_to_draft', 'unapproved'));

-- The reasons, in the words staff read. Unknown codes give null.
create or replace function public.exam_unapprove_reason_label(p_reason text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_reason
    when 'wrong_answer' then 'A correct answer is wrong or missing'
    when 'question_error' then 'A question or its options have a mistake'
    when 'format' then 'The paper doesn''t follow the policy format'
    when 'repeated' then 'Questions repeat an earlier examination'
    when 'syllabus' then 'Not 20% past work and 80% this term''s syllabus'
    when 'wrong_details' then 'Wrong subject, term or time allowed'
    when 'other' then 'Other'
  end;
$$;
revoke all on function public.exam_unapprove_reason_label(text) from public, anon;
grant execute on function public.exam_unapprove_reason_label(text) to authenticated;

create or replace function public.exam_unapprove_test(p_test uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.exam_tests%rowtype;
  v_label text := public.exam_unapprove_reason_label(p_reason);
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_writing int;
  v_sat int;
  v_sessions int;
  v_released int;
  v_text text;
  v_to uuid;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only admins can unapprove exam questions.';
  end if;
  if v_label is null then
    raise exception 'Choose why you are unapproving this paper.';
  end if;
  if p_reason = 'other' and (v_note is null or length(v_note) < 5) then
    raise exception 'Say what is wrong, so the teacher knows what to fix.';
  end if;
  if p_reason <> 'other' then
    v_note := null; -- only "Other" takes free text
  end if;

  select * into t from public.exam_tests where id = p_test for update;
  if t.id is null then
    raise exception 'That test was not found.';
  end if;
  if t.approval_status <> 'approved' then
    raise exception 'This paper isn''t approved, so there is nothing to unapprove.';
  end if;

  select count(*) filter (where a.submitted_at is null),
         count(*) filter (where a.submitted_at is not null)
  into v_writing, v_sat
  from public.exam_attempts a
  join public.exam_test_sessions s on s.id = a.session_id
  where s.test_id = p_test and s.active;
  if v_writing > 0 then
    raise exception 'Learners are still writing this paper (% not handed in). Wait until they finish, or use Hand in everyone in the exam room, then unapprove it.', v_writing;
  end if;

  select count(*) filter (where s.results_released_at is null and (s.ends_at is null or s.ends_at >= now())),
         count(*) filter (where s.results_released_at is not null)
  into v_sessions, v_released
  from public.exam_test_sessions s
  where s.test_id = p_test and s.active;

  v_text := case when p_reason = 'other' then v_note else v_label end;

  perform set_config('app.exam_approval', 'on', true);
  update public.exam_tests
  set approval_status = 'returned', reviewed_at = now(), reviewed_by = auth.uid(),
      review_note = 'Approval taken back: ' || v_text
  where id = p_test;
  perform set_config('app.exam_approval', '', true);

  insert into public.exam_test_events (test_id, action, note, detail, done_by, done_by_name)
  values (p_test, 'unapproved', v_text,
          jsonb_build_object('reason', p_reason, 'reason_label', v_label, 'learners_sat', v_sat,
                             'sessions_waiting', v_sessions, 'results_released', v_released),
          auth.uid(), public.exam_actor_name());

  v_to := coalesce(t.submitted_by, t.created_by);
  if v_to is not null and v_to <> auth.uid() then
    perform public.email_enqueue(
      v_to, 'exam',
      'Exam questions sent back: ' || t.name,
      'Approval of your exam questions was taken back',
      'Reason: ' || v_text || '. Learners can''t open this paper until it is approved again. '
        || case when v_sat > 0
             then v_sat || ' learner' || case when v_sat = 1 then ' has' else 's have' end
                  || ' already sat it; their answers and marks are kept. Its questions are locked, so use Duplicate to make a corrected copy and send that for approval.'
             else 'Make the changes, then send it for approval again.'
           end,
      '/admin/exams/tests/' || t.id::text, t.id, 2
    );
  end if;
end;
$$;

revoke all on function public.exam_unapprove_test(uuid, text, text) from public, anon;
grant execute on function public.exam_unapprove_test(uuid, text, text) to authenticated;

-- Learners' answers are never deleted with a question.
create or replace function public.exam_questions_keep_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.exam_attempt_answers a where a.question_id = old.id) then
    raise exception 'Learners have answered this question, so it can''t be deleted. Untick Active to take it off the paper instead.';
  end if;
  return old;
end;
$$;
revoke all on function public.exam_questions_keep_answered() from public, anon, authenticated;

drop trigger if exists exam_questions_keep_answered on public.exam_questions;
create trigger exam_questions_keep_answered
  before delete on public.exam_questions
  for each row execute function public.exam_questions_keep_answered();
