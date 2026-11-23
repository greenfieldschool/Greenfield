// PGlite test for docs/migrations/20261122_payment_plans.sql. Copy next to pglite-full-schema.mjs and
// pglite-split.mjs (supabase-migration skill), npm install @electric-sql/pglite@0.2.17, then: node <this file>
import { load, U } from "./pglite-full-schema.mjs";
const REPO = "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/";
const MIG = REPO + "20261122_payment_plans.sql";
const db = await load([REPO + "20261120_payment_corrections.sql", MIG, MIG]); // run twice
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function as(uid, fn, role = "authenticated") { await db.exec(`reset role; set test.uid='${uid}'; set role ${role};`); try { return await fn(); } finally { await db.exec("reset role;"); } }
async function refused(uid, sql, m, re) { try { await as(uid, () => db.query(sql)); ok(false, m + " (was allowed)"); } catch (e) { ok(!re || re.test(e.message), m + " wrong error: " + e.message); } }
const q = async (sql) => (await db.query(sql)).rows;
const ADMIN = U(1), TEACHER = U(2), PARENT = U(3), PARENT2 = U(4), PUPIL = U(5);
const G = U(10), G2 = U(11), ST = U(20), ST2 = U(21), Y = U(25), T_PAST = U(26), T_FUT = U(27);
const INV = U(30), INV2 = U(31), INV_F = U(32), INV_D = U(33);
const RC_T = U(40), RC_B = U(41);
const today = (await q(`select (now() at time zone 'Africa/Lagos')::date as d`))[0].d;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) values ('${ADMIN}','a@x'),('${TEACHER}','t@x'),('${PARENT}','p@x'),('${PARENT2}','q@x'),('${PUPIL}','s@x');
insert into profiles(id, role, full_name, email) values ('${ADMIN}','admin','Ada Admin','a@x'),('${TEACHER}','teacher','Tom Teacher','t@x'),('${PARENT}','parent','Pam Parent','p@x'),('${PARENT2}','parent','Quin Parent','q@x'),('${PUPIL}','student','Kemi','s@x');
insert into guardians(id, full_name, email, phone) values ('${G}','Pam Parent','p@x','0801'),('${G2}','Quin Parent','q@x','0802');
insert into guardian_user_links(guardian_id, user_id) values ('${G}','${PARENT}'),('${G2}','${PARENT2}');
insert into students(id, first_name, last_name, level) values ('${ST}','Kemi','Ade','primary'),('${ST2}','Tobi','Ola','primary');
insert into student_guardians(student_id, guardian_id) values ('${ST}','${G}'),('${ST2}','${G2}');
insert into student_user_links(student_id, user_id) values ('${ST}','${PUPIL}');
insert into academic_years(id, name) values ('${Y}','2026/27');
insert into academic_terms(id, academic_year_id, name, starts_on, ends_on) values
  ('${T_PAST}','${Y}','First', current_date - 60, current_date + 20),
  ('${T_FUT}','${Y}','Second', current_date + 30, current_date + 110);
insert into revenue_categories(id, name, is_tuition) values ('${RC_T}','Tuition',true),('${RC_B}','Books',false);
insert into finance_invoices(id, student_id, bill_to_guardian_id, invoice_no, status, academic_year_id, academic_term_id) values
  ('${INV}','${ST}','${G}','INV-1','draft','${Y}','${T_PAST}'),
  ('${INV2}','${ST2}','${G2}','INV-2','draft','${Y}','${T_PAST}'),
  ('${INV_F}','${ST}','${G}','INV-3','draft','${Y}','${T_FUT}'),
  ('${INV_D}','${ST}','${G}','INV-4','draft','${Y}','${T_FUT}');
insert into finance_invoice_items(invoice_id, description, quantity, unit_amount, revenue_category_id) values
  ('${INV}','Tuition',1,100001,'${RC_T}'),('${INV2}','Fees',1,50000,null),('${INV_F}','Tuition',1,200000,'${RC_T}'),
  ('${INV_D}','Tuition',1,100000,'${RC_T}'),('${INV_D}','Books',1,20000,'${RC_B}');
