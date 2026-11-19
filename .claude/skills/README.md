# Project skills

One folder per kind of request, each with a `SKILL.md`. `CLAUDE.md` lists them; add a row there for every new one.

## Template

```markdown
---
name: kebab-case-name
description: One sentence saying when to use this skill (the trigger), specific enough to tell it apart from the others.
---

# Title

## When to use
The requests this covers, and the ones it doesn't (point to the right skill instead).

## Where things live
Files, tables, functions — with paths.

## Steps
1. Numbered, in the order they are done.

## Rules
- Things that must always / never happen, and why.

## Pitfalls we hit
- Concrete mistakes from past work and how to avoid them.

## Expert review
Before calling the work done, answer these as <a practitioner with 30+ years in this field: registrar, bursar,
examinations officer, safeguarding lead, DBA …> would. Where an answer needs a decision the school hasn't made, ask.
- 4 to 7 questions that experience teaches and newcomers miss, specific to this area.

## Verify
- Commands and checks that prove it works.
```

Keep skills short and specific to this codebase. Update them when something turns out to be wrong.

Every skill has an **Expert review**: the questions someone with at least 30 years in that field would ask before
the work ships. Write it as checks for the change in hand, not as claims about what the code already does. When a
session learns something an expert would have caught, add it there or to "Pitfalls we hit".

`CLAUDE.md` also has a "Skills that go together" table. When a new skill should always be used with others, add it
there too.
