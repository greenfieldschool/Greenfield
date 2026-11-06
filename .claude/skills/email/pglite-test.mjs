import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

const db = new PGlite();
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const C1 = U(101), C2 = U(102), MATHS = U(201), P1 = U(401), P2 = U(402), P3 = U(403), G1 = U(601), G2 = U(602), G3 = U(603);
const DM = U(901), ANN = U(902), PAR = U(903);

// users: 1 admin, 2 teacher, 5 parent of P1+P2 (Year 2), 6 pupil P1, 7 parent of P3 (Year 3, primary), 8 parent of P1 too (other guardian), 9 parent with no email pref (opted out)
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create type public.school_level as enum ('creche','primary','secondary');
create table public.profiles(id uuid primary key, role text, full_name text);
create function public.current_role() returns text language sql stable security definer as $$ select role from public.profiles where id = auth.uid() $$;
create function public.is_admin() returns boolean language sql stable security definer as $$ select public.current_role() in ('admin','super_admin') $$;
create function public.is_staff() returns boolean language sql stable security definer as $$ select public.current_role() in ('super_admin','admin','teacher','front_desk','nurse') $$;
create table public.subjects(id uuid primary key, name text);
create table public.classes(id uuid primary key, level school_level, name text);
create table public.students(id uuid primary key, class_id uuid, status text default 'active');
create table public.guardians(id uuid primary key, full_name text);
create table public.student_user_links(user_id uuid, student_id uuid);
create table public.guardian_user_links(user_id uuid, guardian_id uuid);
create table public.student_guardians(guardian_id uuid, student_id uuid);
create function public.portal_sees_student(p_student uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from public.student_user_links sul where sul.user_id = auth.uid() and sul.student_id = p_student)
    or exists (select 1 from public.guardian_user_links gul join public.student_guardians sg on sg.guardian_id = gul.guardian_id where gul.user_id = auth.uid() and sg.student_id = p_student) $$;
