---
name: results-and-reports
description: Use for anything about academic results, result sheet columns, welfare scores, report cards, publishing, final/locked scores, correction requests or the results history.
---

# Results, welfare and report cards

## How it fits together
- **Result sheet** (`/admin/academics/results`): one sheet per class + subject + term. Columns are
  `academic_assessments` with `on_result_sheet = true` (`title`, `max_score`, `position`, `component_group`
  ca/exam/other). Subject score = sum of scores / sum of column maxima × 100 (`subjectPercent` in `src/lib/results.ts`).
- **Default columns**: `result_layouts` (class+subject → class → level → school → built-in). Admins edit level/school
  layouts on `/admin/academics/config`; teachers can save one for their class+subject from the sheet.
- **Welfare** (`/admin/welfare/scores`, criteria at `/admin/welfare/criteria`): `welfare_criteria` per level, total
  100. Sources: `rating` (class teacher rates 1–5 in `welfare_ratings`), `attendance`, `punctuality`, `uniform`,
  `conduct` (discipline severity × penalty from `welfare_scoring_rules`). Health incidents never count. A
  record-based criterion with no records is left out and the rest scaled. Logic: `src/lib/welfare.ts`.
- **Report cards** (`/admin/academics/reports`, `/comments`, `/print`; portal `/portal/academics`): all built by
  `buildClassReport()` in `src/lib/term-report.ts` so every view agrees. Term total = (academic average + welfare) / 2,
  only when both exist. Positions rank on term total (ties share). Comments in `report_card_comments`
  (head comment admin-only, enforced by trigger). Printable component: `src/components/report-card.tsx`.
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
- Keep the PGlite tests for locks/corrections passing when touching these triggers (see supabase-migration skill).
- Report-card numbers must come from `buildClassReport`; don't recompute elsewhere.

## Pitfalls we hit
- Upserts logged phantom "score entered" entries; the guard skips the insert path when the row exists.
- A pupil with no scores ranked first on welfare alone; term total now needs both halves.
- Attendance/uniform/discipline rows are sometimes saved without a term id; `termFilter()` also matches by the term's dates.
