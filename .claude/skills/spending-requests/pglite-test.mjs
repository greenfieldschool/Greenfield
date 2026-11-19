// PGlite test for spending requests. From a scratchpad folder with @electric-sql/pglite@0.2.17 installed and the
// supabase-migration helpers (pglite-full-schema.mjs, pglite-split.mjs) copied next to this file:
//   node pglite-test.mjs <repo>/docs/schema.sql <repo>/docs/migrations/20261119_spending_requests.sql
import { load, U } from "./pglite-full-schema.mjs";

const [, , schemaPath, migration] = process.argv;
process.argv[2] = schemaPath;
const db = await load([migration, migration]); // run twice: must be safe

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log("FAIL:", m); } };
async function as(uid, sql, params) {
  await db.exec(`reset role; set test.uid = '${uid ?? ""}';`);
  if (uid === "service") { await db.exec(`set test.uid = ''; set role service_role;`); }
  else if (uid) await db.exec(`set role authenticated;`);
  else await db.exec(`set role anon;`);
  try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role;"); }
}
const refused = async (uid, sql, params, m) => { const r = await as(uid, sql, params); ok(!!r.error, `${m} should be refused`); return r; };
const allowed = async (uid, sql, params, m) => { const r = await as(uid, sql, params); ok(!r.error, `${m}: ${r.error}`); return r; };

await db.exec(`alter role service_role bypassrls; grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;`); // Supabase grants these; RLS decides
const SA = U(1), SA2 = U(2), P = U(3), T1 = U(4), C = U(5), R = U(6), N = U(7), G = U(8), A2 = U(9);
const people = [[SA, "super_admin", "Proprietor"], [SA2, "super_admin", "Developer"], [P, "admin", "Principal"], [T1, "teacher", "Head of Primary"],
  [C, "front_desk", "Bursar"], [R, "teacher", "Mrs Requester"], [N, "nurse", "Nurse"], [G, "parent", "A Parent"], [A2, "admin", "Office Admin"]];
await db.exec(`set session_replication_role = replica;`);
for (const [id, role, name] of people) {
  await db.query(`insert into auth.users(id, email) values ($1, $2)`, [id, `${name.replace(/\W/g, "").toLowerCase()}@x.ng`]);
  await db.query(`insert into public.profiles(id, role, full_name, email) values ($1, $2, $3, $4)`, [id, role, name, `${name.replace(/\W/g, "").toLowerCase()}@x.ng`]);
}
await db.exec(`
insert into public.academic_years(id, name) values ('${U(100)}', '2026/2027') on conflict do nothing;
insert into public.academic_terms(id, academic_year_id, name, starts_on, ends_on, is_active) values ('${U(101)}', '${U(100)}', 'First term', current_date - 30, current_date + 60, true);
insert into public.expense_categories(id, name) values ('${U(200)}', 'Diesel'), ('${U(201)}', 'Repairs');
insert into public.finance_expenses(id, category_id, amount, description) values ('${U(300)}', '${U(200)}', 1000, 'old manual expense');
set session_replication_role = origin;`);
const DIESEL = U(200), REPAIRS = U(201);

// ---- permissions
await refused(P, `select public.spending_set_permission($1, 50000, false)`, [T1], "admin giving spending permissions");
await allowed(SA, `select public.spending_set_permission($1, 50000, false)`, [T1], "super admin gives approver limit");
await allowed(SA, `select public.spending_set_permission($1, 250000, false)`, [P], "principal limit");
await allowed(SA, `select public.spending_set_permission($1, null, true)`, [C], "cashier");
await refused(SA, `select public.spending_set_permission($1, 5000000, false)`, [SA], "super admin changing own permission (two exist)");
await allowed(SA2, `select public.spending_set_permission($1, 5000000, false)`, [SA], "another super admin sets proprietor");
await refused(SA, `select public.spending_set_permission($1, 1000, false)`, [G], "permission for a parent");
let r = await as("service", `select count(*)::int n from public.spending_permission_log`);
ok(r.rows[0].n === 4, "4 permission changes logged, got " + r.rows[0].n);
await allowed(SA, `select public.spending_set_permission($1, 50000, false)`, [T1], "same permission again");
r = await as("service", `select count(*)::int n from public.spending_permission_log`);
ok(r.rows[0].n === 4, "no-op permission change not logged");

// ---- asking
const advance = (amount, extra = {}) => JSON.stringify({ kind: "advance", category_id: DIESEL, purpose: "Diesel for generator", amount,
  payee: { name: "x", bank_name: "GTBank", bank_code: "058", account_number: "0123456789", account_name: "MRS REQUESTER", checked: true }, ...extra });
