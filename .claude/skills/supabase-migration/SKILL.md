---
name: supabase-migration
description: Use for any database change in Supabase/Postgres: new tables, columns, RLS policies, security definer functions, triggers or views.
---

# Supabase migrations

## Where things live
- `docs/migrations/YYYYMMDD_short_name.sql`: one file per change, run by hand in the Supabase SQL editor.
- `docs/schema.sql`: full schema. Append each migration's body (from the first `-- ----` divider) at the end with a
  `-- <Title> (see docs/migrations/<file>)` header.
- Role helpers already in the database: `is_admin()`, `is_staff()`, `current_role()`, `teacher_teaches(class, subject)`,
  `teacher_has_class(class)`, `teacher_has_class_or_subject(class)`, `staff_can_class(class)`,
  `can_manage_results(class, subject)`, `can_manage_assessment(assessment)`.
- Test harness: [`pglite-harness.mjs`](pglite-harness.mjs).

## Steps
1. Header comment: what it does and why, in plain words, and "Run AFTER <previous file>" if there is an order.
2. Make it **safe to run twice**: `create table if not exists`, `add column if not exists`,
   `drop policy if exists` + `create policy`, `create or replace function`, `drop trigger if exists`,
   `on conflict do nothing` for seed rows.
3. Enable RLS on every new table. Prefer: read policies on the table, writes through `security definer`
   functions (`set search_path = public`) that check permissions, then `revoke insert, update, delete … from anon, authenticated`.
4. For each new function: `revoke all on function … from public, anon;` and `grant execute … to authenticated`
   only if the app calls it. Internal helpers: revoke from `authenticated` too.
5. Test with PGlite (below). Cover: allowed, refused, wrong role, run twice.
6. Append to `docs/schema.sql`.
7. Tell the user exactly which files to run, in which order, **before** deploying code that needs them.

## Rules
- `coalesce(public.is_admin(), false)`; never `if not public.is_admin()` (NULL slips through). Same for any
  boolean permission function: return a definite true/false.
- Enum casts (`level::text`) are not IMMUTABLE, so don't use them in index expressions. Use `nulls not distinct`.
- Keep audit-type tables write-only for triggers: no insert/update/delete policies, revoke privileges.
- Upserts fire BEFORE INSERT triggers even when they become updates; check for an existing row before logging.
- `SET` flags for trusted internal paths use `set_config('app.<flag>', 'on', true)` inside definer functions only.
- Views run as their owner (bypass RLS) unless `with (security_invoker = true)`.

## Test with PGlite
```bash
S=<scratchpad>/pgtest; mkdir -p $S && cd $S && npm init -y >/dev/null && npm install @electric-sql/pglite@0.2.17 >/dev/null
cp <repo>/.claude/skills/supabase-migration/pglite-harness.mjs $S/
node pglite-harness.mjs <repo>/docs/migrations/<file>.sql
```
Edit the stub section of the harness for the tables your migration touches (only the columns used). Act as a
user with `set test.uid` / `set test.role`, then `set role authenticated` to make RLS apply. In JS, never
`String.replace` SQL containing `$$` with a string replacement (use a function), because `$$` means `$`.

### Whole database in PGlite (permission questions: "can a teacher do X?")
[`pglite-full-schema.mjs`](pglite-full-schema.mjs) loads all of `docs/schema.sql` with stubs for Supabase's `auth`,
`storage`, `vault`, `net`, `cron` and the default table grants. `schema.sql` is not in dependency order, so it splits the
file into statements ([`pglite-split.mjs`](pglite-split.mjs)), retries failures for several passes, then replays the whole
file in order so the newest version of each function/policy wins. `const db = await load([extra.sql, ...])`, with
`process.argv[2]` = path to schema.sql. Seed rows inside `set session_replication_role = replica;` (otherwise
`profiles_guard_role` refuses role changes), then act as users with `set test.uid` + `set role authenticated`.
`schema.sql` can lag the migrations (Nov 2026: it had no policies on `teacher_class_assignments`), so when a result
looks wrong, check the original migration and pass it as an extra file before concluding.

## Pitfalls we hit
- Don't use temporary tables in a migration. The Supabase SQL editor sees `create temporary table` as a table
  without RLS and offers "enable Row Level Security"; that appends an `alter table … enable row level security`
  after the script, which fails once the temp table is dropped ("relation … does not exist") and rolls the whole
  run back. Put lists in a `do $$ … $$` block and read them with `jsonb_to_recordset(…)` or inline `values`.
- The editor also warns "destructive operations" for `drop policy/trigger/function if exists` used to replace them.
  Expected; say so in the migration's header so the school isn't alarmed.
- Policies on two tables that query each other (A's policy reads B, B's policy reads A) fail every query with
  "infinite recursion detected in policy". Do cross-table checks in a `security definer` helper instead of a
  subquery in the policy. PGlite reproduces it, so test the old policies first.
- `is_admin() or current_role() <> 'teacher' or …` lets parents and pupils through. Use the helpers
  `staff_can_class(class_id)` (classes, students, attendance) or `can_manage_results(class, subject)` (results),
  or write `coalesce(is_staff(), false) and current_role() is distinct from 'teacher'`. Fixed everywhere by
  20261023 (result_publications) and the two 20261028 migrations. Test a parent account in PGlite for every
  staff policy you write.
- Exact-duplicate cleanup must merge dependents before adding a unique index.
- Merge functions matched result columns by `assessment_type`; once several columns could share a type they had
  to match by title.
- A function returning NULL from `x in (select …)` on an unknown role made a check pass silently.

## Expert review
Before calling the work done, answer these as a PostgreSQL DBA (30+ years of running production databases) would. Where an answer needs a decision the school hasn't made, ask.

- **Safe to run, safe to re-run, safe to stop.** Each file runs in one go in the SQL editor; if it fails half way, a
  second run must finish the job.
- **Plan the way back.** Before a risky change, know the forward fix and confirm the school has a recent backup
  (Supabase daily backups or point-in-time restore).
- **Existing rows first.** A new constraint on old data: find the rows that break it and list them for people (or
  add the constraint `not valid` and validate later); never silently change them.
- **Locks and size.** Think about what a change locks and for how long on the biggest tables (scores, attendance,
  chat); index the columns policies and joins filter on.
- **Functions.** `security definer` with `set search_path = public`, definite booleans, `revoke … from public, anon`,
  and grant only what the app calls.
- **Plans, not hopes.** `explain` the main reads on realistic row counts.
