---
name: school-policies
description: Use when a change touches anything the school's policies decide (school times, lateness, discipline, dress, assessment, exam questions, admission documents and ages, fees, payment plans, default fees, discounts, scholarships, reward points, withdrawals, event reminders, PTA, staff hours, probation, staff penalties, inventory counts), or when the policy text, the Policies pages or the "School policy" boxes change.
---

# School policies

## When to use
- Changing the policy text, its version or approval, the Policies pages, or the excerpt boxes.
- **Any feature whose rules come from a policy.** Check the rule here first and build what the policy says; if the
  feature needs a rule the policy doesn't have, or the policy looks wrong, ask the user. Never make up school policy.
- Use with the area's skill (finance-payments, admission-and-accounts, results-and-reports, …) and school-writing.

## Where things live
- Text: `src/lib/policies/families.ts` (parents and pupils), `src/lib/policies/staff.ts`, types in `types.ts`,
  helpers and `POLICY_SUGGESTIONS` in `index.ts`. This is the single source: pages never retype a rule.
- Display: `src/components/policies/policy-view.tsx`: `PolicyDocument` (whole policy, contents, anchors per section,
  phone layout for tables, printable) and `PolicyExcerpt` (a "School policy: …" link that opens one section in a
  pop-up, `policy-popup.tsx`, a native `<dialog>`, with "Read the whole policy"). In the portal pass `portal`: it
  shows nothing until the policy is approved, and never shows a staff section.
- Pages: `/admin/policies` (`?doc=staff|families|suggestions`; suggestions for admins only), `/portal/policies`
  (pupils don't see `audience: "parents"` sections, via `forReader`). Nav: AdminShell Overview group, both portal navs.
- Help: `LEARN.policies` guide in the Learn Centre, `HELP.policies` in portal help.
- Excerpts placed so far: admin Discipline + portal Discipline (`discipline-ladder`), admin Attendance (`arriving`),
  Applications (`admission-documents`), portal Fees & billing and Pay in instalments (`payment-plans`,
  `late-payment`), invoice page (`payment-plans`, `early-payment`), Payment plans (`late-payment`), Discipline rules
  (`school-rules`), Messages inbox (portal `using-the-portal`, staff `staff-devices`), portal Fees & billing (`refunds`).
- Originals: `Policies/` (Word files, git-ignored by the user's choice; don't commit them). The two "vetted by
  Proprietress" files are the newest; "Procedures Act" (2016) is older but the only source for duties, subject
  categories, exam format and staff penalties.

## Decisions already made (22 Nov 2026, by the user)
| Topic | Decision |
|---|---|
| Assembly | 7:45–8:05: prayer 7 min, anthems 3, announcements + educational message 5, closing 3, march 2 |
| Lessons | Start 8:15. Staff prepare 8:05–8:15 |
| Pre-school | 8:15–2:00, after-school care 2:00–3:00 |
| Primary / secondary | Lessons end 3:00, after-school 3:10–4:00; Friday everyone closes 1:00 |
| Pupils arriving | By 7:45 (later = late); gate closes for assembly 8:00, later pupils signed in at the front desk |
| Staff meetings | Workshop Mon + Fri, committee Tue + Thu, 7:15–7:45 |
| Probation | 3 months, can be extended to 6 |
| Parent points | 1,000 = 5% off tuition, 2,000 = 10%, 5,000 = half-tuition; points used up when redeemed |
| Scholarship grades | % of tuition only; other fees in full |
| Fee deadline | New pupils in full before day 1; returning by end of week 2 unless a signed payment plan |
| Default fee | Higher of ₦2,500 or 3% of the term's fees, per missed instalment, plus a default letter |
| Event reminders | 2 months, 1 month, 1 week, 2 days before |
| Withdrawal | Written notice with reasons a term ahead, or a term's fees instead |
| Admission ages | Pre-school 1–5, primary 6–11, JSS 10–13; head teacher may override with a reason |
| Exam questions | Due Friday of week 2, late = holiday salary forfeited |
| Discipline ladder | Count per pupil and rule for the whole time at school; parents told every time; committee decision recorded by an admin |
| Pupil corrections | 2nd time: supervised reflection, not time apart; 4th time: up to 10 school days with the environment team or school counsellor (outside support only if the parent agrees), never a correctional service; pupil heard first; only the committee suspends/expels, with a letter; parents appeal to the Proprietress; never corporal punishment |

Open questions for the school are `POLICY_SUGGESTIONS` (shown to admins). Remove one once it's decided.

Draft sections added 23 Nov 2026 at the user's request, not yet confirmed by the Proprietress (listed in the
"New sections to check" suggestion): families `safeguarding`, `anti-bullying`, `phones-devices`,
`using-the-portal`, `personal-data` (part "Safety and wellbeing") and `refunds` (fees); staff `staff-safeguarding`,
`staff-data`, `staff-devices` (part "Safeguarding, personal data and devices"). The numbers in them (2 school days,
30 days, 6 years, 72 hours from the NDPA) must match any feature built on them.

