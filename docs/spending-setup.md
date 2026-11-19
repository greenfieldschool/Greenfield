# Setting up spending requests

Spending requests work in three stages. Each one is useful on its own.

## 1. The database (needed first)

Run these in the Supabase SQL editor, in order:

1. `docs/migrations/20261119_spending_requests.sql`: requests, approvals, receipts, permissions, emails, and the fix that
   makes expense records, categories and budgets admins only.
2. `docs/migrations/20261119b_spending_schedule.sql`: the reminders and the 7:00 summary on weekdays. Needs pg_cron (it is
   already on if the school emails are scheduled).

Then a super admin opens **Spending requests → Who approves** and gives:
- at least one **approver** with a limit (two is safer, for when someone is away), including someone whose limit covers
  the two-approval amount (₦250,000 by default);
- at least one **cashier** (Can pay out).

Without Paystack, cashiers pay from the bank app, in cash or by POS and record each payment with its reference.

## 2. The Paystack expenses wallet (optional, for paying from the app)

The school chose (Nov 2026) to use a Paystack account belonging to a company it has a mutual relationship with,
rather than registering its own. The steps below apply to that account. **Webhook:** Paystack allows one live
webhook URL per business. If the company already uses a webhook for its own payments, leave it as it is; payments
from the app still finish and record correctly through the code step and "Check with Paystack". Only set our webhook
URL if the account has none.

The account in use is **U Estate** (Paystack business ID shown under the name, top left). In Nov 2026 it was **Live**
with activation status **Pre-Approved**, and its menu had **no Transfers or Balance item**, so payouts were not yet
possible. Admins have the same steps in the Learn Centre ("The Paystack Expenses Wallet", linked from the Wallet page).

In the Paystack dashboard:
1. **Two-step sign-in first.** Click the red "Setup 2FA" banner; everyone who signs in to the account does the same.
2. **Get to Approved.** "Pre-Approved" means Paystack is still checking the business and may pause payouts. Answer any
   request from Paystack (reviews@paystack.com) until the status says Approved.
3. **Switch on Transfers.** Transfers only exist for a **Registered Business**; when they are on, "Transfers" and
   "Balance" appear in the left menu. If they don't: in Settings check the business type (upgrade from Starter with the
   CAC documents if needed); if it is already Registered, press **Support** and ask Paystack to enable Transfers from
   the balance, by API, for the business ID. Paystack has said some features (Transfers among them) aren't in its new
   dashboard yet; if the dashboard offers the old version, look there too.
4. **Keep the transfer code (OTP) on.** In the transfer preferences under Settings, leave OTP confirmation switched on;
   the code must go to a phone the bursar or principal holds, never a developer's.
5. **Create the top-up account (PT Account).** Settings → Accounts → PT Account. It's a normal bank account number
   (Paystack-Titan or Paystack MFB), free for registered Nigerian businesses. Transfers into it from the school's main
   account top up the balance within minutes and show as "Auto Topup" on Paystack's Balance page.
6. **Set a daily transfer limit** about the size of the weekly float (ask Support if the setting isn't visible).
7. **Webhook (only if the account has none):** Settings → API keys & webhooks → webhook URL
   `https://greenfieldschool.ng/api/spending/paystack-webhook`.
8. **Subaccounts and Transaction Splits are not needed**: they split money customers pay in.
9. Optional: an IP allow-list for API calls (ask Paystack which addresses to allow for Vercel).

Sources: [Transfers missing from the dashboard](https://support2.paystack.com/hc/en-us/articles/360013724859-Why-can-t-I-find-the-Transfers-option-on-the-Paystack-Dashboard),
[activation statuses](https://support.paystack.com/en/articles/6543554), [PT Accounts](https://support.paystack.com/en/articles/2129346),
[top-ups and balance](https://support.paystack.com/en/articles/2130114), [the new dashboard](https://support.paystack.com/en/articles/9040258).

In Vercel (Project → Settings → Environment Variables), add `PAYSTACK_SECRET_KEY` = the live secret key, then redeploy.
Never put this key in a file, a message or anything starting with `NEXT_PUBLIC_`.

To check: open **Spending requests → Wallet**; the Paystack balance shows. On a new request, the bank list and
"Check the account name" appear.

## 3. Charges

Paystack charges ₦10 (₦5,000 or less), ₦25 (to ₦50,000) or ₦50 (above) per transfer, plus the government's ₦50 stamp duty
on ₦10,000 or more. The app records this as a "Bank charges" expense when the payment succeeds, using Paystack's price
list; compare with Paystack's statement each month.
