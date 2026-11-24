// PGlite test for docs/migrations/20261124_exam_lockouts_and_time.sql (needs 20261123b in docs/schema.sql).
// Copy next to pglite-full-schema.mjs and pglite-split.mjs (supabase-migration skill), npm install
// @electric-sql/pglite@0.2.17, then: node <this file>
import { load, U } from "./pglite-full-schema.mjs";
const MIG = "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/20261124_exam_lockouts_and_time.sql";
const db = await load([MIG, MIG]); // run twice
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function as(uid, fn) { await db.exec(`reset role; set test.uid='${uid}'; set role authenticated;`); try { return await fn(); } finally { await db.exec("reset role;"); } }
async function refused(uid, sql, m, re) { try { await as(uid, () => db.query(sql)); ok(false, m + " (was allowed)"); } catch (e) { ok(!re || re.test(e.message), m + " wrong error: " + e.message); } }
const q = async (sql) => (await db.query(sql)).rows;
const ADMIN = U(1), PUPIL = U(5), PUPIL2 = U(6), CONDUCTOR = U(7), TEACHER = U(8), PARENT = U(9);
const C = U(30), ST = U(20), ST2 = U(21), T = U(40), S = U(41), SUBJ = U(42), CD = U(43);
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) values ('${ADMIN}','a@x'),('${PUPIL}','s@x'),('${PUPIL2}','s2@x'),('${CONDUCTOR}','c@x'),('${TEACHER}','t@x'),('${PARENT}','p@x');
insert into profiles(id, role) values ('${ADMIN}','admin'),('${PUPIL}','student'),('${PUPIL2}','student'),('${CONDUCTOR}','parent'),('${TEACHER}','teacher'),('${PARENT}','parent');
insert into classes(id, level, name, active) values ('${C}','primary','Primary 4',true);
insert into students(id, first_name, last_name, level, class_id, status) values ('${ST}','Kemi','Ade','primary','${C}','active'),('${ST2}','Tobi','Ola','primary','${C}','active');
insert into student_user_links(student_id, user_id) values ('${ST}','${PUPIL}'),('${ST2}','${PUPIL2}');
insert into subjects(id, name, level) values ('${SUBJ}','Maths','primary');
insert into exam_tests(id, subject_id, name, duration_minutes) values ('${T}','${SUBJ}','Maths CA',30);
insert into exam_questions(id, test_id, question_type, prompt, options, marks) values ('${U(50)}','${T}','mcq_single','2+2?','["3","4"]',1);
insert into exam_question_solutions(question_id, correct_answer) values ('${U(50)}','{"value":"4"}');
insert into exam_test_sessions(id, test_id, class_id, status, active, starts_at, ends_at) values ('${S}','${T}','${C}','active',true, now()-interval '1 hour', now()+interval '5 hours');
insert into exam_conductors(id, full_name) values ('${CD}','Mr Invigilator');
insert into exam_conductor_user_links(conductor_id, user_id) values ('${CD}','${CONDUCTOR}');
insert into exam_session_conductors(session_id, conductor_id) values ('${S}','${CD}');
set session_replication_role = origin;`);

const att = (uid) => as(uid, () => q(`select start_exam_attempt('${S}', null) as id`)).then((r) => r[0].id);
const checkin = (uid, a, ev, hidden = "null") => as(uid, () => q(`select * from exam_checkin('${a}', '${ev}', ${hidden})`)).then((r) => r[0]);
const row = async (a) => (await q(`select * from exam_attempts where id='${a}'`))[0];
// Move the attempt's clock back in time by n seconds (simulates time passing).
const age = (a, n) => db.exec(`update exam_attempts set clock_started_at = clock_started_at - interval '${n} seconds', last_seen_at = last_seen_at - interval '${n} seconds', away_since = away_since - interval '${n} seconds' where id='${a}'`);

// 1. Starting starts the clock; 30 minutes
const A = await att(PUPIL);
let r = await checkin(PUPIL, A, "load");
ok(!r.locked && r.seconds_left > 1790 && r.seconds_left <= 1800, "30 minutes on the clock: " + r.seconds_left);
await refused(PUPIL2, `select * from exam_checkin('${A}', 'load', null)`, "another pupil can't check in", /not found/);
await refused(PARENT, `select * from exam_checkin('${A}', 'load', null)`, "a parent can't", /Not a learner/);

// 2. Away less than 10 seconds: recorded, not locked, clock paused
await checkin(PUPIL, A, "away");
ok((await row(A)).clock_started_at === null && (await row(A)).away_since !== null, "away stops the clock");
await db.exec(`update exam_attempts set away_since = now() - interval '5 seconds' where id='${A}'`);
r = await checkin(PUPIL, A, "back", 5);
ok(!r.locked, "5 seconds away: not locked");
ok((await q(`select count(*)::int n from exam_malpractice_events where attempt_id='${A}' and event_type in ('left_page','back')`))[0].n === 2, "leaving and coming back are recorded");
// The old instant-lock call now behaves as 'away'
await as(PUPIL, () => q(`select lock_exam_attempt('${A}', 'blur', '{}')`));
ok((await row(A)).locked_at === null, "old lock call no longer locks at once");
await checkin(PUPIL, A, "back", 2);

// 3. Away 10+ seconds locks; time away isn't counted
await age(A, 60); // 60 seconds of exam time pass
await checkin(PUPIL, A, "heartbeat"); // within 45 s? last_seen moved back 60 s -> counts as cut off
r = await checkin(PUPIL, A, "load");
ok(r.locked && r.locked_reason === "interrupted", "a 60-second silence (power cut) locks as interrupted: " + r.locked_reason);
const usedAfterCut = (await row(A)).used_seconds;
ok(usedAfterCut <= 5, "the cut-off time isn't counted against the pupil: " + usedAfterCut);
await refused(PUPIL, `insert into exam_attempt_answers(attempt_id, question_id, answer) values ('${A}','${U(50)}','{"value":"4"}')`, "locked pupil can't answer");

// 4. Conductor unlocks with a reason; clock resumes on the next check-in
await refused(CONDUCTOR, `select exam_unlock_attempts('${S}', null, null, null)`, "bulk unlock needs a reason", /why/);
await refused(CONDUCTOR, `select exam_unlock_attempts('${S}', null, null, 'other')`, "'other' needs a note", /Say why/);
await refused(TEACHER, `select exam_unlock_attempts('${S}', null, null, 'cheating')`, "unknown reason refused", /Choose why/);
ok((await as(CONDUCTOR, () => q(`select exam_unlock_attempts('${S}', null, null, 'power_cut') n`)))[0].n === 1, "conductor unlocks everyone after a power cut");
ok((await row(A)).unlock_reason === "power_cut" && (await row(A)).status === "in_progress", "reason saved, attempt back in progress");
r = await checkin(PUPIL, A, "load");
ok(!r.locked && (await row(A)).clock_started_at !== null, "pupil continues, clock running again");

// 5. Away 12 seconds (browser reports it) locks as left_page
await checkin(PUPIL, A, "away");
await db.exec(`update exam_attempts set away_since = now() - interval '12 seconds' where id='${A}'`);
r = await checkin(PUPIL, A, "back", 12);
ok(r.locked && r.locked_reason === "left_page", "12 seconds away locks");
await as(ADMIN, () => q(`select exam_unlock_attempts('${S}', '${A}', null, 'left_page')`));
await checkin(PUPIL, A, "load");
// If the 'away' message never arrived, the browser's hidden time still counts
r = await checkin(PUPIL, A, "back", 30);
ok(r.locked, "30 hidden seconds reported on return locks even if 'away' was lost");
await as(ADMIN, () => q(`select exam_unlock_attempts('${S}', '${A}', null, 'left_page')`));
await checkin(PUPIL, A, "load");

// 6. Extra time and time running out
await refused(TEACHER, `select exam_add_time('${S}', array['${A}']::uuid[], 90, 'late_start', null)`, "more than 60 minutes refused", /1 and 60/);
await refused(PARENT, `select exam_add_time('${S}', array['${A}']::uuid[], 5, 'late_start', null)`, "a parent can't add time", /not assigned/);
await refused(TEACHER, `select exam_add_time('${S}', array['${A}']::uuid[], 5, null, null)`, "a reason is required", /why/);
await refused(TEACHER, `select exam_add_time('${S}', array['${A}']::uuid[], 5, 'other', '')`, "'other' needs a note", /Say why/);
await refused(TEACHER, `select exam_add_time('${S}', array[]::uuid[], 5, 'late_start', null)`, "no pupils ticked", /Tick/);
const before = (await checkin(PUPIL, A, "heartbeat")).seconds_left;
ok((await as(CONDUCTOR, () => q(`select exam_add_time('${S}', array['${A}']::uuid[], 5, 'access_arrangement', 'Agreed extra time') n`)))[0].n === 1, "conductor adds 5 minutes for a ticked pupil, with a reason");
ok((await q(`select event_data->>'reason' r from exam_malpractice_events where attempt_id='${A}' and event_type='extra_time'`))[0].r === "access_arrangement", "the reason is recorded");
const after = (await checkin(PUPIL, A, "heartbeat")).seconds_left;
ok(after - before >= 295 && after - before <= 305, "5 minutes added: " + (after - before));
await db.exec(`update exam_attempts set used_seconds = 2100 - 10, clock_started_at = now() - interval '20 seconds', last_seen_at = now() where id='${A}'`);
await as(PUPIL, () => q(`insert into exam_attempt_answers(attempt_id, question_id, answer) values ('${A}','${U(50)}','{"value":"4"}')`)); // within grace
r = await checkin(PUPIL, A, "heartbeat");
ok(r.submitted && r.seconds_left === 0, "handed in automatically when time runs out");
ok(Number((await row(A)).obtained_marks) === 1, "the saved answer was marked");
const B = await att(PUPIL2);
await db.exec(`update exam_attempts set used_seconds = 1800 + 120, last_seen_at = now() where id='${B}'`);
await refused(PUPIL2, `insert into exam_attempt_answers(attempt_id, question_id, answer) values ('${B}','${U(50)}','{"value":"4"}')`, "no answers after time is up", /Time is up/);

// 7. Who can see the new records
ok((await as(CONDUCTOR, () => q(`select * from exam_malpractice_events`))).length > 0, "conductor reads the session's records");
try { await as(PUPIL, () => q(`update exam_attempts set extra_seconds = 3000 where id='${A}'`)); } catch {}
ok((await row(A)).extra_seconds === 300, "pupil can't give themselves time");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
