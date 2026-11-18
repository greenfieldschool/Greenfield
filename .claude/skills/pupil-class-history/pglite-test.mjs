// Class history checks (backfill, conflicts, triggers, RLS, merge, reader) against the whole schema in PGlite.
// Copy this file with ../supabase-migration/pglite-full-schema.mjs and pglite-split.mjs into a scratch folder with
// @electric-sql/pglite@0.2.17 installed, then:
//   node pglite-test.mjs <repo>/docs/schema.sql [20261118_developer_only_pupil_delete.sql if not in schema.sql yet] <repo>/docs/migrations/20261118b_pupil_class_history.sql
// (If schema.sql already contains the migration, it is simply applied again: it must be safe to run twice.)
import { load, U } from "./pglite-full-schema.mjs";
// Extra migrations not yet in schema.sql may go before ours: node pglite-test.mjs schema.sql [other.sql ...] ours.sql
const FILES = process.argv.slice(3);
const MIG = FILES[FILES.length - 1];
const db = await load([...FILES, MIG]); // ours runs twice: must be harmless

let problems = 0;
const rows = async (sql) => (await db.query(sql)).rows;
const as = async (uid) => { await db.exec("reset role"); await db.exec(`set test.uid='${uid}'`); await db.exec("set role authenticated"); };
const su = async () => { await db.exec("reset role"); await db.exec("set test.uid=''"); };
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log("ok      ", label); else { problems++; console.log("FAILED  ", label, "\n   got ", g, "\n   want", w); }
};
const refused = async (label, sql) => {
  try { await db.exec(sql); problems++; console.log("WRONGLY ALLOWED", label); } catch (e) { console.log("refused ", label, "-", e.message.slice(0, 100)); }
};
const allowed = async (label, sql) => {
  try { await db.exec(sql); console.log("ok      ", label); } catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); }
};

// ids
const P1 = U(101), P2 = U(102), P2B = U(103);
const Y1 = U(201), Y2 = U(202), T3 = U(213), N1 = U(221), N2 = U(222);
const [A, B, C, D, E, G] = [U(301), U(302), U(303), U(304), U(305), U(307)];
const SUBJ = U(401), AS_T3_P1 = U(501), AS_N1_P2 = U(502), AS_N1_P1 = U(503), CRIT = U(601);
const ADMIN = U(1), T_P1 = U(2), T_P2 = U(3), PARENT = U(4), PUPIL_B = U(5), DESK = U(6), GUARD = U(701);
const name = (id) => ({ [A]: "A", [B]: "B", [C]: "C", [D]: "D", [E]: "E", [G]: "G" })[id] ?? id;

