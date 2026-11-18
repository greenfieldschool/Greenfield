// Tests docs/migrations/20261118_developer_only_pupil_delete.sql against the whole schema in PGlite.
// From a scratchpad with @electric-sql/pglite@0.2.17 and the supabase-migration pglite-*.mjs copied in:
//   node delete-requests-pglite-test.mjs <repo>/docs/schema.sql <repo>/docs/migrations/20261118_developer_only_pupil_delete.sql
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
const asOwner = (db) => db.exec(`reset role; set test.uid = '';`);

const db = await load([]);
const sql = fs.readFileSync(process.argv[3], "utf8");
await db.exec(sql);
await db.exec(sql);
ok(true, "migration runs (twice)");

await db.exec(`
set session_replication_role = replica;
insert into auth.users(id, email) values ('${U(1)}','admin@x.ng'),('${U(2)}','teacher@x.ng');
insert into public.profiles(id, role, email, full_name) values ('${U(1)}','admin','admin@x.ng','Mrs Admin'),('${U(2)}','teacher','teacher@x.ng','Mr Teacher');
insert into public.students(id, first_name, last_name, level, status, deactivation_reason, admission_number) values
  ('${U(20)}','Test','Pupil','primary','inactive','test_record','GRE/2026/990'),
  ('${U(21)}','Dup','Licate','primary','inactive','duplicate',null),
  ('${U(22)}','Real','Pupil','primary','active',null,'GRE/2026/991'),
  ('${U(23)}','Left','School','primary','withdrawn','left_school',null),
  ('${U(24)}','Later','Attached','primary','inactive','test_record',null);
set session_replication_role = origin;
`);

// Admins ask; others can't
await as(db, U(2));
await refuses(db, `select public.request_student_delete('${U(20)}','Test Pupil','Created while testing')`, "teacher can't ask", "Only admins");
await as(db, U(1));
await refuses(db, `select public.request_student_delete('${U(20)}','Wrong Name','Created while testing')`, "wrong name refused", "Type the pupil");
await refuses(db, `select public.request_student_delete('${U(20)}','Test Pupil','')`, "reason required", "Say why");
await refuses(db, `select public.request_student_delete('${U(22)}','Real Pupil','Not needed')`, "active pupil can't be asked for", "Deactivate it first");
await refuses(db, `select public.request_student_delete('${U(23)}','Left School','Not needed')`, "leaver can't be asked for", "duplicate or a test record");
const r1 = (await db.query(`select public.request_student_delete('${U(20)}',' test  pupil ','Created while testing the portal') id`)).rows[0].id;
ok(Boolean(r1), "admin can ask (name matched ignoring case and spaces)");
await refuses(db, `select public.request_student_delete('${U(20)}','Test Pupil','Again please')`, "second waiting request refused", "already been asked");

// Admins can no longer delete directly or approve
await refuses(db, `select public.delete_student('${U(21)}','Dup Licate')`, "old direct delete switched off", "Only the developers");
await refuses(db, `select public.approve_student_delete('${r1}','Admin pretending')`, "admin can't approve (no grant)", "permission denied");
await refuses(db, `select public.reject_student_delete('${r1}','Admin pretending','No thanks at all')`, "admin can't reject (no grant)", "permission denied");
await refuses(db, `insert into public.student_delete_requests(student_name, reason) values ('X','Sneaky one')`, "no direct writes to requests", "permission denied");
let r = await db.query(`select count(*)::int n from public.students where id = '${U(20)}'`);
ok(r.rows[0].n === 1, "nothing deleted while the request waits");

// Developer approves
await asOwner(db);
await refuses(db, `select public.approve_student_delete('${r1}','')`, "developer must give a name", "Give your name");
const msg = (await db.query(`select public.approve_student_delete('${r1}','Dev Test','Checked: test record') m`)).rows[0].m;
ok(/Deleted Test Pupil \(GRE\/2026\/990\)/.test(msg), `approval deletes: ${msg}`);
r = await db.query(`select count(*)::int n from public.students where id = '${U(20)}'`);
ok(r.rows[0].n === 0, "record gone");
r = await db.query(`select action, done_by_name, reason_other from public.student_status_log where student_name = 'Test Pupil' order by created_at`);
ok(r.rows.some((x) => x.action === "delete_requested" && x.done_by_name === "Mrs Admin"), "request logged with the admin");
ok(r.rows.some((x) => x.action === "deleted" && x.done_by_name === "Dev Test (developer)" && /Asked by Mrs Admin/.test(x.reason_other)), "deletion logged with the developer and who asked");
r = await db.query(`select status, student_id, decided_by_name from public.student_delete_requests where id = '${r1}'`);
ok(r.rows[0].status === "approved" && r.rows[0].student_id === null && r.rows[0].decided_by_name === "Dev Test (developer)", "request kept as approved, link cleared");

// Reject and withdraw
await as(db, U(1));
const r2 = (await db.query(`select public.request_student_delete('${U(21)}','Dup Licate','Duplicate of the real record') id`)).rows[0].id;
await asOwner(db);
await refuses(db, `select public.reject_student_delete('${r2}','Dev','')`, "rejection needs a reason", "Say why");
await db.exec(`select public.reject_student_delete('${r2}','Dev Test','It has a fee invoice in the old system')`);
r = await db.query(`select count(*)::int n from public.students where id = '${U(21)}'`);
ok(r.rows[0].n === 1, "rejected record stays");
await as(db, U(1));
const r3 = (await db.query(`select public.request_student_delete('${U(21)}','Dup Licate','Asking again after checking') id`)).rows[0].id;
await db.exec(`select public.withdraw_student_delete_request('${r3}')`);
await refuses(db, `select public.withdraw_student_delete_request('${r3}')`, "can't withdraw twice", "no longer waiting");
r = await db.query(`select action from public.student_status_log where student_id = '${U(21)}' order by created_at`);
ok(["delete_requested", "delete_rejected", "delete_requested", "delete_request_withdrawn"].every((a) => r.rows.some((x) => x.action === a)), "request, rejection and withdrawal all logged");

// Something attached after the request: the developer's approval re-checks (and isn't fooled by having no admin
// session: student_usage returns nothing for non-admins, so the approval must use student_usage_unchecked).
const r4 = (await db.query(`select public.request_student_delete('${U(24)}','Later Attached','Test record from training') id`)).rows[0].id;
await asOwner(db);
await db.exec(`create table public.test_attached(id serial primary key, student_id uuid references public.students(id) on delete cascade);
insert into public.test_attached(student_id) values ('${U(24)}');`);
await refuses(db, `select public.approve_student_delete('${r4}','Dev Test')`, "approval re-checks what is attached", "Not deleted");
r = await db.query(`select count(*)::int n from public.students where id = '${U(24)}'`);
ok(r.rows[0].n === 1, "attached record not deleted");
await db.exec(`drop table public.test_attached;`);
await as(db, U(1));
r = await db.query(`select public.student_usage('${U(21)}') u`);
ok(JSON.stringify(r.rows[0].u) === "{}", "the request itself doesn't count as attached");

// Teachers can't read requests
await as(db, U(2));
r = await db.query(`select count(*)::int n from public.student_delete_requests`);
ok(r.rows[0].n === 0, "teacher can't see requests");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
