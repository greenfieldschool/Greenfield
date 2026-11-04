---
name: assignments
description: Use for assignments and classwork: teachers setting and marking work, pupils handing in on the portal (text, photos, files), parents following it, the private file bucket, and sending marks to the result sheet.
---

# Assignments and classwork

## Where things live
- SQL: `docs/migrations/20261105_assignments.sql`. Tables `assignments` (class, subject or null = general, kind
  `assignment|classwork`, instructions, worksheet `attachment_path`, `due_at`, `max_score`, `accepts_late`,
  `result_assessment_id`) and `assignment_submissions` (one per pupil: `body`, `file_path`, `submitted_at`, `score`,
  `feedback`, `marked_at`).
- Access helpers: `can_manage_assignment(id)` (= `can_manage_results(class, subject)`), `portal_sees_class(class)`,
  `portal_sees_student(pupil)`, `assignment_file_allowed(path, write)`.
- Writes to submissions only through functions: `submit_assignment(assignment, body, file_path, file_name, file_type)`
  (the signed-in pupil only, their class, not once marked, not after the due date unless `accepts_late`, file must
  be in their own folder) and `mark_submission(assignment, pupil, score, feedback)` (teacher of the class/subject or
  admin; never above `max_score`; null + null clears the mark; works without a submission for paper work).
- Files: private bucket `assignment-files` (10 MB): `briefs/<assignment>/…` (teacher's worksheet),
  `work/<assignment>/<pupil>/…` (pupil's work). Storage policies use `assignment_file_allowed`. Open files with
  `signedFileLinks()` (10-minute links, created with the user's own client so the rules apply).
- Code: `src/lib/assignments.ts` (types, `pupilStatus`, `dueLabel`, Lagos due times, `signedFileLinks`, errors),
  `src/components/assignment-file-picker.tsx` (uploads straight from the browser to the bucket; shrinks phone photos
  to 1800px JPEG first; "Take a photo" on phones), teacher pages `src/app/admin/academics/assignments/**`, portal
  `src/app/portal/assignments/**` (`_load.ts` picks the pupil or the parent's chosen child).
- Help: Learn Centre `LEARN.assignments`; portal help `HELP.assignments`. Menus: Academics → Assignments & classwork;
  portal: pupils' tab bar, parents under More.

## Rules
- Never let the browser send files through a server action: Vercel caps request bodies (~4.5 MB) and phone photos
  are bigger. Upload from the browser to the bucket, then send only the path.
- Pupils' work is private. No public URLs, ever; always signed links from the user's client.
- Marks to the result sheet go through `academic_assessment_scores` with the teacher's own client, scaled to the
  column's total, so result locks and the results history apply (see results-and-reports). Don't add a bypass.
- Statuses (`pupilStatus`): Marked → Handed in late / Handed in → Not handed in (past due) → To do.

## Pitfalls we hit
- PGlite tests need a `storage` schema stub (`storage.buckets`, `storage.objects` with RLS on) for the bucket and
  its policies (`scratchpad/pgtest/test-assignments.mjs` covers pupil, classmate, parent, other parent, teachers).

## Verify
- `node test-assignments.mjs docs/migrations/20261105_assignments.sql` (PGlite), tsc, lint, build, and the
  preview app at 375px for the portal pages.
