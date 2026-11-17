// Tests docs/migrations/20261117_admission_numbers_and_accounts.sql against the whole schema in PGlite.
// Usage (from a scratchpad with @electric-sql/pglite@0.2.17 and the supabase-migration pglite-*.mjs copied in):
//   node pglite-test.mjs <schema.sql from before these were appended> <repo>/docs/migrations/20261117_admission_numbers_and_accounts.sql <repo>/docs/migrations/20261117b_single_source_fixes.sql
import { load, U } from "./pglite-full-schema.mjs";

const migration = process.argv[3];
const migrationB = process.argv[4];
let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};
async function refuses(db, sql, label, match) {
  try {
    await db.exec(sql);
    ok(false, `${label} (was allowed)`);
  } catch (e) {
    ok(!match || new RegExp(match, "i").test(e.message), `${label} → ${e.message.split("\n")[0]}`);
  }
}
const as = async (db, uid) => db.exec(`reset role; set test.uid = '${uid}'; set role authenticated;`);
const asOwner = async (db) => db.exec(`reset role; set test.uid = '';`);

// Seed BEFORE the migration: existing pupils, including two that already clash.
const db = await load([]);
await db.exec(`
set session_replication_role = replica;
insert into auth.users(id, email) values
  ('${U(1)}','admin@x.ng'),('${U(2)}','teacher@x.ng'),('${U(3)}','parent@x.ng'),
  ('${U(10)}','gre2026447@students.greenfield.local'),('${U(11)}','orphan@x.ng'),('${U(4)}','desk@x.ng');
insert into public.profiles(id, role, email, full_name) values
  ('${U(1)}','admin','admin@x.ng','Mrs Admin'),('${U(2)}','teacher','teacher@x.ng','Mr Teacher'),
  ('${U(3)}','parent','parent@x.ng','Mrs Parent'),('${U(10)}','student','gre2026447@students.greenfield.local','Ada Obi'),
  ('${U(11)}','parent','orphan@x.ng','Nobody'),('${U(4)}','front_desk','desk@x.ng','Front Desk');
insert into public.classes(id, name, level, active) values ('${U(100)}','JSS1','secondary',true);
insert into public.students(id, first_name, last_name, admission_number, level, class_id, status, date_of_birth) values
  ('${U(20)}','Ada','Obi','GRE/2026/447','secondary','${U(100)}','active','2014-03-02'),
  ('${U(21)}','Tunde','Bello','GRE/2025/120','primary',null,'active','2016-01-01'),
  ('${U(22)}','Clash','One','gre/2024/009','primary',null,'active',null),
  ('${U(23)}','Clash','Two','GRE 2024 9','primary',null,'active',null);
insert into public.student_user_links(user_id, student_id) values ('${U(10)}','${U(20)}');
insert into public.guardians(id, full_name, email, phone) values ('${U(30)}','Mrs Obi','obi@x.ng','+234 803 111 2222');
insert into public.student_guardians(student_id, guardian_id) values ('${U(20)}','${U(30)}');
insert into public.guardian_user_links(user_id, guardian_id) values ('${U(3)}','${U(30)}');
set session_replication_role = origin;
`);
const fs = await import("fs");
const sql = fs.readFileSync(migration, "utf8");
await db.exec(sql);
ok(true, "migration runs with existing clashing numbers (unique index skipped)");
const sqlB = fs.readFileSync(migrationB, "utf8");
await db.exec(sqlB);
await db.exec(sqlB);
ok(true, "single-source fixes run (twice)");
let idx = await db.query(`select 1 from pg_indexes where indexname = 'students_admission_key_unique'`);
ok(idx.rows.length === 0, "unique index not created while clashes exist");

// admission_key
const k = await db.query(`select public.admission_key('GRE/2026/007') a, public.admission_key(' gre 2026 7 ') b, public.admission_key('GRE-2026-070') c, public.admission_key('GRE2026/7') d`);
ok(k.rows[0].a === k.rows[0].b && k.rows[0].a === "gre20267", `key: GRE/2026/007 = gre 2026 7 (${k.rows[0].a})`);
ok(k.rows[0].c !== k.rows[0].a, "key: 070 differs from 007");
ok(k.rows[0].d === "gre20267", "key: GRE2026/7 = GRE/2026/007");

// Clash listing
await as(db, U(1));
const cl = await db.query(`select * from public.admission_number_clashes()`);
ok(cl.rows.length === 1 && cl.rows[0].students.length === 2, "clashes listed for admin");
await as(db, U(2));
const cl2 = await db.query(`select * from public.admission_number_clashes()`);
ok(cl2.rows.length === 0, "clashes hidden from teacher");

