---
name: spending-requests
description: Use for spending requests (daily expense requests): staff asking for money, approvals and limits, paying out through the Paystack expenses wallet or by hand, accounting for advances with receipts and change, spending permissions, reminders, and how closed requests become expense records.
---

# Spending requests

## When to use
Anything in `/admin/spending`: asking for money (advance, pay a supplier, pay me back), approving, paying out,
accounting for an advance, the Paystack wallet and its top-ups, who may approve or pay, the daily reminders and
summary. Plain expense records typed by admins are `finance-payments`. Always with data-modelling,
supabase-migration, security-and-privacy, admin-portal-page, ui-ux-design, school-writing and email.
Approach agreed with the school: the Claude Doc "Daily Expense Requests – Proposed Approach" (Nov 2026).

## Where things live
- SQL: `docs/migrations/20261119_spending_requests.sql` (tables, functions, RLS, emails, the `spending-files` bucket,
  and the admins-only fix for `finance_expenses`, `expense_categories`, `finance_budgets*`), schedule
  `20261119b_spending_schedule.sql` (`spending_daily_run()` 06:00 UTC = 07:00 Lagos, weekdays). Set-up for the school:
  `docs/spending-setup.md`.
- Statuses: `submitted → (first_approval) → approved → [paying →] paid (advance) → checking → closed`; supplier and pay-back
  requests close when paid. Side exits: `sent_back` (edit and resubmit), `declined`, `cancelled` (before paying only).
  `paying` falls back to `approved` when Paystack says failed / the cashier stops it.
- Code: `src/lib/spending.ts` (labels, fixed reason lists in step with `spending_reason_ok()`, flags, `spendingError`),
  `src/lib/paystack.ts` (server only: banks, resolve, recipient, transfer, finalize OTP, verify, balance, webhook
  signature), `src/components/spending-receipts.tsx` (receipts / slip upload: shrink under 2MB, SHA-256, own folder).
- Pages `src/app/admin/spending/`: `page.tsx` (tabs My requests / To approve / To pay / Receipts to check / All, stat
  cards, email on/off), `new/` (ask; `?edit=<id>` after sent back; `_request-form.tsx`), `[id]/` (the actions for
  whoever is looking, receipts with signed links, history), `settings/` (who approves and pays, rules, change log;
  admins only in middleware, super admins edit), `wallet/` (Paystack balance, top-ups, Paystack payouts), `actions.ts`,
  `_data.ts`. Routes: `/api/spending/resolve-account` (signed-in staff), `/api/spending/paystack-webhook` (signature).
- Menu: Overview → Spending requests (all staff), badge = `spending_my_counts()` total, from `admin/layout.tsx`.
  Expenses page shows the request link and Void. Management pack "Spent" skips voided expenses.
- Emails: category `spending` (`email_preferences.spending`, templates "Staff dashboard"), queued by the
  `spending_events_email` trigger and the daily run, priority 1.
- Learn Centre `LEARN.spending`.

## Rules
- Never write the tables from the app; call the functions. Never mark anything paid from the browser:
  `spending_paystack_result` is service-key only, called after Paystack confirms (webhook, finalize, verify).
- Before calling a Paystack payment failed, ask Paystack (`verifyTransfer`); a timeout may still have sent money.
  A new attempt gets a new reference only after a confirmed failure.
- Bank names are checked with the bank on the server when saving and again when creating the Paystack recipient;
  a mismatch stops the payment.
- Expense records come only from closing (`spending_post_expenses`); paying an advance is not spending.
- Reasons are fixed lists; Other needs a note. Nothing is deleted.

## Data design (data-modelling review, Nov 2026)
1. **What it is.** A request for school money by a staff member, from asking to closed. System of record:
   `spending_requests`. Money actually spent stays in `finance_expenses` (one home); a request only *creates* expense
   rows when it closes.
2. **Identity.** uuid. Human identifier `request_no` `SR-2026-00001` from a locked per-year counter
   (`spending_counters`), unique. Paystack reference `greenfield-sr-2026-00001-<attempt>`, unique, so a retry after a confirmed
   failure gets a new reference and a request can never be paid twice.
