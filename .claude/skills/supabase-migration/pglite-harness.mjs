// Runs a migration against a minimal stand-in of the Greenfield schema in PGlite (Postgres in WebAssembly),
// then lets you act as different users. Usage: node pglite-harness.mjs path/to/migration.sql
// Edit STUB to add only the tables/columns the migration touches, and add checks at the bottom.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

const db = new PGlite();
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const STUB = `
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create type public.school_level as enum ('creche','primary','secondary');
create type public.student_status as enum ('applied','enrolled','active','graduated','withdrawn','transferred');
create table public.profiles(id uuid primary key, role text, full_name text, email text);
create function public.current_role() returns text language sql security definer as $$ select role from public.profiles where id = auth.uid() $$;
create function public.is_admin() returns boolean language sql security definer as $$ select public.current_role() in ('admin','super_admin') $$;
create function public.is_staff() returns boolean language sql security definer as $$ select public.current_role() in ('super_admin','admin','teacher','front_desk','nurse') $$;
create table public.classes(id uuid primary key, level school_level, name text, active boolean default true);
create table public.students(id uuid primary key default gen_random_uuid(), first_name text, last_name text, class_id uuid, status student_status default 'active');
create table public.teacher_class_assignments(teacher_id uuid, class_id uuid, active boolean default true);
create table public.teacher_subject_assignments(teacher_id uuid, class_id uuid, subject_id uuid, active boolean default true);
create function public.teacher_has_class(p uuid) returns boolean language sql security definer as $$ select exists(select 1 from public.teacher_class_assignments where teacher_id = auth.uid() and class_id = p and active) $$;
create function public.teacher_teaches(c uuid, s uuid) returns boolean language sql security definer as $$
  select public.teacher_has_class(c) or exists(select 1 from public.teacher_subject_assignments where teacher_id = auth.uid() and class_id = c and subject_id = s and active) $$;

-- sample people
insert into auth.users values ('${U(1)}'),('${U(2)}');
insert into profiles values ('${U(1)}','admin','Head Admin',null),('${U(2)}','teacher','Mr Bello',null);
`;

await db.exec(STUB);
const migration = fs.readFileSync(process.argv[2], "utf8");
await db.exec(migration);
await db.exec(migration); // must be safe to run twice
await db.exec("grant usage on schema public, auth to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated;");
// Re-apply any revokes the migration makes, since the grant above re-opens them, e.g.:
// await db.exec("revoke insert, update, delete on public.result_audit_log from authenticated;");

const as = async (userId) => {
  await db.exec("reset role");
  await db.exec(`set test.uid='${userId}'`);
  await db.exec("set role authenticated");
};
let problems = 0;
const allowed = async (label, sql) => {
  try { await db.exec(sql); console.log("ok      ", label); } catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); }
};
const refused = async (label, sql) => {
  try { await db.exec(sql); problems++; console.log("WRONGLY ALLOWED", label); } catch (e) { console.log("refused ", label, "-", e.message.slice(0, 90)); }
};
const rows = async (sql) => (await db.query(sql)).rows;

// --- checks -------------------------------------------------------------------------------------------------
await as(U(2));
// await allowed("teacher does X", "select ...");
// await refused("teacher does Y", "select ...");
// console.log(await rows("select ..."));

console.log(problems ? `${problems} problem(s)` : "all checks passed");
