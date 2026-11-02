---
name: ui-ux-design
description: Use whenever a screen, form, grid, report or flow is designed or reworked, or the user asks for the best possible UI/UX. Applies a senior (20+ years) product-design review to the work before it is called done.
---

# UI/UX design (senior review)

Use this together with the skill for the area (admin-portal-page, results-and-reports, finance-payments …). That
skill says where the code goes; this one says how the screen should work for the people using it.

## Who we design for
- **Class teachers**: many pupils, little time, often on a laptop between lessons, sometimes on a phone, on slow
  or patchy internet. They repeat the same task every week.
- **Admins / head**: need the whole picture (what's done, what's missing, what's locked) and the way to fix it.
- **Parents**: on phones, not technical, want "how is my child doing" and "what do I do next".
- Everyone reads plain English. No developer words (RLS, null, upsert, UUID, migration) on screen.

## The review: ask these before writing code
1. **What is the job?** The thing the person comes to do most often goes first, with one clear primary button.
   Everything else is secondary (outline buttons, links, tabs).
2. **What's the status at a glance?** Show progress in words and numbers ("18 of 30 pupils scored"), what is
   missing, and whether it's locked. Colour supports the words; it never carries the meaning alone.
3. **How can it be less work?** For anything repeated: sensible defaults (open on the current week/term), copy from
   last time, "fill the empty boxes" for a column, keyboard-friendly order (Tab moves along the row), save only
   what changed (`orig:` inputs).
4. **Can they lose work?** Count unsaved changes, warn before leaving the page with unsaved changes, keep the save
   button in a sticky bar, disable it while saving. Server actions redirect back with a toast.
5. **Can they make a mistake?** Prevent it rather than report it: selects or ranges instead of free text, limits
   on numbers, confirm anything destructive, explain a lock and say who can unlock it and how.
6. **Do the numbers explain themselves?** Put units ("/100", "/15") and the rule in plain words next to the number
   ("Final score = (academic + welfare) ÷ 2"). Use the same rounding everywhere (`round2`) and compute in one place
   (`buildClassReport`) so every screen agrees.
7. **What does each state look like?** Nothing chosen, loading/empty, no permission, missing set-up (with the link
   to set it up), database update not run yet, locked, done. Every empty state says the next step.
8. **Phone?** Check at 375px: no page-wide horizontal scroll; grids scroll inside their card with a sticky first
   column and sticky header; chip rows scroll sideways with the selected chip brought into view; tap targets ≥ 36px.
9. **Accessible?** Every input has a label or `aria-label` naming the pupil and the field; visible focus ring;
   status text, not just colour; `aria-current` on the selected tab/chip; contrast at least slate-500 on white.
10. **Same words, same parts.** Use the design system (`PageHeader`, `Card`, `StatCard`, `LinkTabs`, `Badge`,
    `Alert`, `EmptyState`, `SubmitButton`, `gf-*` classes) and the glossary below.

## Patterns already in the app (reuse them)
- **Score grid** (`/admin/welfare/scores` `weekly-grid.tsx`, result sheets): sticky header and first column, empty
  cells tinted gold ("still to do"), changed cells tinted blue ("not saved yet"), live row total, column "Fill empty"
  menu, "Copy last week", "Undo changes", sticky save bar with the unsaved count, `beforeunload` warning.
- **Period strip** (`week-strip.tsx`): chips for each week with a text status (All scored / 12 of 30 / Not scored),
  current week marked, future weeks not clickable, prev/next buttons, selected chip scrolled into view.
- **Picker → content**: `ClassTermPicker`, then tabs (`LinkTabs`) for the views of the same data.
- **Stats row**: 3–4 `StatCard`s answering "how far along are we?" above the work area.
- **Explain-the-maths footnote** under any table that shows a computed score.
- **Outcome first** (report card): the result a parent is looking for (final score, grade, position) sits at the top
  with the sum that makes it written out; details follow. A missing result says why ("Not ready yet: welfare not
  scored yet"), never a bare dash.
- **Held, not hidden** (portal fee hold): when something exists but is withheld, say it is ready, why it's held, the
  exact amount, the one action that releases it ("Pay fees"), and what to do if they already paid.
- **Printable documents** (certificates): size everything in `cqw` inside a `container-type: inline-size` wrapper so
  one design works on a phone and on paper; give each its own `@page` size.

## Glossary (use these words)
- **Welfare score**: out of 100, scored weekly; the term's welfare is the average of the weeks.
- **Academic average**: average of the subject scores.
- **Final score**: (academic average + welfare) ÷ 2. (Called `termTotal` in code.)
- **Published**: parents can see the report cards; results and welfare are locked.
- **Submitted as final**: a subject teacher has locked a result sheet.

## Pitfalls we hit
- A blank grid after a failed read looked like "nothing entered yet" and invited re-entry: show an `Alert`.
- Client-side `Link` navigation skips `beforeunload`; use plain `<a>` for links away from a grid with unsaved edits.
- Grid state kept the previous week's edits after switching weeks: give the grid a `key` per class/term/week.
- `toLocaleDateString("en-GB", { month: "short" })` gives "Sept" on some servers: format months by hand.

## Verify
- Preview with a fake Supabase client (see admin-portal-page skill) and take screenshots at desktop and 375px.
- Walk the states in step 7 and the keyboard path (Tab through a row, change a value, save).
