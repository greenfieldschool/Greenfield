---
name: management-pack
description: Use for the management information (MI) pack in /admin/management-pack: the weekly and monthly figures for leadership, their comparisons with the period before, the "Worth a look" notes, saved packs and the history page, the nightly save job, adding or changing a figure or section, and printing it.
---

# Management information pack (weekly and monthly)

## When to use
Anything about the leadership pack: a new figure or section, a change to how a figure is counted, the period
picker, comparisons, the automatic notes, printing. A figure that reads a new table also needs that area's skill
(finance-payments for money, results-and-reports for results …). Screen work also follows `ui-ux-design`.

## Where things live
- Page: `src/app/admin/management-pack/page.tsx` (admin and super_admin only; others go to `/admin/unauthorized`).
  It is in `adminOnlyPrefixes` (`src/lib/route-access.ts`), in `NAV` under Overview with `adminOnly`, and has a
  `SEGMENT_LABELS` entry (`"management-pack"`). Don't put it under `/admin/reports`: that segment is labelled
  "Report cards" in the breadcrumbs.
- Screen: `src/app/admin/management-pack/mi-pack-view.tsx` (`MiPackView`, pure presentation, no data access).
- Loader: `src/lib/mi-pack.ts` (`loadMiPack(supabase, service, period)` → `MiPack` = `headline`, `notes`, `sections`).
  Each section is `{ metrics, snapshots, tables, unavailable, link }`; the screen renders sections generically, so
  a new figure is usually only a change in the loader.
- Periods: `src/lib/mi-periods.ts` (`resolvePeriod`, `recentPeriods`, `lagosToday`, `weekdaysBetween`). Weeks are
  Monday–Sunday, months are calendar months, all in Lagos time. URL: `?view=week|month&period=<Monday date | YYYY-MM>`.
- Preview: `src/app/design-preview/management-pack/page.tsx` runs the **real loader** against a fake client with
  seeded sample rows (dev only; the design-preview layout 404s in production). Add sample rows there for any new table.
- History: table `mi_pack_snapshots` (`docs/migrations/20261111_management_pack_history.sql`): one saved copy per
  `(view, period_key)`, the whole `MiPack` in `data` (with `version`, see `MI_PACK_VERSION`), `source automatic|manual`,
  `saved_by_name`, `saved_at`. RLS: admins select only; insert/update/delete revoked from everyone signed in. Only
  the nightly job writes, with the service key.
  Code: `src/lib/mi-history.ts` (`getSavedPack`, `listSavedPacks`, `saveMiPack`, `saveFinishedPacks`, `canSave`).
- Banner states under the picker: `src/app/admin/management-pack/pack-banner.tsx` (`no-table` | `saved` |
  `live-saved` | `unsaved` | `running`), text and links only. A finished period with a saved copy opens on the
  copy; `&live=1` shows today's recalculation (viewing only).
- History page: `src/app/admin/management-pack/history/` (`HistoryView`): key figures per saved period, picked by
  metric/snapshot `id` (`attendance`, `collected`, `spent`, `enquiries`, `incidents`, `handedIn`, `onRoll`, `owed`,
  `overdue`, `unresolved`). Finished periods between the newest and the oldest saved copy that were never saved show
  as "Not saved yet" rows (no button: the nightly job fills them).
- Nightly job: `src/app/api/management-pack/save/route.ts` (Vercel Cron `30 23 * * *` UTC = 00:30 Lagos in
  `vercel.json`, `Authorization: Bearer CRON_SECRET`, service key). `saveFinishedPacks`: the week and month that just
  finished first, then gaps in the last 8 weeks and 3 months, at most 4 saves a night; never overwrites.
- Help: Learn Centre guide `LEARN.managementPack` ("Management Pack (weekly and monthly)").

## Rules
- **Online only (decided 11 Nov 2026):** leadership asked for the pack to be viewed in `/admin/management-pack`, not
  emailed. Don't add an email of the pack unless they ask again.
- **Compare like with like.** While a week or month is still running, the previous period is cut to the same
  number of days (`resolvePeriod` does this). Never compare a part week with a full week.
- Every `MiMetric` has `better: "up" | "down" | "none"`; it decides the colour of the change (green good, red needs
  a look, grey neither). The change chip always carries an arrow and words (`sr-only`), never colour alone.
- Percentages change in points ("+1.2 pts"), counts and money in amount plus percent.
- Figures with no history (pupils on roll, fees owed, unresolved incidents, waiting applications) are `snapshots`
  ("As of today"), with no comparison. Don't fake a comparison from `updated_at`.
- One query per figure covering both periods (`previous.start` to `end`), bucketed in code with `bucketOf`; or
  `countPair` (two head-only counts) when only a total is needed. Anything that can pass 1000 rows goes through
  `fetchAllRows` (attendance uses `maxRows` 200000).
- Money follows the finance skill: payments are `direction = inflow` and `status = posted`; invoices are read from
  `finance_invoice_balances` with `.neq("status", "void")` (never by stored status); "owed" is the balance.
- Attendance = (present + late) ÷ marked. "Registers taken" = class-days with any register ÷ (active classes ×
  weekdays); holidays lower it, and the text says so.
