# Greenfield School

School website, staff dashboard (`/admin`), parent/student portal (`/portal`) and CBT exam conductor
(`/conductor`) for Greenfield School, Lekki, Lagos. Live at greenfieldschool.ng.

## Skills — read this first

Every request goes through a skill.

1. **Before starting**, check the table below (and `.claude/skills/`). If a skill matches the request, open its
   `SKILL.md` and follow it.
2. **If no skill matches**, do the work, then **create a new skill** for that kind of request in
   `.claude/skills/<kebab-case-name>/SKILL.md` (template in [`.claude/skills/README.md`](.claude/skills/README.md))
   and add a row to the table. Capture what a future session needs: where the code lives, the steps, the rules
   and the mistakes we hit.
3. **If a skill was wrong or incomplete**, update it in the same change.

| Skill | Use it when |
|---|---|
| [resolve-issue-doc](.claude/skills/resolve-issue-doc/SKILL.md) | The user attaches an `issues/*.docx` / `.pdf` with screenshots of problems to fix |
| [admin-portal-page](.claude/skills/admin-portal-page/SKILL.md) | Building or changing any page, form or server action in `/admin` or `/portal` |
| [pupil-records](.claude/skills/pupil-records/SKILL.md) | Deactivating, reactivating or deleting pupil records (duplicates, test records, leavers), the reason list and the deactivation log |
| [role-management](.claude/skills/role-management/SKILL.md) | Who can give or change account roles, the role change log, role options on `/admin/users`, the roles guide |
| [supabase-migration](.claude/skills/supabase-migration/SKILL.md) | Any database change: tables, RLS policies, functions, triggers, views |
| [results-and-reports](.claude/skills/results-and-reports/SKILL.md) | Result sheets, welfare scores, report cards, locks, corrections, results history |
| [finance-payments](.claude/skills/finance-payments/SKILL.md) | Fees, invoices, payments, debtors, payment IDs, bank statements or bank email alerts |
| [messaging](.claude/skills/messaging/SKILL.md) | Teacher–parent / parent–parent messages, class spaces, moderation |
| [assignments](.claude/skills/assignments/SKILL.md) | Assignments and classwork: setting, handing in (photos/files), marking, sending marks to the result sheet |
| [lesson-notes](.claude/skills/lesson-notes/SKILL.md) | Lesson notes: teachers preparing, publishing and replacing notes by class/subject/term/week/topic; pupils and parents reading and downloading them |
| [online-classes](.claude/skills/online-classes/SKILL.md) | Online video classes: scheduling Zoom/Meet/Teams lessons, cancelling, pupils joining from the portal, online attendance |
| [star-videos](.claude/skills/star-videos/SKILL.md) | Star of the week videos: major subjects per class, teachers posting weekly video links, families watching on the portal, the KPI in the management pack |
| [notifications](.claude/skills/notifications/SKILL.md) | Portal notifications (the bell) and phone push notifications: what sends them, who gets them, the service worker, adding one for a new event |
| [email](.claude/skills/email/SKILL.md) | Emails through the school Gmail: connection, queue and daily limit, notification/message/announcement emails, school announcements, unsubscribe |
| [brand-logo](.claude/skills/brand-logo/SKILL.md) | The school crest/logo, its words and colours, the browser and home-screen icons, where the crest appears |
| [inventory](.claude/skills/inventory/SKILL.md) | The school inventory / asset register (`/admin/inventory`): sections, usual items, locations, counts by condition, pictures, history, report |
| [management-pack](.claude/skills/management-pack/SKILL.md) | The weekly/monthly management information pack for leadership (`/admin/management-pack`): figures, comparisons, notes, saved history and the nightly save, printing |
| [ui-ux-design](.claude/skills/ui-ux-design/SKILL.md) | Designing or reworking any screen, form, grid or flow, animation or three.js scene; "make the UI/UX as good as possible" (use with the area's skill) |
| [deploy](.claude/skills/deploy/SKILL.md) | Committing, pushing and checking the Vercel deployment |

## Stack

- Next.js 14 App Router (server components + server actions), React 18, TypeScript, Tailwind 3, `lucide-react`.
- Supabase (Postgres + Auth + RLS) via `@supabase/ssr`. No ORM; queries use the Supabase client.
- Hosted on Vercel, deployed from `main` on GitHub (`greenfieldschool/greenfield`).
- No test runner in the repo. Verify with `npx tsc --noEmit -p .`, `npx next lint --dir src`, `npx next build`,
  plus the scratchpad techniques in the skills (PGlite for SQL, a fake Supabase client for UI previews).

```bash
npm run dev            # http://localhost:3000 (needs .env.local with Supabase keys)
npx tsc --noEmit -p .
npx next lint --dir src
npx next build
```

There is usually **no `.env.local`** in this checkout, so pages that need Supabase render nothing locally. Don't
assume you can click through the real app; see the preview techniques in the skills.

## Layout

- `src/app/admin/**` staff dashboard. `AdminShell.tsx` = sidebar nav (`NAV`, `adminOnly`, `SEGMENT_LABELS` for breadcrumbs).
- `src/app/portal/**` parents and students. `PortalShell.tsx` = nav (`parentNav`, `studentNav`, `tab: true` = bottom tab bar).
- `src/lib/**` shared logic: `teacher-access.ts`, `results.ts`, `term-report.ts`, `welfare.ts`, `chat.ts`, `fetch-all.ts`, `lagos-dates.ts`.
- `src/components/ui/**` design system: `PageHeader`, `Card`/`CardHeader`/`CardBody`, `Badge`, `Alert`, `EmptyState`,
  `StatCard`, `LinkTabs`, `buttonClasses`/`ButtonLink`, `FormSection`/`Field`. CSS helpers: `gf-input`, `gf-select`,
  `gf-label`, `gf-hint`, `gf-link`, `gf-table`, `gf-table-wrap`.
- `docs/migrations/*.sql` every database change, run by hand in the Supabase SQL editor. `docs/schema.sql` is the
  full schema; append each new migration to it.
- `src/app/admin/learn/page.tsx` the in-app Learn Centre for staff; `src/app/portal/help/page.tsx` help for parents and
  pupils. Update them when a workflow changes, and link pages to them (`learn=` / `help=`, see the ui-ux-design skill).
- `issues/` documents from the school describing problems. Don't commit them.

## Roles and access

- `profiles.role`: `super_admin`, `admin`, `teacher`, `front_desk`, `nurse`, `parent`, `student`.
- Parents are linked through `guardian_user_links` (user → guardian) and `student_guardians` (guardian → pupils).
- Teachers: class teacher (`teacher_class_assignments`) or subject teacher (`teacher_subject_assignments`). Use
  `getTeacherAccess()` / `canTeach()` in pages; the database enforces the same rules with `teacher_teaches()`,
  `teacher_has_class()`.
- `src/middleware.ts` + `src/lib/route-access.ts` send signed-out visitors to the right login page, keep staff out of
  the portal and non-admins out of `adminOnlyPrefixes`. The middleware must stay in `src/` (a root-level one is
  ignored when using a src directory). Keep `adminOnlyPrefixes` in step with
  `adminOnly` in `AdminShell` **and** with RLS. RLS is the real guard; the UI only hides things.

## Hard-won rules

- **Inline server actions must not capture functions or array methods** from the page body (e.g. `termRows.find`,
  a helper declared inside the component). It compiles, then crashes at runtime ("server-side exception"). Put
  actions at module level and pass context through hidden inputs.
- In plpgsql, `if not public.is_admin()` passes when `is_admin()` returns NULL. Always write
  `coalesce(public.is_admin(), false)` and make permission functions return a definite boolean.
- An upsert (`insert … on conflict do update`) fires the BEFORE INSERT trigger first, then becomes an update.
  Triggers that log changes must skip the insert path when the row already exists.
- Supabase returns at most 1000 rows per request: use `fetchAllRows()` for reports.
- Dates and times are Lagos time (UTC+1): use `lagos-dates.ts` / `timeZone: "Africa/Lagos"`.
- Both the admin and portal layouts wrap pages in `ToastProvider`; `UrlToast` reads `?toast=…&toast_type=…`.
- Results are locked when submitted as final or published, and every change is written to `result_audit_log`.
  Never add a code path that bypasses the locks or the log (see the results-and-reports skill).
- Write user-facing text in plain language for school staff and parents, not developer terms.
