---
name: verify-changes
description: Use before saying any change is done: which checks prove it works here (typecheck, lint, build, PGlite tests, previews without a database, screenshots at phone size) and how to report what was and wasn't checked. Applies the review of a QA lead with 30+ years of experience.
---

# Verify changes

## When to use
At the end of every piece of work, with the area's skill (which names its own tests). There is no test runner in
the repo and usually no `.env.local`, so "it builds" is not "it works".

## The ladder (climb as far as the change needs)
1. **Types, lint, build** (always):
   ```bash
   npx tsc --noEmit -p . && npx next lint --dir src && npx next build
   ```
   Pages that need Supabase build as static locally; that's expected.
2. **Database changes: PGlite.** Harness and whole-schema loader in `.claude/skills/supabase-migration/`
   (`pglite-harness.mjs`, `pglite-full-schema.mjs`). Area tests: `admission-and-accounts`, `email`, `finance-payments` (corrections, payment plans), `lesson-notes`,
   `notifications` (+ push), `online-classes`, `pupil-class-history`, `pupil-records`, `results-and-reports`,
   `role-management`, `star-videos`, `management-pack`, `welfare-discipline`. Run the area's test and add cases for the change: allowed,
   refused, each role, run the migration twice.
3. **Pure logic** (parsers, matchers, money, dates): a scratchpad script importing the module, run with `npx tsx`
   or `node --experimental-transform-types`.
4. **Screens: preview without a database.** Copy the app into a scratchpad (or a git-ignored folder in the repo for
   pages that read the database directly), replace `src/lib/supabase/server.ts` with a fake client returning sample
   rows per role, run `npx next dev -p 39xx`, and look with the built-in browser at desktop and 375px
   (admin-portal-page skill has the details). Also `src/app/design-preview/` for designs with sample data.
5. **Live (read only):** after a deploy, open the sign-in page and the changed page.

## Rules
- Run the checks yourself; never ask the user to check something you could check.
- Test the unhappy paths: refused permission, empty list, missing migration, slow or failed outside service,
  double submit, 375px, a long name, a pupil with no class.
- Report plainly: what you ran and its result, what you could not check and why, and what the user must do
  (run a migration, set an env var, configure a provider). Never say "verified" for something you only built.
- Stop and clean up: stop preview servers, reset the browser viewport, delete scratch copies inside the repo.

## Expert review
Before calling the work done, answer these as a QA lead with 30+ years would.
- **What would a real user do first,** and did you do it?
- **What breaks if the data is old, odd or large** (three years of records, 1,500 pupils, a name with an
  apostrophe, an amount with kobo)?
- **What happens when two people do it at once, or someone presses it twice?**
- **Which promise in the user's request is not yet proven?** Say so in the report.
- **Could this change break something else** that reads the same table or component? Check one of them.