create table public.assignments(id uuid primary key, class_id uuid, subject_id uuid, kind text default 'assignment', title text, due_at timestamptz, max_score numeric);
create table public.assignment_submissions(id uuid primary key default gen_random_uuid(), assignment_id uuid, student_id uuid, score numeric, feedback text, marked_at timestamptz);
create table public.lesson_notes(id uuid primary key, class_id uuid, subject_id uuid, topic text, week int, status text default 'draft');
create table public.online_classes(id uuid primary key, class_id uuid, subject_id uuid, topic text, starts_at timestamptz, status text default 'scheduled', cancel_reason text);
create table public.chat_conversations(id uuid primary key, kind text, class_id uuid);
create table public.chat_members(conversation_id uuid, user_id uuid);
create table public.chat_messages(id uuid primary key default gen_random_uuid(), conversation_id uuid, sender_id uuid, sender_name text, body text, created_at timestamptz default now(), removed_at timestamptz);
insert into auth.users values ('${U(1)}','admin@school.ng'),('${U(2)}','bello@school.ng'),('${U(5)}','ada@gmail.com'),('${U(6)}','tolu@school.ng'),('${U(7)}','musa@gmail.com'),('${U(8)}','dad@gmail.com'),('${U(9)}', null);
insert into profiles values ('${U(1)}','admin','Head Admin'),('${U(2)}','teacher','Mr Bello'),('${U(5)}','parent','Mrs Ada'),('${U(6)}','student','Tolu'),('${U(7)}','parent','Mr Musa'),('${U(8)}','parent','Mr Bakare'),('${U(9)}','parent','No Email');
insert into subjects values ('${MATHS}','Mathematics');
insert into classes values ('${C1}','primary','Year 2'),('${C2}','secondary','JSS 1');
insert into students values ('${P1}','${C1}'),('${P2}','${C1}'),('${P3}','${C2}');
insert into guardians values ('${G1}','Mrs Ada'),('${G2}','Mr Musa'),('${G3}','Mr Bakare');
insert into student_user_links values ('${U(6)}','${P1}');
insert into guardian_user_links values ('${U(5)}','${G1}'),('${U(7)}','${G2}'),('${U(8)}','${G3}'),('${U(9)}','${G1}');
insert into student_guardians values ('${G1}','${P1}'),('${G1}','${P2}'),('${G2}','${P3}'),('${G3}','${P1}');
insert into chat_conversations values ('${DM}','direct',null),('${ANN}','class_announcements','${C1}'),('${PAR}','class_parents','${C1}');
insert into chat_members values ('${DM}','${U(2)}'),('${DM}','${U(5)}');
`);

const base = "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/";
for (const f of ["20261109_notifications.sql", process.argv[2]]) {
  const sql = fs.readFileSync(f.startsWith("/") ? f : base + f, "utf8");
  await db.exec(sql);
  await db.exec(sql);
}
await db.exec(`grant usage on schema public, auth to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated;
  revoke all on public.email_outbox, public.email_settings from authenticated; revoke insert, update, delete on public.notifications from authenticated;`);

const as = async (u) => { await db.exec("reset role"); await db.exec(`set test.uid='${u}'`); await db.exec("set role authenticated"); };
const owner = async () => { await db.exec("reset role"); await db.exec("set test.uid=''"); };
let problems = 0;
const rows = async (sql) => (await db.query(sql)).rows;
const expect = async (label, sql, want) => {
  try { const got = (await rows(sql)).length; if (got === want) console.log("ok      ", label, got); else { problems++; console.log("WRONG   ", label, "got", got, "want", want); } }
  catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); }
};
const allowed = async (label, sql) => { try { await db.exec(sql); console.log("ok      ", label); } catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); } };
const refused = async (label, sql) => { try { await db.exec(sql); problems++; console.log("WRONGLY ALLOWED", label); } catch (e) { console.log("refused ", label, "-", e.message.slice(0, 70)); } };
const show = async (label, sql) => console.log("        ", label, JSON.stringify(await rows(sql)));

// Parent 7 switched off notification emails.
await as(U(7));
await allowed("parent saves their own email choices", `insert into email_preferences(user_id, notifications) values ('${U(7)}', false)`);
await refused("parent can't change someone else's", `insert into email_preferences(user_id, notifications) values ('${U(5)}', false)`);

await owner();
await db.exec(`insert into assignments values ('${U(701)}','${C1}','${MATHS}','assignment','Fractions worksheet','2026-11-12T15:00:00Z',20)`);
await expect("assignment: an email per parent with an address (not one per child, not the pupil)", "select * from email_outbox where category = 'notification'", 2);
await show("who", "select to_email, to_name, subject, link from email_outbox where category = 'notification' order by to_email");
await db.exec(`insert into assignments values ('${U(702)}','${C2}','${MATHS}','assignment','JSS work',null,null)`);
await expect("parent who switched notifications off gets none", "select * from email_outbox where to_email = 'musa@gmail.com'", 0);

// Messages
await db.exec(`insert into chat_messages(conversation_id, sender_id, sender_name, body) values ('${DM}','${U(2)}','Mr Bello','Hello Mrs Ada')`);
await expect("private message: the other person gets one", "select * from email_outbox where category = 'message'", 1);
await show("message email", "select to_email, subject, body, link from email_outbox where category = 'message'");
await db.exec(`insert into chat_messages(conversation_id, sender_id, sender_name, body) values ('${DM}','${U(2)}','Mr Bello','Second message')`);
await expect("second message within 2 hours: no new email", "select * from email_outbox where category = 'message'", 1);
await db.exec(`insert into chat_messages(conversation_id, sender_id, sender_name, body) values ('${DM}','${U(5)}','Mrs Ada','Reply')`);
await expect("reply: the teacher gets one, with the staff link", "select * from email_outbox where category = 'message' and to_email = 'bello@school.ng' and link like '/admin/messages/%'", 1);
await db.exec(`insert into chat_messages(conversation_id, sender_id, sender_name, body) values ('${PAR}','${U(5)}','Mrs Ada','Parents chat')`);
await expect("class parents' chat: no emails", `select * from email_outbox where conversation_id = '${PAR}'`, 0);
await db.exec(`insert into chat_messages(conversation_id, sender_id, sender_name, body) values ('${ANN}','${U(2)}','Mr Bello','Sports day')`);
await expect("class announcements post: each parent of the class with an address", `select * from email_outbox where conversation_id = '${ANN}'`, 2);

// Announcements
await as(U(1));
await expect("admin sees how many it would reach", "select * from announcement_reach('class', null, '" + C1 + "') where pupils = 2 and parents = 3 and parents_with_email = 2", 1);
await allowed("admin sends a whole-school announcement", `insert into announcements(title, body, audience) values ('Mid-term break','School closes on Friday at 12 noon.','school')`);
await owner();
await expect("announcement emails: one per parent with an address", "select * from email_outbox where category = 'announcement'", 3);
await expect("announcement: portal notifications for pupils and parents", "select * from notifications where kind = 'announcement'", 7);
await expect("announcement notifications don't also send notification emails", "select * from email_outbox where category = 'notification' and subject = 'Mid-term break'", 0);
await as(U(1));
await allowed("admin sends a level announcement without email", `insert into announcements(title, body, audience, level, send_email) values ('Secondary only','Bring calculators.','level','secondary', false)`);
await owner();
await expect("no emails when not ticked", "select * from email_outbox where subject = 'Secondary only'", 0);
await expect("level: only the secondary parent is notified", "select * from notifications where title = 'Secondary only'", 1);
await as(U(2));
await refused("teacher can't send a school announcement", `insert into announcements(title, body, audience) values ('x','yy','school')`);
await refused("teacher can't see reach", `select * from announcement_reach('school', null, null)`);

// Who sees what
await as(U(5));
await expect("parent sees the school announcement", "select * from announcements where audience = 'school'", 1);
await expect("Year 2 parent doesn't see the secondary one", "select * from announcements where level = 'secondary'", 0);
await refused("parent can't read the outbox", "select * from email_outbox");
await refused("parent can't read the Gmail settings", "select * from email_settings");
await refused("parent can't see email status", "select * from email_status()");
await refused("parent can't claim emails", "select * from email_claim(10)");
await refused("parent can't queue an email", `select email_enqueue('${U(5)}','test','x','x','x',null,null,1)`);
await as(U(7));
await expect("secondary parent sees it", "select * from announcements where level = 'secondary'", 1);
await as(U(1));
await expect("admin sees email status", "select * from email_status()", 1);
await show("status", "select sent_24h, queued, failed_7d from email_status()");

// Sending job (service key)
await owner();
const claimed = await rows("select category, priority from email_claim(3)");
console.log("        claimed", JSON.stringify(claimed));
if (claimed.length !== 3 || claimed.some((c) => c.priority !== 1)) { problems++; console.log("WRONG    messages must go first"); } else console.log("ok       messages go first");
await expect("claimed ones are marked sending", "select * from email_outbox where status = 'sending'", 3);
await expect("a second claim doesn't take them again", "select * from email_claim(100) where status = 'sending' and attempts > 1", 0);
await db.exec("update email_outbox set claimed_at = now() - interval '20 minutes' where status = 'sending'");
await expect("stuck ones go back in the queue", "select 1 where email_requeue_stuck() > 0", 1);

console.log(problems ? `${problems} problem(s)` : "all checks passed");
