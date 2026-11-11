// PGlite test for docs/migrations/20261112_star_videos.sql. Usage (in a folder with @electric-sql/pglite@0.2.17):
//   node pglite-test.mjs <repo>/docs/migrations/20261112_star_videos.sql
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create type public.school_level as enum ('creche','primary','secondary');
create table public.profiles(id uuid primary key, role text, full_name text);
create function public.current_role() returns text language sql security definer as $$ select role from public.profiles where id = auth.uid() $$;
create function public.is_admin() returns boolean language sql security definer as $$ select public.current_role() in ('admin','super_admin') $$;
create function public.is_staff() returns boolean language sql security definer as $$ select public.current_role() in ('super_admin','admin','teacher','front_desk','nurse') $$;
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create table public.classes(id uuid primary key, level school_level, name text);
create table public.subjects(id uuid primary key, name text);
create table public.academic_terms(id uuid primary key);
create table public.class_subjects(class_id uuid references classes(id), subject_id uuid references subjects(id), primary key(class_id, subject_id));
create table public.students(id uuid primary key, first_name text, class_id uuid);
create table public.student_user_links(user_id uuid, student_id uuid);
create table public.guardian_user_links(user_id uuid, guardian_id uuid);
create table public.student_guardians(guardian_id uuid, student_id uuid);
create table public.teacher_subject_assignments(teacher_id uuid, class_id uuid, subject_id uuid);
create function public.can_manage_results(c uuid, s uuid) returns boolean language sql security definer as $$
  select coalesce(public.is_admin(), false) or exists(select 1 from teacher_subject_assignments where teacher_id = auth.uid() and class_id = c and subject_id = s) $$;
create function public.portal_sees_student(p uuid) returns boolean language sql security definer as $$
  select exists (select 1 from student_user_links where user_id = auth.uid() and student_id = p)
    or exists (select 1 from guardian_user_links g join student_guardians sg using (guardian_id) where g.user_id = auth.uid() and sg.student_id = p) $$;
create function public.subject_label(p uuid) returns text language sql security definer as $$ select coalesce((select name from subjects where id = p), 'General') $$;
create table public.notifications(student_id uuid, kind text, title text, body text, ref uuid);
create function public.notify_pupils(st uuid[], k text, t text, b text, p text, r uuid) returns void language sql security definer as $$
  insert into notifications select unnest(st), k, t, b, r $$;