// Fix the clash, run again → unique index on
await asOwner(db);
await db.exec(`update public.students set admission_number = 'GRE/2024/010' where id = '${U(23)}'`);
await db.exec(sql);
idx = await db.query(`select 1 from pg_indexes where indexname = 'students_admission_key_unique'`);
ok(idx.rows.length === 1, "unique index created on second run once clashes fixed (run twice is safe)");

// Format changes: admins can only ASK; developers approve from the database (no website grant).
const REQ = (t, pre, sec, d, yb, reason) => `select public.request_admission_format_change('${t}','${pre}','${sec}',${d},'${yb}',9,true,'${reason}') id`;
async function setFormat(t, pre, sec, d, yb) {
  await as(db, U(1));
  const id = (await db.query(REQ(t, pre, sec, d, yb, "Test change"))).rows[0].id;
  await asOwner(db);
  await db.exec(`select public.approve_admission_format_change('${id}', 'Dev Test')`);
  await as(db, U(1));
}
await as(db, U(2));
await refuses(db, REQ("{PREFIX}/{N}", "GRE", "{}", 3, "session", "Because"), "teacher can't ask for a format change", "Only admins");
await refuses(db, `update public.admission_number_settings set prefix = 'X'`, "teacher can't update settings table directly");
await as(db, U(1));
await refuses(db, `update public.admission_number_settings set prefix = 'X'`, "admin can't update settings table directly");
await refuses(db, REQ("{PREFIX}/{YYYY}", "GRE", "{}", 3, "session", "Because"), "format without {N} refused", "\\{N\\}");
await refuses(db, REQ("{PREFIX}/{N}", "GRE", "{}", 3, "session", ""), "a reason is required", "Say why");
await refuses(db, REQ("{PREFIX}/{YYYY}/{N}", "GRE", "{}", 3, "session", "Same again"), "asking for the current format refused", "already the format");
const r1 = (await db.query(REQ("{PREFIX}/{N}", "gre", "{}", 4, "session", "First try"))).rows[0].id;
const r2 = (await db.query(REQ("{PREFIX}-{YY}-{N}", "gre", "{}", 4, "session", "Second try"))).rows[0].id;
const reqs = await db.query(`select id, status, prefix from public.admission_format_requests order by requested_at, status`);
ok(reqs.rows.filter((x) => x.status === "pending").length === 1 && reqs.rows.find((x) => x.id === r1)?.status === "cancelled", "a new request replaces the waiting one");
ok(reqs.rows.find((x) => x.id === r2)?.prefix === "GRE", "requested prefix saved in capitals");
await refuses(db, `select public.approve_admission_format_change('${r2}', 'Admin pretending')`, "admin can't approve (no grant)", "permission denied");
let fmt = (await db.query(`select template from public.admission_number_settings`)).rows[0].template;
ok(fmt === "{PREFIX}/{YYYY}/{N}", "format unchanged while the request waits");
await asOwner(db);
await refuses(db, `select public.reject_admission_format_change('${r2}', 'Dev', '')`, "developer must give a reason to reject", "Say why");
await db.exec(`select public.reject_admission_format_change('${r2}', 'Dev Test', 'Clashes with the old numbers')`);
await as(db, U(1));
fmt = (await db.query(`select template from public.admission_number_settings`)).rows[0].template;
ok(fmt === "{PREFIX}/{YYYY}/{N}", "rejected request changes nothing");
const r3 = (await db.query(REQ("{PREFIX}/{N}", "GRE", "{}", 4, "session", "Third"))).rows[0].id;
await db.exec(`select public.cancel_admission_format_request('${r3}')`);
await refuses(db, `select public.cancel_admission_format_request('${r3}')`, "can't cancel twice", "no longer waiting");
const fl = await db.query(`select action, done_by_name from public.account_log where action like 'format_change%' order by created_at`);
ok(fl.rows.some((x) => x.action === "format_change_rejected" && x.done_by_name === "Dev Test (developer)") && fl.rows.some((x) => x.action === "format_change_cancelled"), "requests, rejection and withdrawal logged");