await refused(G, `select public.spending_save_request($1::jsonb)`, [advance(20000)], "parent asking for money");
await refused(null, `select public.spending_save_request($1::jsonb)`, [advance(20000)], "signed-out asking");
await refused(R, `select public.spending_save_request($1::jsonb)`, [advance(20000, { payee: { ...JSON.parse(advance(1)).payee, account_number: "123" } })], "bad account number");
r = await allowed(R, `select public.spending_save_request($1::jsonb) id`, [advance(20000)], "teacher asks for an advance");
const REQ1 = r.rows[0].id;
r = await as(R, `select request_no, status, flags, approvals_needed, payee_id from public.spending_requests where id = $1`, [REQ1]);
ok(/^SR-\d{4}-00001$/.test(r.rows[0]?.request_no), "request number " + r.rows[0]?.request_no);
ok(r.rows[0]?.flags.includes("new_bank_details"), "new bank details flagged");
const PAYEE_R = r.rows[0]?.payee_id;
r = await as(N, `select count(*)::int n from public.spending_requests`);
ok(r.rows[0].n === 0, "nurse without permission sees no one else's requests");
r = await as(T1, `select count(*)::int n from public.spending_requests`);
ok(r.rows[0].n === 1, "approver sees requests");
await refused(R, `update public.spending_requests set amount = 1 where id = $1`, [REQ1], "requester editing the row directly");
await refused(R, `insert into public.spending_events(request_id, action) values ($1, 'x')`, [REQ1], "writing history directly");
r = await as("service", `select count(*)::int n from public.email_outbox where category = 'spending' and ref_id = $1`, [REQ1]);
ok(r.rows[0].n >= 3, "approvers emailed about the new request, got " + r.rows[0].n);

// ---- deciding
await refused(R, `select public.spending_decide($1, 'approve')`, [REQ1], "approving own request");
await refused(N, `select public.spending_decide($1, 'approve')`, [REQ1], "nurse approving");
await refused(T1, `select public.spending_decide($1, 'decline', 'other', '')`, [REQ1], "decline Other without a note");
r = await allowed(T1, `select public.spending_decide($1, 'approve') d`, [REQ1], "head approves");
ok(r.rows[0]?.d === "approved", "one approval is enough under the second-approval amount");
await refused(T1, `select public.spending_decide($1, 'approve')`, [REQ1], "approving twice");
r = await as("service", `select count(*)::int n from public.email_outbox where ref_id = $1 and to_email = 'bursar@x.ng'`, [REQ1]);
ok(r.rows[0].n === 1, "cashier emailed when approved");

// ---- paying by hand
await refused(T1, `select public.spending_record_payout($1, 'bank_app', 'REF1')`, [REQ1], "approver without pay permission paying");
await refused(C, `select public.spending_record_payout($1, 'bank_app', '')`, [REQ1], "transfer without reference");
await refused(C, `select public.spending_record_payout($1, 'bank_app', 'REF1', $2)`, [REQ1, `${R}/${U(900)}.jpg`], "slip in someone else's folder");
r = await allowed(C, `select public.spending_record_payout($1, 'bank_app', 'TRF-889') s`, [REQ1], "cashier records transfer");
ok(r.rows[0]?.s === "paid", "advance waits to be accounted for");
r = await as(R, `select status, due_by, paid_by_name from public.spending_requests where id = $1`, [REQ1]);
ok(r.rows[0].status === "paid" && r.rows[0].due_by && r.rows[0].paid_by_name === "Bursar", "paid, due date set, payer named");
r = await as("service", `select count(*)::int n from public.finance_expenses where spending_request_id = $1`, [REQ1]);
ok(r.rows[0].n === 0, "paying an advance is not spending yet");
await refused(C, `select public.spending_record_payout($1, 'bank_app', 'TRF-889')`, [REQ1], "paying twice");
await refused(R, `select public.spending_cancel($1, 'no_longer_needed')`, [REQ1], "cancelling a paid request");

