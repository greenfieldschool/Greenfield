---
name: online-classes
description: Use for online video classes: teachers scheduling, rescheduling or cancelling Zoom/Meet/Teams lessons for a class, pupils and parents joining from the portal, and online-class attendance.
---

# Online classes

## When to use
Anything about virtual lessons (issue 10, "Online video class management"). Lesson notes and assignments have their
own skills; a class can link to one published lesson note.

## Where things live
- SQL: `docs/migrations/20261108_online_classes.sql`. `online_classes` (class, subject or null = General, term,
  `topic`, `description` "what to prepare", `starts_at`, `duration_minutes`, `platform` zoom|meet|teams|other,
  `meeting_url` https only (check constraint), `meeting_code`, `lesson_note_id`, `status` scheduled|cancelled,
  `cancel_reason`, `author_name`). `online_class_attendance` (class + pupil: `joined_at`, `status`
  present|late|absent).
- Access: staff via `can_manage_results(class, subject)`; parents/pupils read classes via `portal_sees_class`, their
  own attendance via `portal_sees_student`. They write attendance **only** through `join_online_class(class, pupil)`
  (pupil or their parent; right class; not cancelled; open from 15 minutes before the start to the end; keeps the
  first join time; returns the link).
- Code: `src/lib/online-classes.ts` (`classState` live/soon/upcoming/ended/cancelled, `whenLabel` in Lagos time,
  `platformFromUrl`, `cleanMeetingUrl`, errors). Dates use `lagosDueAt` / `lagosDateTimeParts` from `lib/assignments.ts`.
- Pages: staff `src/app/admin/academics/online-classes/page.tsx` (now / coming up by day / held; schedule form) and
  `[id]/page.tsx` (attendance pre-filled from joins, details/reschedule, cancel with reason, it's on again, delete).
  Portal `src/app/portal/online-classes/page.tsx` (live card with Join, coming up, earlier with attendance) and
  `[id]/page.tsx`; `actions.ts` `joinOnlineClass` calls the function then redirects to the meeting.
- Menus: Academics → Online classes; portal "Online classes" (pupils and parents). Help: `LEARN.onlineClasses`,
  `HELP.onlineClasses`.

## Rules
- Pupils join through our Join button only (it's what records attendance); never show the raw link as the main action.
- Meeting links must stay https (database check + `cleanMeetingUrl`) so a link can't run script in the portal.
- Attendance saves only changed rows (`orig:`); after the class, joined = Present and not joined = Absent are
  suggestions that the teacher confirms by saving.
- A cancelled class stays visible (crossed out, with the reason) so families aren't left wondering.

## Pitfalls we hit
- On phones the status badge on the right squeezed long topics into three lines: it sits under the text below `sm`.

## Verify
- `node .claude/skills/online-classes/pglite-test.mjs docs/migrations/20261108_online_classes.sql` from a scratchpad
  folder with `@electric-sql/pglite@0.2.17` (27 checks).
- tsc, lint, build; preview with the fake client (role cookie) for teacher, parent and pupil at 375px; tap Join and
  check it lands on the meeting.
