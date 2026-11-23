// PGlite test for docs/migrations/20261123c_school_office_messages.sql. Copy next to pglite-full-schema.mjs and
// pglite-split.mjs (supabase-migration skill), npm install @electric-sql/pglite@0.2.17, then: node <this file>
import { load, U } from "./pglite-full-schema.mjs";
const MIG = "/Users/user/Documents/Business/greenfieldSchool/docs/migrations/20261123c_school_office_messages.sql";
const db = await load([MIG, MIG]); // run twice
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
async function as(uid, fn) { await db.exec(`reset role; set test.uid='${uid}'; set role authenticated;`); try { return await fn(); } finally { await db.exec("reset role;"); } }
async function refused(uid, sql, m, re) { try { await as(uid, () => db.query(sql)); ok(false, m + " (was allowed)"); } catch (e) { ok(!re || re.test(e.message), m + " wrong error: " + e.message); } }
const q = async (sql) => (await db.query(sql)).rows;
const ADMIN = U(1), FRONT = U(2), TEACHER = U(3), PARENT = U(4), PARENT2 = U(5), NURSE = U(6), PUPIL = U(7);
const G = U(10), G2 = U(11), ST = U(20), ST2 = U(21), C = U(30);
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) values ('${ADMIN}','a@x'),('${FRONT}','f@x'),('${TEACHER}','t@x'),('${PARENT}','p@x'),('${PARENT2}','q@x'),('${NURSE}','n@x'),('${PUPIL}','s@x');
insert into profiles(id, role, full_name, email) values ('${ADMIN}','admin','Ada Admin','a@x'),('${FRONT}','front_desk','Fola Front','f@x'),('${TEACHER}','teacher','Tom Teacher','t@x'),('${PARENT}','parent','Pam Parent','p@x'),('${PARENT2}','parent','Quin Parent','q@x'),('${NURSE}','nurse','Nia Nurse','n@x'),('${PUPIL}','student','Kemi','s@x');
insert into guardians(id, full_name, email) values ('${G}','Pam Parent','p@x'),('${G2}','Quin Parent','q@x');
insert into guardian_user_links(guardian_id, user_id) values ('${G}','${PARENT}'),('${G2}','${PARENT2}');
insert into classes(id, level, name, active) values ('${C}','primary','Primary 1',true);
insert into students(id, first_name, last_name, level, class_id, status) values ('${ST}','Kemi','Ade','primary','${C}','active'),('${ST2}','Tobi','Ola','primary','${C}','active');
insert into student_guardians(student_id, guardian_id) values ('${ST}','${G}'),('${ST2}','${G2}');
insert into student_user_links(student_id, user_id) values ('${ST}','${PUPIL}');
insert into teacher_class_assignments(teacher_id, class_id, active) values ('${TEACHER}','${C}',true);
set session_replication_role = origin;`);

const send = (uid, conv, body) => as(uid, () => q(`insert into chat_messages(conversation_id, body) values ('${conv}', '${body}') returning sender_label, sender_name`));
const inbox = (uid) => as(uid, () => q(`select * from chat_inbox()`));
const office = (rows) => rows.filter((r) => r.kind === "office");

// 1. Who can start one
await refused(FRONT, `select chat_start_office()`, "front desk can't start", /Only parents/);
await refused(TEACHER, `select chat_start_office()`, "teacher can't start", /Only parents/);
await refused(PUPIL, `select chat_start_office()`, "pupil can't start", /Only parents/);
const CONV = (await as(PARENT, () => q(`select chat_start_office() as id`)))[0].id;
ok((await as(PARENT, () => q(`select chat_start_office() as id`)))[0].id === CONV, "same conversation the second time");
ok((await q(`select count(*)::int n from chat_members where conversation_id='${CONV}'`))[0].n === 1, "only the parent is a member");
ok(office(await inbox(PARENT)).length === 1 && office(await inbox(PARENT))[0].title === "School office", "parent sees School office in inbox");
ok(office(await inbox(FRONT)).length === 0, "empty office conversation not in the office inbox yet");

// 2. Messages and labels
const m1 = (await send(PARENT, CONV, "Is the school open on Friday?"))[0];
ok(/Parent of Kemi/.test(m1.sender_label), "parent labelled as parent: " + m1.sender_label);
ok(office(await inbox(FRONT))[0]?.unread === 1 && office(await inbox(ADMIN))[0]?.unread === 1, "front desk and admin both see 1 unread");
ok(office(await inbox(FRONT))[0].title === "Pam Parent", "office sees the parent's name");
ok(office(await inbox(TEACHER)).length === 0, "teacher doesn't see office messages");
ok(office(await inbox(PARENT2)).length === 0, "other parent doesn't see it");
ok((await as(TEACHER, () => q(`select * from chat_messages where conversation_id='${CONV}'`))).length === 0, "teacher can't read the messages");
ok((await as(NURSE, () => q(`select * from chat_messages where conversation_id='${CONV}'`))).length === 0, "nurse can't read");
ok((await as(PARENT2, () => q(`select * from chat_messages where conversation_id='${CONV}'`))).length === 0, "other parent can't read");
await refused(TEACHER, `insert into chat_messages(conversation_id, body) values ('${CONV}', 'hi')`, "teacher can't post", /can't post/);
await refused(PARENT2, `insert into chat_messages(conversation_id, body) values ('${CONV}', 'hi')`, "other parent can't post", /can't post/);
const m2 = (await send(FRONT, CONV, "Yes, normal hours."))[0];
ok(m2.sender_label === "School office" && m2.sender_name === "Fola Front", "front desk reply labelled School office");
ok(office(await inbox(ADMIN))[0].unread === 0, "after front desk replies, admin no longer sees it unread");
ok(office(await inbox(PARENT))[0].unread === 1, "parent sees the reply unread");
const m3 = (await send(ADMIN, CONV, "And closes at 1 pm."))[0];
ok(m3.sender_label === "School office", "admin reply labelled School office too");

// 3. Email: parent emailed on the office's reply (once per 2 hours), staff not emailed
const mails = await q(`select user_id, subject from email_outbox where conversation_id='${CONV}'`);
ok(mails.length === 1 && mails[0].user_id === PARENT && /The school office/.test(mails[0].subject), "one email to the parent: " + JSON.stringify(mails));

// 4. Front desk sees nothing else (and message emails work again for teacher-parent messages)
await as(ADMIN, () => q(`select chat_ensure_class_spaces()`));
ok((await inbox(FRONT)).every((r) => r.kind === "office"), "front desk inbox has only office conversations");
ok((await as(FRONT, () => q(`select * from chat_conversations`))).every((r) => r.kind === "office"), "front desk can read only office conversations");
ok((await as(FRONT, () => q(`select * from chat_contacts()`))).length === 0, "front desk can't start private messages");
const D = (await as(TEACHER, () => q(`select chat_start_direct('${PARENT}') as id`)))[0].id;
await send(TEACHER, D, "Hello from the class teacher");
ok((await as(FRONT, () => q(`select * from chat_messages where conversation_id='${D}'`))).length === 0, "front desk can't read teacher-parent messages");
ok((await q(`select count(*)::int n from email_outbox where conversation_id='${D}' and user_id='${PARENT}'`))[0].n === 1, "teacher's message emails the parent (was broken)");
ok((await as(ADMIN, () => q(`select * from chat_messages where conversation_id='${D}'`))).length === 1, "admin still reads teacher-parent messages");

// 5. Existing behaviour unchanged
ok((await as(PARENT, () => q(`select chat_dm_kind('${FRONT}') k`)))[0].k === null, "parent can't DM front desk directly");
ok((await as(PARENT, () => q(`select chat_dm_kind('${TEACHER}') k`)))[0].k === "teacher_parent", "parent can still DM the teacher");
await refused(PARENT, `insert into chat_conversations(kind, direct_key) values ('office', 'office:${PARENT2}')`, "no direct inserts");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
