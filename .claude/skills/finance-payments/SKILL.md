---
name: finance-payments
description: Use for anything about fees, invoices, payments, debtors, payment IDs, bank statements or bank email alerts (Finance in /admin, Fees & billing in /portal).
---

# Finance: invoices, payments and bank matching

## When to use
Changes to money records and how payments reach them. Table or RLS changes also need the `supabase-migration`
skill; new pages also need `admin-portal-page`. Unpaid fees hold back portal report cards (`src/lib/fee-hold.ts`,
explained in the results-and-reports skill): a change to what counts as "paid" changes who sees report cards.

## Where things live
- Pages: `src/app/admin/finance/**` (admin only, `/admin/finance` is in `adminOnlyPrefixes`), parent view
  `src/app/portal/billing/page.tsx`. Shared bits: `finance/_components/finance-ui.tsx` (`fmtMoney`, `currencyPrefix`,
  `fmtDate`, badges) and `finance-server.ts` (`toastUrl`).
- Tables: `finance_invoices` (+ `_items` with `revenue_category_id`, `_adjustments`), `finance_payment_transactions`
  (inflow/outflow, `status posted|void`), `finance_payment_allocations` (payment → invoice, unique per pair),
  views `finance_invoice_balances` (`balance` = total − posted allocations; **invoice status is not updated by
  payments**, read the balance), `finance_guardian_balances`. **Invoices are created as `draft` and nothing moves
  them to `issued`**; parents, debtors and balances treat every non-void invoice as owed, so filter with
  `.neq("status", "void")`, never `.in("status", ["issued", …])` (bank matching and the fee hold did, and saw nothing).
  For the same reason never show the stored status to people: `invoiceState()` (`src/lib/invoice-state.ts`) gives
  Unpaid / Part paid / Overdue (past the due date, Lagos time) / Paid / Cancelled from the balance, and
  `InvoiceStatusBadge` (finance-ui) shows it in admin; the portal fees page uses it too. Invoice numbers `INV-YYYY-00001` come from a trigger.
- **Payment IDs** (`20261101_payment_ids_bank_inbox.sql`): `revenue_categories.payment_code` (2–8 A–Z/0–9, unique,
  reserved words in `src/lib/payment-codes.ts`). Parents write `<admission number> <payment ID>` in the bank
  transfer description. Invoice page and the portal show the exact text.
- **Bank inbox**: table `finance_bank_lines` (admin-only RLS, unique `fingerprint` so a line is never added twice,
  `status pending|recorded|ignored`, `match_level auto|review|none`). `record_bank_line(line, invoice, student)` creates
  the posted payment (`provider 'bank'`, `provider_txn_id` = fingerprint, which the existing unique index turns into a
  second guard against double posting) and allocates `least(amount, balance)`; the rest is kept as paid in advance.
  `record_bank_line_unchecked` is for the service key only.
- Code: `src/lib/bank-match.ts` (pure: `parseStatement`, `parseEmailAlert`, `matchLine`, `fingerprintAll`),
  `src/lib/bank-import.ts` (loads students/codes/open invoices, stores lines, records sure ones),
  `src/app/admin/finance/payments/import/page.tsx` (upload/paste, inbox, confirm/ignore),
  `src/app/api/finance/bank-alert/route.ts` (email alerts; header `x-bank-alert-secret` = `BANK_ALERT_SECRET`),
  setup for the school in `docs/BANK_ALERTS.md`.
- Other payment sources: Moniepoint webhook `src/app/api/payments/moniepoint/webhook/route.ts` (online, via
  `finance_payment_intents`), manual `payments/new`.

- **Correcting payments** (`20261120_payment_corrections.sql`, page `payments/[id]` + `actions.ts`,
  wording in `src/lib/payment-corrections.ts`): a recorded payment is **never edited or deleted**. The trigger
  `finance_payment_guard` locks amount, date, pupil, parent, term, method, provider and `corrects_payment_id`;
  only `reference` and `notes` can change. Deletes raise an error (even for the service key). Mistakes go through
  `reverse_payment(id, reason, note)`: status `void`, `void_reason` from a fixed list (only `other` takes text),
  `voided_at/by/by_name`. A reversed bank payment sends its bank line back to `pending`, and
  `record_bank_line_unchecked` then gives the new payment key `fingerprint#2`. The correct payment is entered
  with `corrects_payment_id` (the trigger insists the old one is reversed) from `payments/new?corrects=<id>`.
  Moving a payment to another invoice of the **same** pupil is `move_payment_invoice(id, invoice|null, reason)`;
  direct deletes/changes of `finance_payment_allocations` are refused. Every step lands in `finance_payment_log`
  (admins read, nobody writes except the triggers). Payments and allocations are **admins only** (they were
  `is_staff()` until 20261120). Test: `payment-corrections-pglite-test.mjs` in this folder (46 checks).
