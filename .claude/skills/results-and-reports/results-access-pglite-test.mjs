// Proves docs/migrations/20261111b_results_admins_and_teachers.sql: only admins and teachers work on results.
//   node results-access-pglite-test.mjs <repo>
// Needs @electric-sql/pglite@0.2.17 (install it in a scratch folder and run from there). Uses the real profiles,
// current_role / is_admin / is_staff from docs/schema.sql; teacher assignments are simplified stubs.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const repo = process.argv[2];
const schema = fs.readFileSync(`${repo}/docs/schema.sql`, "utf8");
const base = schema.slice(0, schema.indexOf("procedure public.set_updated_at();") + "procedure public.set_updated_at();".length)
  .replace(/create extension[^;]*;/, "");
const mig = fs.readFileSync(`${repo}/docs/migrations/20261111b_results_admins_and_teachers.sql`, "utf8");
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const C1 = U(101), C2 = U(102), S1 = U(201), S2 = U(202);

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
`);
await db.exec(base);
// 1 admin, 2 teacher of C1/S1 (subject teacher), 3 front desk, 4 nurse, 5 class teacher of C2, 6 parent
const people = [[1, "admin"], [2, "teacher"], [3, "front_desk"], [4, "nurse"], [5, "teacher"], [6, "parent"]];
for (const [n] of people) await db.exec(`insert into auth.users(id,email) values ('${U(n)}','u${n}@x.ng')`);
for (const [n, r] of people) await db.exec(`update public.profiles set role='${r}' where id='${U(n)}'`);
await db.exec(`
create table public.t_assign(teacher uuid, class_id uuid, subject_id uuid);
insert into public.t_assign values ('${U(2)}','${C1}','${S1}'), ('${U(5)}','${C2}',null);
create function public.teacher_has_class(p_class uuid) returns boolean language sql stable security definer set search_path=public as
  $$ select exists(select 1 from t_assign where teacher=auth.uid() and class_id=p_class and subject_id is null) $$;
create function public.teacher_teaches(p_class uuid, p_subject uuid) returns boolean language sql stable security definer set search_path=public as
  $$ select exists(select 1 from t_assign where teacher=auth.uid() and class_id=p_class and (subject_id is null or subject_id=p_subject)) $$;
create table public.academic_assessments(id uuid primary key default gen_random_uuid(), class_id uuid, subject_id uuid, title text);
create table public.academic_assessment_scores(id uuid primary key default gen_random_uuid(), assessment_id uuid references public.academic_assessments(id), student_id uuid, score numeric);
create table public.result_publications(id uuid primary key default gen_random_uuid(), class_id uuid, published boolean default true);
alter table public.academic_assessments enable row level security;
alter table public.academic_assessment_scores enable row level security;
alter table public.result_publications enable row level security;
insert into public.academic_assessments(id,class_id,subject_id,title) values ('${U(301)}','${C1}','${S1}','1st CA'), ('${U(302)}','${C2}','${S2}','Exam');
insert into public.academic_assessment_scores(assessment_id,student_id,score) values ('${U(301)}','${U(401)}',12), ('${U(302)}','${U(402)}',20);
insert into public.result_publications(class_id) values ('${C1}');
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
`);
// The rules as they were (20261028 and 20261023), copied from docs/schema.sql.
await db.exec(`
create function public.can_manage_results(p_class uuid, p_subject uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false)
    or (coalesce(public.is_staff(), false) and public.current_role() is distinct from 'teacher')
    or (public.current_role() = 'teacher' and coalesce(public.teacher_teaches(p_class, p_subject), false)); $$;
create function public.can_manage_assessment(p_assessment uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_manage_results(a.class_id, a.subject_id) from public.academic_assessments a where a.id = p_assessment), false); $$;
create policy academic_assessments_staff_all on public.academic_assessments for all to authenticated
  using (public.can_manage_results(class_id, subject_id)) with check (public.can_manage_results(class_id, subject_id));
create policy academic_assessment_scores_staff_all on public.academic_assessment_scores for all to authenticated
  using (public.can_manage_assessment(assessment_id)) with check (public.can_manage_assessment(assessment_id));
`);
await db.exec(`
create policy result_publications_staff_write on public.result_publications for insert to authenticated
  with check (public.is_admin() or (public.is_staff() and public.current_role() <> 'teacher') or public.teacher_has_class(class_id));
create policy result_publications_staff_update on public.result_publications for update to authenticated
  using (public.is_admin() or (public.is_staff() and public.current_role() <> 'teacher') or public.teacher_has_class(class_id))
  with check (public.is_admin() or (public.is_staff() and public.current_role() <> 'teacher') or public.teacher_has_class(class_id));
`);

const as = async (n) => { await db.exec("reset role"); await db.exec(`set test.uid='${U(n)}'`); await db.exec("set role authenticated"); };
const count = async (sql) => Number((await db.query(sql)).rows[0].n);
let problems = 0;
const expect = (label, got, want) => { const ok = got === want; if (!ok) problems++; console.log(ok ? "ok      " : "WRONG   ", label, ok ? "" : `(got ${got}, want ${want})`); };
const tryWrite = async (sql) => { try { await db.exec("begin"); const r = await db.query(sql); await db.exec("rollback"); return (r.affectedRows ?? 0) > 0; } catch { await db.exec("rollback"); return false; } };
const sees = (n) => as(n).then(() => count("select count(*) n from public.academic_assessment_scores"));
const canScore = (n) => as(n).then(() => tryWrite(`update public.academic_assessment_scores set score=score+1 where assessment_id='${U(301)}'`));
const canAddColumn = (n) => as(n).then(() => tryWrite(`insert into public.academic_assessments(class_id,subject_id,title) values ('${C1}','${S1}','2nd CA')`));
const canPublish = (n) => as(n).then(() => tryWrite(`insert into public.result_publications(class_id) values ('${C2}')`));

console.log("-- before the update (the gap)");
expect("front desk sees every score", await sees(3), 2);
expect("nurse can change a score", await canScore(4), true);
expect("front desk can publish", await canPublish(3), true);

await db.exec("reset role"); await db.exec(mig); await db.exec(mig); // safe to run twice
console.log("-- after the update");
expect("admin sees every score", await sees(1), 2);
expect("admin can change a score", await canScore(1), true);
expect("admin can publish", await canPublish(1), true);
expect("subject teacher sees only their subject", await sees(2), 1);
expect("subject teacher can change their score", await canScore(2), true);
expect("subject teacher can add a column", await canAddColumn(2), true);
expect("class teacher sees their class", await sees(5), 1);
expect("class teacher can publish their class", await canPublish(5), true);
for (const [n, who] of [[3, "front desk"], [4, "nurse"], [6, "parent"]]) {
  expect(`${who} sees no scores`, await sees(n), 0);
  expect(`${who} can't change a score`, await canScore(n), false);
  expect(`${who} can't add a column`, await canAddColumn(n), false);
  expect(`${who} can't publish`, await canPublish(n), false);
  await as(n); expect(`${who} can't update a publication`, await tryWrite(`update public.result_publications set published=false`), false);
}
console.log(problems ? `${problems} problem(s)` : "all rules hold");
process.exit(problems ? 1 : 0);