insert into auth.users values ('${U(1)}'),('${U(2)}'),('${U(3)}'),('${U(4)}'),('${U(5)}');
insert into profiles values ('${U(1)}','admin','Head'),('${U(2)}','teacher','Mr Bello'),('${U(3)}','parent','Mrs Ade'),('${U(4)}','parent','Mr Other'),('${U(5)}','teacher','Ms Other');
insert into classes values ('${U(10)}','primary','Year 1'),('${U(11)}','primary','Year 2');
insert into subjects values ('${U(20)}','English'),('${U(21)}','Mathematics'),('${U(22)}','Science');
insert into class_subjects values ('${U(10)}','${U(20)}'),('${U(10)}','${U(21)}'),('${U(10)}','${U(22)}'),('${U(11)}','${U(20)}');
insert into students values ('${U(30)}','Tobi','${U(10)}'),('${U(31)}','Ada','${U(10)}'),('${U(32)}','Kemi','${U(11)}');
insert into guardian_user_links values ('${U(3)}','${U(40)}'),('${U(4)}','${U(41)}');
insert into student_guardians values ('${U(40)}','${U(30)}'),('${U(41)}','${U(31)}');
insert into teacher_subject_assignments values ('${U(2)}','${U(10)}','${U(20)}');
`);
const mig = fs.readFileSync(process.argv[2], "utf8");
await db.exec(mig); await db.exec(mig);
await db.exec("grant usage on schema public, auth to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated;");
const as = async (u) => { await db.exec("reset role"); await db.exec(`set test.uid='${u}'`); await db.exec("set role authenticated"); };
let problems = 0;
const ok = async (l, sql) => { try { await db.exec(sql); console.log("ok      ", l); } catch (e) { problems++; console.log("FAILED  ", l, "-", e.message); } };
const no = async (l, sql) => { try { await db.exec(sql); problems++; console.log("WRONGLY ALLOWED", l); } catch (e) { console.log("refused ", l, "-", e.message.slice(0, 80)); } };
const n = async (sql) => (await db.query(sql)).rows[0].n;
const expect = (l, got, want) => { if (got !== want) { problems++; console.log("WRONG   ", l, got, "≠", want); } else console.log("ok      ", l, got); };
const vid = (subj, stu, week = "2026-11-09", cls = U(10)) => `insert into star_videos(class_id, subject_id, week_start, student_id, video_url) values ('${cls}','${subj}','${week}','${stu}','https://youtu.be/abc')`;

await as(U(2));
await no("teacher sets major subjects", `select set_class_major_subjects('${U(10)}', array['${U(20)}'::uuid])`);
await as(U(1));
await no("three majors", `select set_class_major_subjects('${U(10)}', array['${U(20)}','${U(21)}','${U(22)}']::uuid[])`);
await no("subject not taken by class", `select set_class_major_subjects('${U(11)}', array['${U(21)}'::uuid])`);
await ok("admin sets English + Maths", `select set_class_major_subjects('${U(10)}', array['${U(20)}','${U(21)}']::uuid[])`);
await ok("admin swaps Maths for Science", `select set_class_major_subjects('${U(10)}', array['${U(20)}','${U(22)}']::uuid[])`);
expect("majors after swap", await n(`select string_agg(subject_id::text, ',' order by subject_id) n from class_subjects where class_id='${U(10)}' and is_major`), `${U(20)},${U(22)}`);
await no("third major by direct update", `update class_subjects set is_major = true where class_id='${U(10)}' and subject_id='${U(21)}'`);

await as(U(2));
await ok("teacher posts English video", vid(U(20), U(30)));
await no("teacher posts Science (doesn't teach it)", vid(U(22), U(30)));
await no("same subject and week twice", vid(U(20), U(31)));
await no("pupil from another class", vid(U(20), U(32), "2026-11-02"));
await no("not a Monday", vid(U(20), U(30), "2026-11-10"));
await no("not an https link", `insert into star_videos(class_id, subject_id, week_start, student_id, video_url) values ('${U(10)}','${U(20)}','2026-11-02','${U(30)}','javascript:alert(1)')`);
await as(U(1));
await no("non-major subject (Maths)", vid(U(21), U(30)));
await ok("admin posts Science video", vid(U(22), U(31)));
expect("notifications so far", await n("select count(*)::int n from notifications"), 2);
await as(U(2));
await ok("teacher changes link only", `update star_videos set video_url='https://youtu.be/xyz' where subject_id='${U(20)}'`);
await as(U(1)); expect("no extra notification for new link", await n("select count(*)::int n from notifications"), 2);
await as(U(2));
await ok("teacher changes pupil", `update star_videos set student_id='${U(31)}' where subject_id='${U(20)}'`);
await as(U(1)); expect("notified the new pupil", await n(`select count(*)::int n from notifications where student_id='${U(31)}'`), 2);

await as(U(3)); expect("parent of Tobi sees", await n("select count(*)::int n from star_videos"), 0);
await as(U(4)); expect("parent of Ada sees", await n("select count(*)::int n from star_videos"), 2);
await no("parent posts", vid(U(20), U(31), "2026-11-02"));
const up = await db.query("update star_videos set reason='x' returning id"); expect("parent updates", up.rows.length, 0);
await as(U(5)); expect("other teacher sees", await n("select count(*)::int n from star_videos"), 0);
const del = await db.query("delete from star_videos returning id"); expect("other teacher deletes", del.rows.length, 0);
await as(U(2)); expect("teacher sees own subject only", await n("select count(*)::int n from star_videos"), 1);
await ok("teacher removes own video", `delete from star_videos where subject_id='${U(20)}'`);
console.log(problems ? `${problems} problem(s)` : "all checks passed");
