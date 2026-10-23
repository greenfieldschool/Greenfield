---
name: admin-portal-page
description: Use when building or changing a page, form, nav item or server action in the staff dashboard (/admin) or parent/student portal (/portal).
---

# Admin and portal pages

## Where things live
- Pages: `src/app/admin/**/page.tsx`, `src/app/portal/**/page.tsx` (server components).
- Nav: `src/app/admin/AdminShell.tsx` (`NAV` groups, `adminOnly`, `chatOnly`, `SEGMENT_LABELS`),
  `src/app/portal/PortalShell.tsx` (`parentNav` / `studentNav`; `tab: true` = mobile bottom bar, max 4 + More).
- Admin-only routes: `middleware.ts` → `adminOnlyPrefixes`.
- Design system: `src/components/ui/*` and `gf-*` classes (see CLAUDE.md). Icons: `lucide-react`.
- Shared form pieces: `SubmitButton` (supports `variant`, `size`, `formAction`), `ConfirmSubmitButton`,
  `ConfirmActionButton` (confirm + `formAction`), `UrlToast`.
- Teacher scoping: `getTeacherAccess(supabase)` → `classes`, `classTeacherClassIds`, `subjectsByClass`; `canTeach()`.

## Steps
1. Server component page; read `searchParams` as a Promise (`const sp = (await searchParams) ?? {}`).
2. Server actions **at module level** with `"use server"`, reading everything from `FormData` (hidden inputs for
   ids). After writing: `revalidatePath(...)`, then `redirect(\`${path}?toast=${encodeURIComponent(msg)}&toast_type=success|error\`)`.
   A `back()`/`xxxBack()` helper typed `never` keeps this tidy.
3. Saving grids (scores, ratings, comments): send `orig:<key>` hidden inputs and only write cells that changed.
   This stops a stale tab from overwriting someone else's work.
4. Use the design system: `PageHeader` → `Card`s; `EmptyState` for empty lists; `Alert` for warnings;
   `Badge` for status. Tables: `gf-table-wrap` + `gf-table`.
5. Access: hide UI by role, but rely on RLS. New admin-only page → add to `adminOnlyPrefixes` and `adminOnly` in nav.
6. New route segment → add a label to `SEGMENT_LABELS`.
7. Update the Learn Centre guide for the workflow.

## Rules
- Never capture a function, a helper declared in the component, or a method like `rows.find` inside an inline
  `"use server"` action. It builds fine and crashes in production. Plain data is fine; module level is best.
- Never trust ids from the form for permissions; the database checks (RLS / security definer functions).
- Text for staff and parents: plain words, no jargon. Confirm destructive actions (`ConfirmSubmitButton`).
- Mobile first: check at 375px. Portal pages sit above a fixed bottom tab bar.
- Printing: shells hide themselves with `print:hidden`; printable cards use `.gf-report-card` (see globals.css).

## Pitfalls we hit
- Portal had no `ToastProvider`, so `UrlToast` crashed every portal page that used it. Both layouts now have it.
- `ConfirmSubmitButton` has no `formAction`; use `ConfirmActionButton` for multi-action forms.
- Supabase upsert with rows that have different keys fills missing columns with NULL; batch rows by shape.
- Pages render nothing locally without `.env.local`, and `next build` marks them static. That's expected.

## Verify
```bash
npx tsc --noEmit -p . && npx next lint --dir src && npx next build
```
UI preview without a database: copy `src/components`, `src/lib`, the route folder, `globals.css` and the
tailwind/ts configs into a scratchpad app with `node_modules` symlinked, replace `src/lib/supabase/server.ts`
with a fake client (`auth.getUser`, `from(table)` chain with `eq/select/order/limit/maybeSingle/then`, `rpc(name)`)
returning sample rows, wrap the root layout in `ToastProvider`, run `npx next dev -p 39xx`, and screenshot with the
built-in browser at desktop and mobile (`resize_window` preset `mobile`). Reset the viewport and stop the server after.
