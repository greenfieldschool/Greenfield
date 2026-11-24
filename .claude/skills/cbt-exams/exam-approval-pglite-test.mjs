// PGlite test for docs/migrations/20261124b_exam_hand_in_access_approval.sql (20261124 must be in docs/schema.sql).
// Copy next to pglite-full-schema.mjs and pglite-split.mjs (supabase-migration skill), npm install
// @electric-sql/pglite@0.2.17, then: node <this file>
import { load, U } from "./pglite-full-schema.mjs";
const MIG = "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/20261124b_exam_hand_in_access_approval.sql";
const db = await load([MIG, MIG]); // run twice
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function as(uid, fn) { await db.exec(`reset role; set test.uid='${uid}'; set role authenticated;`); try { return await fn(); } finally { await db.exec("reset role;"); } }
async function refused(uid, sql, m, re) { try { await as(uid, () => db.query(sql)); ok(false, m + " (was allowed)"); } catch (e) { ok(!re || re.test(e.message), m + " wrong error: " + e.message); } }
const q = async (sql) => (await db.query(sql)).rows;
const rowsAs = async (uid, sql) => { try { return await as(uid, () => q(sql)); } catch (e) { return []; } };
const ADMIN = U(1), TEACHER = U(2), OTHER_T = U(3), FRONT = U(4), NURSE = U(5), PUPIL = U(6);
const C1 = U(30), C2 = U(31), SUBJ = U(40), SUBJ2 = U(41), Y = U(50), TERM = U(51), ST = U(60);
const OLD_T = U(70), OLD_S = U(71);
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) values ('${ADMIN}','a@x'),('${TEACHER}','t@x'),('${OTHER_T}','o@x'),('${FRONT}','f@x'),('${NURSE}','n@x'),('${PUPIL}','s@x');
insert into profiles(id, role, full_name) values ('${ADMIN}','admin','Ada Admin'),('${TEACHER}','teacher','Tom Teacher'),('${OTHER_T}','teacher','Ola Other'),('${FRONT}','front_desk','Fola Front'),('${NURSE}','nurse','Nia Nurse'),('${PUPIL}','student','Kemi');
insert into classes(id, level, name, active) values ('${C1}','primary','Primary 4',true),('${C2}','primary','Primary 5',true);
insert into subjects(id, name, level) values ('${SUBJ}','Maths','primary'),('${SUBJ2}','French','primary');
insert into class_subjects(class_id, subject_id) values ('${C1}','${SUBJ}'),('${C2}','${SUBJ}');
insert into teacher_subject_assignments(teacher_id, class_id, subject_id, active) values ('${TEACHER}','${C1}','${SUBJ}',true),('${OTHER_T}','${C1}','${SUBJ2}',true);
insert into academic_years(id, name) values ('${Y}','2026/27');
insert into academic_terms(id, academic_year_id, name, starts_on, ends_on) values ('${TERM}','${Y}','First','2026-09-14','2026-12-18');
insert into students(id, first_name, last_name, level, class_id, status) values ('${ST}','Kemi','Ade','primary','${C1}','active');
insert into student_user_links(student_id, user_id) values ('${ST}','${PUPIL}');
set session_replication_role = origin;`);
// An older test already used in a session (set before this migration) -> treated as approved on first run.
// (Inserted after the migration ran, so mark it like the backfill would.)

// 1. Access to tests and questions
const T = (await as(TEACHER, () => q(`insert into exam_tests(subject_id, name, duration_minutes, academic_term_id) values ('${SUBJ}','Maths exam',30,'${TERM}') returning id, approval_status`)))[0];
ok(T.approval_status === "draft", "new test starts as draft");
await refused(OTHER_T, `insert into exam_tests(subject_id, name) values ('${SUBJ}','Not mine')`, "teacher of another subject can't create a Maths test");
await refused(FRONT, `insert into exam_tests(subject_id, name) values ('${SUBJ}','Front desk test')`, "front desk can't create tests");
await as(TEACHER, () => q(`insert into exam_questions(id, test_id, question_type, prompt, options, marks) values ('${U(80)}','${T.id}','mcq_single','7 x 8?','[{"value":"56"},{"value":"54"}]',1)`));
await as(TEACHER, () => q(`insert into exam_question_solutions(question_id, correct_answer) values ('${U(80)}','{"value":"56"}')`));
ok((await rowsAs(FRONT, `select * from exam_questions where test_id='${T.id}'`)).length === 0, "front desk can't read questions");
ok((await rowsAs(NURSE, `select * from exam_question_solutions`)).length === 0, "nurse can't read answers");
ok((await rowsAs(OTHER_T, `select * from exam_questions where test_id='${T.id}'`)).length === 0, "another subject's teacher can't read them");
ok((await rowsAs(ADMIN, `select * from exam_questions where test_id='${T.id}'`)).length === 1, "admin reads them");
await refused(TEACHER, `update exam_tests set approval_status='approved' where id='${T.id}'`, "teacher can't approve by editing", /Send for approval/);

// 2. Sessions need an approved test, and the right class
await refused(TEACHER, `insert into exam_test_sessions(test_id, class_id, status, active) values ('${T.id}','${C1}','active',true)`, "can't open a session for a draft test", /approved/);
const S = (await as(TEACHER, () => q(`insert into exam_test_sessions(test_id, class_id, status, active, academic_term_id, starts_at, ends_at) values ('${T.id}','${C1}','draft',true,'${TERM}', now() - interval '2 hours', now() + interval '2 hours') returning id`)))[0].id;
ok(!!S, "teacher saves a draft session for their class");
await refused(TEACHER, `insert into exam_test_sessions(test_id, class_id, status, active) values ('${T.id}','${C2}','draft',true)`, "teacher can't schedule a class they don't teach");
ok((await as(ADMIN, () => q(`insert into exam_test_sessions(test_id, class_id, status, active) values ('${T.id}','${C2}','draft',true) returning id`))).length === 1, "admin schedules any class");
ok((await rowsAs(FRONT, `select id from exam_test_sessions`)).length >= 2, "front desk can still read sessions (to run rooms)");
ok((await rowsAs(FRONT, `update exam_test_sessions set status='draft' where id='${S}' returning id`)).length === 0, "front desk can't change sessions");

// 3. Submit and review
await refused(OTHER_T, `select exam_submit_test('${T.id}', null)`, "another teacher can't submit it", /subject/);
await as(TEACHER, () => q(`select exam_submit_test('${T.id}', 'Ready')`));
ok((await q(`select approval_status, submitted_by from exam_tests where id='${T.id}'`))[0].approval_status === "submitted", "submitted");
await refused(TEACHER, `select exam_submit_test('${T.id}', null)`, "can't submit twice", /already/);
await refused(TEACHER, `select exam_review_test('${T.id}', 'approve', null, true)`, "teacher can't approve", /Only admins/);
await refused(ADMIN, `select exam_review_test('${T.id}', 'return', 'no', false)`, "send back needs a real comment", /what needs changing/);
await refused(ADMIN, `select exam_review_test('${T.id}', 'approve', null, false)`, "approve needs the 20/80 tick", /20%/);
await as(ADMIN, () => q(`select exam_review_test('${T.id}', 'return', 'Question 1 repeats last term', false)`));
ok((await q(`select approval_status, review_note from exam_tests where id='${T.id}'`))[0].approval_status === "returned", "sent back with a comment");
ok((await q(`select count(*)::int n from email_outbox where user_id='${TEACHER}' and category='exam'`))[0].n === 1, "teacher emailed when sent back");
await as(TEACHER, () => q(`update exam_questions set prompt='8 x 7?' where id='${U(80)}'`));
await as(TEACHER, () => q(`select exam_submit_test('${T.id}', null)`));
await as(ADMIN, () => q(`select exam_review_test('${T.id}', 'approve', null, true)`));
ok((await q(`select approval_status from exam_tests where id='${T.id}'`))[0].approval_status === "approved", "approved");

// 4. Open the session; editing is refused while it's open; editing later sends it back to draft
await as(TEACHER, () => q(`update exam_test_sessions set status='active' where id='${S}'`));
ok((await q(`select status from exam_test_sessions where id='${S}'`))[0].status === "active", "session opens once approved");
ok((await rowsAs(PUPIL, `select id from exam_questions`)).length === 1, "pupil sees the questions in the open session");
await refused(TEACHER, `update exam_questions set prompt='changed' where id='${U(80)}'`, "can't change questions while the session is open", /open to learners/);
await refused(TEACHER, `update exam_tests set duration_minutes=45 where id='${T.id}'`, "can't change the time while open", /open to learners/);
await as(TEACHER, () => q(`update exam_tests set name='Maths exam (First term)' where id='${T.id}'`));
ok((await q(`select approval_status from exam_tests where id='${T.id}'`))[0].approval_status === "approved", "renaming keeps approval");

// 5. Hand-in when the session closes
const A = (await as(PUPIL, () => q(`select start_exam_attempt('${S}', null) as id`)))[0].id;
await as(PUPIL, () => q(`insert into exam_attempt_answers(attempt_id, question_id, answer) values ('${A}','${U(80)}','{"value":"56"}')`));
await db.exec(`update exam_test_sessions set ends_at = now() - interval '1 minute' where id='${S}'`);
ok((await q(`select exam_close_ended_sessions() n`))[0].n === 0, "no hand-in in the first 2 hours after the end (an end date set too early can be moved)");
await db.exec(`update exam_test_sessions set ends_at = now() - interval '3 hours' where id='${S}'; update exam_attempts set last_seen_at = now() - interval '3 hours' where id='${A}'`);
await refused(PUPIL, `select exam_close_ended_sessions()`, "pupils can't run the closing job");
ok((await q(`select exam_close_ended_sessions() n`))[0].n === 1, "closing job hands in the open attempt after the grace period");
const a = (await q(`select status, submitted_at, obtained_marks from exam_attempts where id='${A}'`))[0];
ok(a.submitted_at && Number(a.obtained_marks) === 1 && a.status === "graded", "handed in and marked with the saved answer: " + JSON.stringify(a));
ok((await q(`select exam_close_ended_sessions() n`))[0].n === 0, "running again does nothing");
// A school hand-in isn't final: staff can let the pupil back in (once the session is open again)
await refused(FRONT, `select exam_reopen_attempt('${A}', 'End date was wrong')`, "can't reopen while the session is closed", /Move its end date/);
await db.exec(`update exam_test_sessions set ends_at = now() + interval '1 hour' where id='${S}'`);
await refused(FRONT, `select exam_reopen_attempt('${A}', '')`, "reopening needs a reason", /why/);
await refused(PUPIL, `select exam_reopen_attempt('${A}', 'Let me back')`, "a pupil can't reopen", /not assigned/);
await as(FRONT, () => q(`select exam_reopen_attempt('${A}', 'End date was set too early')`));
const back = (await q(`select status, submitted_at from exam_attempts where id='${A}'`))[0];
ok(back.status === "in_progress" && back.submitted_at === null, "let back in: writing again");
ok((await as(PUPIL, () => q(`select * from exam_checkin('${A}', 'load', null)`)))[0].submitted === false, "pupil carries on");
// A pupil's own Submit stays final
await as(PUPIL, () => q(`select submit_exam_attempt('${A}')`));
await refused(ADMIN, `select exam_reopen_attempt('${A}', 'Wants to change an answer')`, "own Submit can't be reopened", /their own answers/);
// Conductor/staff "hand in everyone still writing"
await db.exec(`update exam_test_sessions set ends_at = now() + interval '1 hour' where id='${S}'`);
await db.exec(`set session_replication_role = replica; insert into students(id, first_name, last_name, level, class_id, status) values ('${U(61)}','Tobi','Ola','primary','${C1}','active'); insert into exam_attempts(id, session_id, student_id, clock_started_at) values ('${U(90)}','${S}','${U(61)}', now()); set session_replication_role = origin;`);
await refused(PUPIL, `select exam_hand_in_open('${S}', null)`, "pupil can't hand everyone in", /not assigned/);
ok((await as(FRONT, () => q(`select exam_hand_in_open('${S}', 'End of exam') n`)))[0].n === 1, "staff hand in everyone still writing");

// 6. Session for the approved test can't be reopened after the test goes back to draft
await db.exec(`update exam_test_sessions set status='draft' where id='${S}'`);
await as(TEACHER, () => q(`update exam_questions set marks=2 where id='${U(80)}'`));
ok((await q(`select approval_status from exam_tests where id='${T.id}'`))[0].approval_status === "draft", "changing questions after approval puts it back to draft");
await refused(TEACHER, `update exam_test_sessions set status='active' where id='${S}'`, "and the session can't open again until re-approved", /approved/);
ok((await q(`select count(*)::int n from exam_test_events where test_id='${T.id}'`))[0].n >= 5, "every step logged");
ok((await q(`select exam_questions_due('${TERM}') d`))[0].d.toISOString().slice(0, 10) === "2026-09-25", "due Friday of week 2 (term starts Mon 14 Sep)");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