// ---- accounting
const H = (n) => String(n).padStart(64, "a");
await refused(C, `select public.spending_add_receipt($1, $2::jsonb)`, [REQ1, JSON.stringify({ path: `${C}/${U(901)}.jpg`, hash: H(1), amount: 100, vendor: "x", spent_on: "2026-11-01" })], "someone else adding receipts");
await allowed(R, `select public.spending_add_receipt($1, $2::jsonb)`, [REQ1, JSON.stringify({ path: `${R}/${U(902)}.jpg`, hash: H(2), amount: 15000, vendor: "Total filling station", spent_on: new Date().toISOString().slice(0, 10) })], "receipt with photo");
await refused(R, `select public.spending_add_receipt($1, $2::jsonb)`, [REQ1, JSON.stringify({ amount: 3000, vendor: "Keke", spent_on: "2026-11-01" })], "no photo and no reason");
await refused(R, `select public.spending_add_receipt($1, $2::jsonb)`, [REQ1, JSON.stringify({ amount: 3000, vendor: "Keke", spent_on: "2026-11-01", no_receipt_reason: "other" })], "Other without a note");
await allowed(R, `select public.spending_add_receipt($1, $2::jsonb)`, [REQ1, JSON.stringify({ amount: 3000, vendor: "Keke rider", spent_on: "2026-11-01", no_receipt_reason: "transport_fare" })], "no-receipt transport fare");
await refused(R, `select public.spending_send_accounting($1, 1000)`, [REQ1], "receipts + change not matching");
await allowed(R, `select public.spending_send_accounting($1, 2000)`, [REQ1], "send for checking with ₦2,000 change");
await refused(R, `select public.spending_check_accounting($1, 'accept')`, [REQ1], "checking own receipts");
await refused(N, `select public.spending_check_accounting($1, 'accept')`, [REQ1], "nurse checking receipts");
await allowed(C, `select public.spending_check_accounting($1, 'accept')`, [REQ1], "cashier accepts");
r = await as("service", `select count(*)::int n, sum(amount)::numeric s from public.finance_expenses where spending_request_id = $1 and voided_at is null`, [REQ1]);
ok(r.rows[0].n === 2 && Number(r.rows[0].s) === 18000, "two expense records totalling 18,000 (change not spent)");
r = await as("service", `select status from public.spending_requests where id = $1`, [REQ1]);
ok(r.rows[0].status === "closed", "closed");

// ---- duplicate receipt picture, supplier request with two approvals and Paystack
const supplier = (amount, hash) => JSON.stringify({ kind: "supplier", category_id: REPAIRS, purpose: "Roof repair", amount,
  payee: { name: "Adebayo Roofing", bank_name: "Access Bank", bank_code: "044", account_number: "1112223334", account_name: "ADEBAYO ROOFING" },
  receipts: [{ path: `${R}/${U(903)}.pdf`, hash, amount, vendor: "Adebayo Roofing", spent_on: "2026-11-02" }] });
await refused(R, `select public.spending_save_request($1::jsonb)`, [supplier(300000, H(2))], "same receipt picture used twice");
await refused(R, `select public.spending_save_request($1::jsonb)`, [JSON.stringify({ ...JSON.parse(supplier(300000, H(3))), receipts: [] })], "supplier without invoice");
r = await allowed(R, `select public.spending_save_request($1::jsonb) id`, [supplier(300000, H(3))], "supplier request");
const REQ2 = r.rows[0].id;
r = await as(R, `select approvals_needed from public.spending_requests where id = $1`, [REQ2]);
ok(r.rows[0].approvals_needed === 2, "two approvals above ₦250,000");
await refused(T1, `select public.spending_decide($1, 'approve')`, [REQ2], "approver whose limit doesn't cover it");
r = await allowed(P, `select public.spending_decide($1, 'approve') d`, [REQ2], "principal first approval");
ok(r.rows[0]?.d === "first_approval", "still waiting for a second approval");
await allowed(SA, `select public.spending_decide($1, 'approve')`, [REQ2], "proprietor final approval");
await refused(C, `select public.spending_paystack_result('x', 'success')`, [], "cashier faking a Paystack result");
r = await allowed(C, `select public.spending_paystack_begin($1) b`, [REQ2], "cashier starts Paystack payment");
const ref1 = r.rows[0].b.reference;
ok(/^greenfield-sr-\d{4}-00002-1$/.test(ref1), "Paystack reference " + ref1);
await refused(C, `select public.spending_paystack_begin($1)`, [REQ2], "starting a second payment while one is in progress");
r = await allowed("service", `select public.spending_paystack_result($1, 'failed', null, 'Insufficient balance') s`, [ref1], "failure");
ok(r.rows[0].s === "failed", "back to approved after failure");
r = await allowed(C, `select public.spending_paystack_begin($1) b`, [REQ2], "retry");
const ref2 = r.rows[0].b.reference;
ok(ref2.endsWith("-2"), "retry gets a new reference");
await allowed("service", `select public.spending_paystack_result($1, 'otp', 'TRF_abc')`, [ref2], "waiting for code");
r = await allowed("service", `select public.spending_paystack_result($1, 'success', 'TRF_abc') s`, [ref2], "success");
ok(r.rows[0].s === "closed", "supplier payment closes the request");
r = await allowed("service", `select public.spending_paystack_result($1, 'success', 'TRF_abc') s`, [ref2], "same webhook twice");
ok(r.rows[0].s === "ignored", "second success ignored");
r = await as("service", `select count(*)::int n, sum(amount)::numeric s from public.finance_expenses where spending_request_id = $1`, [REQ2]);
ok(r.rows[0].n === 2 && Number(r.rows[0].s) === 300100, "invoice + ₦100 charge posted once, got " + r.rows[0].n + "/" + r.rows[0].s);
await allowed("service", `select public.spending_paystack_result($1, 'reversed')`, [ref2], "reversal after success");
r = await as("service", `select flags from public.spending_requests where id = $1`, [REQ2]);
ok(r.rows[0].flags.includes("payment_reversed"), "reversal flagged");

