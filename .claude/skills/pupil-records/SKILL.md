---
name: pupil-records
description: Use for deactivating, reactivating or deleting pupil records (duplicates, test records, leavers), the fixed list of reasons, pupil statuses, and the deactivation log.
---

# Pupil records: deactivate, reactivate, delete

## When to use
"Remove this duplicate pupil", "delete test pupils", "mark as left / graduated", the reason list, the deactivation
log, anything that changes a pupil's status to or from graduated / withdrawn / transferred / inactive. Editing a
pupil's name, class or photo is admin-portal-page; parents and guardians are on the guardian pages.

## Where things live
- Database: `docs/migrations/20261113b_student_deactivation.sql`.
  - Status `inactive` (added to `student_status`) = deactivated as Duplicate, Test record or Other. Leavers use the
    existing statuses: Left the school = `withdrawn`, Moved to another school = `transferred`, Graduated = `graduated`.
  - Columns on `students`: `deactivation_reason`, `deactivation_note` (Other's typed text only), `deactivated_at`,
    `deactivated_by`, `status_before_deactivation`, `duplicate_of` (record kept), `class_before_deactivation`.
  - `deactivate_student(student, reason, other, kept)`, `reactivate_student(student)`, `student_usage(student)`
    (what's attached, by table, from every foreign key to students), `delete_student(student, confirm_name)`.
    All admins only, all write `student_status_log` (keeps name + admission number after a delete).
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
- Permanent delete only for `inactive` + Duplicate/Test record + nothing attached (`student_usage` empty), with the
  name typed to confirm. Everything else stays deactivated, which is safe.
- Inactive records leave their class (`class_id` null, remembered) so every class roster, register, result sheet
  and report drops them with no query changes; reactivation restores the class. Leavers keep their class so past
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

## Verify
- PGlite: teacher refused; plain `update students set status='withdrawn'` refused; Other without text refused;
  duplicate needs a different, current record; guardians copied; parent sees only the kept record; inactive record
  leaves its class and gets it back on reactivate; delete refused with wrong name or attached records; log rows.
- `npx tsc --noEmit -p . && npx next lint --dir src && npx next build`.