- Expenses: `finance_expenses` is admins only, never deleted (`finance_void_expense` with a reason, 20261119). Spending
  requests post their receipts here when they close (`spending-requests` skill); read spending with `.is("voided_at", null)`.

## Steps (changing how payments are matched)
1. Edit `bank-match.ts`; add the case to a throwaway test (see Verify) before touching pages.
2. A line is **auto** only when: known admission number or invoice number, payment ID matches an unpaid invoice of
   that child, and amount ≤ balance. Everything uncertain must be `review`, never recorded silently.
3. Keep the matcher pure (no database); loading happens in `bank-import.ts`.
4. Update `docs/BANK_ALERTS.md`, the Learn Centre guide ("Payment IDs and Bank Statements") and this skill.

## Rules
- Money records are admin-only (RLS `coalesce(is_admin(), false)`); never expose them to teachers or other staff.
- Never record a payment from the app without going through `record_bank_line` / the existing transaction + allocation
  pair, and never allocate more than the invoice balance.
- Matching must tolerate what banks do to descriptions: upper-case, slashes and spaces dropped (`GRE2026447SF`).
  Compare whole words only, so `GRE/2026/44` never matches `GRE/2026/447`.
- Same statement imported twice must change nothing (fingerprint). Identical lines inside one file keep both
  (occurrence counter).
- Amounts are Naira with 2 decimals; dates on statements are day-first (`30/10/2026`).

## Pitfalls we hit
- Until 20261120 the payment page saved over posted payments, could delete them, and any staff role could do the
  same in the database. Never add an edit form for a recorded payment's amount, date, pupil or method again.
- The Moniepoint webhook upserts the same payment again on retries. The guard lets identical values through and
  the log skips no-op updates; a retry on a reversed payment is refused (it stays reversed).
- Foreign keys with `on delete set null` (guardian, pupil, term) update payments from inside a trigger, so the
  guard allows a link to become empty when `pg_trigger_depth() > 1`.
- Allocations used to be the full amount even when the invoice owed less; new payments and moves now cap at the
  balance and keep the rest as paid in advance.
- Bank wording varies; the email reader only knows labels like Amount / Narration / Description / Remarks / Date /
  Reference. A new bank format needs a real example alert to add labels.
- A payment ID alone, or an admission number alone, is `review` (suggested, one click) rather than auto, on purpose.
- Statements export differently (debit/credit columns, or one signed Amount column, or Amount + CR/DR type). All three
  are handled in `parseStatement`; a header row is needed to tell credits from debits reliably.
- Server-action body limit is about 1 MB: a very large CSV must be split by month.

## Expert review
Before calling the work done, answer these as a school bursar and chartered accountant (30+ years) would. Where an answer needs a decision the school hasn't made, ask.

- **Every naira is traceable** from the source document (invoice, receipt, bank line) to the record and to the bank.
  Reconcile the bank to the records at least monthly and list differences for a person to explain.
- **Never edit posted money.** Mistakes are reversed or voided with a reason, and both entries stay. Nothing is
  deleted.
- **Segregation of duties.** Decided 2026-11-20: any admin can reverse a payment of any amount, with no second
  approval. The reason and who did it are in the payment history. Don't add an approval step unless the school asks.
- **Segregation of duties (general).** The person who records money is not the only one who approves or reconciles it. Ask
  who can do each step before building it.
- **Counted once.** Know which table is the record of each kind of money (fees owed, fees paid, money spent) and
  make every report read it from there.
- **Totals reproduce.** The same filter gives the same total next month; a figure on a report can be clicked back to
  its records.
- **Parents' trust.** A clear balance, a receipt for every payment and no surprise charges. Correct mistakes in the
  family's favour first, then investigate.
- **Nigerian practice.** Most money moves by transfer with messy narrations; cash is limited by CBN rules; stamp duty
  applies to transfers of ₦10,000 or more. Check current rules rather than relying on memory.

## Verify
```bash
npx tsc --noEmit -p . && npx next lint --dir src && npx next build
```
- Matcher/parsers: write a scratchpad test that imports `src/lib/bank-match.ts` and run it with `npx tsx` (install
  `tsx` in the scratchpad). Cover: slashes dropped, code stuck to the admission number, prefix collision
  (447 vs 44), debit rows skipped, same line twice, amount over balance.
- SQL: PGlite test as in the `supabase-migration` skill (admin ok; teacher and parent refused; record twice refused;
  overpayment split; service role can call the unchecked function).