## Steps (changing the policy)
1. Get the change from the user (the Proprietress approves policy). Edit the text in `families.ts` / `staff.ts`.
2. Change `version`; set `approvedBy` / `approvedOn` to `null` until it is approved again (the portal then shows
   "being updated"). Set them when the user says it's approved.
3. If a feature enforces the rule (fees, discipline, admission checks), change the code in the same change, and
   say on the screen which policy section it follows (`PolicyExcerpt`).
4. Section ids are anchors and excerpt keys: renaming one means updating every `PolicyExcerpt section=` (typecheck
   won't catch it; grep for it). Keep ids unique within a document.
5. Update the decisions table above and the Learn Centre / portal help if the workflow changed.

## Rules
- **Families never see the staff policy.** `/admin` is staff-only (middleware), `/admin/policies` checks the role
  itself and fails closed, `src/lib/policies/index.ts` is `server-only`, and the pop-up only receives the one
  section rendered on the server. Never import `@/lib/policies` from a client component or pass a whole `PolicyDoc`
  to one; check with `grep -rl "Corrective measures for staff" .next/static` after a build (must find nothing).
- Policy on a working page is a small link that opens a pop-up, not a block of text: the page stays about its job.
- Plain words, "pupil" not "learner", British English, ₦ amounts and Lagos times (school-writing).
- A rule lives in one place. A page that applies a rule shows the excerpt instead of its own copy of the words.
- Draft policies are never shown to families. Staff see drafts with a "Draft" banner.
- Features follow the policy exactly (percentages, weeks, amounts); store the numbers the policy sets in settings
  tables when they are likely to change (data-modelling), but default them to the policy.

## Built from the policy
- Payment plans, default fees and early payment discounts (22 Nov 2026): finance-payments skill. The percentages
  and weeks are in `fee_plan_template()` in the database; if the policy's plans change, change that function, the
  families policy text and the Learn Centre guide together. Decisions: an admin confirms each default fee; parents
  may agree on the portal (typed name) up to the first day of term, or on paper at the office; "week n" = Friday.

- Discipline ladder (23 Nov 2026): welfare-discipline skill. Count per pupil and rule, never reset; only the
  policy's corrections per step; 4th time and later wait for an admin to record the committee's decision; parents
  told every time with lock-screen-safe words.

## Planned (agreed with the user, not built yet)
Admission checklist + Terms and Agreements signing,
rewards and scholarships (points, levels, fee grades), and parents/staff accepting each new policy version.

## Pitfalls we hit
- `.gitignore` had `Policies/`, and git on macOS ignores case, so it also hid `src/lib/policies/`,
  `src/components/policies/` and both `policies` pages from git. It must stay `/Policies/` (repo root only).

## Expert review
Before calling the work done, answer these as a school registrar and governance lead with 30+ years would.
- **Is there a written, approved rule behind this behaviour?** Quote the section. If not, ask; don't invent policy.
- **Do the screen, the policy text and the help say the same thing**, with the same numbers?
- **Would a parent reading this understand what they must do, by when, and what happens if they don't?**
- **Is the rule fair and lawful for a child** (Lagos State Child's Rights Law) **and for staff** (Labour Act on pay
  deductions)? Flag anything doubtful in `POLICY_SUGGESTIONS` instead of building it silently.
- **Which version did this person agree to, and when?** Anything binding (fees agreement, policy acceptance) must
  record the version.

## Verify
- `npx tsc --noEmit -p . && npx next lint --dir src && npx next build`.
- Preview `/admin/policies` and an excerpt page at desktop and 375px (fake client, admin-portal-page skill); check
  no sideways scroll, anchors open the right section, print preview shows the tables.