await su();
await db.exec(`set session_replication_role = replica;
insert into auth.users(id) values ('${ADMIN}'),('${T_P1}'),('${T_P2}'),('${PARENT}'),('${PUPIL_B}'),('${DESK}');
insert into profiles(id, role, full_name) values ('${ADMIN}','admin','Head Admin'),('${T_P1}','teacher','Mr One'),('${T_P2}','teacher','Mrs Two'),
  ('${PARENT}','parent','Parent A'),('${PUPIL_B}','student','Pupil B'),('${DESK}','front_desk','Front Desk');
insert into classes(id, level, name) values ('${P1}','primary','Basic 1'),('${P2}','primary','Basic 2'),('${P2B}','primary','Basic 2 (copy)');
insert into academic_years(id, name, is_active) values ('${Y1}','2025/2026', false),('${Y2}','2026/2027', true);
insert into academic_terms(id, academic_year_id, name, starts_on, ends_on, is_active) values
  ('${T3}','${Y1}','Third Term','2026-04-20','2026-07-20', true),
  ('${N1}','${Y2}','First Term','2026-09-08','2026-12-18', true),
  ('${N2}','${Y2}','Second Term','2027-01-06','2027-04-01', false);
insert into students(id, first_name, last_name, level, class_id, status) values
  ('${A}','Ada','A','primary','${P2}','active'),
  ('${B}','Bayo','B','primary','${P2}','active'),
  ('${C}','Chi','C','primary','${P1}','active'),
  ('${D}','Dupe','D','primary',null,'inactive'),
  ('${E}','Emeka','E','primary','${P1}','withdrawn'),
  ('${G}','Gozie','G','primary','${P2B}','active');
insert into teacher_class_assignments(teacher_id, class_id) values ('${T_P1}','${P1}'),('${T_P2}','${P2}');
insert into guardians(id, full_name) values ('${GUARD}','Parent A');
insert into guardian_user_links(user_id, guardian_id) values ('${PARENT}','${GUARD}');
insert into student_guardians(student_id, guardian_id) values ('${A}','${GUARD}');
insert into student_user_links(user_id, student_id) values ('${PUPIL_B}','${B}');
insert into subjects(id, name) values ('${SUBJ}','Maths');
insert into welfare_criteria(id, level, name, source, max_points) values ('${CRIT}','primary','Test criterion','rating',5);
insert into academic_assessments(id, academic_year_id, academic_term_id, class_id, subject_id, assessment_type) values
  ('${AS_T3_P1}','${Y1}','${T3}','${P1}','${SUBJ}','exam'),
  ('${AS_N1_P2}','${Y2}','${N1}','${P2}','${SUBJ}','test'),
  ('${AS_N1_P1}','${Y2}','${N1}','${P1}','${SUBJ}','test');
insert into academic_assessment_scores(assessment_id, student_id, score) values
  ('${AS_T3_P1}','${A}',70),('${AS_T3_P1}','${D}',50),('${AS_T3_P1}','${E}',60),
  ('${AS_N1_P2}','${A}',80),('${AS_N1_P2}','${C}',40);
insert into student_attendance(student_id, class_id, academic_term_id, date, status) values
  ('${B}','${P1}',null,'2026-05-04','present');
insert into welfare_ratings(student_id, academic_term_id, class_id, criterion_id, rating) values ('${B}','${T3}','${P2}','${CRIT}',4);
insert into student_attendance(student_id, class_id, academic_term_id, date, status) values ('${G}','${P2B}','${T3}','2026-05-05','present');
insert into published_results(class_id, class_name, class_level, academic_term_id, term_name, published_at, report, pupils, pupil_count) values
  ('${P1}','Basic 1','primary','${T3}','Third Term', now(), '{}', '[{"id":"${A}","name":"Ada A"},{"id":"not-a-uuid"}]', 2);
set session_replication_role = origin;`);

// ---------------- Backfill ----------------
console.log(await rows("select public.backfill_student_class_terms() as r"));
const hist = async () => (await rows(`select student_id, academic_term_id, class_id, source from student_class_terms order by academic_term_id, student_id`))
  .map((r) => `${name(r.student_id)}:${r.academic_term_id === T3 ? "T3" : r.academic_term_id === N1 ? "N1" : r.academic_term_id === N2 ? "N2" : "M1"}:${r.class_id === P1 ? "P1" : r.class_id === P2 ? "P2" : r.class_id === P2B ? "P2B" : r.class_id}`);
eq("backfill rows", await hist(), ["A:T3:P1", "D:T3:P1", "E:T3:P1", "G:T3:P2B", "A:N1:P2", "B:N1:P2", "C:N1:P1", "G:N1:P2B"]);
const conf = await rows(`select student_id, academic_term_id, provisional_class_id, jsonb_array_length(candidates) n from student_class_term_conflicts order by student_id`);
eq("conflicts listed", conf.map((c) => `${name(c.student_id)}:${c.academic_term_id === T3 ? "T3" : "N1"}:${c.provisional_class_id === P1 ? "P1" : c.provisional_class_id}:${c.n}`), ["B:T3:null:2", "C:N1:P1:2"]);
const again = (await rows("select public.backfill_student_class_terms() as r"))[0].r;
eq("backfill again adds nothing", [again.rows_added, again.conflicts_listed], [0, 0]);

