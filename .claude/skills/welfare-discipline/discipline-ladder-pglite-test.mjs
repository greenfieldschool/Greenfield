// PGlite test for docs/migrations/20261123_discipline_ladder.sql. Copy next to pglite-full-schema.mjs and
// pglite-split.mjs (supabase-migration skill), npm install @electric-sql/pglite@0.2.17, then: node <this file>
import { load, U } from "./pglite-full-schema.mjs";
const REPO = "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/";
const MIG = REPO + "20261123_discipline_ladder.sql";
const db = await load([MIG, MIG]); // run twice
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function as(uid, fn, role = "authenticated") { await db.exec(`reset role; set test.uid='${uid}'; set role ${role};`); try { return await fn(); } finally { await db.exec("reset role;"); } }
async function refused(uid, sql, m, re) { try { await as(uid, () => db.query(sql)); ok(false, m + " (was allowed)"); } catch (e) { ok(!re || re.test(e.message), m + " wrong error: " + e.message); } }
const q = async (sql) => (await db.query(sql)).rows;
const ADMIN = U(1), TEACHER = U(2), PARENT = U(3), PARENT2 = U(4), PUPIL = U(5), NURSE = U(6);
const G = U(10), G2 = U(11), ST = U(20), ST2 = U(21), Y = U(25), T = U(26);
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) values ('${ADMIN}','a@x'),('${TEACHER}','t@x'),('${PARENT}','p@x'),('${PARENT2}','q@x'),('${PUPIL}','s@x'),('${NURSE}','n@x');
insert into profiles(id, role, full_name, email) values ('${ADMIN}','admin','Ada Admin','a@x'),('${TEACHER}','teacher','Tom Teacher','t@x'),('${PARENT}','parent','Pam Parent','p@x'),('${PARENT2}','parent','Quin Parent','q@x'),('${PUPIL}','student','Kemi','s@x'),('${NURSE}','nurse','Nia Nurse','n@x');
insert into guardians(id, full_name, email, phone) values ('${G}','Pam Parent','p@x','0801'),('${G2}','Quin Parent','q@x','0802');
insert into guardian_user_links(guardian_id, user_id) values ('${G}','${PARENT}'),('${G2}','${PARENT2}');
insert into students(id, first_name, last_name, level) values ('${ST}','Kemi','Ade','primary'),('${ST2}','Tobi','Ola','primary');
insert into student_guardians(student_id, guardian_id) values ('${ST}','${G}'),('${ST2}','${G2}');
insert into student_user_links(student_id, user_id) values ('${ST}','${PUPIL}');
insert into academic_years(id, name) values ('${Y}','2026/27');
insert into academic_terms(id, academic_year_id, name, starts_on, ends_on) values ('${T}','${Y}','First', current_date - 60, current_date + 20);
insert into welfare_discipline_records(student_id, category, description, severity) values ('${ST}','Late-coming','Old free-text record',1);
set session_replication_role = origin;`);

const rule = async (name) => (await q(`select id from discipline_rules where name='${name.replace(/'/g, "''")}'`))[0].id;
const LATE = await rule("Lateness"), TAKE = await rule("Taking what isn't theirs"), OUT = await rule("Behaviour outside school in uniform");
ok((await q(`select count(*)::int n from discipline_rules`))[0].n === 10, "10 rules seeded once (ran twice)");
const rec = (uid, st, r, corr, extra = "") => as(uid, () => q(`select * from record_discipline_case('${st}','${r}', current_date, 'Came in at 8:20', 1, ${corr === null ? "null" : `'${corr}'`}${extra})`));

// 1. Direct writes are closed
await refused(TEACHER, `insert into welfare_discipline_records(student_id, description) values ('${ST}','x')`, "teacher can't insert directly");
await refused(ADMIN, `update welfare_discipline_records set severity=5`, "admin can't edit directly");
await refused(ADMIN, `delete from welfare_discipline_records`, "admin can't delete directly");
await refused(TEACHER, `insert into discipline_rules(name) values ('New rule')`, "teacher can't add rule");
ok((await as(ADMIN, () => q(`insert into discipline_rules(name, ladder) values ('Phones in class','steps') returning id`))).length === 1, "admin adds rule");
await refused(ADMIN, `insert into discipline_rules(name) values ('lateness')`, "duplicate rule name refused");
await refused(ADMIN, `delete from discipline_rules where name='Phones in class'`, "rules can't be deleted");
try { await as("", () => db.query(`select * from discipline_rules`), "anon"); ok(false, "signed-out reads rules"); } catch { ok(true, ""); }