// The school counts the session start year (Nov 2026): 2026/27 session → 2026, even in January 2027.
const sy = await db.query(`select public.admission_year('2027-01-15 10:00+01') jan, public.admission_year('2026-09-01 08:00+01') sep, public.admission_year('2026-08-31 20:00+01') aug`);
ok(sy.rows[0].jan === 2026 && sy.rows[0].sep === 2026 && sy.rows[0].aug === 2025, `session year: Jan 2027 → ${sy.rows[0].jan}, Sep 2026 → ${sy.rows[0].sep}, Aug 2026 → ${sy.rows[0].aug}`);

// Preview and allocation continue after the highest existing number
const year = (await db.query(`select public.admission_year() y`)).rows[0].y;
const pv = await db.query(`select public.preview_admission_number('secondary') p`);
const expectedFirst = year === 2026 ? "GRE/2026/448" : `GRE/${year}/001`;
ok(pv.rows[0].p === expectedFirst, `preview = ${pv.rows[0].p} (expected ${expectedFirst})`);

// Auto-assign on insert of an enrolled pupil (as admin: RLS on students insert)
await db.exec(`insert into public.students(id, first_name, last_name, level, status) values ('${U(40)}','New','Pupil','secondary','enrolled')`);
let r = await db.query(`select admission_number from public.students where id = '${U(40)}'`);
ok(r.rows[0].admission_number === expectedFirst, `enrolled pupil got ${r.rows[0].admission_number}`);
const pv2 = await db.query(`select public.preview_admission_number('secondary') p`);
ok(pv2.rows[0].p !== expectedFirst, `preview moved on to ${pv2.rows[0].p}`);

// Applicant (status applied) gets no number
await db.exec(`insert into public.students(id, first_name, last_name, level, status) values ('${U(41)}','Still','Applying','primary','applied')`);
r = await db.query(`select admission_number from public.students where id = '${U(41)}'`);
ok(r.rows[0].admission_number === null, "applicant gets no number");
await db.exec(`update public.students set status = 'enrolled' where id = '${U(41)}'`);
r = await db.query(`select admission_number from public.students where id = '${U(41)}'`);
ok(r.rows[0].admission_number !== null, `number given on enrolment: ${r.rows[0].admission_number}`);

// Imported pupil keeps their own number, tidied
await db.exec(`insert into public.students(id, first_name, last_name, level, status, admission_number) values ('${U(42)}','Old','Portal','primary','active','  gre/2023/055 ')`);
r = await db.query(`select admission_number from public.students where id = '${U(42)}'`);
ok(r.rows[0].admission_number === "GRE/2023/055", `imported number kept and tidied: ${r.rows[0].admission_number}`);

// Clash refused, with the other pupil's name, in any spelling
await refuses(db, `insert into public.students(first_name, last_name, level, status, admission_number) values ('X','Y','primary','active','gre 2023 55')`, "clash refused (different spelling)", "already used by Old Portal");
await refuses(db, `update public.students set admission_number = 'GRE/2026/0447' where id = '${U(42)}'`, "change to a used number refused", "Ada Obi");

// Many allocations: all unique
await db.exec(`do $$ begin for i in 1..60 loop insert into public.students(first_name, last_name, level, status) values ('Bulk', i::text, 'primary', 'enrolled'); end loop; end $$;`);
const dup = await db.query(`select public.admission_key(admission_number) k, count(*) from public.students where admission_number is not null group by 1 having count(*) > 1`);
ok(dup.rows.length === 0, "60 quick inserts: no duplicate numbers");

// Counter keeps going even if a later number was typed by hand
await db.exec(`insert into public.students(first_name, last_name, level, status, admission_number) values ('Hand','Typed','primary','active','GRE/${year}/900')`);
const after = await db.query(`select public.preview_admission_number('primary') p`);
ok(after.rows[0].p === `GRE/${year}/901`, `after a hand-typed /900 the next is ${after.rows[0].p}`);

// Section prefixes and running across years
await setFormat("{PREFIX}/{N}", "GRE", '{"creche":"GRC"}', 4, "calendar");
const appr = await db.query(`select done_by_name, detail from public.account_log where action = 'settings_changed' order by created_at desc limit 1`);
ok(appr.rows[0]?.done_by_name === "Dev Test (developer)" && /Asked by Mrs Admin/.test(appr.rows[0]?.detail ?? ""), "approved change logged with the developer and the admin who asked");
const sec = await db.query(`select public.preview_admission_number('creche') c, public.preview_admission_number('primary') p`);
ok(sec.rows[0].c === "GRC/0001", `creche prefix: ${sec.rows[0].c}`);
ok(sec.rows[0].p === "GRE/0001", `no-year format: ${sec.rows[0].p}`);
await setFormat("{PREFIX}/{YYYY}/{N}", "GRE", "{}", 3, "session");

