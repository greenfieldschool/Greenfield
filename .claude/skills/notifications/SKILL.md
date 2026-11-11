---
name: notifications
description: Use for portal notifications (the bell) and phone notifications (Web Push): what sends them, who receives them, the Notifications page, unread counts, the service worker, and adding a notification for a new kind of event.
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
  `star_videos` insert or pupil changed (`star_video`, only that pupil and their parents; see the star-videos skill).
  Times in the text use `notify_when()` (Lagos, "Thu 12 Nov, 4:00 pm").
- Code: `src/lib/notifications.ts`; bell in `src/app/portal/PortalShell.tsx` (count from `portal/layout.tsx`, 2.5 s
  timeout, 0 on error); page `src/app/portal/notifications/page.tsx` (Today / This week / Earlier, mark all read,
  child's name for parents of several children); `notifications/open/[id]/route.ts` marks read and redirects
  (portal links only). Help: `HELP.notifications`.

## Phone notifications (Web Push)
- Set-up for a new environment: `docs/push-setup.md` (VAPID keys on Vercel, two SQL files, how to check).
- SQL: `docs/migrations/20261111_push_notifications.sql` + `20261111b_push_sending.sql` (the second has the
  CRON_SECRET pasted in; stores it and the send URL in Supabase Vault and schedules a 5-minute backup).
  - `push_subscriptions` (one row per phone; select/delete own; saved only via `push_subscribe()`, which moves a
    shared phone to whoever turned it on, swaps a renewed address, keeps 10 per person).
  - `push_outbox` (server only). Trigger `notifications_push` (after insert on `notifications`) queues one row per
    notification for people with a phone, then `push_kick()`: one `pg_net` POST to `/api/push/send` per transaction
    (a whole class = one request), read from Vault; does nothing until file b is run. Errors are caught.
  - `push_claim(limit)` (service role; drops alerts older than a day, already read or tried 3 times; skip locked;
    re-takes after 2 minutes; returns the unread count for the icon badge), `push_done(ids)`.
- Code: `src/lib/push.ts` (server: VAPID from env, `sendPush` → sent/gone/retry/failed, 404/410/403/400 = gone),
  `src/lib/push-outbox.ts` (`runPushOutbox`: batches of 20, deletes gone phones, leaves "retry" ones),
  `src/lib/push-client.ts` (browser: support/iOS checks, turn on/off, resync, test, app badge).
  Routes: `/api/push/send` (Bearer CRON_SECRET), `/api/push/subscription` (POST save / DELETE own, signed in),
  `/api/push/test` (one alert to the caller's own phone). Badge icon `/app-icon/badge`.
- `public/sw.js`: push → `showNotification` (tag `kind:ref` so a parent of twins gets one alert, not two;
  `setAppBadge`), click → focus an open portal window and navigate or open `/portal/notifications/open/<id>` (marks
  read, then redirects); `pushsubscriptionchange` re-saves. No fetch handler or caching on purpose.
- UI: `PushSetup` in `portal/layout.tsx` (registers the worker with scope `/portal`, resyncs the phone to the signed-in
  person once per visit, app badge, gentle invite: home-screen app only, from the 2nd visit, 6 s after load, not on
  the Notifications page, 14 days quiet after "Not now", never after two). `PushControl` card on the Notifications
  page (`#phone`): Turn on / Send a test / Turn off, blocked steps, iPhone "Add to Home Screen" steps (push needs a
  Home Screen app on iOS 16.4+). Both hidden when no VAPID key is set. Help: `#phone-alerts`.

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
- Email is built (see the `email` skill): notifications to parents are queued by a trigger on this table. Phone push
  is built (above) and follows every notification automatically. No SMS or WhatsApp. New chat messages are not
  pushed (they aren't notifications); that would need its own trigger into `push_outbox`-style queueing.
- No "starting in 15 minutes" reminders (needs a scheduler such as pg_cron or a Vercel cron).

## Pitfalls
- Never hard-code the CRON_SECRET in a function body: `pg_proc.prosrc` is readable by every signed-in user. Vault.
- iPhone Safari (not from the Home Screen) has no `PushManager`: show the Add to Home Screen steps, not an error.
- `Notification.requestPermission()` must run from a tap, never on page load (browsers block or penalise it).
- A subscription made with other VAPID keys gets 403 from the push service; `turnOnPush` replaces it.

## Verify
- `node .claude/skills/notifications/push-pglite-test.mjs <repo>/docs/migrations/20261109_notifications.sql
  <repo>/docs/migrations/20261111_push_notifications.sql` (30 checks: own rows only, queueing, claim/retry/expiry,
  shared phone, 10-phone cap, one pg_net request per transaction with a fake `net`/`vault`, failure never blocks).
- In the browser preview with keys in env: `/sw.js` registers with scope `/portal`, the card shows each state.
- `node .claude/skills/notifications/pglite-test.mjs docs/migrations/20261109_notifications.sql` (30 checks).
- Preview the portal with the fake client: bell count, page, tapping one opens its page.