3. **Who decides what.** One writer per fact, all `security definer` functions that lock the request row
   (`for update`), check permission, change status and write `spending_events`:
   `spending_save_request` (ask / resubmit), `spending_decide` (approve / decline / send back),
   `spending_cancel`, `spending_paystack_begin` + `spending_paystack_result` (service key only),
   `spending_record_payout` (paid another way), `spending_add_receipt` / `spending_remove_receipt`,
   `spending_send_accounting`, `spending_check_accounting`, `spending_set_permission`, `spending_save_settings`,
   `spending_record_topup` / `spending_void_topup`, `finance_void_expense`. No insert/update/delete grants on the tables.
4. **Time.** Requests are current state + an append-only history (`spending_events`: action, from → to status, fixed
   reason code, note, who, name snapshot). Approvals are append-only (`spending_approvals`, withdrawn when sent back).
   Permissions are current state + `spending_permission_log` (from → to, who). Nothing is deleted anywhere.
5. **Copies on purpose (snapshots, never synced):** the payee's bank details on the request (what the approver saw),
   `requester_name`, `approver_name`, `done_by_name`. Bank details live in `spending_payees`; a change makes a new
   payee row and deactivates the old one, and the request is flagged `new_bank_details` for the approver.
6. **Counted once.** A closed request posts one `finance_expenses` row per receipt (`spending_receipt_id` unique) and
   at most one charge row (partial unique on `spending_request_id` where no receipt). Paying out an advance is
   "money with staff", not spending. Rule enforced when sending: receipts + change returned = amount paid.
7. **Derived, not stored:** money with staff, waiting counts, budget left (`spending_category_figures`), wallet
   balance (Paystack is the record; top-ups and payouts are our list to reconcile against it).
8. **Integrity in the database:** status, kind, method and reason checks; amount > 0; NUBAN account numbers 10 digits;
   one active staff payee per person; one active supplier per bank account; a receipt picture (SHA-256) used once;
   requester ≠ approver ≠ payer (payer may have approved only at or under `approver_may_pay_up_to`, with a note).
9. **Reads:** by status (queues), by requester (My requests), by category + date (split check), events by request.
   Indexed on those. Lists are small (hundreds a term); reports use `fetchAllRows`.
10. **Who sees what:** requesters their own; admins and anyone with a spending permission all requests; money
    records (`finance_expenses`, categories' writes, budgets) admins only. Files in the private `spending-files`
    bucket under `<uploader id>/…`.
11. **Existing rows:** current expenses keep working; no existing row breaks the new rules (new columns are nullable).

## Expert review
Before calling the work done, answer these as a school bursar and internal auditor with 30+ years would.
- **Can one person ask, approve and pay?** Prove they can't, as each role, in PGlite.
- **Can money leave twice for one request,** through a double click, a retry or a webhook sent twice?
- **Does every naira paid out end as receipts, change returned or a visible overdue advance?**
- **Can a spent naira appear twice in the expenses or the management pack?**
- **Is every decision recorded with a person, a time and a fixed reason?**
- **What does the bursar do when Paystack is down?** (Record a payment made another way.)

## Pitfalls we hit
- Read policies call `spending_sees_all()` / `spending_can_see()`: after `revoke all … from public` they must be granted
  back to `authenticated`, or every read fails with "permission denied for function".
- `text[] || 'literal'` needs `::text`, or Postgres reads the literal as an array.

## Verify
- `node .claude/skills/spending-requests/pglite-test.mjs <repo>/docs/schema.sql <repo>/docs/migrations/20261119_spending_requests.sql`
  from a scratchpad with `@electric-sql/pglite@0.2.17` and `pglite-full-schema.mjs` + `pglite-split.mjs` copied next to
  it (121 checks: roles, segregation, two approvals, paying twice, Paystack retries and repeats, receipts, expenses
  posted once, admins-only money records, files, daily run, history names).
- tsc, lint, build; preview the pages with the fake client as requester, approver, cashier and admin, at 375px.
