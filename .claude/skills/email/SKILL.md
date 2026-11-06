---
name: email
description: Use for anything about emails to parents and staff: the Gmail connection, the email queue and daily limit, notification/message/announcement emails, school announcements, email preferences and unsubscribe links.
---

# Email (Gmail API)

## When to use
Sending email from the app, the Gmail connection in Settings, school announcements (`/admin/announcements`), what
parents get by email and how they switch it off. Portal-only notifications (the bell) are the `notifications` skill.

## Where things live
- Set-up for a new environment: `docs/email-setup.md` (Google Cloud OAuth client, Vercel env vars, SQL, Connect).
- SQL: `docs/migrations/20261110_email.sql` (+ optional `20261110b_email_schedule.sql`: pg_cron + pg_net call
  `/api/email/send` every 5 minutes with the CRON_SECRET; Vercel Cron in `vercel.json` is a daily backup).
  - `email_settings` (one row: sender, encrypted refresh token; no grants, server only), `email_preferences`
    (own row: notifications / messages / announcements, default on), `email_outbox` (server only), `announcements`.
  - Queueing is only in the database: trigger on `notifications` (parents only, one per thing per 12 h, skips
    kind `announcement`), trigger on `chat_messages` (direct: other members; class_announcements: parents of the
    class; never class_parents; one per conversation per person per 2 h; links `/admin/messages/…` for staff),
    trigger on `announcements` (portal notifications + one email per parent if `send_email`).
  - `email_claim(limit)` (skip locked, priority: 1 messages, 2 notifications, 3 announcements, 0 test),
    `email_requeue_stuck()`, `email_status()` (admins), `announcement_reach()` (admins).
- Code `src/lib/email/`: `gmail.ts` (OAuth URLs, token refresh, send; `GmailError.disconnected/limitReached`),
  `mime.ts` (multipart, encoded words, no header injection), `secret.ts` (AES-256-GCM + HMAC with EMAIL_TOKEN_KEY),
  `templates.ts` (one table layout, escaped, signed unsubscribe + one-click links), `outbox.ts` (`runOutbox`: daily
  limit `EMAIL_DAILY_LIMIT` default 450, skips messages already read via `chat_reads`, limit/expiry put the rest
  back), `preferences.ts` (signed unsubscribe).
- Routes: `/api/email/send` (Bearer CRON_SECRET), `/api/email/google/start|callback` (admins; signed state cookie;
  needs gmail.send scope and a refresh token), `/api/email/unsubscribe` (one-click POST), page `/email/unsubscribe`
  (asks to confirm, so link scanners don't unsubscribe). Settings card `src/app/admin/settings/email-section.tsx`.
- UI: parents choose on `/portal/notifications#email`; everyone's message emails in Messages → Settings; admins send
  announcements at `/admin/announcements` (admin-only in nav, middleware and RLS); portal `/portal/announcements`.

## Rules
- Never put a message's text in an email (who wrote it only). Never email pupils (bell only).
- Never send outside the queue or around the daily limit; a free Gmail account allows ~500 recipients a day.
- The OAuth app must be *In production* (Testing tokens die after 7 days). Changing EMAIL_TOKEN_KEY means reconnecting.
- Every email: List-Unsubscribe + List-Unsubscribe-Post headers and a visible "Stop these emails" link.

## Verify
- `node .claude/skills/email/pglite-test.mjs docs/migrations/20261110_email.sql` (34 checks; runs
  20261109_notifications.sql first, path set inside).
- `node --experimental-transform-types .claude/skills/email/engine-test.ts` after copying `src/lib/email/*.ts` with
  `.ts` import suffixes and a stub `service.ts` (28 checks: MIME, escaping, secrets, signed links, limit, expiry).
- Preview Settings → Email with `email_status` faked connected/not; curl `/api/email/google/start` as admin and
  check the Google URL; curl `/api/email/send` without the secret → 401.
