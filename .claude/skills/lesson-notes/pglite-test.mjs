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
await db.exec("grant usage on schema public, auth, storage to authenticated; grant select, insert, update, delete on all tables in schema public, storage to authenticated;");

const as = async (u) => { await db.exec("reset role"); await db.exec(`set test.uid='${u}'`); await db.exec("set role authenticated"); };
let problems = 0;
const count = async (sql) => (await db.query(sql)).rows.length;
const expect = async (label, sql, want) => {
  try { const got = await count(sql); if (got === want) console.log("ok      ", label, got); else { problems++; console.log("WRONG   ", label, "got", got, "want", want); } }
  catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); }
};
const allowed = async (label, sql) => { try { await db.exec(sql); console.log("ok      ", label); } catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); } };
const refused = async (label, sql) => { try { await db.exec(sql); problems++; console.log("WRONGLY ALLOWED", label); } catch (e) { console.log("refused ", label, "-", e.message.slice(0, 80)); } };
const yes = async (label, sql) => { const v = (await db.query(sql)).rows[0]?.v; if (v === true) console.log("ok      ", label); else { problems++; console.log("WRONG   ", label, v); } };
const no = async (label, sql) => { const v = (await db.query(sql)).rows[0]?.v; if (v === false) console.log("ok      ", label); else { problems++; console.log("WRONG   ", label, v); } };

// Maths teacher of Year 2 (C1)
await as(U(2));
await allowed("maths teacher saves a draft", `insert into lesson_notes(id, class_id, subject_id, academic_term_id, week, topic) values ('${N1}','${C1}','${MATHS}','${T1}',3,'Fractions')`);
await refused("maths teacher can't publish an empty note", `update lesson_notes set status = 'published' where id = '${N1}'`);
await refused("file must be in the note's own folder", `update lesson_notes set file_path = 'notes/${N2}/x.pdf' where id = '${N1}'`);
await yes("maths teacher may upload the note's file", `select public.lesson_note_file_allowed('notes/${N1}/1-fractions.pdf', true) as v`);
await allowed("file uploads into the bucket", `insert into storage.objects(bucket_id, name) values ('lesson-notes','notes/${N1}/1-fractions.pdf')`);
await allowed("maths teacher attaches the file and publishes", `update lesson_notes set file_path = 'notes/${N1}/1-fractions.pdf', file_name = 'Fractions.pdf', status = 'published', published_at = now() where id = '${N1}'`);
await allowed("maths teacher saves another draft", `insert into lesson_notes(id, class_id, subject_id, academic_term_id, week, topic, body) values ('${N2}','${C1}','${MATHS}','${T1}',4,'Decimals','Typed notes')`);
await refused("maths teacher can't write English notes", `insert into lesson_notes(class_id, subject_id, topic) values ('${C1}','${ENG}','Nouns')`);
await refused("maths teacher can't write a general class note", `insert into lesson_notes(class_id, topic) values ('${C1}','Class rules')`);
await refused("maths teacher can't write for another class", `insert into lesson_notes(class_id, subject_id, topic) values ('${C2}','${MATHS}','x')`);
await refused("maths teacher can't upload into another class's note folder", `insert into storage.objects(bucket_id, name) values ('lesson-notes','notes/${N3}/x.pdf')`);

// Class teacher of Year 2
await as(U(3));
await allowed("class teacher writes a general note", `insert into lesson_notes(id, class_id, academic_term_id, week, topic, body, status, published_at) values ('${N3}','${C1}','${T1}',3,'Class rules','Be kind', 'published', now())`);
await expect("class teacher sees all Year 2 notes, drafts too", "select * from lesson_notes", 3);

// English teacher of Year 3
await as(U(4));
await expect("other class's teacher sees none", "select * from lesson_notes", 0);
await expect("other teacher can't change them", "update lesson_notes set topic = 'x' returning id", 0);
await no("other teacher can't read the file", `select public.lesson_note_file_allowed('notes/${N1}/1-fractions.pdf', false) as v`);
await expect("other teacher sees no file", "select * from storage.objects", 0);

// Admin and nurse (non-teaching staff manage, like result sheets and assignments)
await as(U(1));
await expect("admin sees every note", "select * from lesson_notes", 3);
await as(U(7));
await expect("nurse sees every note (same rule as result sheets)", "select * from lesson_notes", 3);

// Parent of a Year 2 pupil
await as(U(5));
await expect("parent sees only published notes of the child's class", "select * from lesson_notes", 2);
await expect("parent doesn't see the draft", `select * from lesson_notes where id = '${N2}'`, 0);
await yes("parent may open the published file", `select public.lesson_note_file_allowed('notes/${N1}/1-fractions.pdf', false) as v`);
await expect("parent sees the file in the bucket", "select * from storage.objects", 1);
await no("parent can't upload", `select public.lesson_note_file_allowed('notes/${N1}/evil.pdf', true) as v`);
await refused("parent can't upload into the bucket", `insert into storage.objects(bucket_id, name) values ('lesson-notes','notes/${N1}/evil.pdf')`);
await expect("parent can't change a note", "update lesson_notes set topic = 'x' returning id", 0);
await expect("parent can't delete a note", "delete from lesson_notes returning id", 0);
await refused("parent can't add a note", `insert into lesson_notes(class_id, subject_id, topic) values ('${C1}','${MATHS}','Fake')`);

// Pupil in Year 3
await as(U(6));
await expect("pupil in another class sees none", "select * from lesson_notes", 0);
await no("pupil in another class can't open the file", `select public.lesson_note_file_allowed('notes/${N1}/1-fractions.pdf', false) as v`);

// Unpublishing hides it again
await as(U(2));
await allowed("teacher takes the note back to draft", `update lesson_notes set status = 'draft', published_at = null where id = '${N1}'`);
await as(U(5));
await expect("parent no longer sees it", `select * from lesson_notes where id = '${N1}'`, 0);
await no("parent can no longer open the file", `select public.lesson_note_file_allowed('notes/${N1}/1-fractions.pdf', false) as v`);

// Paths that aren't a note's folder
await as(U(1));
await no("odd paths are refused", `select public.lesson_note_file_allowed('../etc/passwd', false) as v`);
await no("unknown note folder is refused", `select public.lesson_note_file_allowed('notes/${U(999)}/x.pdf', true) as v`);

console.log(problems ? `${problems} problem(s)` : "all checks passed");