// Teacher can't preview? (staff can) / parent can't
await as(db, U(3));
const pp = await db.query(`select public.preview_admission_number(null) p`);
ok(pp.rows[0].p === null, "parent gets no preview");
const po = await db.query(`select * from public.admission_number_owner('GRE/2026/447')`);
ok(po.rows.length === 0, "parent can't look up number owners");

// Login moves with the number
await as(db, U(1));
await db.exec(`update public.students set admission_number = 'GRE/2026/850' where id = '${U(20)}'`);
await asOwner(db);
const em = await db.query(`select email from auth.users where id = '${U(10)}'`);
ok(em.rows[0].email === "gre2026850@students.greenfield.local", `sign-in email followed the number: ${em.rows[0].email}`);
const pe = await db.query(`select email from public.profiles where id = '${U(10)}'`);
ok(pe.rows[0].email === "gre2026850@students.greenfield.local", "profile email followed too");
await as(db, U(1));
await refuses(db, `update public.students set admission_number = null where id = '${U(20)}'`, "can't remove number of a pupil with an account", "signs in");

// Log
const log = await db.query(`select action, admission_number, detail, done_by_name from public.account_log where student_id = '${U(20)}' order by created_at`);
ok(log.rows.some((l) => l.action === "number_changed" && l.detail === "Was GRE/2026/447" && l.done_by_name === "Mrs Admin"), "number change logged with who did it");
await db.exec(`select public.log_account_action('password_reset', '${U(20)}', null, '${U(10)}', 'Temporary password')`);
const lr = await db.query(`select subject_name, admission_number from public.account_log where action = 'password_reset'`);
ok(lr.rows[0]?.subject_name === "Ada Obi", "password reset logged with the pupil's name");
await as(db, U(2));
await refuses(db, `select public.log_account_action('password_reset', '${U(20)}', null, null, null)`, "teacher can't write the log", "Only admins");
await db.exec(`select public.log_account_action('duplicate_override', '${U(20)}', null, null, 'Added although similar to X')`);
ok(true, "staff can record 'added despite a likely duplicate'");
await as(db, U(3));
await refuses(db, `select public.log_account_action('duplicate_override', '${U(20)}', null, null, null)`, "parent can't write the log", "Only admins");
await as(db, U(2));
const tl = await db.query(`select count(*)::int n from public.account_log`);
ok(tl.rows[0].n === 0, "teacher can't read the log");
await refuses(db, `insert into public.account_log(action) values ('password_reset')`, "nobody can insert into the log directly");

// Accounts overview: admins only
const tp = await db.query(`select count(*)::int n from public.admin_pupil_accounts()`);
ok(tp.rows[0].n === 0, "teacher sees no account overview");
await as(db, U(1));
const ap = await db.query(`select * from public.admin_pupil_accounts() where student_id = '${U(20)}'`);
ok(ap.rows[0].user_id === U(10) && ap.rows[0].login_matches_number === true, "admin sees pupil account, login matches number");
const ag = await db.query(`select * from public.admin_parent_accounts() where guardian_id = '${U(30)}'`);
ok(ag.rows[0].user_id === U(3) && ag.rows[0].children === "Ada Obi", "admin sees parent account and children");
const un = await db.query(`select * from public.admin_unlinked_accounts()`);
ok(un.rows.length === 1 && un.rows[0].email === "orphan@x.ng", "unlinked accounts list only the orphan");

// Assign missing numbers
await asOwner(db);
await db.exec(`update public.admission_number_settings set auto_assign = false`);
await db.exec(`insert into public.students(id, first_name, last_name, level, status) values ('${U(50)}','No','Number','primary','active')`);
await as(db, U(1));
const n = await db.query(`select public.assign_missing_admission_numbers(array['${U(50)}'::uuid]) n`);
ok(n.rows[0].n === 1, "assign missing numbers: 1 given");
await as(db, U(2));
await refuses(db, `select public.assign_missing_admission_numbers(null)`, "teacher can't assign numbers", "Only admins");

