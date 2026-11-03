---
name: results-and-reports
description: Use for anything about academic results, result sheet columns, welfare scores, report cards, publishing, final/locked scores, correction requests or the results history.
---

# Results, welfare and report cards

## How it fits together
- **Result sheet** (`/admin/academics/results`): one sheet per class + subject + term. Columns are
  `academic_assessments` with `on_result_sheet = true` (`title`, `max_score`, `position`, `component_group`
  ca/exam/other). Subject score = sum of scores / sum of column maxima × 100 (`subjectPercent` in `src/lib/results.ts`).
- **Result management** menu (issue 8): Class result sheet (bulk entry/edit, Excel paste via `bulkUpload`, CSV
  download at `/admin/academics/results/template`), Single pupil results (`/admin/academics/results/pupil`), Report
  cards, Correction requests, Results history, Grading & layouts. Sheets open straight onto their columns through
  `ensure_result_sheet()` (20261026); no set-up step. The sheet shows a class summary, column averages and a per-pupil
  stacked bar coloured by column kind (`groupColors` in `src/lib/results.ts`, validated with the dataviz skill).
- **Grades** come from `grading_scales` (with `remark`, e.g. A Excellent); school default 80/70/60/50 bands. Show the
  remark with `gradeRemark()`.
- **Default columns**: `result_layouts` (class+subject → class → level → school → built-in). Admins edit level/school
  layouts on `/admin/academics/config`; teachers can save one for their class+subject from the sheet.
- **Welfare is weekly** (20261102; `/admin/welfare/scores`, criteria at `/admin/welfare/criteria`): `welfare_criteria`
  per level, total 100 (school's marks: Attendance 15, Punctuality 10, Uniform 10, Conduct 15, Politeness 10,
  Honesty 5, Cooperation 5, Attentiveness 5, Leadership 5, Participation 20). Sources: `rating` (class teacher rates
  1–5 in `welfare_ratings`, one row per pupil + criterion + `week_start` Monday), `attendance`, `punctuality`,
  `uniform`, `conduct` (discipline severity × penalty from `welfare_scoring_rules`), each worked out from that week's
  records. Each week is out of 100; a week counts once the pupil is rated that week; term welfare = average of the
  counted weeks (`scoreWelfareWeekly`). A record-based criterion with no records that week is left out and the rest
  scaled. Health incidents never count. Ratings with `week_start` null are old whole-term ratings: a term with only
  those uses `scoreWelfareTerm` (`report.welfareMode === "term"`) until its first weekly save.
  `StudentReport.weeklyWelfare` is always the week-by-week result (the score sheet uses it); `welfare` is what counts.
- **Record-based criteria are filled at the source, never typed on the score sheet** (the school's choice: a typed
  override was built and dropped). The score sheet's "This week's records" box and the "Fill in →" column links open
  the attendance register, uniform check sheet and discipline form on the class and day with `?back=<score sheet
  url>` (`scoreSheetBack()` in `welfare/_ui.tsx` only allows the score sheet; `BackToScoreSheet` shows the way back).
  Attendance and uniform are whole-class sheets saved once (everyone starts Present / Neat; `orig:` fields skip
  unchanged pupils); discipline records take a "when it happened" date so they land in the right week.
- **Compulsory weeks** (20261104; admin-only `/admin/welfare/weeks`): `welfare_compulsory_weeks` (term + Monday),
  changed only through `set_welfare_compulsory_weeks(term, weeks[])` (admin check, replaces the list). `TermWeek.compulsory`;
  `ClassReport.compulsoryMissing` lists compulsory weeks where some pupils' week doesn't count yet (weekly mode, rated
  criteria only) and `completeness.ready` needs it empty. Publishing is **refused** (not "publish anyway") on both the
  Report cards page and Result publications while it has anything in it. No weeks chosen = nothing compulsory.
  Score sheet UI: `week-strip.tsx` (weeks with status) + `weekly-grid.tsx` (client grid: live totals, copy last week,
  fill empty, unsaved warning) + Term summary tab. Logic: `src/lib/welfare.ts`.
- **Report cards** (`/admin/academics/reports`, `/comments`, `/print`; portal `/portal/academics`): all built by
  `buildClassReport()` in `src/lib/term-report.ts` so every view agrees. Final score (`termTotal`) = (academic average + welfare) / 2,
  only when both exist. Call it "Final score" on screen. Positions rank on term total (ties share). Comments in `report_card_comments`
  (head comment admin-only, enforced by trigger). Printable component: `src/components/report-card.tsx`.
- **Report card layout** (`src/components/report-card.tsx`): the term result comes first (final score /100, grade +
  remark, position, and the sum "(academic + welfare) ÷ 2" with the academic grade and welfare award), then subjects,
  welfare (weekly scores, missed weeks shown as "–"), comments, and keys (final score rule, grading key, welfare
  award marks from `ClassReport.welfareAwards`). If either half is missing it says "Not ready yet" and why.