// 2. The ladder climbs per pupil and rule; old records don't count
await refused(TEACHER, `select * from record_discipline_case('${ST}','${LATE}', current_date, 'Late', 1, 'useful_work')`, "1st time must be read and warn", /1st time/);
let r1 = (await rec(TEACHER, ST, LATE, "read_and_warn"))[0];
ok(r1.occurrence === 1 && r1.step === 1, "1st lateness = step 1 (old free-text record not counted)");
const row1 = (await q(`select * from welfare_discipline_records where id='${r1.record_id}'`))[0];
ok(row1.category === "Lateness" && row1.academic_term_id === T && row1.reported_by === TEACHER && row1.reported_by_name === "Tom Teacher", "category, term and reporter filled in");
ok((await as(TEACHER, () => q(`select * from discipline_next_step('${ST}','${LATE}')`)))[0].step === 2, "next step shows 2");
await refused(TEACHER, `select * from record_discipline_case('${ST}','${LATE}', current_date, 'Late', 1, 'read_and_warn')`, "2nd time can't be read and warn", /2nd time/);
const r2 = (await rec(NURSE, ST, LATE, "supervised_reflection"))[0];
ok(r2.step === 2, "nurse (staff) records 2nd time");
const r3 = (await rec(TEACHER, ST, LATE, "three_days_counselling_statement"))[0];
ok(r3.step === 3, "3rd time");
await refused(TEACHER, `select * from record_discipline_case('${ST}','${LATE}', current_date, 'Late', 1, 'useful_work')`, "4th time: correction left to the committee", /committee/);
const r4 = (await rec(TEACHER, ST, LATE, null))[0];
ok(r4.step === 4 && r4.occurrence === 4, "4th time waits for the committee");
const r5 = (await rec(TEACHER, ST, LATE, null))[0];
ok(r5.step === 4 && r5.occurrence === 5, "5th time stays at step 4, count 5");
ok((await rec(TEACHER, ST2, LATE, "read_and_warn"))[0].step === 1, "another pupil starts at 1");
ok((await rec(TEACHER, ST, TAKE, "useful_work"))[0].step === 1, "taking what isn't theirs: useful work from the 1st time");
await refused(TEACHER, `select * from record_discipline_case('${ST2}','${TAKE}', current_date, 'Took a pen', 1, 'read_and_warn')`, "taking: no warning only", /1st time/);
ok((await rec(TEACHER, ST2, OUT, null))[0].step === 4, "outside school in uniform goes straight to the committee");

// 3. Checks
await refused(PARENT, `select * from record_discipline_case('${ST}','${LATE}', current_date, 'Late', 1, null)`, "parent can't record", /staff/);
await refused(TEACHER, `select * from record_discipline_case('${ST}','${LATE}', current_date + 1, 'Late', 1, null)`, "future day refused", /today/);
await refused(TEACHER, `select * from record_discipline_case('${ST}','${LATE}', current_date, 'x', 1, null)`, "empty description refused", /what happened/);
await refused(TEACHER, `select * from record_discipline_case('${ST}','${LATE}', current_date, 'Late', 9, null)`, "severity 9 refused", /1 and 5/);
await as(ADMIN, () => q(`update discipline_rules set active=false where name='Phones in class'`));
await refused(TEACHER, `select * from record_discipline_case('${ST}',(select id from discipline_rules where name='Phones in class'), current_date, 'Phone', 1, 'read_and_warn')`, "retired rule refused", /no longer/);

// 4. Statement
await refused(TEACHER, `select save_discipline_statement('${r1.record_id}', 'Because the bus was late and I will leave early')`, "no statement on step 1", /3rd time/);
await as(TEACHER, () => q(`select save_discipline_statement('${r3.record_id}', 'Because the bus was late and I will leave early')`));
ok((await q(`select statement from welfare_discipline_records where id='${r3.record_id}'`))[0].statement.startsWith("Because"), "statement saved");

// 5. Committee: pupil heard first, environment team up to 10 days, counsellor instead of a correctional service
const cd = (rec, outcome, days, meet, note, said = "'I was helping my mum at the shop'") =>
  `select record_committee_decision('${rec}', ${outcome}, ${days}, ${meet}, ${note}, ${said})`;
