---
name: notifications
description: Use for portal notifications (the bell): what sends them, who receives them, the Notifications page, unread counts, and adding a notification for a new kind of event.
---

# Notifications

## When to use
Anything about the bell / Notifications page for pupils and parents, or making a new event notify families. Staff
have no notifications yet (they have the Messages badge).

## Where things live
- SQL: `docs/migrations/20261109_notifications.sql`. `notifications` (recipient `user_id`, `student_id` the child
  it's about, `kind`, `title`, `body`, `link` must start `/portal/`, `ref_id`, `read_at`). RLS: read own only; no
  insert/update/delete grants. `notifications_unread_count()`, `mark_notifications_read(ids | null)`.
- Sending is **only** in the database: triggers call `notify_class(class, kind, title, body, path, ref)` (every pupil
  still at school in the class) or `notify_pupils(pupils[], …)`. Recipients = pupil logins (`student_user_links`) and
  parents (`guardian_user_links` → `student_guardians`); parents' links get `?student_id=`. Same kind + ref to the
  same person within 12 hours is skipped. Errors are caught (`raise warning`) so the teacher's change always saves.
  Helpers are revoked from `authenticated`: the browser can't send or fake one.
- Current triggers: `assignments` insert (kind `assignment`), `assignment_submissions` first marking
  (`assignment_marked`), `lesson_notes` becoming published (`lesson_note`), `online_classes` insert / moved /
  cancelled / back on (`online_class`, `online_class_moved`, `online_class_cancelled`, `online_class_on`).
  Times in the text use `notify_when()` (Lagos, "Thu 12 Nov, 4:00 pm").
- Code: `src/lib/notifications.ts`; bell in `src/app/portal/PortalShell.tsx` (count from `portal/layout.tsx`, 2.5 s
  timeout, 0 on error); page `src/app/portal/notifications/page.tsx` (Today / This week / Earlier, mark all read,
  child's name for parents of several children); `notifications/open/[id]/route.ts` marks read and redirects
  (portal links only). Help: `HELP.notifications`.

## Steps to notify a new event
1. Write an `after insert/update of <columns>` trigger (security definer) that decides when it really changed and
   calls `notify_class` / `notify_pupils` with a portal path and the row id as `ref`.
2. Add an icon for the new `kind` in `ICONS` on the notifications page.
3. Add a test to `pglite-test.mjs`, and a line to the matching Learn Centre guide telling staff families are notified.

## Rules
- Never insert notifications from app code or with the service key; keep them in triggers so every path sends them.
- Links stay inside `/portal/` (check constraint + `safePortalLink`).
- Notify on real changes only (e.g. moved time, not a renamed topic); a changed mark doesn't re-notify.

## Not built
- Email is built (see the `email` skill): notifications to parents are queued by a trigger on this table. No SMS,
  WhatsApp or phone push yet (needs a provider account or web-push keys).
- No "starting in 15 minutes" reminders (needs a scheduler such as pg_cron or a Vercel cron).

## Verify
- `node .claude/skills/notifications/pglite-test.mjs docs/migrations/20261109_notifications.sql` (30 checks).
- Preview the portal with the fake client: bell count, page, tapping one opens its page.
