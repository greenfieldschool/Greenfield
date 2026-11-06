import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

const db = new PGlite();
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const C1 = U(101), C2 = U(102), MATHS = U(201), ENG = U(202), T1 = U(301), P1 = U(401), P2 = U(402), G1 = U(601);
const N1 = U(901), N2 = U(902), N3 = U(903);

// 1 admin, 2 maths teacher of C1, 3 class teacher of C1, 4 English teacher of C2, 5 parent of P1 (C1), 6 pupil P2 (C2), 7 nurse
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create table public.profiles(id uuid primary key, role text);
create function public.current_role() returns text language sql stable security definer as $$ select role from public.profiles where id = auth.uid() $$;
create function public.is_admin() returns boolean language sql stable security definer as $$ select public.current_role() in ('admin','super_admin') $$;
create function public.is_staff() returns boolean language sql stable security definer as $$ select public.current_role() in ('super_admin','admin','teacher','front_desk','nurse') $$;
create table public.classes(id uuid primary key);
create table public.subjects(id uuid primary key);
create table public.academic_terms(id uuid primary key);
create table public.students(id uuid primary key, class_id uuid, status text default 'active');
create table public.teacher_class_assignments(teacher_id uuid, class_id uuid, active boolean default true);
create table public.teacher_subject_assignments(teacher_id uuid, class_id uuid, subject_id uuid, active boolean default true);
create table public.guardian_user_links(user_id uuid, guardian_id uuid);
create table public.student_guardians(guardian_id uuid, student_id uuid);
create table public.student_user_links(user_id uuid, student_id uuid);
create function public.teacher_has_class(p uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.teacher_class_assignments where teacher_id = auth.uid() and class_id = p and active) $$;
create function public.teacher_teaches(c uuid, s uuid) returns boolean language sql stable security definer as $$
  select exists(select 1 from public.teacher_subject_assignments where teacher_id = auth.uid() and class_id = c and subject_id = s and active) or public.teacher_has_class(c) $$;
-- As in 20261028_fix_results_policy_loop.sql.
create function public.can_manage_results(p_class uuid, p_subject uuid) returns boolean language sql stable security definer as $$
  select coalesce(public.is_admin(), false)
    or (coalesce(public.is_staff(), false) and public.current_role() is distinct from 'teacher')
    or (public.current_role() = 'teacher' and coalesce(public.teacher_teaches(p_class, p_subject), false)) $$;
create function public.portal_sees_student(p_student uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from public.student_user_links sul where sul.user_id = auth.uid() and sul.student_id = p_student)
    or exists (select 1 from public.guardian_user_links gul join public.student_guardians sg on sg.guardian_id = gul.guardian_id where gul.user_id = auth.uid() and sg.student_id = p_student) $$;
create table public.lesson_notes(id uuid primary key);
-- As in 20261105_assignments.sql.
create function public.portal_sees_class(p_class uuid) returns boolean language sql stable security definer as $$
  select exists (select 1 from public.students s where s.class_id = p_class and s.status not in ('withdrawn','graduated','transferred')
    and (exists (select 1 from public.student_user_links sul where sul.user_id = auth.uid() and sul.student_id = s.id)
      or exists (select 1 from public.guardian_user_links gul join public.student_guardians sg on sg.guardian_id = gul.guardian_id where gul.user_id = auth.uid() and sg.student_id = s.id))) $$;