// ---------------- Reading: class_members_in_term ----------------
const members = async (cls, term) => (await rows(`select id from public.class_members_in_term('${cls}','${term}')`)).map((r) => name(r.id));
await as(ADMIN);
eq("admin: Basic 1 last term (A promoted since, D inactive hidden, E left kept)", await members(P1, T3), ["A", "E"]);
eq("admin: Basic 2 this term", await members(P2, N1), ["A", "B"]);
eq("admin: next term has no history → class now", await members(P1, N2), ["C", "E"]);
await as(T_P1);
eq("class teacher of Basic 1 sees last term's pupils incl. promoted A", await members(P1, T3), ["A", "E"]);
await as(T_P2);
eq("teacher of Basic 2 gets nobody for Basic 1", await members(P1, T3), []);
await as(PARENT);
eq("parent gets only their child", await members(P1, T3), ["A"]);
eq("parent: child's class now", await members(P2, N1), ["A"]);
await as(PUPIL_B);
eq("pupil B sees only self", await members(P2, N1), ["B"]);
await as(DESK);
eq("front desk sees all", await members(P1, T3), ["A", "E"]);

// ---------------- RLS on the tables ----------------
const seen = async () => (await rows(`select student_id, academic_term_id from student_class_terms order by academic_term_id, student_id`)).map((r) => `${name(r.student_id)}:${r.academic_term_id === T3 ? "T3" : "N1"}`);
await as(T_P1);
eq("teacher Basic 1 reads its rows only", await seen(), ["A:T3", "D:T3", "E:T3", "C:N1"]);
eq("teacher can't read the log", (await rows("select count(*)::int n from student_class_term_log"))[0].n, 0);
eq("teacher can't read conflicts", (await rows("select count(*)::int n from student_class_term_conflicts"))[0].n, 0);
await as(PARENT);
eq("parent reads own child's rows", await seen(), ["A:T3", "A:N1"]);
await as(PUPIL_B);
eq("pupil reads own rows", await seen(), ["B:N1"]);
await as(ADMIN);
eq("admin reads conflicts", (await rows("select count(*)::int n from student_class_term_conflicts"))[0].n, 2);
await refused("admin cannot insert directly", `insert into student_class_terms(student_id, academic_term_id, class_id, class_name, source) values ('${C}','${T3}','${P1}','x','admin')`);
await refused("admin cannot update directly", `update student_class_terms set class_id='${P2}' where student_id='${A}'`);
await refused("admin cannot delete log", `delete from student_class_term_log`);
await as(T_P1);
await refused("teacher cannot fix a term", `select public.set_student_class_for_term('${B}','${T3}','${P1}', null)`);
await as(PARENT);
await refused("parent cannot fix a term", `select public.set_student_class_for_term('${B}','${T3}','${P1}', null)`);
await refused("parent cannot run backfill", `select public.backfill_student_class_terms()`);
await refused("teacher cannot call internal writer", `select public.write_student_class_term('${B}','${T3}','${P1}','admin',null)`);

// ---------------- Admin fixes a conflict ----------------
await as(ADMIN);
await allowed("admin sets B's last-term class", `select public.set_student_class_for_term('${B}','${T3}','${P1}', 'Register shows Basic 1')`);
eq("B's T3 row and conflict resolved", (await rows(`select h.class_id = '${P1}' ok, h.source, h.set_by_name, c.status from student_class_terms h join student_class_term_conflicts c using (student_id, academic_term_id) where h.student_id='${B}' and h.academic_term_id='${T3}'`))[0], { ok: true, source: "admin", set_by_name: "Head Admin", status: "resolved" });
await refused("set needs a class", `select public.set_student_class_for_term('${B}','${T3}', null, null)`);

