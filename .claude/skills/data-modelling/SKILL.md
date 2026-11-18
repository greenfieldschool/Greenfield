---
name: data-modelling
description: Use when designing or reviewing how data is stored (new tables, columns, keys, identifiers, constraints, history, imports, deduplication, reports, indexes, data quality, privacy), before writing the migration. Applies the review of a data engineer with 30+ years of experience: single source of truth, one writer per fact, integrity in the database, time and history modelled on purpose. supabase-migration then covers writing and testing the SQL.
---

# Data modelling (senior data engineer review)

## When to use
Before any new table or column, any identifier scheme, any import from another system, any duplicate / merge / clean-up
request, any report that reads many rows, and whenever someone asks "is the data designed well?". The SQL mechanics
(safe to run twice, RLS, grants, PGlite) are in [supabase-migration](../supabase-migration/SKILL.md): this review comes
first. The aim is data the school can trust in five years, after staff turnover, imports and mistakes.

## Principles (what experience teaches)
1. **Single source of truth.** Every fact has exactly one home (the *system of record*). Everything else is a
   reference to it (a foreign key) or a copy made on purpose, with a named mechanism that keeps the copy right. A copy
   with no such mechanism will drift. The only question is when.
2. **One writer per fact.** Each fact is changed through one door: a security definer function or a trigger, which
   validates and logs. If two screens update the same column with different rules, the rules will diverge. Put the
   rule in the database and let both screens call it.
3. **Store facts, derive the rest.** Store what happened (a score entered, a payment received, a status changed).
   Derive totals, averages, positions, balances and "has an account" in one function. Store a derived value only when
   it must be **frozen** (a published report card, an issued invoice). Then it is a *snapshot*: it records when it
   was taken and from what, and is never edited to "fix" it; a new snapshot replaces it.
4. **Identity is separate from identifiers.** A row's identity is its `uuid`. Human identifiers (admission number,
   payment ID, email, phone) are attributes that can change, collide or be mistyped. They get their own normalised
   uniqueness rule and must never be used as foreign keys.
5. **Model time on purpose.** For every table, choose:
   - *current state* (overwrite);
   - *history log* (who changed what, from → to);
   - *effective-dated* (valid from / to, e.g. which class a pupil was in each term);
   - *append-only facts* (payments, scores).
   
   "We'll need last year's version" is the most common late discovery.
6. **Integrity lives in the database.** Use `not null`, `check`, foreign keys with a deliberate `on delete`, unique
   (often partial, on a normalised expression) and exclusion constraints. App checks are for friendly messages. A rule
   that lives only in the app isn't a rule: the next import, script or screen will break it.
7. **Normalise first, denormalise deliberately.** Start in third normal form. Denormalise only for a measured read
   need, or to freeze history, and write down the copy and its sync mechanism in the register below.
8. **Identity resolution is a process, not a cleanup.** The same person arrives through several doors: applications,
   the office, an old portal, a parent's second child. Check at every entry (`find_possible_duplicates`). Keep both
   records and link them (`duplicate_of`) rather than merging locked history. Record who decided "different person".
9. **Concurrency and idempotency.** Assume two people press save at once, and that a request is retried:
   - numbers come from locked counters or sequences;
   - grids save only changed cells (`orig:`);
   - an upsert must not fire "created" side effects twice;
   - a bank import must not record the same line twice (unique source reference).
10. **Data quality at the boundary.** Normalise on the way in: trim, collapse spaces, case for codes. Keep what was
    typed if it might matter. Reject impossible values with a check constraint. Report the doubtful ones (clash
    lists, "needs a number") rather than guessing.
11. **Reconcile what comes from outside.** Anything mirrored from another system (bank statements, the auth service,
    an old portal) gets a regular comparison and a visible list of differences: matched, unmatched, mismatched.
12. **Lineage and audit.** For any number on a report you should be able to answer "where did this come from, who
    entered it, when, and what was it before?". That means history tables with `done_by` and a name snapshot, source
    references on imported rows, and the computation in one named function.
13. **Privacy by design (Nigeria Data Protection Act 2023).**
    - Collect only what a screen needs; children's data deserves extra care.
    - Restrict by role with RLS, never by hiding columns in the UI.
    - Never store passwords or card numbers; don't put personal data in URLs or logs.
    - Decide how long each kind of data is kept, and what deactivation versus deletion means for it.
14. **Evolve the schema safely: expand, migrate, contract.**
    - Add the new column or table, backfill, and switch reads and writes.
    - Only then drop the old one, in a later release.
    - Every migration is safe to run twice and says what happens to existing rows that break a new rule.
15. **Names and nulls mean something.**
    - Tables are plural nouns and foreign keys are `<thing>_id`; timestamps are `<event>_at timestamptz` and calendar
      days are `date`.
    - `null` means "unknown or not applicable", never "zero" or "no". Say which in a comment when it isn't obvious.