// Duplicates
await as(db, U(2));
const d1 = await db.query(`select full_name, reasons from public.find_possible_duplicates('ada','OBI','2014-03-02', null, null, null)`);
ok(d1.rows[0]?.reasons?.includes("Same name and date of birth"), `same name + dob: ${JSON.stringify(d1.rows[0])}`);
const d2 = await db.query(`select reasons from public.find_possible_duplicates('Adaeze','Obi', null, null, null, null)`);
ok(d2.rows[0]?.reasons?.includes("Similar name"), `similar name: ${JSON.stringify(d2.rows[0])}`);
const d3 = await db.query(`select reasons from public.find_possible_duplicates('Ada','Okafor', null, array['08031112222'], null, null)`);
ok(d3.rows[0]?.reasons?.includes("Same parent phone number"), `same parent phone (0803 vs +234 803): ${JSON.stringify(d3.rows[0])}`);
const d4 = await db.query(`select * from public.find_possible_duplicates('Chidi','Obi', null, array['08031112222'], null, null)`);
ok(d4.rows.length === 0, "a brother (same phone, different first name) isn't flagged");
const d5 = await db.query(`select * from public.find_possible_duplicates('Obi','Ada', null, null, null, '${U(20)}')`);
ok(d5.rows.length === 0, "excluded record not returned");
await as(db, U(3));
const d6 = await db.query(`select * from public.find_possible_duplicates('Ada','Obi', null, null, null, null)`);
ok(d6.rows.length === 0, "parent can't search for duplicates");

// Deactivation still works with the new trigger (status change through the function)
await as(db, U(1));
await db.exec(`select public.deactivate_student('${U(42)}', 'test_record', null, null)`);
r = await db.query(`select status::text s, admission_number from public.students where id = '${U(42)}'`);
ok(r.rows[0].s === "inactive" && r.rows[0].admission_number === "GRE/2023/055", "deactivation keeps the number");
await db.exec(`select public.reactivate_student('${U(42)}')`);
r = await db.query(`select status::text s from public.students where id = '${U(42)}'`);
ok(r.rows[0].s !== "inactive", "reactivation works");

// Single source of truth: section follows the class.
await as(db, U(1));
await db.exec(`insert into public.students(id, first_name, last_name, level, status, class_id) values ('${U(60)}','Wrong','Level','primary','applied','${U(100)}')`);
r = await db.query(`select level::text l from public.students where id = '${U(60)}'`);
ok(r.rows[0].l === "secondary", `section follows the class on insert: ${r.rows[0].l}`);
await db.exec(`update public.students set level = 'creche' where id = '${U(60)}'`);
r = await db.query(`select level::text l from public.students where id = '${U(60)}'`);
ok(r.rows[0].l === "secondary", "section can't be set apart from the class");
await asOwner(db);
await db.exec(`update public.classes set level = 'primary' where id = '${U(100)}'`);
r = await db.query(`select count(*)::int n from public.students where class_id = '${U(100)}' and level::text <> 'primary'`);
ok(r.rows[0].n === 0, "changing a class's section moves its pupils");
await db.exec(`update public.classes set level = 'secondary' where id = '${U(100)}'`);

// Single source of truth: profile email follows the sign-in email.
await db.exec(`update auth.users set email = 'new.parent@x.ng' where id = '${U(3)}'`);
r = await db.query(`select email from public.profiles where id = '${U(3)}'`);
ok(r.rows[0].email === "new.parent@x.ng", "profile email follows a sign-in email change");
// Front desk (not an admin) changes a linked pupil's number: sign-in and profile follow, the save isn't refused.
await as(db, U(4));
await db.exec(`update public.students set admission_number = 'GRE/2026/860' where id = '${U(20)}'`);
await asOwner(db);
r = await db.query(`select (select email from auth.users where id = '${U(10)}') a, (select email from public.profiles where id = '${U(10)}') p`);
ok(r.rows[0].a === "gre2026860@students.greenfield.local" && r.rows[0].p === r.rows[0].a, `front desk number change: sign-in and profile follow (${r.rows[0].p})`);
// The flag lets only the email through: a role change in the same update is still checked.
await as(db, U(3));
try { await db.exec(`update public.profiles set full_name = 'Hacker', email = 'x@y.ng' where id = '${U(1)}'`); } catch {}
await asOwner(db);
r = await db.query(`select full_name, email from public.profiles where id = '${U(1)}'`);
ok(r.rows[0].full_name === "Mrs Admin" && r.rows[0].email === "admin@x.ng", "parent still can't edit someone else's profile");
// Without the flag, a non-admin still can't change their own email (only the sync may).
await as(db, U(3));
await refuses(db, `update public.profiles set email = 'mine@x.ng' where id = '${U(3)}'`, "parent can't change their own profile email directly", "only change your own name");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
