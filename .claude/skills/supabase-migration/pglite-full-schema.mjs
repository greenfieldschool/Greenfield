import { splitSql } from "./pglite-split.mjs";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
export const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
export async function load(extraFiles = []) {
  const db = new PGlite();
  await db.exec(`
create role anon; create role authenticated; create role service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema auth; create schema storage; create schema vault; create schema net; create schema extensions; create schema cron;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz, phone text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
create table vault.decrypted_secrets(name text, decrypted_secret text);
create function net.http_post(url text, body jsonb default null, params jsonb default null, headers jsonb default null, timeout_milliseconds int default null) returns bigint language sql as $$ select 1::bigint $$;
create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
create function cron.unschedule(a text) returns boolean language sql as $$ select true $$;
`);
  let sql = fs.readFileSync(process.argv[2] ?? "/Users/user/Documents/Business/greenfieldSchool/docs/schema.sql", "utf8");
  sql = sql.replace(/create extension[^;]*;/gi, () => "");
  let pending = splitSql(sql); let pass = 0;
  while (pending.length && pass < 8) {
    pass++; const failed = [];
    for (const st of pending) { try { await db.exec(st); } catch (e) { failed.push([st, e.message]); } }
    if (failed.length === pending.length) { pending = failed.map((f) => f[0]); globalThis.__fail = failed; break; }
    pending = failed.map((f) => f[0]); globalThis.__fail = failed;
  }
  if (pending.length) { console.log("UNAPPLIED", pending.length); for (const [st, m] of globalThis.__fail) console.log(" -", m, "|", st.replace(/\s+/g, " ").slice(0, 140)); }
  // Replay everything in file order so the latest version of each function/policy wins.
  for (const st of splitSql(sql)) { try { await db.exec(st); } catch {} }
  for (const f of extraFiles) await db.exec(fs.readFileSync(f, "utf8"));
  return db;
}
