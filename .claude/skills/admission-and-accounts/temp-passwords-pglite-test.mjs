// Tests docs/migrations/20261119c_viewable_temporary_passwords.sql against the whole schema in PGlite.
// From a scratchpad with @electric-sql/pglite@0.2.17 and the supabase-migration pglite-*.mjs copied in:
//   node temp-passwords-pglite-test.mjs <repo>/docs/schema.sql <repo>/docs/migrations/20261119c_viewable_temporary_passwords.sql
import { load, U } from "./pglite-full-schema.mjs";
import fs from "fs";

let failures = 0;
const ok = (c, label) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${label}`);
  if (!c) failures++;
};
async function refuses(db, sql, label, match) {
  try {
    await db.exec(sql);
    ok(false, `${label} (was allowed)`);
  } catch (e) {
    ok(!match || new RegExp(match, "i").test(e.message), `${label} → ${e.message.split("\n")[0]}`);
  }
}
const as = (db, uid) => db.exec(`reset role; set test.uid = '${uid}'; set role authenticated;`);
const asAnon = (db) => db.exec(`reset role; set test.uid = ''; set role anon;`);
const asOwner = (db) => db.exec(`reset role; set test.uid = '';`);

const db = await load([]);
const sql = fs.readFileSync(process.argv[3], "utf8");
await db.exec(sql);
await db.exec(sql);
ok(true, "migration runs (twice)");

await db.exec(`
set session_replication_role = replica;
insert into auth.users(id, email) values ('${U(1)}','admin@x.ng'),('${U(2)}','teacher@x.ng'),('${U(3)}','parent@x.ng'),
  ('${U(4)}','gre2026001@students.greenfield.local'),('${U(5)}','orphan@x.ng'),('${U(6)}','desk@x.ng');
insert into public.profiles(id, role, email, full_name) values ('${U(1)}','admin','admin@x.ng','Mrs Admin'),
  ('${U(2)}','teacher','teacher@x.ng','Mr Teacher'),('${U(3)}','parent','parent@x.ng','Mrs Obi'),
  ('${U(4)}','student','gre2026001@students.greenfield.local','Ada Obi'),('${U(5)}','parent','orphan@x.ng','Nobody'),
  ('${U(6)}','front_desk','desk@x.ng','Front Desk');
insert into public.students(id, first_name, last_name, level, status, admission_number) values ('${U(20)}','Ada','Obi','primary','active','GRE/2026/001');
insert into public.guardians(id, full_name, email) values ('${U(30)}','Mrs Obi','parent@x.ng');
insert into public.student_user_links(user_id, student_id) values ('${U(4)}','${U(20)}');
insert into public.guardian_user_links(user_id, guardian_id) values ('${U(3)}','${U(30)}');
insert into public.academic_years(id, name) values ('${U(40)}','2026/2027');
insert into public.academic_terms(id, academic_year_id, name, starts_on, ends_on, is_active) values
  ('${U(41)}','${U(40)}','First term', (now() at time zone 'Africa/Lagos')::date - 30, (now() at time zone 'Africa/Lagos')::date + 25, true),
  ('${U(42)}','${U(40)}','Second term', (now() at time zone 'Africa/Lagos')::date + 40, (now() at time zone 'Africa/Lagos')::date + 120, false);
