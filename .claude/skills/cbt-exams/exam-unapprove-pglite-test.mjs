// PGlite test for docs/migrations/20261127_exam_unapprove.sql (Unapprove a paper).
// Copy next to pglite-full-schema.mjs and pglite-split.mjs (supabase-migration skill), npm install
// @electric-sql/pglite@0.2.17, then: node <this file> [path to docs/schema.sql]
import { load, U } from "./pglite-full-schema.mjs";
const D = "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/";
const MIG = D + "20261127_exam_unapprove.sql";
const db = await load([D + "20261125e_exam_session_class_required.sql", MIG, MIG]); // new file twice
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function as(uid, fn) { await db.exec(`reset role; set test.uid='${uid}'; set role authenticated;`); try { return await fn(); } finally { await db.exec("reset role;"); } }
async function refused(uid, sql, m, re) { try { await as(uid, () => db.query(sql)); ok(false, m + " (was allowed)"); } catch (e) { ok(!re || re.test(e.message), m + " wrong error: " + e.message); } }
const q = async (sql) => (await db.query(sql)).rows;
const rowsAs = async (uid, sql) => { try { return await as(uid, () => q(sql)); } catch (e) { return []; } };
const ADMIN = U(1), TEACHER = U(2), FRONT = U(4), PUPIL = U(6);
const C1 = U(30), SUBJ = U(40), Y = U(50), TERM = U(51), ST = U(60), QN = U(80);
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) values ('${ADMIN}','a@x'),('${TEACHER}','t@x'),('${FRONT}','f@x'),('${PUPIL}','s@x');
insert into profiles(id, role, full_name) values ('${ADMIN}','admin','Ada Admin'),('${TEACHER}','teacher','Tom Teacher'),('${FRONT}','front_desk','Fola Front'),('${PUPIL}','student','Kemi');
insert into classes(id, level, name, active) values ('${C1}','primary','Primary 4',true);
insert into subjects(id, name, level) values ('${SUBJ}','Maths','primary');
insert into class_subjects(class_id, subject_id) values ('${C1}','${SUBJ}');
insert into teacher_subject_assignments(teacher_id, class_id, subject_id, active) values ('${TEACHER}','${C1}','${SUBJ}',true);
insert into academic_years(id, name) values ('${Y}','2026/27');
insert into academic_terms(id, academic_year_id, name, starts_on, ends_on) values ('${TERM}','${Y}','First','2026-09-14','2026-12-18');
insert into students(id, first_name, last_name, level, class_id, status) values ('${ST}','Kemi','Ade','primary','${C1}','active');
insert into student_user_links(student_id, user_id) values ('${ST}','${PUPIL}');
set session_replication_role = origin;`);

const T = (await as(TEACHER, () => q(`insert into exam_tests(subject_id, name, duration_minutes, academic_term_id) values ('${SUBJ}','Maths exam',30,'${TERM}') returning id`)))[0].id;
await as(TEACHER, () => q(`insert into exam_questions(id, test_id, question_type, prompt, options, marks) values ('${QN}','${T}','mcq_single','7 x 8?','[{"value":"56"},{"value":"54"}]',1)`));
await as(TEACHER, () => q(`insert into exam_question_solutions(question_id, correct_answer) values ('${QN}','{"value":"56"}')`));
const approve = async () => {
  await as(TEACHER, () => q(`select exam_submit_test('${T}', null)`));
  await as(ADMIN, () => q(`select exam_review_test('${T}', 'approve', null, true)`));
};
const status = async () => (await q(`select approval_status from exam_tests where id='${T}'`))[0].approval_status;
const emails = async () => (await q(`select count(*)::int n from email_outbox where user_id='${TEACHER}' and category='exam'`))[0].n;

// 1. Not approved yet: nothing to unapprove
await refused(ADMIN, `select exam_unapprove_test('${T}', 'wrong_answer', null)`, "a draft can't be unapproved", /isn't approved/);
await approve();
const S = (await as(TEACHER, () => q(`insert into exam_test_sessions(test_id, class_id, status, active, academic_term_id, starts_at, ends_at) values ('${T}','${C1}','active',true,'${TERM}', now() - interval '1 hour', now() + interval '2 hours') returning id`)))[0].id;
ok((await rowsAs(PUPIL, `select id from exam_questions`)).length === 1, "approved and open: the learner sees the questions");

// 2. Who may unapprove, and the reason
await refused(TEACHER, `select exam_unapprove_test('${T}', 'wrong_answer', null)`, "the teacher who set it can't unapprove", /Only admins/);
await refused(FRONT, `select exam_unapprove_test('${T}', 'wrong_answer', null)`, "front desk can't unapprove", /Only admins/);
await refused(PUPIL, `select exam_unapprove_test('${T}', 'wrong_answer', null)`, "a learner can't unapprove", /Only admins/);
await refused(ADMIN, `select exam_unapprove_test('${T}', null, null)`, "a reason is required", /Choose why/);
await refused(ADMIN, `select exam_unapprove_test('${T}', 'because', null)`, "only reasons from the list", /Choose why/);
await refused(ADMIN, `select exam_unapprove_test('${T}', 'other', '  ')`, "Other needs words", /Say what is wrong/);
await refused(TEACHER, `update exam_tests set approval_status='returned' where id='${T}'`, "approval can't be changed by editing the row", /Send for approval/);
ok((await status()) === "approved", "still approved after the refusals");

// 3. Admin unapproves before anyone sat it
const before = await emails();
await as(ADMIN, () => q(`select exam_unapprove_test('${T}', 'wrong_answer', 'free text is ignored for listed reasons')`));
const t1 = (await q(`select approval_status, review_note, reviewed_by from exam_tests where id='${T}'`))[0];
ok(t1.approval_status === "returned" && t1.reviewed_by === ADMIN, "sent back: " + JSON.stringify(t1));
ok(/A correct answer is wrong or missing/.test(t1.review_note), "the teacher sees the reason: " + t1.review_note);
const e1 = (await q(`select note, detail, done_by, done_by_name from exam_test_events where test_id='${T}' and action='unapproved'`));
ok(e1.length === 1 && e1[0].done_by === ADMIN && e1[0].done_by_name === "Ada Admin", "history records who");
ok(e1[0]?.note === "A correct answer is wrong or missing" && e1[0]?.detail.reason === "wrong_answer" && e1[0]?.detail.learners_sat === 0, "and why: " + JSON.stringify(e1[0]));
ok((await emails()) === before + 1, "the teacher is emailed");
ok((await rowsAs(PUPIL, `select id from exam_questions`)).length === 0, "learners can't see the questions any more");
ok((await as(PUPIL, () => q(`select * from portal_student_exam_sessions()`))).length === 0, "nor the session in their list");
ok((await q(`select status from exam_test_sessions where id='${S}'`))[0].status === "active", "the session itself is kept");
await refused(ADMIN, `select exam_unapprove_test('${T}', 'wrong_answer', null)`, "can't unapprove twice", /isn't approved/);
// The teacher can fix it and send it again; approval reopens the session by itself
await as(TEACHER, () => q(`update exam_questions set prompt='8 x 7?' where id='${QN}'`));
await approve();
ok((await rowsAs(PUPIL, `select id from exam_questions`)).length === 1, "approved again: the session opens with no other step");

// 4. While a learner is writing: refused, their work kept
const A = (await as(PUPIL, () => q(`select start_exam_attempt('${S}', null) as id`)))[0].id;
await as(PUPIL, () => q(`insert into exam_attempt_answers(attempt_id, question_id, answer) values ('${A}','${QN}','{"value":"56"}')`));
await refused(ADMIN, `select exam_unapprove_test('${T}', 'question_error', null)`, "refused while a learner is still writing", /still writing.*1 not handed in/);
ok((await status()) === "approved", "nothing changed");
await as(PUPIL, () => q(`select submit_exam_attempt('${A}')`));
const marks = (await q(`select obtained_marks, submitted_at from exam_attempts where id='${A}'`))[0];

// 5. After the learner handed in: allowed (decided by the user); answers and marks kept
await as(ADMIN, () => q(`select exam_unapprove_test('${T}', 'other', 'Question 1 is printed twice')`));
const e2 = (await q(`select note, detail from exam_test_events where test_id='${T}' and action='unapproved' order by done_at desc, id limit 1`))[0];
ok(e2.note === "Question 1 is printed twice" && e2.detail.reason === "other" && e2.detail.learners_sat === 1, "Other's words and the learner count logged: " + JSON.stringify(e2));
const after = (await q(`select obtained_marks, submitted_at from exam_attempts where id='${A}'`))[0];
ok(String(after.obtained_marks) === String(marks.obtained_marks) && String(after.submitted_at) === String(marks.submitted_at), "the learner's marks are untouched");
ok((await q(`select count(*)::int n from exam_attempt_answers where attempt_id='${A}'`))[0].n === 1, "and their answers kept");
const mail = (await q(`select * from email_outbox where user_id='${TEACHER}' and category='exam' order by created_at desc limit 1`))[0];
ok(/Duplicate/.test(JSON.stringify(mail)), "the email says to use Duplicate for a paper that was sat");

// 6. Nothing is deleted or rewritten
await refused(TEACHER, `delete from exam_questions where id='${QN}'`, "an answered question can't be deleted", /answered this question/);
await refused(ADMIN, `delete from exam_questions where id='${QN}'`, "not even by an admin", /answered this question/);
await refused(ADMIN, `insert into exam_test_events(test_id, action) values ('${T}','unapproved')`, "nobody writes the history by hand");
ok((await rowsAs(ADMIN, `update exam_test_events set note='x' returning id`)).length === 0, "nor edits it");
ok((await rowsAs(ADMIN, `delete from exam_test_events returning id`)).length === 0, "nor deletes it");
ok((await q(`select count(*)::int n from exam_test_events where test_id='${T}' and action='unapproved'`))[0].n === 2, "both unapprovals still in the history");
// A question nobody answered can still be deleted (test is sent back, so not frozen in the database)
await as(TEACHER, () => q(`insert into exam_questions(id, test_id, question_type, prompt, options, marks) values ('${U(81)}','${T}','mcq_single','2 + 2?','[{"value":"4"}]',1)`));
ok((await as(TEACHER, () => q(`delete from exam_questions where id='${U(81)}' returning id`))).length === 1, "an unanswered question can still be deleted");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