- Serious incident = `welfare_incidents.severity >= 4` (same as the incidents page).
- Staff section: staff = `profiles.role` in super_admin/admin/teacher/front_desk/nurse (admins read all profiles
  through RLS). Work is credited to whoever recorded it: `student_attendance.recorded_by` (distinct class-days),
  `assignments.created_by`, `assignment_submissions.marked_by`, `lesson_notes.created_by` (published),
  `online_classes.created_by` (held). "Assigned" = an active `teacher_class_assignments` or
  `teacher_subject_assignments` row. The "recorded no work" note waits until 3 school days have passed, so Monday
  doesn't name every teacher. There are no staff attendance, leave or HR tables: say so rather than inventing figures.
- Heads' actions (section `heads`): heads = `admin` + `super_admin` profiles (there is no separate head role). Every
  figure is a count of records whose "who" column is a head, in the period: incidents/discipline `reported_by`,
  `exam_attempts.unlocked_by`, `star_videos.created_by`, `report_card_comments.updated_by` (with a head comment),
  `result_publications.published_by`, `result_correction_requests.decided_by` (+ average hours from `requested_at`),
  `result_audit_log` `sheet_unlocked` `actor_id`, teacher assignments `assigned_by`, `chat_reports.resolved_by`,
  `chat_messages.sender_id` (service key, counts only), `announcements.created_by`, payments `received_by`, expenses
  and invoices `created_by`. History column `headActions`. Never add free-text head reports: leadership asked for
  reports built from actions, not typed text (11 Nov 2026).
- **Who-did-it columns must be filled**: `docs/migrations/20261113_record_who_did_what.sql` adds `assigned_by` to
  teacher assignments, `default auth.uid()` on incidents, discipline, payments, expenses and invoices, and a trigger
  stamping `student_attendance.recorded_by` (on a new or changed mark). Before it, registers had no recorder, so the
  Staff table's "Registers" column was always 0. A new figure that credits a person must check its column is really
  set (by the code, a default or a trigger); test: `who-did-what-pglite-test.mjs` in this folder.
- `MiTable.wide` makes a many-column table span the card; first-column cells don't wrap (names stay on one line).
- Table cells are `MiCell` = text or `{ text, href }` (a link; external ones open in a new tab). Columns whose cells
  are all numbers/money/percent are right-aligned automatically; text columns stay left.
- Star of the week videos (section `stars`, headline tile, history `starVideosRate`, staff "Star videos" column) are
  documented in the star-videos skill. Expected = active classes' major subjects × Mondays in the period.
- RLS: the page is admin-only and admins can read these tables. Two totals admins can't read through RLS
  (`chat_messages` outside their own conversations, `email_outbox`) are **counted** with the service key; never
  read message or email content in the pack.
- A section whose main read fails shows `unavailable` text, not zeros (a zero would look like "nothing happened").
- "Worth a look" notes are built at the end of `loadMiPack`; keep them short, plain and actionable, and always end
  with a success note when nothing stands out.

- **The pack is read only (decided 11 Nov 2026).** Leadership wants it fed only by day-to-day work (heads, teachers
  and the office recording registers, payments, incidents, marking, star videos …). No forms, buttons that write, or
  manual saving/replacing on the pack or history pages; a wrong figure is fixed where the record was entered.
- **Saved copies are the record.** Show the saved copy by default for finished periods; recalculating is view-only. "As of" figures in a saved copy are dated with
  `saved_at` (`asOf` prop), never "today".
- Renaming a metric's label is fine; never change or reuse an `id`: the history page finds figures in old saved
  copies by `id`. A change to `MiPack`'s shape that old copies can't be rendered with must bump `MI_PACK_VERSION`
  and handle the old version.

## Steps (adding a figure)
1. Add the query to the `Promise.all` in `loadMiPack` (cover both periods), then a `m(label, pair, format, better, hint, id)`
   in the right section. Labels in plain words a head teacher would use. Give it an `id` (and a `COLUMNS` entry in
   `history-view.tsx`) if it belongs in the history table. Old saved copies won't have it: they show "—".
2. If it deserves a headline tile or a note, add it there too.
3. Add sample rows for the table in the design preview's `sampleTables`, and add any new filter (e.g. `in`, `or`) to
   `fakeClient`.
4. Update the Learn Centre guide if the meaning of a section changes.

## Pitfalls we hit
- Month names: format by hand (`mi-periods.ts`); `en-GB` gives "Sept" on some servers.
- Two tables side by side were cramped at laptop width: section tables go two-up only from `xl` (and in print).
- Picker labels truncate on phones: put the distinguishing part first ("9 Nov – 15 Nov 2026 (this week)").
- `next build` and `next dev` share `.next`: stop the preview server before building.
- A saved copy carries its old `period` object; the page replaces it with a freshly resolved one (`{ ...saved.pack, period }`)
  so the prev/next links and labels are right today.

## Verify
```bash
npx tsc --noEmit -p . && npx next lint --dir src && npx next build
```
SQL: PGlite test of `mi_pack_snapshots` (service key saves; admin reads but can't save, change or delete; teacher,
parent and signed-out see nothing and can't write). Then `preview_start` (`greenfield-dev`), open
`/design-preview/management-pack` (also `?view=month`, a saved past `&period=`, `&live=1`, and the unsaved week the
sample leaves out) and `/design-preview/management-pack/history`. The preview's `sample.ts` saves earlier periods with
the real loader; screenshot at desktop and at 375px (`resize_window` preset `mobile`), and check
`document.documentElement.scrollWidth === innerWidth`. Reset the viewport and stop the server after.