## Sources of truth in this app (keep this register current)
| Fact | System of record | Copies, and what keeps them right |
|---|---|---|
| Who someone is, and their sign-in | `auth.users` (id, email, password hash) | `profiles.email`: copied by `handle_new_user` on insert and by `on_auth_user_email_changed` on every change (20261117b); the profiles guard lets only that sync change the email (`app.profile_email_sync`) |
| Role | `profiles.role` | none (guarded by `profiles_guard_role`, logged in `role_change_log`) |
| Pupil identity and current status | `students` | status changes only through `deactivate_student` / `reactivate_student` (trigger-guarded, logged) |
| Admission number | `students.admission_number` (unique on `admission_key`) | pupil sign-in email: moved by trigger; `account_log` / `student_status_log` keep snapshots on purpose |
| Pupil's current class | `students.class_id` | the current term's row in `student_class_terms`: kept in step by the `students_class_history` trigger (unless the term is closed) |
| Pupil's section (creche/primary/secondary) | `classes.level` | `students.level`: set from the class by `students_00_level_follows_class` on every insert or class change, and moved by `classes_level_to_students` when a class's section changes (20261117b); typed by hand only for pupils with no class |
| Which class a pupil was in during a term | `student_class_terms` (one row per pupil per term; written only by triggers and `set_student_class_for_term`, logged in `student_class_term_log`) | `class_name` / `class_level` snapshots on purpose; `class_id` on scores, welfare, attendance and comments stays as the class the record was made in; read through `class_members_in_term` (pupil-class-history skill). Backfill clashes listed in `student_class_term_conflicts` for an admin |
| Scores | `academic_assessment_scores` (append/edit with `result_audit_log`, locks) | report figures derived in `buildClassReport`; frozen in `published_results` (snapshot, on purpose) |
| Parent contact | `guardians.email` / `phone` | the parent's sign-in email (`auth.users`) can differ from `guardians.email`: **flagged on Accounts, not reconciled** |
| Parent ↔ child | `student_guardians` | none |
| Account ↔ person | `student_user_links`, `guardian_user_links` | none; unlinked accounts listed on Accounts |
| Money | `finance_*` tables, `numeric(12,2)` | balances derived; bank lines reconciled against payments |
| Admission number format | `admission_number_settings` (changed only by developers) | none |

When you add a table or a copy, add a row. When a row says **drift risk** or **gap**, the fix belongs in the area's
next change, or a session of its own.

## The review: answer these before writing SQL
1. What real-world thing is this, and what is its system of record? Is it already stored somewhere (register)?
2. What identifies it (uuid), and what are its human identifiers? What makes two rows "the same", and which unique
   index enforces that, on which normalised expression?
3. Who hands out identifiers? The database (sequence or locked counter), seeded past existing values.
4. Which constraints stop bad data, and what does each foreign key do `on delete` (cascade only for true parts;
   `set null` + name snapshot for history; restrict for money and results)?
5. How does it change over time: current state, history log, effective-dated, or append-only? Who changed it, and is
   that recorded with a name snapshot?
6. Is every copy in the register with its sync mechanism? Could this be derived instead of stored?
7. Through which one function is it written, and what does that function check and log?
8. What happens with two writers at once, a retried request, an import of the same file twice?
9. How will it be read: which filter, which order, how many rows? Which index serves it (leading column = filter;
   expression index for normalised comparisons)? Does a report need `fetchAllRows()`?
10. Who may read and change it (RLS)? Does it hold personal data, and how long is it kept?
11. What happens to existing rows that break the new rule? They should be listed for people to fix, never silently
    changed.
12. Write the system of record, the natural key, the history rule and the read paths into the area's skill.

## Pitfalls we hit
- Admission numbers were free text with a case-sensitive unique index, so `GRE/2026/7` and `gre/2026/007` could
  both exist, and the pupil sign-in, a copy built from the number, broke when it changed. Fixed with a normalised
  key, a locked counter and a trigger that moves the sign-in (admission-and-accounts skill).
- One child, three doors (applications, office, old portal), no shared check: duplicates. All doors now call
  `find_possible_duplicates()`, which finds candidates through indexes before scoring.
- Approving an application created the pupil but not the parent. Model the whole intake (child + parent + link) as
  one step (`linkOrCreateGuardian`).
- `students.level` copied `classes.level` with only app code keeping it right, and `profiles.email` copied the
  sign-in email only on insert. Both now follow their source by trigger (20261117b). The profile copy also showed a
  hidden bug: the profiles guard refused the copy when a non-admin (front desk) changed a linked pupil's admission
  number, rolling back their save. The guard now lets the flagged email sync through, and nothing else.
- Exact-duplicate cleanup must merge dependents before adding a unique index (supabase-migration pitfalls).
- Results are locked and audited, so duplicates are linked (`duplicate_of`), never merged (pupil-records skill).
- Past class membership had no home: promotion overwrote `students.class_id` and last term's report cards changed.
  Fixed with an effective-dated table (`student_class_terms`, per-term rows), a backfill that lists clashes instead of
  guessing, and "closed" terms that a later class change can't rewrite (pupil-class-history skill).

## Verify
- PGlite: each write path is refused when it breaks the rule (insert, update, upsert, the function, an import);
  existing bad rows are reported, not lost; history rows name the right person; two quick writes don't collide.
- `explain` the main reads on a few thousand seeded rows: `Index Scan` / `Bitmap Index Scan`, not `Seq Scan`.
- The register above and the area's skill are updated in the same change.
