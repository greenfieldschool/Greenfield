// Phone notifications (20261111_push_notifications.sql) in PGlite.
// Usage (from a scratchpad folder with @electric-sql/pglite@0.2.17 installed):
//   node push-pglite-test.mjs <repo>/docs/migrations/20261109_notifications.sql <repo>/docs/migrations/20261111_push_notifications.sql
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

const db = new PGlite();
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const C1 = U(101), MATHS = U(201), P1 = U(401), P2 = U(402), G1 = U(601), A1 = U(701), A2 = U(702), A3 = U(703);
const EP = (n) => `https://fcm.googleapis.com/fcm/send/phone-${n}`;
const KEY = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";

// users: 5 parent of P1 and P2, 6 pupil P1, 7 another parent (no children here)
await db.exec(`
create role anon; create role authenticated; create role service_role;
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
insert into students values ('${P1}','${C1}','active'),('${P2}','${C1}','active');
insert into student_user_links values ('${U(6)}','${P1}');
insert into guardian_user_links values ('${U(5)}','${G1}');
insert into student_guardians values ('${G1}','${P1}'),('${G1}','${P2}');
`);

for (const file of process.argv.slice(2)) await db.exec(fs.readFileSync(file, "utf8"));
const push = fs.readFileSync(process.argv[process.argv.length - 1], "utf8");
await db.exec(push); // run twice
await db.exec("grant usage on schema public, auth to authenticated, service_role;");

const as = async (u) => { await db.exec("reset role"); await db.exec(`set test.uid='${u}'`); await db.exec("set role authenticated"); };
const owner = async () => { await db.exec("reset role"); await db.exec("set test.uid=''"); };
let problems = 0;
const rows = async (sql) => (await db.query(sql)).rows;
const expect = async (label, sql, want) => {
  try { const got = (await rows(sql)).length; if (got === want) console.log("ok      ", label, got); else { problems++; console.log("WRONG   ", label, "got", got, "want", want); } }
  catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); }
};
const refused = async (label, sql) => { try { await db.exec(sql); problems++; console.log("WRONGLY ALLOWED", label); } catch (e) { console.log("refused ", label, "-", e.message.slice(0, 70)); } };
const sub = (n, old = null) => `select public.push_subscribe('${EP(n)}', '${KEY}', 'tBHItJI5svbpez7KI4CCXg', 'Test phone'${old ? `, '${old}'` : ""})`;

// Before anyone turns alerts on, notifications don't queue anything.
await owner();
await db.exec(`insert into assignments values ('${A1}','${C1}','${MATHS}','assignment','Fractions worksheet', now(), 20)`);
await expect("no phones: nothing waiting", "select * from push_outbox", 0);

// Turning on
await as(U(5));
await db.exec(sub(1));
await db.exec(sub(1)); // same phone twice: one row
await expect("parent saved one phone", "select * from push_subscriptions", 1);
await refused("can't insert directly", `insert into push_subscriptions(user_id, endpoint, p256dh, auth) values ('${U(5)}', '${EP(9)}', '${KEY}', 'xxxxxxxxxxxx')`);
await refused("can't change someone's row", `update push_subscriptions set user_id = '${U(7)}'`);
await refused("can't read the waiting alerts", "select * from push_outbox");
await refused("can't take alerts", "select * from push_claim(10)");
await refused("can't ask for sending", "select push_kick(true)");
await refused("not a web address", `select push_subscribe('http://evil/x', '${KEY}', 'tBHItJI5svbpez7KI4CCXg')`);
await as(U(6));
await db.exec(sub(2));
await expect("pupil sees only their own", "select * from push_subscriptions", 1);
await as(U(7));
await expect("other parent sees none", "select * from push_subscriptions", 0);
await db.exec(`delete from push_subscriptions`);
await owner();
await expect("other parent couldn't delete them", "select * from push_subscriptions", 2);
await as("");
await refused("signed out can't save", sub(3));