insert into auth.users select ('00000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 7) g;
insert into profiles values ('${U(1)}','admin'),('${U(2)}','teacher'),('${U(3)}','teacher'),('${U(4)}','teacher'),('${U(5)}','parent'),('${U(6)}','student'),('${U(7)}','nurse');
insert into classes values ('${C1}'),('${C2}'); insert into subjects values ('${MATHS}'),('${ENG}'); insert into academic_terms values ('${T1}');
insert into teacher_subject_assignments values ('${U(2)}','${C1}','${MATHS}',true),('${U(4)}','${C2}','${ENG}',true);
insert into teacher_class_assignments values ('${U(3)}','${C1}',true);
insert into students values ('${P1}','${C1}'),('${P2}','${C2}');
insert into guardian_user_links values ('${U(5)}','${G1}'); insert into student_guardians values ('${G1}','${P1}');
insert into student_user_links values ('${U(6)}','${P2}');
`);


const migration = fs.readFileSync(process.argv[2], "utf8");
await db.exec(migration);
await db.exec(migration);
await db.exec("grant usage on schema public, auth to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated;");
// P3: a Year 2 pupil with their own login (user 8)
await db.exec(`insert into auth.users values ('${U(8)}'); insert into profiles values ('${U(8)}','student'); insert into students values ('${U(403)}','${C1}'); insert into student_user_links values ('${U(8)}','${U(403)}');`);

const as = async (u) => { await db.exec("reset role"); await db.exec(`set test.uid='${u}'`); await db.exec("set role authenticated"); };
let problems = 0;
const count = async (sql) => (await db.query(sql)).rows.length;
const expect = async (label, sql, want) => {
  try { const got = await count(sql); if (got === want) console.log("ok      ", label, got); else { problems++; console.log("WRONG   ", label, "got", got, "want", want); } }
  catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); }
};
const allowed = async (label, sql) => { try { await db.exec(sql); console.log("ok      ", label); } catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); } };
const refused = async (label, sql) => { try { await db.exec(sql); problems++; console.log("WRONGLY ALLOWED", label); } catch (e) { console.log("refused ", label, "-", e.message.slice(0, 80)); } };
const LIVE = U(951), LATER = U(952), DONE = U(953);
const ins = (id, startsSql, extra = "") => `insert into online_classes(id, class_id, subject_id, topic, starts_at, duration_minutes, platform, meeting_url${extra ? ", status" : ""}) values ('${id}','${C1}','${MATHS}','Fractions live', ${startsSql}, 40, 'zoom', 'https://us02web.zoom.us/j/123'${extra ? `, '${extra}'` : ""})`;

await as(U(2));
await allowed("maths teacher schedules a class starting now", ins(LIVE, "now() - interval '5 minutes'"));
await allowed("maths teacher schedules one for tomorrow", ins(LATER, "now() + interval '1 day'"));
await allowed("maths teacher schedules one that has ended", ins(DONE, "now() - interval '3 hours'"));
await refused("link must be https", `insert into online_classes(class_id, subject_id, topic, starts_at, meeting_url) values ('${C1}','${MATHS}','x', now(), 'http://zoom.us/j/1')`);
await refused("link can't be javascript:", `insert into online_classes(class_id, subject_id, topic, starts_at, meeting_url) values ('${C1}','${MATHS}','x', now(), 'javascript:alert(1)')`);
await refused("maths teacher can't schedule English", `insert into online_classes(class_id, subject_id, topic, starts_at, meeting_url) values ('${C1}','${ENG}','x', now(), 'https://meet.google.com/abc')`);
await refused("maths teacher can't schedule for another class", `insert into online_classes(class_id, subject_id, topic, starts_at, meeting_url) values ('${C2}','${MATHS}','x', now(), 'https://meet.google.com/abc')`);

await as(U(4));
await expect("other class's teacher sees none", "select * from online_classes", 0);

// Parent of P1 (Year 2) joins for their child
await as(U(5));
await expect("parent sees the class's online classes", "select * from online_classes", 3);
await expect("parent gets the link when joining for their child", `select public.join_online_class('${LIVE}','${P1}') as url`, 1);
await refused("parent can't join for someone else's child", `select public.join_online_class('${LIVE}','${U(403)}')`);
await refused("can't join before it opens", `select public.join_online_class('${LATER}','${P1}')`);
await refused("can't join after it ended", `select public.join_online_class('${DONE}','${P1}')`);
await expect("parent sees their child's attendance", "select * from online_class_attendance", 1);
await refused("parent can't mark attendance directly", `insert into online_class_attendance(online_class_id, student_id, status) values ('${LIVE}','${P1}','present')`);
await expect("parent can't change attendance", "update online_class_attendance set status = 'present' returning *", 0);

// Pupil in Year 2 with own login
await as(U(8));
await expect("pupil joins", `select public.join_online_class('${LIVE}','${U(403)}') as url`, 1);
await expect("joining twice keeps the first time", `select public.join_online_class('${LIVE}','${U(403)}') as url`, 1);
await expect("pupil sees only their own attendance", "select * from online_class_attendance", 1);

// Pupil in Year 3
await as(U(6));
await expect("pupil of another class sees none", "select * from online_classes", 0);
await refused("pupil of another class can't join", `select public.join_online_class('${LIVE}','${P2}')`);

// Teacher marks attendance
await as(U(2));
await expect("teacher sees who joined", "select * from online_class_attendance where joined_at is not null", 2);
await allowed("teacher marks a pupil absent", `insert into online_class_attendance(online_class_id, student_id, status, marked_at) values ('${DONE}','${P1}','absent', now())`);
await refused("teacher can't mark a pupil of another class", `insert into online_class_attendance(online_class_id, student_id, status) values ('${DONE}','${P2}','absent')`);
await allowed("teacher cancels tomorrow's class", `update online_classes set status = 'cancelled', cancel_reason = 'Teacher unwell' where id = '${LATER}'`);
await db.exec("reset role");
await db.exec(`update online_classes set starts_at = now() where id = '${LATER}'`);
await as(U(5));
await refused("can't join a cancelled class", `select public.join_online_class('${LATER}','${P1}')`);

await as(U(7));
await expect("nurse sees them (same rule as result sheets)", "select * from online_classes", 3);

console.log(problems ? `${problems} problem(s)` : "all checks passed");
