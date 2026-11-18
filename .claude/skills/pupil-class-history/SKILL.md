---
name: pupil-class-history
description: Use for which class a pupil was in during a term (student_class_terms), moving pupils up at the end of a session, past-term class rosters on report cards and result sheets, the "Needs checking" list of pupils found in two classes, and correcting a pupil's class for a term.
---

# Pupil class history (effective-dated class enrolment)

## When to use
"Last term's report cards list the wrong pupils", "promote pupils to the next class", "which class was X in last
year", a new screen that lists a class **for a term**, the Class history page, the class-history trigger. Changing a
pupil's current class itself is admin-portal-page (pupil page, class page grid); merging classes is the class page.
Locked/published results are results-and-reports: this never changes a score, a lock or a published copy.

## Where things live
- Database: `docs/migrations/20261118b_pupil_class_history.sql` (run after 20261117b_single_source_fixes.sql).
  - `student_class_terms` (**system of record**): one row per pupil per term (`unique (student_id, academic_term_id)`),
    `class_id` (set null if the class is deleted) + `class_name`/`class_level` snapshot, `source` (`records`,
    `term start`, `class change`, `new pupil`, `class merge`, `admin`), `note`, `set_by`, `set_by_name`, `set_at`.
  - `student_class_term_log`: every change from → to, with who and when. No FK to students (outlives a delete).
  - `student_class_term_conflicts`: pupils whose records put them in two classes in one term (`candidates` jsonb with
    evidence counts, `provisional_class_id`, `status open|resolved`).
  - Helpers: `current_academic_term_id()` (active term of the active year first, else the term covering today),
    `academic_term_ended(term)`, `class_term_closed(term, class)` (ended, or the class's `term_results` published).
  - Writers (internal, no grants): `write_student_class_term(...)`, `snapshot_class_term(term, source)`,
    `backfill_student_class_terms()` (run by the migration; re-run in the SQL editor to fill gaps).
  - Triggers: `students_class_history` (after insert / update of `class_id`), `academic_terms_class_history`
    (after insert / update of `is_active`). `merge_classes` moves the removed class's rows to the class kept.
  - Admin door: `set_student_class_for_term(student, term, class, note)`; resolves the open conflict.
  - Reader: `class_members_in_term(class, term)` (definer): staff who may see the class (`staff_can_class` /
    `teacher_has_class_or_subject`) or the service key get everyone; parents/pupils only their own; `inactive` records
    never. A term with **no rows at all** falls back to the class's pupils now (next term, before activation).
  - RLS: rows readable by admins/office staff, teachers of the class, the pupil and their parents (`can_see_class_history`);
    log and conflicts admins only; insert/update/delete revoked everywhere.
- App: `src/lib/class-history.ts` (`classPupilsInTerm(supabase, classId, termId)`: calls the reader, falls back to
  `students.class_id` if the function is missing; `CLASS_HISTORY_SOURCES` labels).
  Used by `buildClassReport` (`src/lib/term-report.ts`: report cards, print, certificates, comments, welfare scores,
  publishing, portal), the result sheet (`/admin/academics/results`: grid, bulk upload, CBT import), its CSV template
  and `/admin/academics/results/pupil`.
- UI: `/admin/students/class-history` (admins; in `adminOnlyPrefixes`, `SEGMENT_LABELS`): Needs checking (choose the
  class per pupil/term) + Recent changes. Pupil page card `src/app/admin/students/[id]/class-history-card.tsx`
  (each term, how/by whom; admins: "Correct a term"). Action: `src/app/admin/students/class-history/actions.ts`.
  "Class history" button on Students (admins). Management pack "Worth a look" note while conflicts are open.
- Learn Centre: `LEARN.classHistory`.

## How promotion at session end works (decided Nov 2026)
1. A term is **closed for a class** once its end date has passed or the class's term results are published. A class
   change after that leaves the closed term's row alone (logged as "kept") and counts from the next term.
2. So: publish third-term results (or wait for the end date), change pupils' classes, make the new first term active.
   Activating a term snapshots every pupil on roll with a class (`term start`). Activating first and then moving
   pupils also works: the moves update the new (open) term only.
3. Moving pupils **before** the old term is closed rewrites that term's rows (it is treated as a mid-term move). Fix
   with "Correct a term" on the pupil page.
4. A mid-term move in an open term: the pupil's row for the term follows the latest class (one class per term). Their
   scores/registers stay on the class they were recorded in.

## Rules
- One writer: never insert/update `student_class_terms` from the app; call `set_student_class_for_term` (admins).
- A list of a class **for a term** uses `classPupilsInTerm`; lists of a class **as it is today** (registers,
  messaging, class page, online classes, assignments) keep `students.class_id`.
- The backfill never guesses a past term: two classes → no row + a conflict. Current open term: the class now is
  written and the conflict is still listed. Re-running only fills what is missing; admin fixes are never overwritten.
- Leavers (withdrawn/transferred/graduated) keep their rows, so they stay on past report cards. `inactive`
  (duplicate/test/other) records drop out of the current term and are skipped by the reader.
- Never use this to move results between classes; locked results stay where they were recorded.

## Pitfalls we hit
- Before this, report cards were built from `students.class_id`, so after promotion last term's cards listed this
  year's pupils (only published copies survived).
- Promoting during the old term would have overwritten that term; hence "closed" (ended or published) terms keep
  their rows.
- A teacher's `students` RLS is by current class, so a past-term roster read through `students` loses promoted pupils.
  The reader is a definer function that checks access to the **class** instead.
- `student_usage` counts every FK to students, so class history alone blocked deleting test records. The skip list
  lives in `student_usage_unchecked` (20261118, developer-only deletes); 20261118b redefines that function with the
  class-history tables added. Never redefine `student_usage` or `delete_student` here.
- `students_class_history` is an AFTER trigger on purpose: the BEFORE triggers on students (run in name order:
  `students_00_level_follows_class`, `students_admission_number`, `students_guard_status`) have all run, so the row it
  reads is final.
- PGlite: `set session_replication_role = replica` (for seeding) also disables these triggers. Seed, then set it back
  to `origin` before testing them. `auth.role()` is stubbed; redefine it to test the service-key path.

## Verify
- PGlite: [`pglite-test.mjs`](pglite-test.mjs) (backfill rows and conflicts, re-run adds nothing, reader per role,
  RLS per role, direct writes refused, admin fix + log, trigger in open/published/ended terms, new pupil, inactive,
  term activation snapshot, merge, service key, `student_usage`, index plan).
- `npx tsc --noEmit -p . && npx next lint --dir src && npx next build`.
