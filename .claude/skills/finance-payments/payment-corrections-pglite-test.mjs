// PGlite test for docs/migrations/20261120_payment_corrections.sql. Copy next to pglite-full-schema.mjs and
// pglite-split.mjs (supabase-migration skill), npm install @electric-sql/pglite@0.2.17, then: node <this file>
import { load, U } from "./pglite-full-schema.mjs";
const MIG = "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/20261120_payment_corrections.sql";
const db = await load([MIG, MIG]); // run twice
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function as(uid, fn) { await db.exec(`reset role; set test.uid='${uid}'; set role authenticated;`); try { return await fn(); } finally { await db.exec("reset role;"); } }
async function refused(uid, sql, m, re) { try { await as(uid, () => db.query(sql)); ok(false, m + " (was allowed)"); } catch (e) { ok(!re || re.test(e.message), m + " wrong error: " + e.message); } }
const q1 = async (sql) => (await db.query(sql)).rows;
const ADMIN = U(1), TEACHER = U(2), PARENT = U(3), FRONT = U(4);
const G = U(10), ST = U(20), ST2 = U(21), INV = U(30), INV2 = U(31), INV3 = U(32), LINE = U(40);
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) values ('${ADMIN}','a@x'),('${TEACHER}','t@x'),('${PARENT}','p@x'),('${FRONT}','f@x');
insert into profiles(id, role, full_name, email) values ('${ADMIN}','admin','Ada Admin','a@x'),('${TEACHER}','teacher','Tom Teacher','t@x'),('${PARENT}','parent','Pam Parent','p@x'),('${FRONT}','front_desk','Fred Front','f@x');
insert into guardians(id, full_name) values ('${G}','Pam Parent');
insert into guardian_user_links(guardian_id, user_id) values ('${G}','${PARENT}');
insert into students(id, first_name, last_name, level) values ('${ST}','Kemi','Ade','primary'),('${ST2}','Tobi','Ola','primary');
insert into student_guardians(student_id, guardian_id) values ('${ST}','${G}');
insert into finance_invoices(id, student_id, bill_to_guardian_id, invoice_no, status) values ('${INV}','${ST}','${G}','INV-1','draft'),('${INV2}','${ST}','${G}','INV-2','draft'),('${INV3}','${ST2}','${G}','INV-3','draft');
insert into finance_invoice_items(invoice_id, description, quantity, unit_amount) values ('${INV}','Fees',1,50000),('${INV2}','Fees',1,30000),('${INV3}','Fees',1,10000);
insert into finance_bank_lines(id, fingerprint, amount, narration, source, status) values ('${LINE}','fp1',20000,'GRE/1 SF','statement','pending');
set session_replication_role = origin;`);

// Admin records a payment with an invoice link
const P1 = (await as(ADMIN, () => q1(`insert into finance_payment_transactions(direction, student_id, guardian_id, amount, method, status) values ('inflow','${ST}','${G}',40000,'cash','posted') returning id`)))[0].id;
await as(ADMIN, () => db.query(`insert into finance_payment_allocations(payment_transaction_id, invoice_id, amount) values ('${P1}','${INV}',40000)`));
let log = await q1(`select action, done_by_name, invoice_number from finance_payment_log where payment_id='${P1}' order by created_at, action`);
ok(log.some((l) => l.action === "recorded" && l.done_by_name === "Ada Admin"), "recorded logged with name");
ok(log.some((l) => l.action === "invoice_linked" && l.invoice_number === "INV-1"), "invoice link logged");

// Other staff can't see or write payments
for (const [u, n] of [[TEACHER, "teacher"], [FRONT, "front desk"]]) {
  const seen = await as(u, () => q1(`select id from finance_payment_transactions`));
  ok(seen.length === 0, `${n} sees no payments`);
  await refused(u, `insert into finance_payment_transactions(direction, amount, status) values ('inflow',5,'posted')`, `${n} can't record`);
  const upd = await as(u, () => q1(`update finance_payment_transactions set notes='x' returning id`));
  ok(upd.length === 0, `${n} can't update`);
  await refused(u, `select reverse_payment('${P1}','duplicate',null)`, `${n} can't reverse`, /Only admins/);
  ok((await as(u, () => q1(`select * from finance_payment_log`))).length === 0, `${n} can't read the log`);
}
// Parent still sees own payment, not the log
ok((await as(PARENT, () => q1(`select id from finance_payment_transactions`))).length === 1, "parent sees own payment");
ok((await as(PARENT, () => q1(`select id from finance_payment_log`))).length === 0, "parent can't read the log");

