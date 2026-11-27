// PGlite test for docs/migrations/20261127b_exam_session_list_and_codes.sql (issue13: session list names and codes).
// Copy next to pglite-full-schema.mjs and pglite-split.mjs (supabase-migration skill), npm install
// @electric-sql/pglite@0.2.17, then: node <this file> [path to docs/schema.sql]
import { load, U } from "./pglite-full-schema.mjs";
const D = "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/";
const MIG = D + "20261127b_exam_session_list_and_codes.sql";
const db = await load([D + "20261125d_exam_rules_speed.sql", D + "20261125e_exam_session_class_required.sql", MIG, MIG]); // new file twice
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function as(uid, fn) { await db.exec(`reset role; set test.uid='${uid}'; set role authenticated;`); try { return await fn(); } finally { await db.exec("reset role;"); } }
async function refused(uid, sql, m, re) { try { await as(uid, () => db.query(sql)); ok(false, m + " (was allowed)"); } catch (e) { ok(!re || re.test(e.message), m + " wrong error: " + e.message); } }
const q = async (sql) => (await db.query(sql)).rows;
const rowsAs = async (uid, sql) => { try { return await as(uid, () => q(sql)); } catch (e) { return []; } };
const ADMIN = U(1), OWNER = U(2), CLASS_T = U(3), SUBJ_T = U(4), OTHER_T = U(5), FRONT = U(6), PUPIL = U(7), CONDUCTOR = U(8), T_COND = U(9);
const C1 = U(30), C2 = U(31), MATHS = U(40), ENG = U(41), ST = U(60), COND = U(65), COND2 = U(66);
const T1 = U(70), T2 = U(71), S1 = U(80), S2 = U(81), S3 = U(82);
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) values ('${ADMIN}','a@x'),('${OWNER}','o@x'),('${CLASS_T}','c@x'),('${SUBJ_T}','s@x'),('${OTHER_T}','x@x'),('${FRONT}','f@x'),('${PUPIL}','p@x'),('${CONDUCTOR}','k@x'),('${T_COND}','tk@x');
insert into profiles(id, role, full_name) values ('${ADMIN}','admin','Ada'),('${OWNER}','teacher','Tom Owner'),('${CLASS_T}','teacher','Cleo Class'),('${SUBJ_T}','teacher','Sam Subject'),('${OTHER_T}','teacher','Ola Other'),('${FRONT}','front_desk','Fola'),('${PUPIL}','student','Kemi'),('${T_COND}','teacher','Tunde Conducts');
insert into classes(id, level, name, active) values ('${C1}','primary','Primary 4',true),('${C2}','primary','Primary 5',true);
insert into subjects(id, name, level) values ('${MATHS}','Maths','primary'),('${ENG}','English','primary');
insert into class_subjects(class_id, subject_id) values ('${C1}','${MATHS}'),('${C1}','${ENG}'),('${C2}','${MATHS}');
insert into teacher_subject_assignments(teacher_id, class_id, subject_id, active) values ('${OWNER}','${C1}','${MATHS}',true),('${OWNER}','${C2}','${MATHS}',true),('${SUBJ_T}','${C1}','${ENG}',true),('${OTHER_T}','${C2}','${ENG}',true);
insert into teacher_class_assignments(teacher_id, class_id, active) values ('${CLASS_T}','${C1}',true);
insert into students(id, first_name, last_name, level, class_id, status) values ('${ST}','Kemi','Ade','primary','${C1}','active');
insert into student_user_links(student_id, user_id) values ('${ST}','${PUPIL}');
insert into exam_tests(id, subject_id, name, duration_minutes, created_by, approval_status) values ('${T1}','${MATHS}','P4 Maths exam',30,'${OWNER}','approved'),('${T2}','${ENG}','P4 English exam',30,'${ADMIN}','approved');
insert into exam_test_sessions(id, test_id, class_id, status, active, starts_at, ends_at, requires_secret_code, secret_code) values
  ('${S1}','${T1}','${C1}','active',true, now() - interval '1 hour', now() + interval '2 hours', true, 'MATH44'),
  ('${S2}','${T2}','${C1}','active',true, now() - interval '1 hour', now() + interval '2 hours', true, 'ENG44'),
  ('${S3}','${T1}','${C2}','draft',true, null, null, true, 'MATH55');
