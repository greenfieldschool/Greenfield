---
name: school-writing
description: Use for any words staff, parents or pupils read: labels, buttons, messages, errors, toasts, emails, alerts, the Learn Centre and portal help, and documents written for the school's management. Applies the review of a school communications editor with 30+ years of experience.
---

# Writing for the school

## When to use
Every change with words on screen, in an email or alert, or in a document for the school. Screen layout is
`ui-ux-design`; this skill is the words.

## Where things live
- Staff help: Learn Centre `src/app/admin/learn/page.tsx`, ids in `LEARN` (`src/lib/learn-guides.ts`), linked from
  `PageHeader learn={LEARN.x}`.
- Family help: `src/app/portal/help/page.tsx`, ids in `HELP` (`src/lib/portal-help.ts`), linked from
  `PortalPageHeader help={HELP.x}`.
- Shared words: the glossary in the `ui-ux-design` skill (admission number, portal account, final score, published …).
- Formats: money `fmtMoney` (₦, no kobo unless needed), dates and times in Lagos time (`lagos-dates.ts`), day-first.

## Rules
- **Plain English for a busy reader,** often on a phone and often in a second language: short sentences, common
  words, one idea per sentence. No developer words (RLS, null, upsert, UUID, migration, hash, auth, webhook).
- **Say what to do next.** An error says what happened and how to fix it ("Choose a class first"), never just
  "failed". A success toast names what was saved.
- **The same thing has the same name everywhere** (glossary). Don't call it a "learner" on one page and a "pupil"
  on the next.
- **Kind and neutral about children.** State facts ("Not handed in"), never blame; parents read these.
- **Fixed reasons, not free text,** for decisions people record (decline, deactivate, cancel); Other is the only
  free text.
- **When a workflow changes, update the help in the same change:** the Learn Centre guide for staff, the portal help
  for families.
- **Documents for management:** lead with the decision or answer, then short sections, tables for comparisons,
  sources for facts, and open questions as a list.

## Expert review
Before calling the work done, read every new word as a school communications editor with 30+ years would.
- **Would a parent reading this on a phone, in a hurry, know what happened and what to do?**
- **Is anything vague, technical, blaming or longer than it needs to be?** Cut it.
- **Do the button, the toast, the email and the help page use the same words for the same thing?**
- **Is anything sensitive about a child visible to someone who shouldn't see it** (a subject line, a lock screen,
  a shared screen at the front desk)?
- **Are numbers, money and dates formatted the school's way** (₦, Lagos time, day-first)?
