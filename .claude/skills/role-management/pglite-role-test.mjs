// Proves the role rules in docs/migrations/20261111_lock_role_changes.sql against the real profiles table, policies
// and handle_new_user from docs/schema.sql. See SKILL.md for how to run it.
//   node pglite-role-test.mjs base.sql before                      -> shows the old gap (parent/pupil self-promote)
//   node pglite-role-test.mjs base.sql after <migration.sql>       -> every rule, run twice, plus the log
// base.sql = sed -n '1,/procedure public.set_updated_at();/p' docs/schema.sql without the "create extension" line.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create function auth.role() returns text language sql as $$ select nullif(current_setting('test.jwtrole', true),'') $$;
`);
await db.exec(fs.readFileSync(process.argv[2], "utf8")); // base schema (profiles, policies, handle_new_user)
// 1=super_admin A, 2=super_admin B, 3=admin, 4=teacher, 5=parent, 6=student, 7=admin2
const people = [[1,'super_admin','Mrs Super'],[2,'super_admin','Mr Super Two'],[3,'admin','Head Admin'],[4,'teacher','Mr Bello'],[5,'parent','Mrs Parent'],[6,'student','Ada Pupil'],[7,'admin','Second Admin']];
for (const [n] of people) await db.exec(`insert into auth.users(id,email) values ('${U(n)}','u${n}@x.ng')`);
for (const [n, r, name] of people) await db.exec(`update public.profiles set role='${r}', full_name='${name}' where id='${U(n)}'`);
await db.exec("grant usage on schema public, auth to authenticated, service_role; grant select, insert, update, delete on all tables in schema public to authenticated, service_role;");

const as = async (uid, jwt = "authenticated") => { await db.exec("reset role"); await db.exec(`set test.uid='${uid ?? ""}'`); await db.exec(`set test.jwtrole='${jwt}'`); await db.exec(`set role ${jwt === "service_role" ? "service_role" : "authenticated"}`); };
let problems = 0;
const changed = async (label, sql, check) => {
  try { await db.exec(sql); const r = (await db.query(check)).rows[0]; if (r && Object.values(r)[0] === true) console.log("ok      ", label); else { problems++; console.log("NO EFFECT", label, JSON.stringify(r)); } }
  catch (e) { problems++; console.log("FAILED  ", label, "-", e.message); }
};
const refused = async (label, sql) => {
  try { await db.exec("begin"); await db.exec(sql); await db.exec("rollback"); problems++; console.log("WRONGLY ALLOWED", label); }
  catch (e) { await db.exec("rollback"); console.log("refused ", label, "-", e.message.slice(0, 90)); }
};
const roleOf = (n) => `select role::text = `;
const is = (n, role) => `select (select role::text from public.profiles where id='${U(n)}') = '${role}'`;
const setRole = (n, role) => `update public.profiles set role='${role}' where id='${U(n)}'`;
const ret = async () => { await db.exec("reset role"); };

const phase = process.argv[3];
if (phase === "before") {
  await as(U(5));
  await changed("GAP: parent makes self super_admin (old policy)", setRole(5, "super_admin"), is(5, "super_admin"));
  await as(U(6));
  await changed("GAP: student makes self admin (old policy)", setRole(6, "admin"), is(6, "admin"));
  console.log(problems ? `${problems} problem(s)` : "gap reproduced");
  process.exit(0);
}

const mig = fs.readFileSync(process.argv[4], "utf8");
await db.exec(mig); await db.exec(mig); // twice
await db.exec("revoke insert, update, delete, truncate on public.role_change_log from anon, authenticated, service_role; grant insert on public.role_change_log to service_role;");
await db.exec("grant select on public.role_change_log to authenticated");

console.log("-- the gap is closed");
await as(U(5)); await refused("parent sets own role to super_admin", setRole(5, "super_admin"));
await as(U(6)); await refused("student sets own role to admin", setRole(6, "admin"));
await as(U(4)); await refused("teacher sets own role to admin", setRole(4, "admin"));
await as(U(4)); await refused("teacher changes a parent role (no effect)", `select 1; ${setRole(5, "teacher")}; select case when (select role from public.profiles where id='${U(5)}')='teacher' then 1/0 end`);
await as(U(5)); await changed("parent edits own name", `update public.profiles set full_name='Mrs P. Okafor' where id='${U(5)}'`, `select full_name='Mrs P. Okafor' from public.profiles where id='${U(5)}'`);
await as(U(5)); await changed("parent edits own photo", `update public.profiles set profile_photo_url='x.jpg' where id='${U(5)}'`, `select profile_photo_url='x.jpg' from public.profiles where id='${U(5)}'`);
await as(U(5)); await refused("parent changes own email", `update public.profiles set email='boss@x.ng' where id='${U(5)}'`);
await as(U(4)); await changed("teacher edits own name", `update public.profiles set full_name='Mr T. Bello' where id='${U(4)}'`, `select full_name='Mr T. Bello' from public.profiles where id='${U(4)}'`);

console.log("-- admin rules");
await as(U(3)); await changed("admin: parent -> teacher", setRole(5, "teacher"), is(5, "teacher"));
await as(U(3)); await changed("admin: teacher(5) -> front_desk", setRole(5, "front_desk"), is(5, "front_desk"));
await as(U(3)); await changed("admin: front_desk -> parent", setRole(5, "parent"), is(5, "parent"));
await as(U(3)); await refused("admin: parent -> admin", setRole(5, "admin"));
await as(U(3)); await refused("admin: parent -> super_admin", setRole(5, "super_admin"));
await as(U(3)); await refused("admin: demote another admin", setRole(7, "teacher"));
await as(U(3)); await refused("admin: demote a super_admin", setRole(1, "parent"));
await as(U(3)); await refused("admin: change own role", setRole(3, "teacher"));
await as(U(3)); await refused("admin: insert profile as admin", `insert into public.profiles(id, role) values ('${U(99)}','admin')`);
await as(U(3)); await refused("admin: delete a super_admin profile", `delete from public.profiles where id='${U(2)}'`);
await as(U(3)); await refused("admin: change a user's email via upsert to admin role", `insert into public.profiles(id, role) values ('${U(4)}','admin') on conflict (id) do update set role = excluded.role`);
await as(U(3)); await changed("admin: edits a parent's name (no role change)", `update public.profiles set full_name='Renamed' where id='${U(5)}'`, `select full_name='Renamed' from public.profiles where id='${U(5)}'`);

console.log("-- super admin rules");
await as(U(1)); await changed("super_admin: teacher -> admin", setRole(4, "admin"), is(4, "admin"));
await as(U(1)); await changed("super_admin: admin -> teacher", setRole(4, "teacher"), is(4, "teacher"));
await as(U(1)); await changed("super_admin: admin(7) -> super_admin", setRole(7, "super_admin"), is(7, "super_admin"));
await as(U(1)); await changed("super_admin: super_admin(7) -> admin", setRole(7, "admin"), is(7, "admin"));
await as(U(1)); await refused("super_admin: change own role", setRole(1, "admin"));
await as(U(1)); await changed("super_admin: demote other super_admin(2) (one remains)", setRole(2, "admin"), is(2, "admin"));
console.log("-- last super admin");
await as(null, "service_role"); await refused("server key: demote last super_admin", setRole(1, "admin"));
await as(null, "service_role"); await refused("server key: delete last super_admin profile", `delete from public.profiles where id='${U(1)}'`);
await ret(); await db.exec("reset test.uid; reset test.jwtrole");
await refused("SQL editor: demote last super_admin", setRole(1, "admin"));
await changed("SQL editor: promote admin(2) back to super_admin", setRole(2, "super_admin"), is(2, "super_admin"));
await as(U(2)); await changed("super_admin(2): demote super_admin(1) now that two exist", setRole(1, "admin"), is(1, "admin"));
await as(U(2)); await refused("super_admin(2): demote self (also last)", setRole(2, "admin"));
console.log("-- trusted paths");
await as(null, "service_role"); await changed("server key: new parent -> student", setRole(6, "student") + `; update public.profiles set role='parent' where id='${U(6)}'; update public.profiles set role='student' where id='${U(6)}'`, is(6, "student"));
await as(null, "anon"); await refused("public key, signed out: change role (no effect)", `select 1; ${setRole(5, "admin")}; select case when (select role from public.profiles where id='${U(5)}')='admin' then 1/0 end`);
await ret(); await db.exec("reset test.uid; reset test.jwtrole");
await changed("new sign-up still becomes parent (handle_new_user)", `insert into auth.users(id,email) values ('${U(50)}','new@x.ng')`, is(50, "parent"));

console.log("-- the log");
await as(U(3)); const log = (await db.query(`select user_name, old_role::text o, new_role::text n, changed_by_name by from public.role_change_log order by id`)).rows;
console.log(`admin reads ${log.length} log rows:`); for (const r of log) console.log("   ", r.user_name, r.o, "->", r.n, "by", r.by ?? "(server/SQL editor)");
const expected = 12; if (log.length !== expected) { problems++; console.log(`EXPECTED ${expected} rows`); }
await as(U(4)); const tlog = (await db.query("select count(*)::int c from public.role_change_log")).rows[0].c;
if (tlog !== 0) { problems++; console.log("TEACHER CAN READ LOG"); } else console.log("ok       teacher sees no log rows");
await as(U(5)); const plog = (await db.query("select count(*)::int c from public.role_change_log")).rows[0].c;
if (plog !== 0) { problems++; console.log("PARENT CAN READ LOG"); } else console.log("ok       parent sees no log rows");
await as(U(3)); await refused("admin inserts a fake log row", `insert into public.role_change_log(user_id, new_role) values ('${U(5)}','admin')`);
await as(U(3)); await refused("admin deletes log rows", `delete from public.role_change_log`);
await as(U(1)); await refused("super_admin edits log rows", `update public.role_change_log set new_role='parent'`);
console.log(problems ? `${problems} problem(s)` : "all checks passed");
