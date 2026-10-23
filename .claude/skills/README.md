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

## Verify
- Commands and checks that prove it works.
```

Keep skills short and specific to this codebase. Update them when something turns out to be wrong.
