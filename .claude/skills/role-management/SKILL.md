---
name: role-management
description: Use when changing who can give or change account roles (super admin, admin, teacher, front desk, nurse, parent, student), the role change log, the role options on /admin/users, or the "Roles and what each can do" guide.
---

# Role management

## When to use
Changing roles on `/admin/users` (role dropdown, Invite staff, Generate login link), the rules for who may give which
role, the `role_change_log`, adding a new role, or explaining roles to staff. For what a role may *see or do* inside
an area, use that area's skill (results-and-reports, finance-payments, messaging…) and keep the Learn Centre guide
below in step. New pages for one role: admin-portal-page.

## Where things live
- `profiles.role` (enum `app_role`). New sign-ups become `parent` in `handle_new_user`.
- `docs/migrations/20261111_lock_role_changes.sql`:
  - `profiles_guard_role` BEFORE INSERT/UPDATE/DELETE trigger on `profiles`: checks every role change with
    `role_change_problem()`, stops non-admins changing anything but their own name and photo, and refuses to demote
    or delete the last super admin (for everyone, including the server key and the SQL editor).
  - `role_change_trusted_caller()`: no signed-in user and not the public key = server key, SQL editor or Supabase Auth.
    Trusted callers skip the who-may-give rules (they create parent/pupil accounts) but are still logged.
  - `profiles_log_role_change` AFTER UPDATE OF role → `role_change_log` (who, whose account, from, to, when, names
    copied at the time). Admin read only; no insert/update/delete for anyone.
- `src/lib/roles.ts`: `ROLES`, `ROLE_LABELS`, `assignableRoles()`, `roleChangeProblem()` — the same rules as
  `role_change_problem()` in SQL, with the same plain-language messages.
- `src/app/admin/users/page.tsx`: `updateRole`, `inviteStaff`, `generateMagicLink`, the role dropdowns (only roles the
  viewer may give; "locked" note for themselves and, for admins, for admins/super admins), "Recent role changes" card.
- Access by role: `src/lib/route-access.ts` (`adminOnlyPrefixes`, `resultsPrefixes`), `AdminShell.tsx` (`adminOnly`,
  `chatOnly`, `roles`), RLS helpers `is_admin`, `is_staff`, `staff_can_class`, `can_manage_results`,
  `can_edit_results`, `teacher_teaches`.
- **Results are admins and teachers only** (school decision, 20261111b_results_admins_and_teachers.sql): front desk
  and nurse can't open result sheets, scores, report cards, corrections, results history, grading, assessments or
  publishing. `can_edit_results()` guards `academic_assessments` / `academic_assessment_scores` (through
  `can_manage_assessment`) and `result_publications`. Front desk keeps the read-only Published results archive
  (`can_view_published_results`). `can_manage_results()` is unchanged on purpose: assignments, lesson notes, online
  classes and star videos still use it, so front desk and nurse keep those. Keep `resultsPrefixes`, the `roles:
  ["teacher"]` nav items and `can_edit_results()` in step.
- Learn Centre: guides `LEARN.staffAccounts` and `LEARN.roles` in `src/app/admin/learn/page.tsx`.

## The rules
1. Only super admins and admins change roles. Nobody changes their own role.
2. Only a super admin gives or removes `super_admin` / `admin`.
3. An admin gives only teacher, front_desk, nurse, parent, student, and only to people who are not admins.
4. The last super admin can't be demoted or have their profile deleted.
5. Everyone else may edit only their own `full_name` and `profile_photo_url` (not `role`, `email`, `id`, `created_at`).

## Steps (changing a rule or adding a role)
1. New migration: `create or replace function public.role_change_problem(...)` (and the trigger if needed). For a
   new role: `alter type public.app_role add value …` in its own migration first (can't be used in the same transaction).
2. Change `roleChangeProblem()` / `assignableRoles()` / `ROLE_LABELS` in `src/lib/roles.ts` to match.
3. Check `staffRoles` in `route-access.ts`, `is_staff()`, `AdminShell` filters and the portal shell for the new role.
4. Update the `LEARN.roles` guide from the real checks (not from memory).
5. Run the PGlite test below; append the migration to `docs/schema.sql`.

## Rules
- Role changes from the app go through the **signed-in admin's** Supabase client, never the service client, so the
  trigger can check them and log who did it. The service client is only for creating brand-new parent/pupil accounts
  (`/admin/guardians/[id]`, `/admin/students/[id]`), which can't already be staff.
- Check in the server action first (friendly message), then let the database decide; show `error.message` from the
  update (the trigger's messages are written for staff). Add `.select("id")` to updates: RLS makes a refused update
  return no rows and no error.
- Column grants can't do this: admins and parents share the `authenticated` database role.

## Pitfalls we hit
- `profiles_update_own_name` only checked `id = auth.uid()`, so any parent or pupil could set their own role to
  `super_admin` with the public key. Fixed by the trigger, not by the policy.
- `generateMagicLink` set the role with the server key on whatever account owned the email, so an admin could demote a
  super admin by typing their email. It now checks the existing account's role and updates as the admin.
- In PGlite, make `service_role` `bypassrls` like Supabase's, or service-key updates silently change nothing and the
  tests look like the trigger let them through.
- Inside a `security definer` trigger `current_user` is the owner; use `auth.uid()` / `auth.role()` to tell callers apart.

## Verify
```bash
S=<scratchpad>/pgtest; mkdir -p $S && cd $S && npm init -y >/dev/null && npm install @electric-sql/pglite@0.2.17 >/dev/null
sed -n '1,/procedure public.set_updated_at();/p' <repo>/docs/schema.sql | sed '/^create extension/d' > base.sql
cp <repo>/.claude/skills/role-management/pglite-role-test.mjs .
node pglite-role-test.mjs base.sql before
node pglite-role-test.mjs base.sql after <repo>/docs/migrations/20261111_lock_role_changes.sql
```
Then `npx tsc --noEmit -p . && npx next lint --dir src && npx next build`.