// ---- approver paying what they approved
r = await allowed(R, `select public.spending_save_request($1::jsonb) id`, [advance(10000, { category_id: REPAIRS, payee_id: PAYEE_R, payee: undefined })], "second advance with saved bank details");
const REQ3 = r.rows[0].id;
await allowed(SA, `select public.spending_set_permission($1, 250000, true)`, [P], "principal can also pay");
await allowed(P, `select public.spending_decide($1, 'approve')`, [REQ3], "principal approves");
await refused(P, `select public.spending_record_payout($1, 'cash', null)`, [REQ3], "approver paying without a note");
await allowed(P, `select public.spending_record_payout($1, 'cash', null, null, 0, 'Bursar on leave')`, [REQ3], "approver paying small amount with a note");

// ---- overdue advance blocks a new one; split check; cancel; send back and resubmit
await db.exec(`update public.spending_requests set due_by = current_date - 5 where id = '${REQ3}'`);
await refused(R, `select public.spending_save_request($1::jsonb)`, [advance(5000, { payee_id: PAYEE_R, payee: undefined })], "new advance while one is overdue");
r = await allowed(R, `select public.spending_save_request($1::jsonb) id`, [JSON.stringify({ ...JSON.parse(supplier(30000, H(4))), category_id: DIESEL, payee: { name: "Total", bank_name: "Zenith", bank_code: "057", account_number: "2223334445" }, receipts: [{ path: `${R}/${U(904)}.jpg`, hash: H(4), amount: 30000, vendor: "Total", spent_on: "2026-11-03" }] })], "supplier diesel 30k");
const REQ4 = r.rows[0].id;
r = await allowed(R, `select public.spending_save_request($1::jsonb) id`, [JSON.stringify({ ...JSON.parse(supplier(30000, H(5))), category_id: DIESEL, payee: { name: "Total", bank_name: "Zenith", bank_code: "057", account_number: "2223334445" }, receipts: [{ path: `${R}/${U(905)}.jpg`, hash: H(5), amount: 30000, vendor: "Total", spent_on: "2026-11-04" }] })], "another diesel 30k");
const REQ5 = r.rows[0].id;
r = await as(R, `select flags from public.spending_requests where id = $1`, [REQ5]);
ok(r.rows[0].flags.includes("split_check"), "split check flagged: " + r.rows[0].flags);
await refused(R, `select public.spending_save_request($1::jsonb)`, [JSON.stringify({ ...JSON.parse(supplier(1000, H(6))), payee: { name: "Other name", bank_name: "Zenith", bank_code: "057", account_number: "2223334445" }, receipts: [{ path: `${R}/${U(906)}.jpg`, hash: H(6), amount: 1000, vendor: "x", spent_on: "2026-11-03" }] })], "same account under a second supplier name");
await allowed(T1, `select public.spending_decide($1, 'send_back', 'need_quote')`, [REQ4], "send back");
r = await allowed(R, `select public.spending_save_request($1::jsonb) id`, [JSON.stringify({ ...JSON.parse(supplier(25000, H(4))), id: REQ4, category_id: DIESEL, payee: { name: "Total", bank_name: "Zenith", bank_code: "057", account_number: "2223334445" }, receipts: [{ path: `${R}/${U(904)}.jpg`, hash: H(4), amount: 25000, vendor: "Total", spent_on: "2026-11-03" }] })], "resubmit with the same receipt picture");
r = await as(R, `select status, amount from public.spending_requests where id = $1`, [REQ4]);
ok(r.rows[0].status === "submitted" && Number(r.rows[0].amount) === 25000, "resubmitted");
await allowed(R, `select public.spending_cancel($1, 'no_longer_needed')`, [REQ5], "cancel own waiting request");
await refused(T1, `select public.spending_decide($1, 'approve')`, [REQ5], "approving a cancelled request");

