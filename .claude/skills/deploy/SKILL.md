---
name: deploy
description: Use when the user asks to commit, push, deploy or ship changes to greenfieldschool.ng.
---

# Deploy

Vercel builds and deploys every push to `main` of `greenfieldschool/greenfield`. There is no Vercel CLI here.

## Steps
1. **Migrations first.** If the change needs SQL from `docs/migrations/`, confirm the user has run it in the
   Supabase SQL editor (in order) before pushing; otherwise the new code hits missing tables. Ask if unsure.
2. Check: `npx tsc --noEmit -p . && npx next lint --dir src && npx next build`.
3. Stage only the work: never `issues/`, `.env*`, or `tsconfig.tsbuildinfo`.
4. Commit with a conventional message (`feat: …` / `fix: …`) summarising the user-visible changes, ending with the
   attribution line from the system reminder.
5. `git push origin main` (the user deploys straight from main; only push when they ask).
6. Watch the deployment until it finishes (run in the background, don't poll by hand):
   ```bash
   until s=$(gh api repos/greenfieldschool/greenfield/commits/<sha>/status --jq '.state' 2>/dev/null); [ "$s" != "pending" ]; do sleep 10; done; echo "$s"
   ```
7. Report the commit, the deploy result, and anything the user must still do (assign subjects, run a migration, …).

## Notes
- The git remote URL contains a GitHub token in plain text; it was flagged to the user. Don't print it.
- Builds run on Vercel with the real Supabase env; locally pages are static because there is no `.env.local`.
