---
name: finance-payments
description: Use for anything about fees, invoices, payments, debtors, payment IDs, bank statements or bank email alerts (Finance in /admin, Fees & billing in /portal).
---

# Finance: invoices, payments and bank matching

## When to use
Changes to money records and how payments reach them. Table or RLS changes also need the `supabase-migration`
skill; new pages also need `admin-portal-page`. Result/report-card money questions are not here.

## Where things live
- Pages: `src/app/admin/finance/**` (admin only, `/admin/finance` is in `adminOnlyPrefixes`), parent view
  `src/app/portal/billing/page.tsx`. Shared bits: `finance/_components/finance-ui.tsx` (`fmtMoney`, `currencyPrefix`,
  `fmtDate`, badges) and `finance-server.ts` (`toastUrl`).
- Tables: `finance_invoices` (+ `_items` with `revenue_category_id`, `_adjustments`), `finance_payment_transactions`
  (inflow/outflow, `status posted|void`), `finance_payment_allocations` (payment → invoice, unique per pair),
  views `finance_invoice_balances` (`balance` = total − posted allocations; **invoice status is not updated by
  payments**, read the balance), `finance_guardian_balances`. Invoice numbers `INV-YYYY-00001` come from a trigger.
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
- Bank wording varies; the email reader only knows labels like Amount / Narration / Description / Remarks / Date /
  Reference. A new bank format needs a real example alert to add labels.
- A payment ID alone, or an admission number alone, is `review` (suggested, one click) rather than auto, on purpose.
- Statements export differently (debit/credit columns, or one signed Amount column, or Amount + CR/DR type). All three
  are handled in `parseStatement`; a header row is needed to tell credits from debits reliably.
- Server-action body limit is about 1 MB: a very large CSV must be split by month.

## Verify
```bash
npx tsc --noEmit -p . && npx next lint --dir src && npx next build
```
- Matcher/parsers: write a scratchpad test that imports `src/lib/bank-match.ts` and run it with `npx tsx` (install
  `tsx` in the scratchpad). Cover: slashes dropped, code stuck to the admission number, prefix collision
  (447 vs 44), debit rows skipped, same line twice, amount over balance.
- SQL: PGlite test as in the `supabase-migration` skill (admin ok; teacher and parent refused; record twice refused;
  overpayment split; service role can call the unchecked function).
