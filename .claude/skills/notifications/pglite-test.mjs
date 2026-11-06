import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

const db = new PGlite();
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const C1 = U(101), C2 = U(102), MATHS = U(201), P1 = U(401), P2 = U(402), P3 = U(403), PX = U(404), G1 = U(601), G2 = U(602);
const A1 = U(701), N1 = U(801), O1 = U(901);

// users: 5 parent of P1 and P2 (both Year 2), 6 pupil P1 (own login), 7 parent of P3 (Year 3), 8 teacher
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create table public.subjects(id uuid primary key, name text);
create table public.students(id uuid primary key, class_id uuid, status text default 'active');
create table public.student_user_links(user_id uuid, student_id uuid);
create table public.guardian_user_links(user_id uuid, guardian_id uuid);
create table public.student_guardians(guardian_id uuid, student_id uuid);
create table public.assignments(id uuid primary key, class_id uuid, subject_id uuid, kind text default 'assignment', title text, due_at timestamptz, max_score numeric);
create table public.assignment_submissions(id uuid primary key default gen_random_uuid(), assignment_id uuid, student_id uuid, score numeric, feedback text, marked_at timestamptz);
create table public.lesson_notes(id uuid primary key, class_id uuid, subject_id uuid, topic text, week int, status text default 'draft');
create table public.online_classes(id uuid primary key, class_id uuid, subject_id uuid, topic text, starts_at timestamptz, status text default 'scheduled', cancel_reason text);
insert into auth.users select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 9) g;
insert into subjects values ('${MATHS}','Mathematics');
insert into students values ('${P1}','${C1}','active'),('${P2}','${C1}','active'),('${P3}','${C2}','active'),('${PX}','${C1}','withdrawn');
insert into student_user_links values ('${U(6)}','${P1}');
insert into guardian_user_links values ('${U(5)}','${G1}'),('${U(7)}','${G2}');
insert into student_guardians values ('${G1}','${P1}'),('${G1}','${P2}'),('${G2}','${P3}');
`);

const migration = fs.readFileSync(process.argv[2], "utf8");
await db.exec(migration);
await db.exec(migration);
await db.exec("grant usage on schema public, auth to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated; revoke insert, update, delete on public.notifications from authenticated;");

const as = async (u) => { await db.exec("reset role"); await db.exec(`set test.uid='${u}'`); await db.exec("set role authenticated"); };
const owner = async () => { await db.exec("reset role"); };
let problems = 0;
const rows = async (sql) => (await db.query(sql)).rows;
const expect = async (label, sql, want) => {
  try { const got = (await rows(sql)).length; if (got === want) console.log("ok      ", label, got); else { problems++; console.log("WRONG   ", label, "got", got, "want", want); } }
  catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); }
};
const refused = async (label, sql) => { try { await db.exec(sql); problems++; console.log("WRONGLY ALLOWED", label); } catch (e) { console.log("refused ", label, "-", e.message.slice(0, 70)); } };
const show = async (label, sql) => console.log("        ", label, JSON.stringify(await rows(sql)));

// Teacher's actions (run as the table owner: the triggers are what matters here)
await owner();
await db.exec(`insert into assignments values ('${A1}','${C1}','${MATHS}','assignment','Fractions worksheet', '2026-11-12T15:00:00Z', 20)`);
await expect("assignment: parent gets one per child, pupil gets one (withdrawn pupil none)", `select * from notifications where kind = 'assignment'`, 3);
await show("parent's links", `select title, body, link from notifications where user_id = '${U(5)}' order by link`);
await show("pupil's link", `select link from notifications where user_id = '${U(6)}'`);
await expect("Year 3 parent gets nothing", `select * from notifications where user_id = '${U(7)}'`, 0);

await db.exec(`insert into assignment_submissions(assignment_id, student_id, score, feedback, marked_at) values ('${A1}','${P1}', 15, 'Well done', now())`);
await expect("marked: only P1 and P1's parent", `select * from notifications where kind = 'assignment_marked'`, 2);
await show("marked text", `select title, body from notifications where kind = 'assignment_marked' limit 1`);
await db.exec(`update assignment_submissions set score = 16, marked_at = now() where student_id = '${P1}'`);
await expect("changing a mark doesn't notify again", `select * from notifications where kind = 'assignment_marked'`, 2);

await db.exec(`insert into lesson_notes values ('${N1}','${C1}','${MATHS}','Fractions',9,'draft')`);
await expect("draft lesson note: nothing", `select * from notifications where kind = 'lesson_note'`, 0);
await db.exec(`update lesson_notes set status = 'published' where id = '${N1}'`);
await expect("published lesson note: 3", `select * from notifications where kind = 'lesson_note'`, 3);
await db.exec(`update lesson_notes set status = 'draft' where id = '${N1}'; update lesson_notes set status = 'published' where id = '${N1}'`);
await expect("republishing the same day doesn't send it twice", `select * from notifications where kind = 'lesson_note'`, 3);

await db.exec(`insert into online_classes values ('${O1}','${C1}','${MATHS}','Live revision','2026-11-12T15:00:00Z')`);
await expect("online class scheduled: 3", `select * from notifications where kind = 'online_class'`, 3);
await show("online class text", `select title, body from notifications where kind = 'online_class' limit 1`);
await db.exec(`update online_classes set topic = 'Live revision!' where id = '${O1}'`);
await expect("renaming only: no new notification", `select * from notifications where ref_id = '${O1}'`, 3);
await db.exec(`update online_classes set starts_at = '2026-11-13T15:00:00Z' where id = '${O1}'`);
await expect("moved: 3", `select * from notifications where kind = 'online_class_moved'`, 3);
await show("moved text", `select body from notifications where kind = 'online_class_moved' limit 1`);
await db.exec(`update online_classes set status = 'cancelled', cancel_reason = 'Teacher unwell' where id = '${O1}'`);
await expect("cancelled: 3", `select * from notifications where kind = 'online_class_cancelled'`, 3);
await db.exec(`update online_classes set status = 'scheduled', cancel_reason = null where id = '${O1}'`);
await expect("back on: 3", `select * from notifications where kind = 'online_class_on'`, 3);

// A broken notification must not stop the teacher's change.
await db.exec(`alter table notifications add constraint test_break check (title <> 'New assignment: Broken')`);
await db.exec(`insert into assignments values ('${U(702)}','${C1}','${MATHS}','assignment','Broken', null, null)`);
await expect("assignment still saved when notifying fails", `select * from assignments where title = 'Broken'`, 1);
await db.exec(`alter table notifications drop constraint test_break`);

// Reading
await as(U(5));
const parentCount = (await rows("select * from notifications")).length;
console.log("        parent sees", parentCount, "of their own");
await expect("parent sees none of the pupil's own", `select * from notifications where user_id <> '${U(5)}'`, 0);
await expect("unread count", "select public.notifications_unread_count() as n where public.notifications_unread_count() = " + parentCount, 1);
await refused("parent can't add a notification", `insert into notifications(user_id, kind, title) values ('${U(5)}','x','Fake')`);
await refused("parent can't edit one directly", `update notifications set title = 'x'`);
await refused("parent can't delete", `delete from notifications`);
await refused("link must stay inside the portal", `select 1 from notifications; insert into notifications(user_id, kind, title, link) values ('${U(5)}','x','x','https://evil.example')`);
const one = (await rows("select id from notifications order by created_at limit 1"))[0].id;
await expect("mark one read", `select public.mark_notifications_read(array['${one}'::uuid]) as n`, 1);
await expect("one fewer unread", `select 1 where public.notifications_unread_count() = ${parentCount - 1}`, 1);
await expect("mark all read", "select public.mark_notifications_read(null) as n", 1);
await expect("none unread", "select 1 where public.notifications_unread_count() = 0", 1);
await as(U(6));
await expect("pupil's own still unread (other people's marking doesn't touch them)", "select 1 where public.notifications_unread_count() > 0", 1);
await expect("pupil can't mark the parent's read", `select 1 where public.mark_notifications_read(array['${one}'::uuid]) = 0`, 1);
await refused("pupil can't call the sending helper", `select public.notify_class('${C1}','x','Fake','x','/portal/x', null)`);

console.log(problems ? `${problems} problem(s)` : "all checks passed");