// ---- money records are admins only now
r = await as(R, `select count(*)::int n from public.finance_expenses`);
ok(r.rows[0].n === 0, "teacher sees no expense records");
await refused(R, `insert into public.finance_expenses(category_id, amount) values ($1, 5)`, [DIESEL], "teacher adding an expense");
await refused(N, `delete from public.finance_expenses`, [], "nurse deleting expenses");
await refused(P, `delete from public.finance_expenses where id = $1`, [U(300)], "admin deleting an expense");
await refused(P, `update public.finance_expenses set amount = 1 where id = $1`, [U(300)], "admin editing an expense");
await refused(P, `insert into public.finance_expenses(category_id, amount, spending_request_id) values ($1, 5, $2)`, [DIESEL, REQ1], "admin faking a request expense");
await allowed(P, `insert into public.finance_expenses(category_id, amount) values ($1, 5)`, [DIESEL], "admin adds a manual expense");
r = await as(R, `select count(*)::int n from public.expense_categories`);
ok(r.rows[0].n >= 3, "staff can read categories");
await refused(R, `insert into public.expense_categories(name) values ('Mine')`, [], "teacher adding a category");
r = await as(R, `select count(*)::int n from public.finance_budgets`);
ok(r.rows[0].n === 0, "teacher can't read budgets");
await refused(P, `select public.finance_void_expense($1, 'other', '')`, [U(300)], "void Other without note");
await allowed(P, `select public.finance_void_expense($1, 'entered_twice')`, [U(300)], "admin voids a manual expense");
r = await as("service", `select id from public.finance_expenses where spending_request_id = $1 limit 1`, [REQ1]);
await refused(P, `select public.finance_void_expense($1, 'entered_twice')`, [r.rows[0].id], "voiding an expense that came from a request");

// ---- figures, counts, top-ups, settings, files, daily run
r = await allowed(R, `select * from public.spending_category_figures()`, [], "figures");
ok(r.rows.length >= 3, "figures per category");
r = await as(G, `select * from public.spending_category_figures()`);
ok(!r.rows?.length, "parent gets no figures");
r = await allowed(T1, `select public.spending_my_counts() c`, [], "counts");
ok(r.rows[0].c.to_approve === 1, "head has one to approve (REQ4), got " + JSON.stringify(r.rows[0].c));
await refused(R, `select public.spending_record_topup(500000, current_date, 'TRF')`, [], "teacher recording a top-up");
await allowed(C, `select public.spending_record_topup(500000, current_date, 'TRF')`, [], "cashier records a top-up");
await refused(P, `select public.spending_save_settings('{"second_approval_above": 1}'::jsonb)`, [], "admin changing settings");
await allowed(SA, `select public.spending_save_settings('{"account_within_days": 5}'::jsonb)`, [], "super admin changes settings");
r = await as("service", `select changes from public.spending_permission_log where subject = 'settings'`);
ok(r.rows.length === 1 && r.rows[0].changes.account_within_days, "settings change logged");
await allowed(R, `insert into storage.objects(bucket_id, name) values ('spending-files', $1)`, [`${R}/${U(950)}.jpg`], "upload into own folder");
await refused(R, `insert into storage.objects(bucket_id, name) values ('spending-files', $1)`, [`${C}/${U(951)}.jpg`], "upload into someone else's folder");
await refused(G, `insert into storage.objects(bucket_id, name) values ('spending-files', $1)`, [`${G}/${U(952)}.jpg`], "parent uploading");
r = await as(N, `select count(*)::int n from storage.objects where bucket_id = 'spending-files'`);
ok(r.rows[0].n === 0, "nurse can't see others' receipt files");
r = await as(C, `select count(*)::int n from storage.objects where bucket_id = 'spending-files'`);
ok(r.rows[0].n === 1, "cashier can see receipt files");
await refused(R, `select public.spending_daily_run()`, [], "teacher running the daily job");
r = await allowed("service", `select public.spending_daily_run() n`, [], "daily run");
ok(r.rows[0].n >= 2, "daily run queued reminders and summaries, got " + r.rows[0].n);
r = await as("service", `select count(*)::int n from public.spending_events`);
ok(r.rows[0].n > 15, "history recorded");
r = await as("service", `select count(*)::int n from public.spending_events where done_by_name is null`);
ok(r.rows[0].n === 0, "every history row names who");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
