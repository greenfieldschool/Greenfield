---
name: admission-and-accounts
description: Use for admission numbers (format, automatic numbering, clashes, changing a number), adding pupils and checking for duplicates (Add a pupil, approving applications, pupils from another portal), and portal accounts and passwords for pupils and parents (Accounts & passwords, temporary passwords, login slips, unlinked accounts, the account history).
---

# Admission numbers and portal accounts

## When to use
"Generate admission numbers", "the same child was entered twice", "pupil can't sign in after their number
changed", "create accounts for the whole class", "print login slips", "reset a parent's password", "accounts that
belong to nobody". Deactivating or deleting duplicate pupils is the pupil-records skill; staff accounts and roles
are role-management.

## Where things live
- Database: `docs/migrations/20261117_admission_numbers_and_accounts.sql` (appended to `docs/schema.sql`).
  - `admission_key(text)`: comparison form (lower case, letters/digits, leading zeros dropped per part):
    `GRE/2026/007` = `gre 2026 7` = `GRE2026/7` → `gre20267`. Unique index `students_admission_key_unique` on it,
    created only when no existing pupils clash (`admission_number_clashes()` lists them; rerun the file after fixing).
  - `admission_number_settings` (one row): `template` with `{PREFIX}` `{YYYY}` `{YY}` `{N}`, `prefix`,
    `section_prefixes` (jsonb by level), `digits`, `year_basis` calendar/session, `session_start_month`, `auto_assign`.
    Changed only by a developer: admins call `request_admission_format_change(...)` (reason required, one pending
    request at a time, `admission_format_requests`), and a developer runs `approve_admission_format_change(id, name,
    note)` or `reject_admission_format_change(id, name, note)` in the Supabase SQL editor. Those two have no grants
    (not even `service_role`) and refuse any call with a signed-in user, so the website can never run them.
  - `admission_number_counters(scope, last_value)`: scope = the template with `{N}` removed ("GRE/2026/").
    `allocate_admission_number(level)` locks the scope's row (`for update`), takes
    `greatest(counter, highest existing number matching the scope) + 1`, skips any taken key. Internal only.
  - Trigger `students_admission_number` (BEFORE insert / update of number or status): tidies the number (trim,
    single spaces, capitals), refuses removing the number of a pupil with a portal account, gives the next number
    when an `enrolled`/`active` pupil has none (insert, or update when it never had one), and refuses a number whose
    key another pupil has (`pg_advisory_xact_lock` per key, then check; the unique index is the backstop).
  - Trigger `students_admission_number_after`: writes `account_log` (number_assigned / changed / removed) and moves
    the pupil's sign-in email (`auth.users`, `auth.identities`) to the new number, keeping the domain;
    `profiles.email` follows through `on_auth_user_email_changed` (20261117b, run after this file).
  - `preview_admission_number(level)` (staff), `admission_number_owner(number, exclude)` (staff),
    `assign_missing_admission_numbers(ids|null)` (admins), `find_possible_duplicates(first, last, dob, phones,
    emails, exclude)` (staff; reasons + strength), `admin_pupil_accounts()`, `admin_parent_accounts()`,
    `admin_unlinked_accounts()` (admins; read `auth.users` for last sign-in), `log_account_action(...)` (admins;
    `duplicate_override` any staff). `account_log` is admin-read, no direct writes.
- `src/lib/admission-login.ts`: `admissionNumberToEmail` (same rule as `admission_login_local()` in SQL),
  `isAdmissionLoginEmail`, `admissionKey`, `tidyAdmissionNumber`, `generateTemporaryPassword` (word-word-digits).
- `src/lib/pupil-intake.ts`: `findPossibleDuplicates`, `STRONG_MATCH` (50), `linkOrCreateGuardian` (reuses a parent
  with the same email or phone, else creates one, links `student_guardians`).
- `src/components/possible-duplicates.tsx`: the "Might already be at the school" panel.
- `/admin/accounts` (admins; `adminOnlyPrefixes`, nav "Accounts & passwords" under People): `page.tsx` (tabs Pupils,
  Parents, No owner, Number format, History; filters in the URL), `accounts-table.tsx` (client: selection, bulk
  create/reset, `OneTimePasswords` panel with copy and printable slips, `AccountQuickActions` for single pages),
  `actions.ts` (create/reset return passwords to the client once; at most 40 per call; assign numbers; save format;
  link an unowned account).
- `/admin/students/new` (admins + front desk): Add a pupil, live duplicate check, "give the next number" or "keep
  their existing number" with a live clash check, parent linked or created.
- `/admin/students/applications/[id]` (`src/app/admin/applications/[id]/page.tsx`): duplicates panel before Approve
  (`confirm_different` checkbox uses `form="approve-form"`), parent from the application linked as guardian, number
  in the toast.
- Pupil and guardian pages: Portal account card with `AccountQuickActions`, last sign-in, links to Accounts.
- Portal: `/portal/change-password`, `TemporaryPasswordBanner` while `user_metadata.must_change_password`, menu item
  "Change password", help answer `sign-in`. The pupil's hidden sign-in email is not shown in the portal menu.
