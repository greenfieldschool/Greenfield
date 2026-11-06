# Email set-up (Gmail)

The website emails parents (notifications, new-message alerts, school announcements) from
**greenfieldschslekki@gmail.com** through the Gmail API. This is done once, by whoever looks after the website.
About 20 minutes.

## 1. Google Cloud (signed in as greenfieldschslekki@gmail.com)
1. Go to https://console.cloud.google.com, create a project called **Greenfield School website**.
2. **APIs & Services → Library**: search **Gmail API**, click **Enable**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External**. App name **Greenfield School**, support email greenfieldschslekki@gmail.com,
     authorised domain `greenfieldschool.ng`.
   - Scopes: add `.../auth/gmail.send`, `openid`, `email`.
   - **Publish the app** (Audience → *Publish app*, status *In production*). In *Testing* the connection stops
     working after 7 days. Google may show "unverified app" when you connect: click *Advanced → Go to Greenfield
     School*. Only the school account ever signs in, so verification isn't needed.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type **Web application**, name **Website**.
   - Authorised redirect URI: `https://greenfieldschool.ng/api/email/google/callback`
   - Copy the **Client ID** and **Client secret**.

## 2. Vercel (Project → Settings → Environment Variables, Production)
| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 1.4 |
| `GOOGLE_CLIENT_SECRET` | from step 1.4 |
| `EMAIL_TOKEN_KEY` | run `openssl rand -base64 32` and paste the result (keep it: changing it means reconnecting) |
| `CRON_SECRET` | run `openssl rand -hex 32` |
| `SUPABASE_SERVICE_ROLE_KEY` | already set if the portal report cards work |

Redeploy after adding them.

## 3. Supabase (SQL editor)
1. Run `docs/migrations/20261110_email.sql`.
2. Open `docs/migrations/20261110b_email_schedule.sql`, replace `PASTE_CRON_SECRET_HERE` with the CRON_SECRET from
   step 2, and run it (sends every 5 minutes).

## 4. Connect
Admin dashboard → **Settings → Email (Gmail)** → **Connect Gmail** → sign in as greenfieldschslekki@gmail.com →
allow "Send email on your behalf". Then **Send me a test email**.

## Limits and good practice
- A free Gmail account sends to about **500 people a day**. The website stops at 450 (`EMAIL_DAILY_LIMIT`), sends
  messages first, then notifications, then announcements, and keeps the rest for the next day.
- Every email has a "Stop these emails" link and a one-click unsubscribe header (Gmail's rules for bulk senders).
- Moving to Google Workspace later (e.g. noreply@greenfieldschool.ng, ~2,000 a day): reconnect with that account
  and set `EMAIL_DAILY_LIMIT=1800`. Nothing else changes.
- If emails stop with "The Gmail connection has expired": the Google password was changed or access was removed.
  Click **Reconnect** in Settings.