// ---------------- Trigger: class changes in the open current term ----------------
await allowed("admin moves C from Basic 1 to Basic 2", `update students set class_id='${P2}' where id='${C}'`);
eq("C's current term follows", (await rows(`select class_id='${P2}' ok, source, set_by_name from student_class_terms where student_id='${C}' and academic_term_id='${N1}'`))[0], { ok: true, source: "class change", set_by_name: "Head Admin" });
eq("logged with who did it", (await rows(`select from_class_name, to_class_name, done_by='${ADMIN}' who, done_by_name from student_class_term_log where student_id='${C}' order by id desc limit 1`))[0], { from_class_name: "Basic 1", to_class_name: "Basic 2", who: true, done_by_name: "Head Admin" });
eq("C's last term untouched (none)", (await rows(`select count(*)::int n from student_class_terms where student_id='${C}' and academic_term_id='${T3}'`))[0].n, 0);

// Results published for Basic 2 this term: moving A out keeps A in Basic 2 for this term
await su();
await db.exec(`insert into result_publications(scope, academic_year_id, academic_term_id, class_id) values ('term_results','${Y2}','${N1}','${P2}')`);
await as(ADMIN);
await allowed("move A after Basic 2's results are published", `update students set class_id='${P1}' where id='${A}'`);
eq("A's current term kept as Basic 2", (await rows(`select class_id='${P2}' ok from student_class_terms where student_id='${A}' and academic_term_id='${N1}'`))[0].ok, true);
eq("kept move is logged with a note", (await rows(`select note like '%closed%' ok from student_class_term_log where student_id='${A}' order by id desc limit 1`))[0].ok, true);

// New pupil with a class
await allowed("add a new pupil to Basic 1", `insert into students(id, first_name, last_name, level, class_id, status) values ('${U(306)}','Funmi','F','primary','${P1}','active')`);
eq("new pupil gets this term's row", (await rows(`select source from student_class_terms where student_id='${U(306)}'`)).map((r) => r.source), ["new pupil"]);
// Deactivated as duplicate → leaves class → drops out of current term
await su();
await db.exec(`select set_config('app.student_status_change','on',false); update students set status='inactive', class_id=null where id='${U(306)}'; select set_config('app.student_status_change','',false);`);
eq("inactive record drops out of the current term", (await rows(`select count(*)::int n from student_class_terms where student_id='${U(306)}'`))[0].n, 0);

// ---------------- Session end: term ended, pupils moved up, new term made active ----------------
await su();
await db.exec(`update academic_terms set ends_on='2026-11-01' where id='${N1}'`);
await as(ADMIN);
await allowed("move B up after the term ended", `update students set class_id='${P1}' where id='${B}'`);
eq("B keeps Basic 2 for the ended term", (await rows(`select class_id='${P2}' ok from student_class_terms where student_id='${B}' and academic_term_id='${N1}'`))[0].ok, true);
await su();
const M1 = U(223);
await db.exec(`insert into academic_terms(id, academic_year_id, name, starts_on, ends_on, is_active) values ('${M1}','${Y2}','Middle Term','2026-11-10','2027-03-01', false)`);
await as(ADMIN);
// as the app does it: switch the others off, then this one on
await su();
await db.exec(`update academic_terms set is_active=false where academic_year_id='${Y2}' and is_active; update academic_terms set is_active=true where id='${M1}';`);
eq("new term: everyone on roll with a class gets a row", (await rows(`select student_id, class_id from student_class_terms where academic_term_id='${M1}' order by student_id`)).map((r) => `${name(r.student_id)}:${r.class_id === P1 ? "P1" : r.class_id === P2 ? "P2" : "P2B"}`), ["A:P1", "B:P1", "C:P2", "G:P2B"]);
await as(ADMIN);
eq("old terms untouched (C moved mid-term while open)", await members(P2, N1), ["A", "B", "C"]);

