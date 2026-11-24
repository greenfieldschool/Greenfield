---
name: cbt-exams
description: Use for the online (CBT) exams: tests and questions, sessions, pupils sitting exams on the portal, the tab-switch lock and the 10-second rule, the time limit and clock, unlocking and extra time (conductor and admin), conductors, marking and releasing results, and setting/approving exam questions.
---

# CBT exams

## When to use
Anything in `/admin/exams/**`, `/conductor/**` or `/portal/exams/**`. Use with results-and-reports (CBT scores into
result sheets), school-policies (staff policy "Examination questions": due Friday of week 2, approval, format) and
security-and-privacy (who can see questions and answers).

## Where things live
- Tables: `exam_tests` (subject, name, `duration_minutes`), `exam_questions` (+ `exam_question_solutions`, staff
  only), `exam_test_sessions` (test × class, `starts_at`/`ends_at` Lagos start/end of day, `status` draft/active,
  `requires_secret_code`, `results_released_at`), `exam_attempts`, `exam_attempt_answers`,
  `exam_malpractice_events` (everything that happens to an attempt), conductors (`exam_conductors`,
  `exam_conductor_user_links`, `exam_session_conductors`). Views `exam_attempt_list_v`, `exam_session_summary_v`
  filter rows with `can_see_exam_session()` (20261123_view_row_checks).
- Pupil: `src/app/portal/exams/[id]/page.tsx` (start, sit, locked screen, submitted), `ExamGuardClient.tsx`
  (away/back/heartbeat, countdown), `ExamAnswersClient.tsx`, routes `/portal/exams/{checkin,answer,submit,lock}`.
- Room: `src/components/exams/exam-room.tsx` (`ExamRoom`: writing/locked/handed in, time left, unlock one or
  everyone with a reason, add time; refreshes every 10 s), actions `src/lib/exam-room-actions.ts`, words and time
  maths `src/lib/exam-room.ts`. Used on `/conductor/sessions/[id]` and `/admin/exams/sessions/[id]/attempts`.
- Help: Learn Centre `LEARN.tests`, `LEARN.sessions`, `LEARN.examRoom`, `LEARN.marking`; portal `HELP.exams`.