await refused(TEACHER, cd(r4.record_id, "'environment_team'", 5, "current_date+3", "null"), "teacher can't record committee", /admins/);
await refused(ADMIN, cd(r3.record_id, "'environment_team'", 5, "current_date+3", "null"), "not on step 3", /4th time/);
await refused(ADMIN, cd(r4.record_id, "'environment_team'", 5, "current_date+3", "null", "''"), "pupil must be heard", /pupil said/);
await refused(ADMIN, cd(r4.record_id, "'environment_team'", "null", "current_date+3", "null"), "days required", /days/);
await refused(ADMIN, cd(r4.record_id, "'environment_team'", 11, "current_date+3", "null"), "more than 10 days refused", /1 to 10/);
await refused(ADMIN, cd(r4.record_id, "'referral'", "null", "current_date+3", "'x'"), "correctional referral no longer allowed", /committee decided/);
await refused(ADMIN, cd(r4.record_id, "'other'", "null", "current_date+3", "''"), "other needs a note", /committee decided/);
await refused(ADMIN, cd(r4.record_id, "'environment_team'", 5, "null", "null"), "meeting day required", /parent/);
await as(ADMIN, () => q(cd(r4.record_id, "'counsellor'", "null", "current_date+3", "null")));
await as(ADMIN, () => q(cd(r4.record_id, "'environment_team'", 5, "current_date+3", "null")));
const c4 = (await q(`select * from welfare_discipline_records where id='${r4.record_id}'`))[0];
ok(c4.committee_outcome === "environment_team" && c4.committee_days === 5 && c4.committee_decided_by === ADMIN && /helping/.test(c4.pupil_explanation), "committee decision saved, can be corrected, pupil's words kept");
await refused(TEACHER, `select * from record_discipline_case('${ST2}','${LATE}', current_date, 'Late', 1, 'time_apart')`, "time apart is no longer a correction", /2nd time|1st time/);

// 6. Parents told every time, safe words; pupils not sent alerts; other parents nothing
const pn = await q(`select kind, title, body, link from notifications where user_id='${PARENT}' order by created_at`);
ok(pn.filter((n) => n.kind === "discipline").length === 6, "parent told for each of Kemi's 6 cases: " + pn.length);
ok(pn.filter((n) => n.kind === "discipline_committee").length === 2, "a corrected decision tells the parents again (the day may have changed)");
ok(pn.some((n) => n.kind === "discipline_committee" && /Please come to the school about Kemi/.test(n.title)), "parent told of committee decision");
ok(pn.every((n) => !/late|8:20|lateness/i.test(n.title + n.body) && n.link === `/portal/discipline?student_id=${ST}`), "no details in the alert words, link to Discipline");
ok((await q(`select count(*)::int n from notifications where user_id='${PUPIL}'`))[0].n === 0, "pupil gets no alert");
ok((await q(`select count(*)::int n from notifications where user_id='${PARENT2}' and kind='discipline'`))[0].n === 2, "Tobi's parent told of Tobi's 2 only");

// 7. Who reads what
ok((await as(PARENT, () => q(`select * from welfare_discipline_records`))).every((r) => r.student_id === ST), "parent reads only own child");
ok((await as(PUPIL, () => q(`select * from welfare_discipline_records`))).every((r) => r.student_id === ST), "pupil reads only own");
ok((await as(PARENT, () => q(`select * from discipline_events`))).length === 0, "parents can't read the staff log");
await refused(PARENT, `select * from discipline_next_step('${ST}','${LATE}')`, "parent can't call next step", /staff/);

// 8. Withdrawing
await refused(TEACHER, `select withdraw_discipline_record('${r2.record_id}','recorded_in_error',null)`, "teacher can't withdraw nurse's record", /own records/);
await refused(TEACHER, `select withdraw_discipline_record('${r5.record_id}','other','')`, "other needs a note", /why/);
await as(TEACHER, () => q(`select withdraw_discipline_record('${r5.record_id}','duplicate',null)`));
ok((await q(`select count(*)::int n from welfare_discipline_records where id='${r5.record_id}'`))[0].n === 0, "withdrawn record leaves the list");
ok((await q(`select reason, record->>'step' s from welfare_discipline_withdrawn where id='${r5.record_id}'`))[0].s === "4", "kept in withdrawn with the whole row");
ok((await as(TEACHER, () => q(`select * from welfare_discipline_withdrawn`))).length === 0, "only admins read withdrawn");
ok((await as(ADMIN, () => q(`select * from welfare_discipline_withdrawn`))).length === 1, "admin reads withdrawn");
await db.exec(`update welfare_discipline_records set created_at = now() - interval '2 days' where id='${r4.record_id}'`);
await refused(TEACHER, `select withdraw_discipline_record('${r4.record_id}','duplicate',null)`, "own record from another day refused", /own records/);
await as(ADMIN, () => q(`select withdraw_discipline_record('${r2.record_id}','recorded_in_error',null)`));
ok((await as(TEACHER, () => q(`select * from discipline_next_step('${ST}','${LATE}')`)))[0].occurrence === 4, "after two withdrawals the next lateness is the 4th");
const ev = await q(`select action, count(*)::int n from discipline_events group by action`);
const n = (a) => ev.find((e) => e.action === a)?.n ?? 0;
ok(n("recorded") === 8 && n("statement") === 1 && n("committee") === 2 && n("withdrawn") === 2, "log: " + JSON.stringify(ev));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