// ---------------- Merge classes ----------------
await as(ADMIN);
await allowed("merge Basic 2 (copy) into Basic 2", `select public.merge_classes('${P2B}','${P2}')`);
eq("G's history moved to Basic 2", (await rows(`select academic_term_id='${T3}' t3, class_id='${P2}' ok, source from student_class_terms where student_id='${G}' order by academic_term_id`)).map((r) => r.ok), [true, true, true]);
eq("Basic 2 last term now lists G", await members(P2, T3), ["G"]);

// Service key (server-side publishing): sees the whole class
await su();
await db.exec(`create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true),''),'authenticated') $$; set test.role='service_role'`);
eq("service key reads the whole class (B fixed to Basic 1 above)", await members(P1, T3), ["A", "B", "E"]);
await db.exec(`set test.role=''`);
eq("no user, no service key: nobody", await members(P1, T3), []);

// ---------------- Pupil usage ignores class history ----------------
await as(ADMIN);
eq("student_usage ignores class history", (await rows(`select public.student_usage('${U(306)}') u`))[0].u, {});
eq("student_usage still counts results", Object.keys((await rows(`select public.student_usage('${D}') u`))[0].u).sort(), ["academic_assessment_scores"]);

// A test record that once had an account (account_log, 20261117) can still be deleted.
if ((await rows(`select to_regclass('public.account_log') is not null as ok`))[0].ok) {
  const TR = U(308);
  await su();
  await db.exec(`set session_replication_role = replica;
    insert into students(id, first_name, last_name, level, class_id, status, deactivation_reason) values ('${TR}','Tess','Record','primary',null,'inactive','test_record');
    insert into account_log(action, student_id, subject_name) values ('account_created','${TR}','Tess Record');
    insert into student_class_terms(student_id, academic_term_id, class_id, class_name, source) values ('${TR}','${T3}','${P1}','Basic 1','records');
    set session_replication_role = origin;`);
  await as(ADMIN);
  eq("student_usage ignores the account log and class history", (await rows(`select public.student_usage('${TR}') u`))[0].u, {});
  if ((await rows(`select to_regproc('public.approve_student_delete') is not null as ok`))[0].ok) {
    // 20261118: admins ask, a developer approves in the SQL editor (no signed-in user).
    const req = (await rows(`select public.request_student_delete('${TR}', 'Tess Record', 'Test record made in training') as id`))[0].id;
    await su();
    await allowed("developer approves deleting a test record with an account and class history", `select public.approve_student_delete('${req}', 'Dev Tester', null)`);
    eq("record gone", (await rows(`select count(*)::int n from students where id='${TR}'`))[0].n, 0);
  } else {
    await allowed("delete a test record that once had an account", `select public.delete_student('${TR}', 'Tess Record')`);
  }
  await su();
  eq("account log kept, link cleared", (await rows(`select count(*)::int n from account_log where subject_name='Tess Record' and student_id is null`))[0].n, 1);
} else console.log("skip     account_log not in this schema");

// ---------------- Explain ----------------
await su();
await db.exec(`set session_replication_role = replica;
insert into classes(id, level, name) select gen_random_uuid(), 'secondary', 'X'||g from generate_series(1,40) g;
insert into students(id, first_name, last_name, level, status) select gen_random_uuid(), 'f', 'l'||g, 'primary', 'active' from generate_series(1,4000) g;
insert into student_class_terms(student_id, academic_term_id, class_id, class_name, source)
  select s.id, t.id, (select id from classes order by random() limit 1), 'x', 'records' from students s cross join academic_terms t on conflict do nothing;
set session_replication_role = origin; analyze;`);
console.log((await rows(`explain select * from student_class_terms where academic_term_id='${T3}' and class_id='${P1}'`)).map((r) => r["QUERY PLAN"]).join("\n"));

console.log(problems ? `${problems} problem(s)` : "all checks passed");
