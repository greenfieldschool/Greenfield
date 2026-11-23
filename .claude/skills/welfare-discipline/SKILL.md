---
name: welfare-discipline
description: Use for pupil discipline: recording cases on Welfare > Discipline, the discipline ladder (which time a pupil broke a rule, the step and the corrections the policy allows), the rule list, the disciplinary committee's decisions, withdrawing a record made in error, parents' notices, and the portal Discipline page.
---

# Discipline and the discipline ladder

## When to use
Anything about discipline cases for pupils: the recording form, the ladder, rules, the committee, withdrawals, the
portal page, or how discipline feeds the welfare score (Conduct). Use with school-policies (the rules come from
"When a rule is broken"), notifications, security-and-privacy, and results-and-reports if report cards change.

## Where things live
- SQL: `docs/migrations/20261123_discipline_ladder.sql` (also in `docs/schema.sql`). Test:
  [`discipline-ladder-pglite-test.mjs`](discipline-ladder-pglite-test.mjs) (59 checks; copy next to the
  supabase-migration harness files and run with node).
  - `discipline_rules`: the list staff pick from. `ladder`: `steps` (usual), `useful_work_first` (taking what isn't
    theirs), `committee` (behaviour outside school in uniform). Staff read; admins insert/update; never deleted
    (`active = false` retires one). Unique by lower(name).
  - `welfare_discipline_records` (the old table) gained `rule_id`, `occurrence` (which time), `step` (1–4),
    `correction` (code), `statement`, `committee_outcome/days/note`, `parent_meeting_on`, `committee_decided_at/by`,
    `reported_by_name`. `category` is set to the rule's name so older readers (score sheet, report cards, MI pack)
    keep working. Old records have no rule and don't count.
  - Writes **only** through functions: `record_discipline_case` (staff), `save_discipline_statement` (staff, step 3+),
    `record_committee_decision` (admins, step 4), `withdraw_discipline_record` (admins, or the recorder on the same
    Lagos day). `discipline_next_step(student, rule)` for the form. Direct insert/update/delete is revoked.
  - `welfare_discipline_withdrawn`: a withdrawn row moves here whole (jsonb) with reason; admins read. Moving it out
    means every reader (ladder, welfare score view, report cards, MI pack) stops counting it without filters.
  - `discipline_events`: who did what (recorded, statement, committee, withdrawn); staff read.
  - Parents are told by `discipline_notify_parents` (kinds `discipline`, `discipline_committee`), parents only.
- Code: `src/lib/discipline.ts` (correction/outcome/reason labels, `correctionsFor`, `stepFor`, `ordinal`,
  `disciplineError`). Admin page `src/app/admin/welfare/discipline/page.tsx` (committee list, a pupil's ladder,
  cases, withdraw, statement), form `case-form.tsx` (client; gets only counts and rule names), actions `actions.ts`,
  rules `rules/page.tsx` (admin only: route-access `adminOnlyPrefixes` + its own role check + RLS). Portal
  `src/app/portal/discipline/page.tsx` (selects `*` so it still works before the migration). Help:
  `LEARN.disciplineLadder`, `HELP.behaviour`.

## Rules (decided 23 Nov 2026 by the user)
- The count is per pupil and per rule and **never starts again**. 5th time and later stay at step 4.
- Step 1: read the rule three times + firm warning (useful work for `useful_work_first`). Step 2: one of useful work,
  supervised reflection time with staff, lost break, spoken promise. Step 3: three days of useful work + counselling
  + written statement. Step 4: no correction at recording; an admin records what the pupil said (required: the
  committee hears the pupil first), the decision and the day the parent comes in. Decisions: `environment_team`
  (1–10 school days, supervised, outside lessons), `counsellor` (outside support only with the parent's agreement,
  noted), `other` (note required; suspension/expulsion only by the committee, with a letter). Parents can appeal in
  writing to the Proprietress (shown on the portal). A corrected decision alerts the parents again.
- Changed 23 Nov 2026 on the user's instruction (Child's Rights Law review): "time apart from the class" became
  supervised reflection; "referral to a correctional service" became the counsellor referral. Never offer isolation,
  a correctional-service referral or corporal punishment.
- Parents are told every time; the alert words are the same for every case ("A note from school about Kemi") because
  they show on lock screens and in email subjects. Pupils get no alerts.
- Records are never edited or deleted; a mistake is withdrawn with a fixed reason. Later cases keep the time they
  were given; the next case counts what is left.
- The count is worked out in the database under an advisory lock (two staff recording at once can't both get "2nd").

## Pitfalls
- Don't add a direct insert anywhere (score sheet, imports): it would skip the count and the notice. Call the RPC.
- Changing the policy's steps means changing `correctionsFor`, the check constraint and the allowed list in
  `record_discipline_case`, the Learn Centre guide and the policy text together.
- Corporal punishment appears in an old (2016) staff document; the Proprietress-vetted policy replaced it. Never
  offer it.

## Not built
- Lateness from the attendance register doesn't create cases on its own; staff record a "Lateness" case.
- No suspension/expulsion workflow (the committee's "another measure" note covers it for now).

## Expert review
Before calling the work done, answer these as a school safeguarding and pastoral lead with 30+ years would.
- **Is every correction one the approved policy allows, for that time?** No new sanctions in code.
- **Is it fair to the child?** Can a mistake be withdrawn, and does a withdrawn case stop counting everywhere?
- **Does the parent learn what happened, what the school did and what they must do** (come in on a day)?
- **Lock-screen and email privacy:** no discipline details in alert titles or bodies.
- **Who saw and changed it?** Every action is in `discipline_events` with a name.