## Locks and time (20261124_exam_lockouts_and_time.sql, decided 24 Nov 2026 by the user)
- The page reports `away` (hidden or lost focus), `back` (with the browser's hidden seconds), `heartbeat` every 15 s
  and `load` (server render) to `exam_checkin()`. Away 10+ s locks (`left_page`); a check-in more than 45 s after
  the last one while the clock was running locks as `interrupted` (power cut, network, closed browser) and counts
  time only to the last check-in. Short trips are logged (`left_page` / `back` events).
- Clock: `used_seconds` + running stretch from `clock_started_at`; stopped while away, locked or cut off; restarts
  on the next check-in after an unlock. Time left = duration + `extra_seconds` − used. At zero `exam_checkin`
  hands in through `submit_exam_attempt`; the answers trigger refuses saves more than 60 s after time is up.
- `exam_unlock_attempts(session, attempt|null, note, reason)`: staff or an assigned conductor; reason from
  power_cut/network/device/left_page/other (other needs a note). Extra time: see below (ticked pupils or everyone,
  with a reason), 2 hours in all per pupil. `exam_room_info(session)` gives conductors the test name and time limit.
- `lock_exam_attempt` (old pages) now behaves as `away`.
- Test: [`exam-lockouts-pglite-test.mjs`](exam-lockouts-pglite-test.mjs) (31 checks). Conductor access:
  `supabase-migration/exam-conductor-pglite-test.mjs`.

## Pitfalls we hit
- Before 20261123b, unlocking cleared `locked_at` but left `status = 'locked'`, and the pupil page treats either as
  locked, so unlocked pupils stayed locked; non-staff conductors couldn't get in at all. Pupils reported "can't see
  the questions".
- Locking on every `blur` locked pupils whose phone screen dimmed or who tapped the address bar. Keep the 10 s rule.
- Pupils can't update `exam_attempts`; every pupil change goes through a security definer function.
- Nobody may sign in as a pupil. After a power cut pupils sign in with their own details.
- Until 20261124b every non-teaching staff member (front desk, nurse) could create, change and delete every test,
  question and correct answer, and read them through `is_staff()` in the pupil read rules.
- Raise messages are format strings: a `%` must be written `%%`.

## Hand-in, access and approval (20261124b_exam_hand_in_access_approval.sql + 20261124c schedule)
- `exam_finalise_attempt()` marks and hands in an attempt with its saved answers (internal). `exam_hand_in_open(session)`
  ("Hand in everyone" in the room; staff or the session's conductor). `exam_close_ended_sessions()` runs every 15
  minutes (pg_cron job `exam-close-ended-sessions`) for sessions whose end passed **more than 2 hours ago** and pupils
  silent for 30 minutes (decided 24 Nov 2026: a premature close must not be a final hand-in). Events
  `handed_in_by_school`. `exam_reopen_attempt(attempt, reason)` ("Let back in"): only school hand-ins (latest of
  submit/time_up/handed_in_by_school/reopened is handed_in_by_school), not after results are released, only while
  the session is open; logs `reopened`. A pupil's own Submit and time running out are final.
- Extra time: `exam_add_time(session, attempts uuid[] | null = everyone not handed in, minutes 1–60, reason
  late_start/interruption/access_arrangement/other (+note), note)`; room tick boxes use the `form` attribute to join
  the one Add time form.
- Access: `can_manage_test()` = admins, or teachers who created the test or teach its subject. Questions and
  solutions are for them (and pupils in an open/released session). Staff read sessions (`exam_sessions_staff_select`)
  to run rooms; `can_schedule_test(test, class)` lets teachers change sessions only for classes they teach that
  subject in (`exam_sessions_manage`). `/admin/exams/tests` is in route-access `resultsPrefixes` (admins + teachers)
  and the menu item has `roles: ["teacher"]`.
- Approval: `exam_tests.approval_status` draft → submitted → approved / returned, `academic_term_id`,
  `submitted_*`, `reviewed_*`, `review_note`; log `exam_test_events`. Only `exam_submit_test()` (needs a term and
  questions) and `exam_review_test()` (admins; approve needs the 20/80 tick, send back needs a comment; emails the
  teacher, category `exam`) change it: `exam_tests_approval_guard` refuses direct changes and forces draft on insert
  (so Duplicate makes a draft). Changing questions, answers, time or subject of a submitted/approved test puts it
  back to draft, and is refused while a session for it is open. `exam_sessions_need_approval` stops a session
  opening for an unapproved test. Backfill: tests with a session were set approved on the first run.
- Due date: `exam_questions_due(term)` / `questionsDue()` = Friday of week 2 (first Friday on or after the start, +7).
- Screens: `tests/[id]/approval-panel.tsx` (status, term, deadline, checks: policy format via `formatCheck`, answers
  set, repeats via `normalisePrompt`; send; approve/send back; history), actions `approval-actions.ts`, words in
  `src/lib/exam-approval.ts`. Tests list: approval badge, filter `?approval=`, term on create, counts. Session
  forms mark "(not approved yet)". Exams overview: waiting for approval, sessions open now, pupils locked.
- Test: [`exam-approval-pglite-test.mjs`](exam-approval-pglite-test.mjs) (45 checks).

## Expert review
Before calling the work done, answer these as an examinations officer with 30+ years (WAEC/NECO-style CBT) would. Where an answer needs a decision the school hasn't made, ask.
- **Fair to the candidate:** can an interruption that isn't the pupil's fault cost them time or marks?
- **Secure:** can a pupil see questions before the session opens, answers after time, or other pupils' work?
- **Recorded:** is every lock, unlock, extra minute and hand-in in `exam_malpractice_events` with who did it?
- **Workable in a hall:** can one conductor recover a whole room after a power cut in under a minute?
- **Approved questions only** reach pupils: a session can't open for an unapproved test, and changes send it back to draft.
