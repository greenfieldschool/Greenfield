---
name: pupil-records
description: Use for deactivating, reactivating or deleting pupil records (duplicates, test records, leavers), the fixed list of reasons, pupil statuses, and the deactivation log.
---

# Pupil records: deactivate, reactivate, delete

## When to use
"Remove this duplicate pupil", "delete test pupils", "mark as left / graduated", the reason list, the deactivation
log, anything that changes a pupil's status to or from graduated / withdrawn / transferred / inactive. Editing a
pupil's name, class or photo is admin-portal-page; parents and guardians are on the guardian pages. Admission
numbers, adding pupils, the duplicate check before adding, and portal accounts are admission-and-accounts.

## Where things live
- Database: `docs/migrations/20261113b_student_deactivation.sql`.
  - Status `inactive` (added to `student_status`) = deactivated as Duplicate, Test record or Other. Leavers use the
    existing statuses: Left the school = `withdrawn`, Moved to another school = `transferred`, Graduated = `graduated`.
  - Columns on `students`: `deactivation_reason`, `deactivation_note` (Other's typed text only), `deactivated_at`,
    `deactivated_by`, `status_before_deactivation`, `duplicate_of` (record kept), `class_before_deactivation`.
  - `deactivate_student(student, reason, other, kept)`, `reactivate_student(student)`: admins, write `student_status_log`.
  - What's attached: `student_usage_unchecked(student)` (every foreign key to students, minus ONE skip list: parents,
    sign-in links, notifications, `student_status_log`, `account_log`, `student_delete_requests`) and the admin-only
    wrapper `student_usage(student)` the page calls. Add new skips to `student_usage_unchecked` only.
  - **Permanent delete is developers only** (`docs/migrations/20261118_developer_only_pupil_delete.sql`, the school's
    rule, Nov 2026). Admins call `request_student_delete(student, confirm_name, reason)` (one waiting request per
    pupil, `student_delete_requests`) or `withdraw_student_delete_request(id)`. A developer runs, in the SQL editor:
    ```sql
    select id, student_name, admission_number, reason, requested_by_name, requested_at
    from student_delete_requests where status = 'pending';
    select public.approve_student_delete('<id>', 'Your name', 'optional note');
    select public.reject_student_delete('<id>', 'Your name', 'why, in words the school understands');
    ```
    Approve/reject have no grants (not even `service_role`) and refuse a signed-in caller. Approval re-checks
    `student_delete_problem()` (still a deactivated duplicate/test record, nothing attached). `delete_student` now
    refuses everyone. Every step is in `student_status_log` (`delete_requested`, `delete_request_withdrawn`,
    `delete_rejected`, `deleted` with the developer's name and who asked).
  - Trigger `students_guard_status`: refuses any status change to or from the off-roll statuses unless it comes
    from those functions (`app.student_status_change`). So the reason is always recorded.
  - `students_parent_select` hides `inactive` records from parents.
- Reasons list: `src/lib/student-deactivation.ts` (`DEACTIVATION_REASONS`, `reasonLabel`, `STATUS_LABELS`,
  `usageSummary` with plain names per table). Keep it in step with the check constraints in the migration.
- UI: `src/app/admin/students/[id]/deactivate-panel.tsx` (client: reason dropdown, "record to keep" for duplicates,
  text box only for Other), `deactivation-actions.ts` (module-level server actions), the banner + Reactivate +
  Delete permanently on `src/app/admin/students/[id]/page.tsx`, `src/app/admin/students/deactivation-log/page.tsx`
  (admin only; in `adminOnlyPrefixes`). Students list hides `inactive` unless filtered for it.
- Learn Centre: `LEARN.deactivatePupils`.

## Rules
- Reasons are a fixed list; only Other takes free text (the school asked for this, Nov 2026).
- Never move a duplicate's results onto the kept record: final/published results are locked and audited
  (results-and-reports skill). The duplicate keeps its own records and is hidden; its parents are linked to the
  kept record instead.
- Permanent delete only by a developer, on an admin's request with a reason, and only for `inactive` +
  Duplicate/Test record + nothing attached, with the name typed to confirm. Everything else stays deactivated, which
  is safe.
- Inactive records leave their class (`class_id` null, remembered) so every class roster, register, result sheet
  and report drops them with no query changes; reactivation restores the class. Their row for the current term in
  the class history goes too (the `students_class_history` trigger), and `class_members_in_term` skips `inactive`
  records for past terms (pupil-class-history skill).
- `student_usage_unchecked` (the one skip list; `student_usage` is its admin-only wrapper, 20261118) also skips
  `student_class_terms` and `student_class_term_conflicts` (20261118b): class history alone doesn't stop a
  duplicate or test record from being deleted (it is deleted with it; the change log keeps the name). Leavers keep their class so past
  report cards still include them.
- Status selects in edit forms (pupil page, class page grid) only offer applied / enrolled / active; off-roll
  pupils show their status read-only with Reactivate.

## Pitfalls we hit
- The school wrote "Deactivate" and "permanently deleted" for the same thing. Deleting a real pupil would cascade
  through results and fees, so we split it: deactivate (reversible) for everyone, delete only empty duplicates/tests.
- Most class rosters (`.eq("class_id", …)`) don't filter by status. Rather than patch ~25 queries, inactive
  records drop their class. If a new roster must also hide leavers, filter `status in ('applied','enrolled','active')`.
- `alter type … add value` can't be used in the same transaction. Only compare `status::text` in policies and
  `language sql` functions in that migration; casts to the new value live inside plpgsql bodies (run later).
- `coalesce(deactivation_reason, '') not in (...)`: a NULL reason made the delete check pass in the first draft.

- `student_usage` returns NULL for anyone who isn't an admin, including a developer in the SQL editor: a first
  draft of the developer approval used it and so skipped the "nothing attached" check. Checks that must work with no
  signed-in user use `student_usage_unchecked`.
- The delete request row itself pointed at the pupil, so it counted as "attached" and blocked its own approval:
  history and request tables go in the skip list.

## Verify
- `node delete-requests-pglite-test.mjs <repo>/docs/schema.sql <repo>/docs/migrations/20261118_developer_only_pupil_delete.sql`
  ([delete-requests-pglite-test.mjs](delete-requests-pglite-test.mjs), 27 checks; needs the supabase-migration
  `pglite-*.mjs` beside it).
- PGlite: teacher refused; plain `update students set status='withdrawn'` refused; Other without text refused;
  duplicate needs a different, current record; guardians copied; parent sees only the kept record; inactive record
  leaves its class and gets it back on reactivate; delete refused with wrong name or attached records; log rows.
- `npx tsc --noEmit -p . && npx next lint --dir src && npx next build`.