// New work: parent (2 children → 2 notifications) and pupil each get alerts lined up.
await owner();
await db.exec(`insert into assignments values ('${A2}','${C1}','${MATHS}','assignment','Shapes', now(), 20)`);
await expect("3 alerts waiting (2 for the parent, 1 for the pupil)", "select * from push_outbox", 3);
await expect("kick without pg_net quietly does nothing", "select push_kick(true)", 1);

// Sending job (service role)
await db.exec("set role service_role");
await expect("job takes them", "select * from push_claim(100)", 3);
await expect("taken ones aren't taken twice", "select * from push_claim(100)", 0);
await db.exec("reset role");
await db.exec("update push_outbox set claimed_at = now() - interval '3 minutes'");
await db.exec("set role service_role");
const again = await rows("select * from push_claim(100)");
console.log(again.length === 3 ? "ok       stuck ones retried 3" : (problems++, `WRONG    stuck retry ${again.length}`));
console.log("         payload", JSON.stringify({ title: again[0].title, body: again[0].body, unread: again[0].unread }));
await db.exec(`select push_done(array['${again[0].outbox_id}']::uuid[])`);
await db.exec("reset role");
await expect("finished one removed", "select * from push_outbox", 2);

// Already read → dropped; tried 3 times → dropped
await as(U(5));
await db.exec("select mark_notifications_read(null)");
await owner();
await db.exec("set role service_role");
await expect("read ones aren't sent", "select * from push_claim(100) where user_id = '00000000-0000-0000-0000-000000000005'", 0);
await db.exec("reset role");
await db.exec("update push_outbox set claimed_at = null, attempts = 3");
await db.exec("set role service_role");
await expect("given up after 3 tries", "select * from push_claim(100)", 0);
await db.exec("reset role");

// Shared phone: pupil's phone turned on by the parent moves to the parent. Renewed address replaces the old one.
await as(U(5));
await db.exec(sub(2));
await owner();
await expect("phone 2 now belongs to the parent", `select * from push_subscriptions where endpoint = '${EP(2)}' and user_id = '${U(5)}'`, 1);
await as(U(5));
await db.exec(sub(4, EP(1)));
await expect("renewed address replaced the old one", `select * from push_subscriptions where endpoint in ('${EP(1)}','${EP(4)}')`, 1);
for (let i = 10; i < 22; i++) await db.exec(sub(i));
await expect("at most 10 phones each", "select * from push_subscriptions", 10);
await db.exec(`delete from push_subscriptions where endpoint = '${EP(21)}'`);
await expect("turning off removes own", "select * from push_subscriptions", 9);

// With pg_net and Vault in place: one request per transaction, however many notifications.
await owner();
await db.exec(`
create schema net; create table net.calls(url text, headers jsonb);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint language sql as $$ insert into net.calls values (url, headers) returning 1::bigint $$;
create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
insert into vault.decrypted_secrets values ('greenfield_push_send_url','https://example.test/api/push/send'),('greenfield_cron_secret','s3cret-s3cret-s3cret');
`);
await db.exec(`begin; insert into assignments values ('${A3}','${C1}','${MATHS}','assignment','Graphs', now(), 20); commit;`);
await expect("one request for the whole class", "select * from net.calls", 1);
await expect("request carries the secret", "select * from net.calls where headers->>'Authorization' = 'Bearer s3cret-s3cret-s3cret'", 1);
await db.exec("delete from push_outbox");
await expect("backup job: nothing waiting, no request", "select push_kick(true)", 1);
await expect("still one request", "select * from net.calls", 1);

// A broken push table never stops the notification.
await db.exec("alter table push_outbox add constraint broken check (false) not valid");
await db.exec(`insert into lesson_notes values ('${U(800)}','${C1}','${MATHS}','Fractions',9,'draft'); update lesson_notes set status = 'published'`);
await expect("notification still saved when queuing fails", "select * from notifications where kind = 'lesson_note'", 3);

console.log(problems ? `\n${problems} problem(s)` : "\nAll checks passed");
process.exit(problems ? 1 : 0);