set session_replication_role = origin;
`);

// Expiry = the day after the current term ends, midnight Lagos.
await as(db, U(1));
let r = await db.query(`select public.temporary_password_expiry() e, (((now() at time zone 'Africa/Lagos')::date + 26)::timestamp at time zone 'Africa/Lagos') want`);
ok(+new Date(r.rows[0].e) === +new Date(r.rows[0].want), `lasts until the end of the current term (${new Date(r.rows[0].e).toISOString()})`);

// Who may save
await as(db, U(2));
await refuses(db, `select public.save_temporary_password('${U(4)}', 'v1:abc')`, "teacher can't save", "Only admins");
await as(db, U(6));
await refuses(db, `select public.save_temporary_password('${U(4)}', 'v1:abc')`, "front desk can't save", "Only admins");
await as(db, U(1));
await refuses(db, `select public.save_temporary_password('${U(4)}', 'mango-river-42')`, "plain text refused", "expected form");
await refuses(db, `select public.save_temporary_password('${U(5)}', 'v1:abc')`, "unlinked sign-in refused", "not linked");
await db.exec(`select public.save_temporary_password('${U(4)}', 'v1:pupil-cipher')`);
await db.exec(`select public.save_temporary_password('${U(3)}', 'v1:parent-cipher-1')`);
await db.exec(`select public.save_temporary_password('${U(3)}', 'v1:parent-cipher-2')`);
r = await db.query(`select count(*)::int n from public.admin_temporary_passwords()`);
ok(r.rows[0].n === 2, "a reset replaces the earlier copy (one per sign-in)");

// Nobody reads the table directly
await refuses(db, `select * from public.temporary_passwords`, "admin can't read the table directly", "permission denied");
await as(db, U(3));
await refuses(db, `select * from public.temporary_passwords`, "parent can't read the table", "permission denied");
await asAnon(db);
await refuses(db, `select * from public.temporary_passwords`, "signed-out can't read the table", "permission denied");
await refuses(db, `select * from public.view_temporary_passwords(array['${U(4)}'::uuid])`, "signed-out can't look up", "permission denied");

// Who may look up
for (const [uid, who] of [[U(2), "teacher"], [U(6), "front desk"], [U(3), "parent"], [U(4), "pupil"]]) {
  await as(db, uid);
  await refuses(db, `select * from public.view_temporary_passwords(array['${U(4)}'::uuid])`, `${who} can't look up`, "Only admins");
  const l = await db.query(`select count(*)::int n from public.admin_temporary_passwords()`);
  ok(l.rows[0].n === 0, `${who} can't list who has one`);
}
await as(db, U(1));
r = await db.query(`select * from public.view_temporary_passwords(array['${U(4)}'::uuid, '${U(3)}'::uuid], 'Reprinted slip')`);
ok(r.rows.length === 2 && r.rows.find((x) => x.user_id === U(3))?.ciphertext === "v1:parent-cipher-2", "admin looks up both (latest copy)");
r = await db.query(`select subject_name, admission_number, detail, done_by_name from public.account_log where action = 'password_viewed' order by subject_name`);
ok(r.rows.length === 2 && r.rows[0].subject_name === "Ada Obi" && r.rows[0].admission_number === "GRE/2026/001" && r.rows[0].detail === "Reprinted slip" && r.rows[0].done_by_name === "Mrs Admin", "each look-up logged with the person, the reason and the admin");

// Expired copies disappear
await asOwner(db);
await db.exec(`update public.temporary_passwords set expires_at = now() - interval '1 minute' where user_id = '${U(4)}'`);
await as(db, U(1));
r = await db.query(`select * from public.view_temporary_passwords(array['${U(4)}'::uuid])`);
ok(r.rows.length === 0, "expired temporary password can't be looked up");
await asOwner(db);
r = await db.query(`select count(*)::int n from public.temporary_passwords where user_id = '${U(4)}'`);
ok(r.rows[0].n === 0, "expired copy deleted");

// Choosing their own password deletes the school's copy
await as(db, U(3));
await db.exec(`select public.clear_my_temporary_password()`);
await asOwner(db);
r = await db.query(`select count(*)::int n from public.temporary_passwords where user_id = '${U(3)}'`);
ok(r.rows[0].n === 0, "parent's own password deletes the school's copy");
r = await db.query(`select subject_name from public.account_log where action = 'temporary_password_cleared'`);
ok(r.rows[0]?.subject_name === "Mrs Obi", "logged as cleared, with the parent's name");
await as(db, U(5));
await db.exec(`select public.clear_my_temporary_password()`);
await asOwner(db);
r = await db.query(`select count(*)::int n from public.account_log where action = 'temporary_password_cleared'`);
ok(r.rows[0].n === 1, "clearing when there is nothing logs nothing");

// A pupil record with a stored password still has nothing "attached" (no FK to students).
await as(db, U(1));
await db.exec(`select public.save_temporary_password('${U(4)}', 'v1:pupil-cipher-again')`);
r = await db.query(`select public.student_usage('${U(20)}') u`);
ok(!r.rows[0].u || !("temporary_passwords" in r.rows[0].u), "stored password doesn't count as attached to the pupil");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
