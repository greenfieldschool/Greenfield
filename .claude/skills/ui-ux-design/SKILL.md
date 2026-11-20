---
name: ui-ux-design
description: Use whenever a screen, form, grid, report, flow, animation, sound or three.js scene is designed or reworked, or the user asks for the best possible UI/UX. Applies the review of a practitioner with 30+ years in interaction design, information design, motion design and UI sound before the work is called done.
---

# UI/UX, motion and sound (senior practitioner review)

Use this with the skill for the area (admin-portal-page, results-and-reports, finance-payments …). That skill says
where the code goes; this one says how the screen should work for the people using it, and what a reviewer with
thirty years of shipping software, broadcast motion graphics and product sound would send back.

Companion files:
- [motion-and-3d.md](motion-and-3d.md): motion principles, timing and easing tokens, choreography, the motion kit,
  three.js.
- [sound.md](sound.md): when sound helps, loudness, frequency, fatigue, mute, mobile autoplay, the sound engine.

The user asked for more than they describe: anticipate the next need (the printout, the undo, the "what if two
people do it at once", the parent who forgets the password) and build it, then say what you added.

## Who we design for
- **Class teachers**: many pupils, little time, a laptop between lessons, sometimes a phone, slow or patchy internet.
  They repeat the same task every week, so seconds saved per row are hours per term.
- **Admins / head / bursar**: need the whole picture (what's done, what's missing, what's locked, who did it) and the
  way to fix it. They print, export and hand things to parents.
- **Front desk**: interrupted constantly; a parent is standing at the desk. Forms must survive being left half done.
- **Parents**: on phones, not technical, often in a second language, sometimes sharing one phone between children.
  They want "how is my child doing" and "what do I do next".
- **Pupils**: young, impatient, on a parent's phone or a lab computer; they type admission numbers in any case.
- Everyone reads plain English. No developer words (RLS, null, upsert, UUID, migration, hash, auth) on screen.

## 1. The review: ask these before writing code
1. **What is the job?** The thing the person comes to do most often goes first, with one clear primary button.
   Everything else is secondary (outline buttons, links, tabs). One primary button per view.
2. **What's the status at a glance?** Progress in words and numbers ("18 of 30 pupils scored"), what is missing,
   whether it's locked. Colour supports the words; it never carries the meaning alone.
3. **How can it be less work?** Defaults (current week/term), copy from last time, "fill the empty boxes", bulk
   actions on a filtered list, keyboard order along the row, save only what changed (`orig:` inputs).
4. **Can they lose work?** Count unsaved changes, warn before leaving, sticky save bar, disable while saving.
   Server actions redirect back with a toast.
5. **Can they make a mistake?** Prevent it rather than report it (section 3).
6. **Do the numbers explain themselves?** Units ("/100") and the rule in plain words next to the number. One place
   computes (`buildClassReport`), one rounding (`round2`).
7. **What does each state look like?** Nothing chosen, loading, empty, no permission, set-up missing (link to set it
   up), database update not run, locked, partly done, done, failed. Every empty state names the next step.
8. **Phone?** 375px, no page-wide sideways scroll (section 6).
9. **Accessible?** Section 5.
10. **Help where the work is.** `PageHeader learn={LEARN.x}` / `PortalPageHeader help={HELP.x}`; change the guide
    in the same commit as the workflow. Write help as the person would ask it, answer in two or three sentences, end
    with the one action.
11. **Same words, same parts.** Design system (`PageHeader`, `Card`, `StatCard`, `LinkTabs`, `Badge`, `Alert`,
    `EmptyState`, `SubmitButton`, `gf-*`) and the glossary below.
12. **Who did it, and when?** Anything that changes a record a parent or the school relies on is logged with the
    person and the time, and the screen shows it ("Reset by Mrs Ade, 14 Nov, 10:12").
13. **Does it move and sound right?** [motion-and-3d.md](motion-and-3d.md) and [sound.md](sound.md). Staff screens
    are silent.

## 2. Information design (lists, records, data-heavy admin screens)
- **Answer, then evidence.** The top of the page answers the question the person came with (stats row, outcome
  first); the table below is the evidence.
- **Tables**: left-align text, right-align numbers with tabular figures (`tabular-nums`), one unit per column in the
  header, not in every cell. Identifiers (admission numbers, payment IDs) in `font-mono`. Zebra striping only for
  wide tables with many columns; otherwise row hover + dividers.
- **Scanning**: the column people search by comes first and is the link. Status is a `Badge` with a word. Dates are
  "14 Nov 2026" (by hand, see Pitfalls), relative ("3 days ago") only next to the exact date in a `title`.
- **Missing values say why**: "Never signed in", "No account yet", "Not scored yet", never a bare dash where the
  reason is known.
- **Filters and search** live in the URL (`?q=&class_id=&status=`), so a filtered view can be bookmarked, shared
  and returned to after an action. After a server action, redirect back to the same filtered URL.
- **Counts on filters** ("No account (42)") so the person sees the size of each problem before clicking.
- **Bulk actions**: select with checkboxes (a "select all 42 shown" in the header), the action bar appears with the
  count ("Create 42 accounts"), and the result says what happened to each ("40 created, 2 skipped: no admission
  number"). Never a silent partial success.
- **Large lists**: `fetchAllRows()` past 1000 rows; paginate or group (by class) on screen beyond ~200 rows.
- **Two-way links**: every record that points to another shows it as a link, and the other record links back
  (pupil ↔ account ↔ parent). A person should never copy an ID to find something.

## 3. Forms and error prevention
- **Ask less.** Every field must justify itself. Derive what you can (class → level, number from the sequence).
- **One column**, labels above fields, hints under them (`gf-hint`), required fields unmarked and optional ones
  marked "(optional)" when most are required.
- **Right control for the data**: selects / radios for fixed lists, `type="date"` for dates, `inputMode="numeric"`
  for numbers, `type="tel"` / `type="email"` with `autoComplete` set, `autoCapitalize="characters"` for codes.
- **Normalise, don't reject**: trim spaces, accept any case, accept "GRE 2026 7" for "GRE/2026/007" and show the
  normalised value back before saving.
- **Check before, not after**: look for duplicates and clashes while the person types or before the final submit
  (likely duplicates with "Open the existing record" as the easy path; "Create anyway" as the deliberate one, with
  a reason).
- **Errors** sit next to the field, say what's wrong and how to fix it ("This number belongs to Ada Obi, JSS1.
  Choose another or open her record"), and keep everything else typed. Never clear a form on error.
- **Destructive actions**: confirm with the consequence in words; for irreversible ones type the name. Prefer
  reversible (deactivate) over destructive (delete).
- **Concurrency**: two admins may act at once. The database guarantees uniqueness (sequence, unique index);
  the UI explains the clash in words if it happens.
- **Idempotent submits**: a double click or a reload after submit must not create two records; disable the button
  while pending (`SubmitButton`) and make the server action safe to repeat.

## 4. Secrets and one-time values (passwords, codes, login slips)
- Passwords people choose are never stored or shown. School-given temporary passwords can be looked up by admins
  until the end of term (admission-and-accounts skill). Say both plainly, with the date: "Works until 14 Dec 2026.
  Once they choose their own, nobody can see it."
- Generated temporary passwords are readable: words + digits (e.g. `mango-river-42`), no look-alike characters
  (0/O, 1/l/I), lower case, typeable on a phone keyboard without switching layouts.
- Show a secret large, in `font-mono`, with Copy and Print and how long it works. Don't put it in the URL, a
  toast, a log or `localStorage`.
- Printable login slips: one per child, cut lines, school crest, the web address, the username, the temporary
  password, "You'll be asked to change it" when that is true, and who to ask for help. Several per A4 page.

## 5. Accessibility (WCAG 2.2 AA is the floor)
- Every input has a visible label or an `aria-label` naming the pupil and the field.
- Visible focus ring on everything focusable; focus never trapped; after a dialog closes focus returns to its
  trigger; after a server action the toast is announced (`role="status"`).
- Contrast ≥ 4.5:1 for text (slate-500 on white is the lightest allowed for small text), 3:1 for icons and borders
  that carry meaning.
- Status in words, never colour alone; icons next to words are `aria-hidden`.
- `aria-current` on the selected tab/chip; tables have `<th scope>`; sortable headers say the sort direction.
- Target size ≥ 36px (portal 44px for primary actions). Nothing needs a drag or a hover to work.
- Respect reduced motion and the sound switch everywhere (motion-and-3d.md, sound.md).
- Language: short sentences, the action first ("Print login slips for JSS1"), no idioms, no ALL CAPS sentences.

## 6. Phone (375px)
- No page-wide horizontal scroll (check `document.documentElement.scrollWidth` against `innerWidth`).
- Grids scroll inside their card with a sticky first column and sticky header; chip rows scroll sideways with the
  selected chip brought into view.
- Parent and pupil screens don't scroll sideways at all: a table becomes one row per item on phones
  (`sm:hidden print:hidden` list + `hidden sm:block print:block` table).
- Text fields are 16px on phones (`gf-input`): smaller ones make iPhones zoom.
- In a message box Return makes a new line; only the send button sends.
- Thumb reach: the primary action at the bottom of a phone form, full width.
- The portal installs to the home screen (`app/manifest.ts`, `components/app-icon-art.tsx`, `InstallPrompt`).

## 7. Printing
- Every list an admin will hand out (login slips, class lists, reports) has a print view. Shells hide themselves
  (`print:hidden`); the page sets `@page` size and margins; nothing important sits in a sticky or fixed element.
- Print black on white; colour only as an extra. Break-inside avoid on cards and table rows
  (`break-inside-avoid`). Repeat table headers (`thead { display: table-header-group }`).
- Show the date printed and who printed it in the footer of official documents.
- Size printable cards in `cqw` inside a `container-type: inline-size` wrapper so one design works on screen and
  paper (certificates).

## Patterns already in the app (reuse them)
- **Score grid** (`/admin/welfare/scores` `weekly-grid.tsx`, result sheets): sticky header and first column, empty
  cells tinted gold ("still to do"), changed cells tinted blue ("not saved yet"), live row total, column "Fill empty"
  menu, "Copy last week", "Undo changes", sticky save bar with the unsaved count, `beforeunload` warning.
- **Period strip** (`week-strip.tsx`): chips for each week with a text status, current week marked, future weeks
  not clickable, prev/next, selected chip scrolled into view.
- **Picker → content**: `ClassTermPicker`, then `LinkTabs` for the views of the same data.
- **Stats row**: 3–4 `StatCard`s answering "how far along are we?" above the work area; each can be a link to the
  filtered list.
- **Explain-the-maths footnote** under any table that shows a computed score.
- **Outcome first** (report card): the result sits at the top with the sum written out; a missing result says why.
- **Held, not hidden** (portal fee hold): it's ready, why it's held, the exact amount, the one action that releases
  it, what to do if they already paid.
- **Likely duplicates** (new pupil, approve application): a panel listing matches with why each matched ("Same
  name and date of birth", "Same parent phone") and "Open this record"; creating anyway is a secondary button.
- **One-time password panel** (accounts): shown once after a reset, large mono text, Copy, Print slip.
- **Help pages**: Learn Centre (search, category cards, "Admins" tag, "Open <page>" link) and portal help
  (`<details>`, filtered by parent/pupil, real data, "Still need help?").
- **3D scene** (`src/components/three/`): see motion-and-3d.md.

## Glossary (use these words)
- **Admission number**: the pupil's school number, e.g. GRE/2026/007. Also their portal username.
- **Portal account**: the sign-in for the parent or pupil portal. "Account", not "user" or "auth".
- **Temporary password**: one an admin set; the person should change it.
- **Welfare score**: out of 100, scored weekly; the term's welfare is the average of the weeks.
- **Academic average**: average of the subject scores.
- **Final score**: (academic average + welfare) ÷ 2. (Called `termTotal` in code.)
- **Published**: parents can see the report cards; results and welfare are locked.
- **Submitted as final**: a subject teacher has locked a result sheet.

## Pitfalls we hit
- The welfare sheet opened on read-only columns on phones, so teachers thought it couldn't be filled. Put what the
  person fills first; on phones use one card per pupil (`PhoneCards`), rendering only one layout.
- A blank grid after a failed read looked like "nothing entered yet": show an `Alert`.
- An `sr-only` header escaped `gf-table-wrap` and made the page scroll sideways: `gf-table-wrap` is `relative`.
- On a broadsheet the outcome goes right after the name. Lists with several actions are wrapping rows
  (`md:flex-row`), not tables with an actions column that gets cut off.
- Client-side `Link` skips `beforeunload`; use plain `<a>` away from a grid with unsaved edits.
- Grid state kept the previous week's edits: give the grid a `key` per class/term/week.
- `toLocaleDateString("en-GB", { month: "short" })` gives "Sept" on some servers: format months by hand.
- Changing a pupil's admission number used to break their portal sign-in (the login email was built from the old
  number). Anything that is also a username must keep the sign-in in step (admission-and-accounts skill).

## Expert review
This skill is itself the review of a practitioner with 30+ years in interaction, information, motion and sound
design: answer section 1 ("The review") for every screen, then sections 2 to 7 that apply. Where an answer needs a
decision the school hasn't made, ask.

## Verify
- Preview with a fake Supabase client (admin-portal-page skill), screenshots at desktop and 375px, and print
  preview for anything printable (`window.print()` or Chrome's print emulation).
- Walk the states in step 7, the keyboard path, and a screen reader pass of the main action (VoiceOver: rotor
  shows the headings and form fields with sensible names).
- Motion: with reduced motion on, nothing moves but everything is usable. Sound: switch off works, and no sound in
  a hidden tab (sound.md has the test).
