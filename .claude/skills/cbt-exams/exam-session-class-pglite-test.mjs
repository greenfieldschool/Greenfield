// PGlite test for docs/migrations/20261125e_exam_session_class_required.sql (schema.sql must include 20261125c/d).
// Copy next to pglite-full-schema.mjs and pglite-split.mjs (supabase-migration skill), npm install
// @electric-sql/pglite@0.2.17, then: node <this file> <path to docs/schema.sql> <path to the migration>
import { load, U } from "./pglite-full-schema.mjs";
const MIG = process.argv[3] ?? "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/20261125e_exam_session_class_required.sql";
const db = await load([MIG, MIG]); // twice
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function as(uid, fn) { await db.exec(`reset role; set test.uid='${uid}'; set role authenticated;`); try { return await fn(); } finally { await db.exec("reset role;"); } }
async function refused(uid, sql, m, re) { try { await as(uid, () => db.query(sql)); ok(false, m + " (was allowed)"); } catch (e) { ok(!re || re.test(e.message), m + " wrong error: " + e.message); } }
const q = async (sql) => (await db.query(sql)).rows;
const rowsAs = async (uid, sql) => { try { return await as(uid, () => q(sql)); } catch (e) { return []; } };
const ADMIN = U(1), TEACHER = U(2), FRONT = U(4), P1 = U(6), P2 = U(7);
const C1 = U(30), C2 = U(31), SUBJ = U(40), ST1 = U(60), ST2 = U(61), T = U(70), OLD = U(71), S1 = U(72);
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) values ('${ADMIN}','a@x'),('${TEACHER}','t@x'),('${FRONT}','f@x'),('${P1}','p1@x'),('${P2}','p2@x');
insert into profiles(id, role, full_name) values ('${ADMIN}','admin','Ada Admin'),('${TEACHER}','teacher','Tom Teacher'),('${FRONT}','front_desk','Fola Front'),('${P1}','student','Kemi'),('${P2}','student','Bayo');
insert into classes(id, level, name, active) values ('${C1}','primary','Year 5',true),('${C2}','secondary','JSS2',true);
insert into subjects(id, name, level) values ('${SUBJ}','Maths','primary');
insert into students(id, first_name, last_name, level, class_id, status) values ('${ST1}','Kemi','Ade','primary','${C1}','active'),('${ST2}','Bayo','Ola','secondary','${C2}','active');
insert into student_user_links(student_id, user_id) values ('${ST1}','${P1}'),('${ST2}','${P2}');
insert into exam_tests(id, subject_id, name, duration_minutes, approval_status) values ('${T}','${SUBJ}','Numeracy Year 5',30,'approved');
insert into exam_questions(id, test_id, question_type, prompt, options, marks) values ('${U(80)}','${T}','mcq_single','7 x 8?','[{"value":"56"}]',1);
-- An old session with no class, open now (made before the rule).
insert into exam_test_sessions(id, test_id, class_id, status, active, starts_at, ends_at) values ('${OLD}','${T}',null,'active',true, now() - interval '1 day', now() + interval '1 day');
set session_replication_role = origin;`);

// 1. The old class-less session is hidden from every learner
ok((await rowsAs(P1, `select id from exam_test_sessions where id='${OLD}'`)).length === 0, "Year 5 learner can't see a session with no class");
ok((await rowsAs(P2, `select id from exam_test_sessions where id='${OLD}'`)).length === 0, "JSS2 learner can't see it either");
ok((await rowsAs(P2, `select * from portal_student_exam_sessions()`)).length === 0, "not in the portal list");
ok((await rowsAs(P2, `select id from exam_questions where test_id='${T}'`)).length === 0, "nor its questions");
ok((await as(P2, () => q(`select can_student_access_session('${OLD}') a`)))[0].a === false, "can't start it");
ok((await rowsAs(ADMIN, `select id from exam_test_sessions where id='${OLD}' and class_id is null`)).length === 1, "admin still sees it, with no class");
ok((await rowsAs(TEACHER, `select id from exam_test_sessions where id='${OLD}' and class_id is null`)).length === 1, "teachers still see it, with no class");
ok((await rowsAs(FRONT, `select id from exam_test_sessions where id='${OLD}' and class_id is null`)).length === 1, "staff running rooms still see it, with no class");

// 2. The school's own changes to an old session still work (release, close)
await as(ADMIN, () => q(`update exam_test_sessions set results_released_at = now() where id='${OLD}'`));
ok((await q(`select results_released_at from exam_test_sessions where id='${OLD}'`))[0].results_released_at !== null, "results can still be released on an old session");
ok((await rowsAs(P2, `select id from exam_test_sessions where id='${OLD}'`)).length === 0, "released but still no class: still hidden");
await as(ADMIN, () => q(`update exam_test_sessions set results_released_at = null where id='${OLD}'`));

// 3. New sessions need a class; a class can't be removed
await refused(ADMIN, `insert into exam_test_sessions(test_id, class_id, status, active) values ('${T}', null, 'active', true)`, "a new session needs a class", /Choose the class/);
await as(ADMIN, () => q(`insert into exam_test_sessions(id, test_id, class_id, status, active, starts_at, ends_at) values ('${S1}','${T}','${C1}','active',true, now() - interval '1 day', now() + interval '1 day')`));
await refused(ADMIN, `update exam_test_sessions set class_id = null where id='${S1}'`, "a class can't be taken off", /Choose the class/);

// 4. With a class, only that class sees it
ok((await rowsAs(P1, `select id from exam_test_sessions where id='${S1}'`)).length === 1, "Year 5 learner sees the Year 5 session");
ok((await rowsAs(P1, `select id from portal_student_exam_sessions()`)).length === 1, "it's in their portal list");
ok((await rowsAs(P1, `select id from exam_questions where test_id='${T}'`)).length === 1, "and they read its questions");
ok((await rowsAs(P2, `select id from exam_test_sessions where id='${S1}'`)).length === 0, "JSS2 learner doesn't see it");
ok((await rowsAs(P2, `select id from exam_questions where test_id='${T}'`)).length === 0, "nor its questions");

// 5. Setting the class on the old session brings it back for that class only
await as(ADMIN, () => q(`update exam_test_sessions set class_id='${C2}' where id='${OLD}'`));
ok((await rowsAs(P2, `select id from exam_test_sessions where id='${OLD}'`)).length === 1, "old session reappears once its class is set");
ok((await rowsAs(P1, `select id from exam_test_sessions where id='${OLD}'`)).length === 0, "only for that class");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
