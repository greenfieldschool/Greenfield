---
name: lesson-notes
description: Use for lesson notes: teachers preparing, uploading, publishing or replacing notes by class, subject, term, week and topic, and pupils or parents reading, searching and downloading them on the portal.
---

# Lesson notes

## When to use
Anything about lesson notes (issue 10, "Online lesson note management"). Assignments and classwork have their own
skill (`assignments`); video classes are not built yet.

## Where things live
- SQL: `docs/migrations/20261107_lesson_notes.sql`. Table `lesson_notes` (class, subject or null = General, term,
  `week` = the term's week number 1–30, `topic`, typed `body`, one file `file_path/name/type/size`, `status`
  `draft|published`, `published_at`, `author_name`). Checks: a published note must have a file or typed notes; the
  file must be in `notes/<note id>/`.
- Access: staff via `can_manage_results(class, subject)` (subject teacher, class teacher, admin, and non-teaching
  staff, same as result sheets and assignments); parents and pupils read **published** notes of their class via
  `portal_sees_class(class)`.
- Files: private bucket `lesson-notes` (20 MB; PDF, Word, PowerPoint, Excel, RTF, text, pictures), policies through
  `lesson_note_file_allowed(path, write)`. Open with `noteFileLinks()` (10-minute open and download links, made with
  the user's own client so the bucket's rules decide).
- Code: `src/lib/lesson-notes.ts` (types, `noteWeeks()` week labels from the term dates via `termWeeks`, `fileKind`,
  `isNewNote` = published in the last 7 days, errors). Upload button: `AssignmentFilePicker` with `bucket`, `accept`,
  `maxBytes`, `camera={false}`.
- Pages: staff `src/app/admin/academics/lesson-notes/page.tsx` (class + term + subject, status chips, by week, latest
  first; "New lesson note" creates a draft) and `[id]/page.tsx` (edit, attach/replace file, Save draft, Save and
  publish, Take back to draft, Delete). Portal `src/app/portal/lesson-notes/page.tsx` (term chips, subject chips, topic
  search, week select that submits on change via `AutoSubmitSelect`) and `[id]/page.tsx` (Open / Download, typed notes).
  Viewer (pupil or parent's chosen child): `loadAssignmentsViewer` from `portal/assignments/_load.ts`.
- Menus: Academics → Lesson notes (`AdminShell`); portal "Lesson notes" for pupils and parents (`PortalShell`, not a tab).
  Help: Learn Centre `LEARN.lessonNotes`, portal `HELP.lessonNotes`.

## Rules
- Files go from the browser straight to the bucket (never through a server action: Vercel caps bodies at ~4.5 MB).
  A note row must exist first, because the folder is the note's id: "New lesson note" saves a draft, then the file is
  added on the note's page.
- Status changes use one server action per button (`publishNote`, `draftNote` wrap `saveNote`), not button name/value.
- Replacing or removing a file deletes the old one from storage after the row is saved; deleting a note deletes its file.
- No public URLs. Parents and pupils only ever get signed links.

## Pitfalls we hit
- A filter row in a `CardHeader` `action` squeezed the title into a one-word column on phones: put chips on their
  own row under the header.
- On phones the portal filters pushed the notes off the first screen: subjects became chips and the box shrank to a
  topic search and a week select.

## Verify
- `node .claude/skills/lesson-notes/pglite-test.mjs docs/migrations/20261107_lesson_notes.sql` from a scratchpad folder
  with `@electric-sql/pglite@0.2.17` installed (35 checks: subject teacher, class teacher, other teacher, admin,
  nurse, parent, pupil of another class, drafts, files, paths).
- tsc, lint, build; preview with a fake client (role cookie) at desktop and 375px for both admin and portal pages.