set session_replication_role = origin;`);

// 1. The leak is closed
const seen = async (uid, role, rel) => (await as(uid, () => q(`select * from ${rel}`), role)).length;
ok((await seen(PARENT, "authenticated", "finance_invoice_balances")) === 3, "parent sees own 3 balances");
ok((await seen(PARENT2, "authenticated", "finance_invoice_balances")) === 1, "parent2 sees own 1");
ok((await seen(TEACHER, "authenticated", "finance_invoice_balances")) === 4, "teacher sees all (fee hold)");
ok((await seen(PARENT, "authenticated", "finance_guardian_balances")) === 1, "parent sees only own guardian balance");
for (const rel of ["finance_invoice_balances", "finance_guardian_balances", "finance_invoice_totals"]) {
  try { await as("", () => db.query(`select * from ${rel}`), "anon"); ok(false, `signed-out can read ${rel}`); } catch { ok(true, ""); }
}
// 2. Invoices: teachers read, admins write
ok((await as(TEACHER, () => q(`update finance_invoices set notes='x' returning id`))).length === 0, "teacher can't edit invoice");
await refused(TEACHER, `insert into finance_invoice_adjustments(invoice_id,type,amount) values ('${INV}','discount',5)`, "teacher can't add adjustment");
ok((await as(ADMIN, () => q(`update finance_invoices set notes='ok' where id='${INV}' returning id`))).length === 1, "admin can edit invoice");

// 3. Preview: amounts add up, dates follow the policy
const pv = await as(PARENT, () => q(`select * from preview_payment_plan('${INV}', 3) order by seq`));
ok(pv.length === 3 && Number(pv[0].amount) === 40000.4 && Number(pv[1].amount) === 30000.3 && Number(pv[2].amount) === 30000.3, "3-plan amounts " + pv.map((r) => r.amount));
const starts = (await q(`select starts_on from academic_terms where id='${T_PAST}'`))[0].starts_on;
ok(iso(pv[0].due_date) === iso(starts), "first due on day one");
const dow = (await q(`select extract(isodow from due_date)::int d from preview_payment_plan('${INV}', 3) where seq=2`))[0].d;
ok(dow === 5, "week 4 payment is due on a Friday");
const p5 = await q(`select * from preview_payment_plan('${INV}', 5) order by seq`);
ok(Math.round(p5.reduce((s, r) => s + Number(r.amount), 0) * 100) === 10000100 && iso(p5[4].due_date) === iso((await q(`select ends_on from academic_terms where id='${T_PAST}'`))[0].ends_on), "5-plan sums and last due at term end");
await refused(PARENT2, `select * from preview_payment_plan('${INV}', 3)`, "other parent can't preview", /own invoices/);
await refused(TEACHER, `select * from preview_payment_plan('${INV}', 3)`, "teacher can't preview", /own invoices/);
await refused(PARENT, `select * from preview_payment_plan('${INV}', 6)`, "6 payments refused", /2, 3, 4 or 5/);

// 4. Parent agrees on the portal (future term only)
await refused(PARENT, `select create_payment_plan('${INV}', 3, 'Pam Parent', 'v1')`, "parent can't after term started", /first day of term/);
await refused(PARENT, `select create_payment_plan('${INV_F}', 3, 'Pa', 'v1')`, "short name refused", /full name/);
await refused(PARENT2, `select create_payment_plan('${INV_F}', 3, 'Quin Parent', 'v1')`, "other parent refused", /own invoice/);
await refused(TEACHER, `select create_payment_plan('${INV_F}', 3, 'Tom Teacher', 'v1')`, "teacher refused", /own invoice/);
const PF = (await as(PARENT, () => q(`select create_payment_plan('${INV_F}', 2, 'Pam Parent', 'v1') as id`)))[0].id;
let plan = (await q(`select * from fee_payment_plans where id='${PF}'`))[0];
ok(plan.agreed_via === "portal" && plan.agreed_by === PARENT && plan.agreed_name === "Pam Parent" && plan.policy_version === "v1" && Number(plan.plan_total) === 200000, "portal plan stored");
await refused(PARENT, `select create_payment_plan('${INV_F}', 3, 'Pam Parent', 'v1')`, "second plan refused", /already has/);
ok((await as(PARENT, () => q(`select * from fee_payment_plan_instalments`))).length === 2, "parent sees own instalments");
ok((await as(PARENT2, () => q(`select * from fee_payment_plans`))).length === 0, "other parent sees no plans");
ok((await as(TEACHER, () => q(`select * from fee_payment_plans`))).length === 0, "teacher sees no plans");
await refused(PARENT, `insert into fee_payment_plans(invoice_id,instalments,plan_total,agreed_via,agreed_name,policy_version) values ('${INV_D}',2,1,'portal','Pam P','v1')`, "no direct insert");
await refused(PARENT, `update fee_payment_plan_instalments set amount=1`, "no direct update");

// 5. Admin records a paper plan on a started term; parents (not the pupil) are told
const PP = (await as(ADMIN, () => q(`select create_payment_plan('${INV}', 4, 'Pam Parent', 'v1') as id`)))[0].id;
ok((await q(`select agreed_via, recorded_by_name from fee_payment_plans where id='${PP}'`))[0].recorded_by_name === "Ada Admin", "paper plan recorded by name");
const notes = await q(`select user_id, link from notifications where kind='fee_plan'`);
ok(notes.length === 1 && notes[0].user_id === PARENT && notes[0].link.startsWith("/portal/billing"), "parent notified, pupil not: " + JSON.stringify(notes));

// 6. Status and missed payments
const pay = async (amt, daysAgo, inv = INV, st = ST, g = G) => {
  const id = (await as(ADMIN, () => q(`insert into finance_payment_transactions(direction, student_id, guardian_id, amount, method, status, paid_at) values ('inflow','${st}','${g}',${amt},'cash','posted', now() - interval '${daysAgo} days') returning id`)))[0].id;
  await as(ADMIN, () => db.query(`insert into finance_payment_allocations(payment_transaction_id, invoice_id, amount) values ('${id}','${inv}',${amt})`));
};
await pay(30000.3, 59);
let st = await as(PARENT, () => q(`select seq, state, due_so_far, paid_towards from payment_plan_status('${INV}') order by seq`));
ok(st[0].state === "paid" && st[1].state === "missed", "first paid, second missed: " + st.map((r) => r.state));
await refused(TEACHER, `select * from fee_plan_missed()`, "teacher can't list missed", /Only admins/);
let missed = await as(ADMIN, () => q(`select * from fee_plan_missed()`));
ok(missed.length >= 1 && Number(missed[0].default_fee) === 3000.03, "missed listed with 3% fee " + missed.map((m) => m.default_fee));
const I2 = missed.find((m) => m.seq === 2).instalment_id;
await refused(TEACHER, `select charge_plan_default('${I2}')`, "teacher can't charge", /Only admins/);
const C = (await as(ADMIN, () => q(`select charge_plan_default('${I2}') as id`)))[0].id;
const bal = (await q(`select invoice_total from finance_invoice_balances where invoice_id='${INV}'`))[0].invoice_total;
ok(Number(bal) === 103001.03, "fee added to invoice: " + bal);
await refused(ADMIN, `select charge_plan_default('${I2}')`, "can't charge twice", /already/);
ok((await q(`select 1 from notifications where kind='fee_default' and user_id='${PARENT}'`)).length === 1, "parent told about default");
ok((await q(`select 1 from notifications where kind='fee_default' and user_id='${PUPIL}'`)).length === 0, "pupil not told");
await refused(ADMIN, `delete from finance_invoice_adjustments where invoice_id='${INV}'`, "fee can't be deleted directly", /Remove it there/);
await refused(ADMIN, `update finance_invoice_adjustments set amount=1 where invoice_id='${INV}'`, "fee can't be edited directly", /Remove it there/);
// Later payments must cover the fee too
st = await q(`select seq, due_so_far from payment_plan_status('${INV}') order by seq`).catch(() => null);
st = await as(ADMIN, () => q(`select seq, due_so_far from payment_plan_status('${INV}') order by seq`));
ok(Number(st[2].due_so_far) === 30000.3 * 2 + 20000.2 + 3000.03, "next payment includes the fee: " + st[2].due_so_far);
ok((await as(PARENT, () => q(`select * from fee_plan_default_charges`))).length === 1, "parent sees the charged fee");
// Remove with a reason
await refused(ADMIN, `select remove_plan_default('${C}', 'other', '')`, "other needs text", /Type the reason/);
await as(ADMIN, () => db.query(`select remove_plan_default('${C}', 'paid_not_recorded', null)`));
ok(Number((await q(`select invoice_total from finance_invoice_balances where invoice_id='${INV}'`))[0].invoice_total) === 100001, "fee removed from invoice");
ok((await q(`select status from fee_plan_default_charges where id='${C}'`))[0].status === "removed", "charge kept as removed");
ok((await as(PARENT, () => q(`select * from fee_plan_default_charges`))).length === 0, "parent no longer sees removed fee");
// Waive needs a reason; decisions are once only
const PW = (await as(ADMIN, () => q(`select create_payment_plan('${INV2}', 3, 'Quin Parent', 'v1') as id`)))[0].id;
const I22 = (await as(ADMIN, () => q(`select instalment_id from payment_plan_status('${INV2}') where seq=2`)))[0].instalment_id;
await refused(ADMIN, `select waive_plan_default('${I22}', 'because', null)`, "waive reason from list", /from the list/);
await as(ADMIN, () => db.query(`select waive_plan_default('${I22}', 'hardship', 'Spoke to the bursar')`));
await refused(ADMIN, `select charge_plan_default('${I22}')`, "can't charge after waive", /already/);
ok(!(await as(ADMIN, () => q(`select instalment_id from fee_plan_missed()`))).some((m) => m.instalment_id === I22), "waived drops off the list");
// Not missed: refused
const I1 = (await as(ADMIN, () => q(`select instalment_id from payment_plan_status('${INV}') where seq=1`)))[0].instalment_id;
await refused(ADMIN, `select charge_plan_default('${I1}')`, "paid payment can't be charged", /not missed/);

// 7. Cancel
await refused(PARENT, `select cancel_payment_plan('${PF}', 'parent_request', null)`, "parent can't cancel", /Only admins/);
await as(ADMIN, () => db.query(`select cancel_payment_plan('${PF}', 'parent_request', null)`));
ok((await q(`select status, cancelled_by_name from fee_payment_plans where id='${PF}'`))[0].cancelled_by_name === "Ada Admin", "cancelled with name");

// 8. Early payment discounts
await refused(TEACHER, `select * from early_discount_options('${INV_D}')`, "teacher can't see discounts", /Only admins/);
await refused(ADMIN, `select apply_early_discount('${INV_D}', 'two_weeks', null)`, "not paid yet refused", /Not paid in full/);
await pay(115000, 50, INV_D); // paid 50 days ago; term starts in 30 days: more than two weeks before; 120000 - 5% of 100000 tuition = 115000
let opts = await as(ADMIN, () => q(`select * from early_discount_options('${INV_D}')`));
const tw = opts.find((o) => o.option === "two_weeks");
ok(tw.met && Number(tw.amount) === 5000 && Number(tw.tuition_total) === 100000, "two weeks met on tuition only " + JSON.stringify(tw));
await refused(ADMIN, `select apply_early_discount('${INV_D}', 'one_term', null)`, "advance option needs a note", /Say which payment/);
const D = (await as(ADMIN, () => q(`select apply_early_discount('${INV_D}', 'two_weeks', null) as id`)))[0].id;
ok(Number((await q(`select balance from finance_invoice_balances where invoice_id='${INV_D}'`))[0].balance) === 0, "balance cleared by discount");
await refused(ADMIN, `select apply_early_discount('${INV_D}', 'two_weeks', null)`, "only one discount", /already/);
await refused(ADMIN, `select apply_early_discount('${INV}', 'two_weeks', null)`, "no discount on a plan", /payment plan/);
await refused(ADMIN, `delete from finance_invoice_adjustments where invoice_id='${INV_D}'`, "discount can't be deleted directly", /Remove it there/);
await refused(ADMIN, `select remove_early_discount('${D}', '')`, "remove needs reason", /Say why/);
await as(ADMIN, () => db.query(`select remove_early_discount('${D}', 'Applied to the wrong invoice')`));
ok(Number((await q(`select balance from finance_invoice_balances where invoice_id='${INV_D}'`))[0].balance) === 5000, "discount removed");
// No tuition marked
await as(ADMIN, () => db.query(`update revenue_categories set is_tuition=false`));
await refused(ADMIN, `select apply_early_discount('${INV_D}', 'two_weeks', null)`, "no tuition refused", /Mark which fee types/);

// 9. Log
const ev = await as(ADMIN, () => q(`select action from fee_plan_events`));
for (const a of ["plan_created", "default_charged", "default_removed", "default_waived", "plan_cancelled", "discount_applied", "discount_removed"]) ok(ev.some((e) => e.action === a), "logged " + a);
ok((await as(PARENT, () => q(`select * from fee_plan_events`))).length === 0, "parent can't read the log");
ok((await as(TEACHER, () => q(`select * from fee_plan_events`))).length === 0, "teacher can't read the log");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