insert into exam_conductors(id, full_name) values ('${COND}','Mr Hall'),('${COND2}','Tunde');
insert into exam_conductor_user_links(conductor_id, user_id) values ('${COND}','${CONDUCTOR}'),('${COND2}','${T_COND}');
insert into exam_session_conductors(session_id, conductor_id) values ('${S2}','${COND}'),('${S3}','${COND2}');
set session_replication_role = origin;`);

const ids = async (uid) => (await rowsAs(uid, `select id from exam_test_sessions order by id`)).map((r) => r.id).join(",");
const details = async (uid) => {
  const r = await as(uid, () => q(`select * from exam_session_details(array['${S1}','${S2}','${S3}']::uuid[]) order by session_id`));
  return Object.fromEntries(r.map((x) => [x.session_id, x]));
};

// 1. Which sessions each person sees
ok((await ids(ADMIN)) === [S1, S2, S3].join(","), "admin sees every session");
ok((await ids(FRONT)) === [S1, S2, S3].join(","), "front desk sees every session (runs rooms)");
ok((await ids(OWNER)) === [S1, S3].join(","), "the paper's teacher sees the sessions of their paper: " + (await ids(OWNER)));
ok((await ids(CLASS_T)) === [S1, S2].join(","), "the class teacher sees their class's sessions: " + (await ids(CLASS_T)));
ok((await ids(SUBJ_T)) === S2, "a subject teacher sees their subject in their class only: " + (await ids(SUBJ_T)));
ok((await ids(OTHER_T)) === "", "a teacher with nothing to do with them sees none: " + (await ids(OTHER_T)));
ok((await ids(T_COND)) === S3, "a teacher who conducts a room sees that session: " + (await ids(T_COND)));
ok((await ids(CONDUCTOR)) === S2, "an outside conductor sees only their room");
ok((await ids(PUPIL)) === [S1, S2].join(","), "the learner still sees their open sessions");

// 2. Names and classes, no ID codes
const cd = await details(CLASS_T);
ok(cd[S2]?.test_name === "P4 English exam" && cd[S2]?.subject_name === "English" && cd[S2]?.class_name === "Primary 4", "class teacher gets the name, subject and class of another teacher's paper: " + JSON.stringify(cd[S2]));
ok(!cd[S3], "but not sessions they can't see");
ok(cd[S2]?.approved === true, "and whether the paper is approved (for 'who can see it')");
ok((await rowsAs(CLASS_T, `select id from exam_questions where test_id='${T2}'`)).length === 0, "the paper's questions stay private");
const od = await details(OWNER);
ok(od[S3]?.class_name === "Primary 5", "owner gets the class name of a class they only teach the subject in");
ok(Object.keys(await details(OTHER_T)).length === 0, "an unrelated teacher gets nothing");
ok(Object.keys(await details(PUPIL)).length === 0, "a learner gets nothing");

// 3. Secret codes
const ad = await details(ADMIN);
ok(ad[S1]?.secret_code === "MATH44" && ad[S2]?.secret_code === "ENG44" && ad[S1]?.can_change === true, "admin sees every code");
ok(od[S1]?.secret_code === "MATH44" && od[S3]?.secret_code === "MATH55" && od[S1]?.can_change === true, "the paper's teacher sees their codes and can change them");
ok(cd[S1]?.secret_code == null && cd[S2]?.secret_code == null && cd[S1]?.can_change === false, "the class teacher sees no codes and can't change");
const kd = await details(CONDUCTOR);
ok(kd[S2]?.secret_code === "ENG44" && kd[S2]?.can_change === false, "the room's conductor sees its code");
ok((await details(T_COND))[S3]?.secret_code === "MATH55", "a teacher conducting a room sees its code");
ok((await details(FRONT))[S1]?.secret_code == null && (await details(FRONT))[S1]?.test_name === "P4 Maths exam", "front desk sees names but not codes");
await refused(PUPIL, `select secret_code from exam_test_sessions where id='${S1}'`, "a learner can't read the code from the database", /permission denied/);
await refused(CLASS_T, `select secret_code from exam_test_sessions`, "a teacher can't read codes directly", /permission denied/);
await refused(ADMIN, `select * from exam_test_sessions`, "nobody reads the column directly, even admins (they use exam_session_details)", /permission denied/);
await refused(PUPIL, `select * from exam_session_details(array(select gen_random_uuid() from generate_series(1,501)))`, "large requests refused", /500/);

// 4. Changing sessions still works, and the code still lets a learner in
ok((await rowsAs(OWNER, `update exam_test_sessions set secret_code='NEW44' where id='${S1}' returning id`)).length === 1, "the paper's teacher can still change the code");
ok((await rowsAs(CLASS_T, `update exam_test_sessions set secret_code='HACK' where id='${S2}' returning id`)).length === 0, "the class teacher can't change it");
ok((await q(`select secret_code from exam_test_sessions where id='${S2}'`))[0].secret_code === "ENG44", "code unchanged");
await refused(PUPIL, `select start_exam_attempt('${S1}', 'MATH44')`, "the old code no longer works", /code/i);
ok((await as(PUPIL, () => q(`select start_exam_attempt('${S1}', 'NEW44') as id`)))[0].id, "the new code lets the learner start");
ok((await as(OWNER, () => q(`insert into exam_test_sessions(test_id, class_id, status, active, requires_secret_code, secret_code) values ('${T1}','${C2}','draft',true,true,'X1')`))) !== null, "teachers can still create sessions with a code");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