- **Certificates** (`src/lib/certificates.ts` `awardsFor`, `src/components/certificate.tsx`): 1st–3rd in class on the
  final score, best in each subject, welfare Gold/Silver/Bronze. Positions/subjects need ≥ 2 pupils with a score; ties
  say "joint". Admin page `/admin/academics/reports/certificates` (tabs by kind, who-gets-what list, print); portal
  `/portal/academics/certificates`. A4 landscape via `@page certificate` + `.gf-certificate` in `globals.css`; sizes
  are `cqw` so the design scales from phone to paper.
- **Signatures** (20261103, `src/lib/signatures.ts`): `staff_signatures` (one PNG data URL + printed name per staff
  member; RLS: staff read, only the owner writes) drawn on `/admin/profile#signature` with
  `src/components/signature-pad.tsx` (draw or upload; paper made transparent; cropped to the ink). `school_settings`
  (single row) holds `head_teacher_id` + `head_teacher_title`, set by admins on `/admin/settings`.
  `loadSignatureStatus(client, classId)`: first class teacher (`teacher_class_assignments`) with a signature + the
  head teacher. Portal reads it with the service key. No signature = blank line to sign by hand.
- **Fee hold** (`src/lib/fee-hold.ts`): the portal report card and certificates stay hidden while the pupil has
  unpaid invoices (any status but void; app invoices stay `draft`) for that term or earlier (read from `finance_invoice_balances` with the service key, so the
  other parent's invoices count). Parents get the amount and "Pay fees"; pupils are told to ask a parent. If fees
  can't be read, the report stays hidden ("unknown"). Admins see "Held from parents: fees owed" on Report cards.
  Staff printing is not held. Portal loading is shared in `src/app/portal/academics/_load.ts`.
- **Integrity** (migrations 20261023, 20261024):
  - A sheet is locked when submitted as final (`result_sheet_locks`, `submit_result_sheet`) or when the class+term
    is published. Locked = nobody can change scores or columns; triggers refuse it.
  - Admin unlock needs a reason (`unlock_result_sheet`); unpublish is admin-only with a reason (`unpublish_term_results`).
  - Teachers ask for changes with correction requests (`request_result_correction`; admin
    `decide_result_correction`). Approval applies the change; a stale request (score changed since) is refused.
  - `result_audit_log` is written only by triggers. Admins read all; teachers read their classes/subjects.
    Page: `/admin/academics/audit` ("Results history"). Corrections page: `/admin/academics/corrections`.
- Portal report cards use the service client (class averages/positions need the whole class) after checking the
  parent is linked to the child and the term is published.

## Rules
- Never write scores, ratings or columns around the locks, and never write to `result_audit_log` from the app.
  Trusted bypasses use `set_config('app.result_lock_bypass', 'merge' | 'correction', true)` inside definer functions only.
- Save only changed cells (`orig:` hidden inputs) on every grid.
- Never ignore a read error on columns or scores: a blank grid looks like "no scores entered" and invites re-entry.
  Show an `Alert` instead, and pass every database error through `resultsErrorMessage()` (`src/lib/results.ts`).
- The result sheet's states, in order: no sheet chosen → couldn't load (error) → no columns and user can't teach it →
  no columns but locked/published (admin gets the unlock form there) → no columns (set-up form, with the reason if
  `ensure_result_sheet` failed) → the sheet.
- Keep the PGlite tests for locks/corrections passing when touching these triggers (see supabase-migration skill).
- Report-card numbers must come from `buildClassReport`; don't recompute elsewhere.

## Pitfalls we hit
- "infinite recursion detected in policy for relation academic_assessments": the parent policy on columns read
  scores while the teacher policy on scores read columns. Fixed in 20261028 with definer helpers
  (`can_manage_results`, `can_manage_assessment`, `portal_can_see_assessment`). The page swallowed the error, so
  "Open sheet" looked like it did nothing and "Create sheet" showed the raw message.
- Upserts logged phantom "score entered" entries; the guard skips the insert path when the row exists.
- A pupil with no scores ranked first on welfare alone; term total now needs both halves.
- Attendance/uniform/discipline rows are sometimes saved without a term id; `termFilter()` also matches by the term's dates.
- Weeks are Lagos dates: `lagosDay()` for timestamps (`occurred_at`), `mondayOf()` for the week. Month names are
  spelled by hand (`en-GB` gives "Sept" on some servers).
- Before 20261102 is run there is no `week_start` column: `buildClassReport` probes for it (`weeklyReady`) and falls
  back to whole-term ratings instead of silently showing none.