// Locked fields
await refused(ADMIN, `update finance_payment_transactions set amount=45000 where id='${P1}'`, "admin can't change amount", /can't be changed/);
await refused(ADMIN, `update finance_payment_transactions set paid_at=now()-interval '3 days' where id='${P1}'`, "admin can't change date", /can't be changed/);
await refused(ADMIN, `update finance_payment_transactions set student_id='${ST2}' where id='${P1}'`, "admin can't change pupil", /can't be changed/);
await refused(ADMIN, `update finance_payment_transactions set status='void' where id='${P1}'`, "admin can't void directly", /Reverse this payment/);
await refused(ADMIN, `delete from finance_payment_transactions where id='${P1}'`, "admin can't delete");
await refused(ADMIN, `delete from finance_payment_allocations where payment_transaction_id='${P1}'`, "direct unlink refused", /Move to another invoice/);
await as(ADMIN, () => db.query(`update finance_payment_transactions set notes='Paid at the office', reference='R-9' where id='${P1}'`));
log = await q1(`select changes from finance_payment_log where payment_id='${P1}' and action='details_changed'`);
ok(log.length === 1 && log[0].changes.reference.to === "R-9", "notes/reference change logged");
// Service role can't delete either (trigger)
try { await db.query(`delete from finance_payment_transactions where id='${P1}'`); ok(false, "owner delete allowed"); } catch (e) { ok(/never deleted/.test(e.message), "owner delete blocked: " + e.message); }

// Move to another invoice
await refused(ADMIN, `select move_payment_invoice('${P1}','${INV2}','')`, "move needs a reason", /Say why/);
await refused(ADMIN, `select move_payment_invoice('${P1}','${INV3}','wrong one')`, "move to other pupil refused", /different pupil/);
const mv = (await as(ADMIN, () => q1(`select move_payment_invoice('${P1}','${INV2}','Meant for second term') as r`)))[0].r;
ok(mv.allocated == 30000 && mv.on_account == 10000, "move caps at balance " + JSON.stringify(mv));
log = await q1(`select action, reason, invoice_number from finance_payment_log where payment_id='${P1}' and action in ('invoice_unlinked','invoice_linked') order by created_at desc, action limit 2`);
ok(log.some((l) => l.action === "invoice_unlinked" && l.invoice_number === "INV-1" && l.reason === "Meant for second term"), "unlink logged with reason");
ok(log.some((l) => l.action === "invoice_linked" && l.invoice_number === "INV-2" && l.reason === "Meant for second term"), "relink logged with reason");
// GUC cleared: direct unlink still refused afterwards in the same session
await refused(ADMIN, `delete from finance_payment_allocations where payment_transaction_id='${P1}'`, "unlink still refused after move", /Move to another invoice/);

// Reverse
await refused(ADMIN, `select reverse_payment('${P1}','because',null)`, "reason must be from list", /from the list/);
await refused(ADMIN, `select reverse_payment('${P1}','other','  ')`, "other needs text", /Type the reason/);
await refused(ADMIN, `insert into finance_payment_transactions(direction, student_id, amount, status, corrects_payment_id) values ('inflow','${ST}',4000,'posted','${P1}')`, "can't correct a payment not yet reversed", /Reverse the wrong/);
await as(ADMIN, () => db.query(`select reverse_payment('${P1}','wrong_amount',null)`));
let p = (await q1(`select status, void_reason, voided_by_name, voided_at from finance_payment_transactions where id='${P1}'`))[0];
ok(p.status === "void" && p.void_reason === "wrong_amount" && p.voided_by_name === "Ada Admin" && p.voided_at, "reversal stored");
ok((await q1(`select 1 from finance_payment_log where payment_id='${P1}' and action='reversed' and reason='wrong_amount'`)).length === 1, "reversal logged");
ok((await q1(`select 1 from finance_payment_allocations where payment_transaction_id='${P1}'`)).length === 1, "allocation kept on reversed payment");
const bal = (await q1(`select balance from finance_invoice_balances where invoice_id='${INV2}'`))[0].balance;
ok(Number(bal) === 30000, "reversed payment no longer counts: balance " + bal);
await refused(ADMIN, `select reverse_payment('${P1}','duplicate',null)`, "reverse twice refused", /already/);
await refused(ADMIN, `update finance_payment_transactions set status='posted' where id='${P1}'`, "un-reverse refused", /stays reversed/);
await refused(ADMIN, `select move_payment_invoice('${P1}','${INV}','x again')`, "move reversed refused", /reversed/);
await refused(ADMIN, `insert into finance_payment_allocations(payment_transaction_id, invoice_id, amount) values ('${P1}','${INV}',5)`, "link reversed refused", /reversed/);
await refused(ADMIN, `insert into finance_payment_transactions(direction, amount, status) values ('inflow',5,'void')`, "can't insert void");
// Re-entry linked
const P2 = (await as(ADMIN, () => q1(`insert into finance_payment_transactions(direction, student_id, guardian_id, amount, method, status, corrects_payment_id) values ('inflow','${ST}','${G}',45000,'cash','posted','${P1}') returning id`)))[0].id;
ok(!!P2, "corrected payment entered");

// Bank line: record, reverse, record again
const r1 = (await as(ADMIN, () => q1(`select record_bank_line('${LINE}','${INV}',null) as r`)))[0].r;
const rv = (await as(ADMIN, () => q1(`select reverse_payment('${r1.payment_id}','wrong_pupil',null) as r`)))[0].r;
ok(rv.bank_line_reopened === true, "bank line reopened");
ok((await q1(`select status from finance_bank_lines where id='${LINE}'`))[0].status === "pending", "line pending again");
const r2 = (await as(ADMIN, () => q1(`select record_bank_line('${LINE}','${INV}',null) as r`)))[0].r;
ok((await q1(`select provider_txn_id from finance_payment_transactions where id='${r2.payment_id}'`))[0].provider_txn_id === "fp1#2", "second recording gets fp1#2");

// Webhook-style upsert of the same values (service role/owner): no error, no new log row
const before = (await q1(`select count(*)::int n from finance_payment_log`))[0].n;
const up = `insert into finance_payment_transactions(direction, amount, currency, provider, provider_txn_id, method, reference, status) values ('inflow',7000,'NGN','moniepoint','mp1','online','ref1','posted') on conflict (provider, provider_txn_id) do update set direction=excluded.direction, amount=excluded.amount, currency=excluded.currency, method=excluded.method, reference=excluded.reference, status=excluded.status returning id`;
await db.query(up); await db.query(up);
ok((await q1(`select count(*)::int n from finance_payment_log`))[0].n === before + 1, "repeat upsert logs once");

// Deleting a guardian still works (FK set null)
await db.exec(`set session_replication_role = origin; delete from guardian_user_links; delete from student_guardians;`);
try { await db.query(`update finance_invoices set bill_to_guardian_id = null where false`); await db.query(`insert into guardians(id, full_name) values ('${U(11)}','Temp')`); const P3 = (await q1(`insert into finance_payment_transactions(direction, guardian_id, amount, status) values ('inflow','${U(11)}',100,'posted') returning id`))[0].id; await db.query(`delete from guardians where id='${U(11)}'`); ok((await q1(`select guardian_id from finance_payment_transactions where id='${P3}'`))[0].guardian_id === null, "guardian delete clears link"); } catch (e) { ok(false, "guardian delete: " + e.message); }

console.log(`${pass} passed, ${fail} failed`);
