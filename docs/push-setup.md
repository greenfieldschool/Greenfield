# Phone notifications set-up (Web Push)

Parents and pupils can get Greenfield alerts on their phone's lock screen (new work, marks, lesson notes, online
classes, school announcements). They turn it on themselves on **Notifications** in the portal. This page is the
one-off set-up for whoever looks after the website. About 10 minutes. Nothing to pay: it uses the phones' own push
services (Google for Android, Apple for iPhone).

## 1. Make the keys (once)
On any computer with Node:
```bash
npx web-push generate-vapid-keys
```
It prints a **Public Key** and a **Private Key**. Keep them: changing them later means everyone has to turn alerts
on again.

## 2. Vercel (Project → Settings → Environment Variables, Production)
| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the Public Key |
| `VAPID_PRIVATE_KEY` | the Private Key (secret) |
| `VAPID_SUBJECT` | `mailto:greenfieldschslekki@gmail.com` (who Google/Apple contact about our alerts) |
| `CRON_SECRET` | already set for email; if not, `openssl rand -hex 32` |
| `SUPABASE_SERVICE_ROLE_KEY` | already set if the portal report cards work |

Then redeploy. Until the keys are set, the "Phone notifications" card simply doesn't show.

## 3. Supabase (SQL editor), in this order
1. `docs/migrations/20261111_push_notifications.sql` (the phones list and the waiting alerts).
2. `docs/migrations/20261111b_push_sending.sql`: first replace `PASTE_CRON_SECRET_HERE` with the `CRON_SECRET`
   from Vercel. It stores the secret in Supabase Vault so the database can ask the website to send alerts the
   moment a notification is written, plus a backup run every 5 minutes. Without it, nothing is sent.

## 4. Check
- On an Android phone: open the portal in Chrome (or from the home-screen icon), **Notifications → Turn on phone
  notifications → Allow → Send a test**.
- iPhone: Safari → Share → **Add to Home Screen**, open Greenfield from the Home Screen, then the same steps.
- Set a test assignment for a class with your test pupil: the alert should arrive within a few seconds.
- Not arriving? In Supabase run `select * from push_outbox;` (should be empty a minute later) and
  `select * from net._http_response order by created desc limit 5;` (status 200 from `/api/push/send`).
  A 401 means the CRON_SECRET in Vault differs from Vercel's: run file 2 again with the right one.
