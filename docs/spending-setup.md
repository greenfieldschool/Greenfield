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

The school needs a Paystack account with **Registered Business** status (CAC documents and a corporate account).

In the Paystack dashboard:
1. **Settings → API keys & webhooks**: copy the **live secret key**. Set the webhook URL to
   `https://greenfieldschool.ng/api/spending/paystack-webhook`.
2. **Keep the transfer code (OTP) switched on.** The code goes to the business phone; choose the bursar's or the
   principal's phone, never a developer's.
3. **Set a daily transfer limit** about the size of the weekly float.
4. **IP allow-list**: ask Paystack support which addresses to allow for Vercel, or leave it off and rely on the secret
   key staying on the server.
5. Everyone with a dashboard login uses two-step sign-in, with view-only roles where possible, so money leaves only
   through the app's approvals.
6. Note the **top-up account number** (Paystack's dedicated account for the business). Transfers into it from the
   school's main account top up the wallet within minutes, free.

In Vercel (Project → Settings → Environment Variables), add `PAYSTACK_SECRET_KEY` = the live secret key, then redeploy.
Never put this key in a file, a message or anything starting with `NEXT_PUBLIC_`.

To check: open **Spending requests → Wallet**; the Paystack balance shows. On a new request, the bank list and
"Check the account name" appear.

## 3. Charges

Paystack charges ₦10 (₦5,000 or less), ₦25 (to ₦50,000) or ₦50 (above) per transfer, plus the government's ₦50 stamp duty
on ₦10,000 or more. The app records this as a "Bank charges" expense when the payment succeeds, using Paystack's price
list; compare with Paystack's statement each month.
