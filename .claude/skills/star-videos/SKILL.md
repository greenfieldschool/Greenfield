---
name: star-videos
description: Use for star of the week videos: the two major subjects per class, teachers posting a weekly video link of a pupil who did well, the suggestions from the week's marks, families watching on the portal, the notification, and the star video figures in the management pack.
---

# Star of the week videos

## When to use
Anything about the weekly "star" videos (a leadership KPI): choosing major subjects, posting or changing a video,
who can see it, the portal page, the notification, or how it's counted in the management pack. Also read
`admin-portal-page` for pages, `supabase-migration` for SQL, `notifications` for the bell, `management-pack` for the
KPI figures.

## Where things live
- SQL: `docs/migrations/20261112_star_videos.sql`.
  - `class_subjects.is_major` (max 2 per class: trigger `class_subjects_major_limit`). Set with
    `set_class_major_subjects(class, subjects[])` (admins only; clears first, then sets, so swapping never trips the limit).
  - `star_videos` (`class_id`, `subject_id`, `week_start` = Monday (check `isodow = 1`), `student_id`, `video_url`
    https only, `reason` ≤ 500, `author_name`, `created_by`), unique per class + subject + week.
  - RLS: staff by `can_manage_results(class, subject)` (admins; class teacher; that subject's teacher; non-teacher
    staff, like results); insert/update also need `star_video_valid()` (a major subject of the class, a pupil in the
    class). Portal: `portal_sees_student(student_id)`, so families only ever see their own child.
  - Trigger `star_videos_notify` → `notify_pupils([student], 'star_video', …, '/portal/star-videos', id)` on insert
    and when the pupil changes (not when only the link or reason changes). Email and phone push follow automatically.
- Code: `src/lib/star-videos.ts` (`cleanVideoUrl`, `videoHost` for "Watch on YouTube/Google Drive", `weekLabel`,
  `suggestStars` = best average score ÷ max on that class+subject's assignments marked in the week, `starVideoErrorMessage`).
- Pages: `src/app/admin/academics/star-videos/page.tsx` (week arrows, class list with "1 of 2 posted", one card per
  major subject: posted video, suggestions, form, remove); major subjects form on
  `src/app/admin/academics/class-subjects/page.tsx`; portal `src/app/portal/star-videos/page.tsx` (child pills,
  "Watch on …" buttons). Nav: admin Academics → Star videos (all staff); portal "Star videos" for parents and pupils
  (not a bottom tab). Notification icon `star_video` in `portal/notifications/page.tsx`.
- Management pack: section `stars` in `src/lib/mi-pack.ts` (videos posted; posted of expected = active classes' major
  subjects × Mondays in the period; week table with a link per video and "Not posted" rows; month table posted vs
  expected per class; "Worth a look" lists missing ones from the third school day; staff table "Star videos" column;
  history column `starVideosRate`; headline tile).
- Help: Learn Centre `LEARN.starVideos` (and a line in `LEARN.classSubjects` and `LEARN.managementPack`); portal
  `HELP.starVideos`.

## Rules
- The school stores the **link**, not the video (the user chose links: no storage costs or size limits). Say "set
  sharing so anyone with the link can view" wherever teachers paste one; otherwise parents can't open it.
- Only https links (database check + `cleanVideoUrl`); external links open with `target="_blank" rel="noopener noreferrer"`.
- A video is for one week (Monday). Teachers can post for this week or earlier weeks, never a future week.
- Suggestions are a hint; never pick the pupil automatically.
- While a week is still running, the management pack compares with last week's videos **posted by the same day**
  (`created_at`), not all of last week's.
- Families see only their own child's videos. Never add a class-wide list to the portal without asking (consent for
  filming children).

## Pitfalls we hit
- Embedded `subjects(id, name)` must keep `id`: the page matches majors to `canTeach` and videos by subject id.
  (The preview's sample rows once had only `name`, and every card said "can't post".)
- Teacher and portal pages read the database directly, so the design-preview trick doesn't reach them. To preview:
  copy the app into a temporary **git-ignored folder inside the repo** (the preview runner can't read the
  scratchpad), symlink `node_modules`, replace `src/lib/supabase/server.ts` with a fake client (cookie `fake_user` to
  switch teacher / admin / parent, `rpc("portal_identity")`, embeds for `classes(` / `subjects(`), drop
  `src/middleware.ts`, start it through `npm --prefix <folder> run dev` from `.claude/launch.json`. Delete the
  folder and the launch entry before running `tsc`/`build` (the root tsconfig includes every `.ts`).

## Verify
```bash
npx tsc --noEmit -p . && npx next lint --dir src && npx next build
```
- SQL: `node pglite-test.mjs <repo>/docs/migrations/20261112_star_videos.sql` (this folder; needs
  `@electric-sql/pglite@0.2.17`): majors limit and admin-only, teacher only for own subject, pupil must be in the
  class, Mondays only, https only, one per week, notifications on new pupil only, parents see only their child,
  other teachers see nothing.
- UI: management pack via `/design-preview/management-pack` (sample star videos in `sample.ts`); teacher, class
  subjects and portal pages via the temporary copy above, desktop and 375px.
