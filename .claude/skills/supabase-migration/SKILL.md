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
  `teacher_has_class(class)`, `teacher_has_class_or_subject(class)`.
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

## Pitfalls we hit
- Exact-duplicate cleanup must merge dependents before adding a unique index.
- Merge functions matched result columns by `assessment_type`; once several columns could share a type they had
  to match by title.
- A function returning NULL from `x in (select …)` on an unknown role made a check pass silently.