- Print: `body.gf-print-slips` in `globals.css` prints only `.gf-slips` while the one-time panel is open.
- Learn Centre: `LEARN.accounts`, `LEARN.addPupil`, `LEARN.studentAccounts`, `LEARN.admissions`.

## The school's choice (Nov 2026)
`GRE/{YYYY}/{N}`, 3 digits, the running number restarts at 001 each year, one prefix (GRE) for every section, and the
year is the **session start year**: a pupil admitted for 2026/27 gets 2026 even in January 2027 (`year_basis =
'session'`, session starts in September). These are the defaults in the migration; only a developer can change them (below).

## Approving a format change (developers)
The school's rule (Nov 2026): admins must get the developers' authorisation to change the numbering. In the SQL editor:
```sql
select id, requested_by_name, requested_at, current_summary, template, prefix, digits, year_basis, reason
from admission_format_requests where status = 'pending';
select public.approve_admission_format_change('<id>', 'Your name', 'optional note');   -- returns the next number
select public.reject_admission_format_change('<id>', 'Your name', 'why, in words the school understands');
```
Before approving, check the new pattern can't produce numbers that clash with old ones (`admission_number_clashes()`
stays empty; the allocator skips taken keys anyway) and that `{N}` is present. Tell the admin the outcome; the
Number format tab shows it too.

## Rules
- Passwords are never stored, logged, put in a URL, toast or `localStorage`. They exist only in the server action's
  return value and the admin's open panel. Explain "nobody can see a password, only set a new one" on every screen
  that resets one.
- Every creation, reset, link, number change, format change and duplicate override is in `account_log` with who.
  Server actions using the service key call `log_account_action` with the user's client (the database takes the
  actor from the session, not from the caller).
- Numbers come only from the database (trigger / `allocate_admission_number`), never from the app counting rows.
- Changing a number must keep the sign-in working: the after-trigger moves the auth email. Don't add a code path
  that changes `auth.users.email` for pupils separately.
- Numbers are given at enrolment (approved, added, imported), not at enquiry (`applied` / application statuses).
- A shared parent phone or email alone is usually a brother or sister: `find_possible_duplicates` only reports it
  with a name or birthday match. Strong matches (same name) need "This is a different child" ticked, and that is logged.

## Pitfalls we hit
- Before this, changing a pupil's admission number silently broke their portal sign-in (the auth email was built
  from the old number) and the approval of an application never linked the parent.
- The login email strips `/` but keeps leading zeros, so `GRE/2026/7` and `GRE/2026/007` were different logins; the
  uniqueness key drops leading zeros so both can't exist. Pupils must type the number as printed (help text says so).
- `log_account_action` used to be admin-only; front desk overrides then failed silently. `duplicate_override` is
  allowed for any staff.
- PGlite: reading `auth.users` as `authenticated` is refused; read it as the owner in tests. A test picked a number
  the bulk inserts had already used: the trigger refused it, which is the point.

## Expert review
Before calling the work done, answer these as a school registrar and identity manager (30+ years of admissions and records) would. Where an answer needs a decision the school hasn't made, ask.

- **One child, one record, for life.** The uuid is the child; the admission number is a label that can be corrected.
  Every door a child comes in by (application, office, transfer, import) runs the same duplicate check, and a
  near-match goes to a person to decide, never an automatic merge.
- **Joiners, movers, leavers.** For each account change ask what happens when the pupil leaves, a parent is
  removed, or a sibling joins. Access should end when the reason for it ends. If the code doesn't do that yet, say so
  and ask; don't assume.
- **Prove who a parent is before linking them to a child.** Custody disputes and court orders are real. Linking a
  parent account is a decision a named staff member makes and the log records, never something a parent can do by
  typing a number.
- **Passwords are never stored or sent in the clear.** Temporary passwords appear once, on a slip handed to a
  checked person, and must be changed at first sign-in. Never put them in emails, logs or URLs.
- **Every number change and account action is logged** with who, when, from and to, and a name snapshot.

## Verify
- `node pglite-test.mjs <schema-before-append.sql> <20261117 migration> <20261117b migration>` from a scratchpad with the supabase-migration
  `pglite-*.mjs` files ([pglite-test.mjs](pglite-test.mjs), 70 checks). Seeds clashing numbers before the migration,
  so pass a copy of `schema.sql` from before the migration was appended.
- Concurrency isn't testable in PGlite (one connection). The guarantee is the counter row lock + advisory lock +
  unique index; to see it, run two `psql` sessions against a real Postgres, `begin; insert …` in both, commit one:
  the other gets the next number or the friendly clash error.
- `npx tsc --noEmit -p . && npx next lint --dir src && npx next build`; preview `/admin/accounts` and
  `/admin/students/new` with the fake client at desktop and 375px, and print preview with the slips open.
