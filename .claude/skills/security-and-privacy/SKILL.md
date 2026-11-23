---
name: security-and-privacy
description: Use whenever a change decides who can see or change something (RLS, storage buckets, routes, server actions), handles secrets or keys, receives a webhook or calls an outside service, or stores children's and parents' personal data. Applies the review of a security and data-protection lead with 30+ years of experience.
---

# Security and privacy

## When to use
Together with the area's skill whenever the work adds a table, bucket, route, API endpoint, webhook, secret,
integration or a new kind of personal data, or changes who may do something. Role changes themselves are
`role-management`; the SQL mechanics are `supabase-migration`.

## Where things live
- **The real guard is the database.** RLS on every table, writes through `security definer` functions that check
  permission and log. Helpers: `is_admin()`, `is_staff()`, `current_role()`, `staff_can_class()`,
  `can_manage_results()`, `teacher_teaches()`, `portal_sees_student()`, `portal_sees_class()`.
- **Routes:** `src/middleware.ts` + `src/lib/route-access.ts` (`adminOnlyPrefixes`, `resultsPrefixes`) keep people out
  of areas; `AdminShell` / `PortalShell` hide links. Both are conveniences, not protection.
- **Files:** private buckets only (`assignment-files`, `lesson-notes`, `inventory-photos`, …) with storage policies;
  opened through short-lived signed links made with the user's own client.
- **Secrets (Vercel env, server only):** `TEMP_PASSWORD_KEY` (optional; locks the school's copies of temporary
  passwords, falls back to a key derived from the service key), `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `EMAIL_TOKEN_KEY`,
  `GOOGLE_CLIENT_SECRET`, `VAPID_PRIVATE_KEY`, `BANK_ALERT_SECRET`, `MONIEPOINT_WEBHOOK_SECRET`. Anything starting
  `NEXT_PUBLIC_` is visible to every visitor. Secrets the database needs live in Supabase Vault, never in a function
  body (`pg_proc.prosrc` is readable by every signed-in user).
- **Incoming calls:** `/api/finance/bank-alert` (header secret), `/api/payments/moniepoint/webhook` (signature),
  `/api/email/send`, `/api/push/send`, `/api/management-pack/save` (Bearer `CRON_SECRET`). All compare with
  `timingSafeEqual`.

## Rules
- Every new table: RLS on, read policies written for each role, `revoke insert, update, delete … from anon,
  authenticated` when writes go through functions. Permission functions return definite booleans
  (`coalesce(…, false)`).
- Test every policy as **each role, including parent, pupil and signed-out**, not only the role it is for
  (a staff policy once let parents through).
- The service key is for trusted server jobs only (cron, webhooks, creating accounts). Pages act as the signed-in
  user so RLS and the logs apply.
- Webhooks: verify the signature or secret on the raw body, accept only known event types, look the record up by
  our own reference, and make processing safe to repeat (the same event twice changes nothing).
- Calling an outside service with money or personal data: keys server-side, the smallest permissions the provider
  offers, an IP allow-list where offered, limits set at the provider as well as in the app, and every call logged
  with who started it.
- Personal data (NDPA 2023): collect only what a screen needs; children's data, health, discipline and money are the
  most sensitive; no personal data in URLs, logs, emails' subject lines or phone lock-screen text; know how long it
  is kept and who can export it.
- Never print or commit secrets. The git remote URL holds a token (flagged to the user); don't echo it.

## Pitfalls we hit
- The school asked to see temporary passwords again (Nov 2026). Done without storing plain passwords: locked by the
  website with a key the database never sees, admins only, every look-up logged, gone at term end or when the person
  chooses their own (`temporary_passwords`, admission-and-accounts skill). Passwords people choose are still never kept.
- `profiles_update_own_name` let any parent set their own role to super_admin; fixed with the `profiles_guard_role`
  trigger (role-management).
- `generateMagicLink` changed roles with the service key; it now acts as the admin.
- `finance_expenses`, `expense_categories` and `finance_budgets` had `is_staff()` "for all" policies, so teachers,
  front desk and the nurse could read, change and delete money records through the API although the pages were
  admin-only (found Nov 2026; fixed in 20261119_spending_requests.sql: admins only, no deletes, void with a reason).
- The Moniepoint webhook accepts unsigned calls when `MONIEPOINT_WEBHOOK_SECRET` is not set. Moniepoint isn't used
  (Nov 2026); require the secret or remove the route before it is.
- Views run as their owner and skip RLS. The finance balance views leaked every family's balances and contact details
  to the public key until 20261122_payment_plans. Five more views (`academic_student_subject_term_summary`,
  `academic_student_term_summary`, `welfare_student_term_summary`, `exam_attempt_list_v`, `exam_session_summary_v`)
  let anyone signed out read every pupil's grades, attendance, discipline counts and exam marks with names, until
  20261123_view_row_checks: the three result/welfare views now run as the reader (`security_invoker`), the two exam
  views filter rows with `can_see_exam_session()` (staff, or a conductor assigned to the session), and anon has no
  select on any of them. Any new view: `with (security_invoker = true)`, or a row filter in the view through a
  definite-boolean `security definer` helper, plus `revoke … from anon`, and a PGlite test as a parent, pupil and
  signed out (`supabase-migration/view-row-checks-pglite-test.mjs` is a template). Check: `select relname, reloptions
  from pg_class where relkind = 'v' and relnamespace = 'public'::regnamespace`.
- Exam conductors who weren't staff could never get in: the only rule on `exam_conductor_user_links` was for staff,
  and `is_exam_conductor()` / `can_conduct_session()` ran as the caller. Making them work would also have let a
  conductor update any column of an attempt (marks) and change or delete malpractice records. Fixed in
  20261123b_exam_conductor_access: own-row reads, definer helpers, unlocks only through `exam_unlock_attempts()`
  (checks, clears the lock, logs), conductors read malpractice records only. When a rule never matched, check what
  it would allow once it does before fixing it (`supabase-migration/exam-conductor-pglite-test.mjs`).
- The CRON secret was nearly hard-coded in a function body; it lives in Vault.

## Expert review
Before calling the work done, answer these as a security and data-protection lead with 30+ years would. Where an
answer needs a decision the school hasn't made, ask.
- **Who can do this, and how do you know?** Name each role and what it can read and change; prove it with a PGlite
  test per role, not by reading the UI.
- **What is the worst thing a curious parent, a pupil or a former staff member could do with the public key and
  this change?** Try it.
- **Where could this leak?** URLs, logs, emails, error messages, browser storage, public buckets, screenshots shared
  on WhatsApp.
- **What if a key is stolen?** How much damage, how is it noticed, how is it rotated.
- **Is every sensitive action logged with a person,** and can an admin see that log?
- **Is it the minimum data for the job,** and does the school know how long it is kept?

## Verify
- PGlite (`supabase-migration` skill, `pglite-full-schema.mjs` for whole-database questions): each role allowed and
  refused, the signed-out key refused, functions not callable by roles that shouldn't.
- `grep` the diff for keys, tokens and `NEXT_PUBLIC_` additions before committing.
