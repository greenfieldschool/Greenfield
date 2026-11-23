import { load, U } from "./pglite-full-schema.mjs";
const MIG = process.argv[3];
const withMig = process.argv[4] !== "before";
const db = await load(withMig ? [MIG, MIG] : []); // run the migration twice
const q = async (sql) => (await db.query(sql)).rows;
// Seed
await db.exec(`set session_replication_role = replica;
insert into auth.users(id,email) select ('00000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid, 'u'||g||'@x' from generate_series(1,8) g;
insert into public.profiles(id, role) values ('${U(1)}','admin'),('${U(2)}','teacher'),('${U(3)}','parent'),('${U(4)}','parent'),('${U(5)}','student'),('${U(8)}','nurse');
insert into public.classes(id, level, name) values ('${U(101)}','primary','Primary 1'),('${U(102)}','primary','Primary 2');
insert into public.students(id, first_name, last_name, level, class_id, admission_number) values
  ('${U(201)}','Ada','Alpha','primary','${U(101)}','GF/A'),('${U(202)}','Bola','Beta','primary','${U(102)}','GF/B');
insert into public.guardians(id, full_name) values ('${U(301)}','Parent A'),('${U(302)}','Parent B');
insert into public.student_guardians(student_id, guardian_id) values ('${U(201)}','${U(301)}'),('${U(202)}','${U(302)}');
insert into public.guardian_user_links(guardian_id, user_id) values ('${U(301)}','${U(3)}'),('${U(302)}','${U(4)}');
insert into public.student_user_links(student_id, user_id) values ('${U(201)}','${U(5)}');
insert into public.teacher_class_assignments(teacher_id, class_id) values ('${U(2)}','${U(101)}');
insert into public.academic_years(id, name) values ('${U(401)}','2026/27');
insert into public.academic_terms(id, academic_year_id, name) values ('${U(402)}','${U(401)}','First');
insert into public.subjects(id, name) values ('${U(501)}','Maths');
insert into public.academic_assessments(id, assessment_type, academic_year_id, academic_term_id, class_id, subject_id, max_score, on_result_sheet) values
  ('${U(601)}','exam','${U(401)}','${U(402)}','${U(101)}','${U(501)}',100,true),
  ('${U(602)}','exam','${U(401)}','${U(402)}','${U(102)}','${U(501)}',100,true);
insert into public.academic_assessment_scores(assessment_id, student_id, score) values ('${U(601)}','${U(201)}',70),('${U(602)}','${U(202)}',55);
insert into public.student_attendance(student_id, date, status, academic_year_id, academic_term_id) values
  ('${U(201)}','2026-11-02','present','${U(401)}','${U(402)}'),('${U(202)}','2026-11-02','absent','${U(401)}','${U(402)}');
insert into public.welfare_discipline_records(student_id, description, severity, academic_year_id, academic_term_id) values ('${U(202)}','Fight',3,'${U(401)}','${U(402)}');
insert into public.exam_tests(id, name, subject_id) values ('${U(701)}','Maths CBT','${U(501)}');
insert into public.exam_test_sessions(id, test_id, class_id, status) values ('${U(711)}','${U(701)}','${U(101)}','active'),('${U(712)}','${U(701)}','${U(102)}','active');
insert into public.exam_attempts(id, session_id, student_id, obtained_marks, max_marks, percent, status, started_at) values
  ('${U(721)}','${U(711)}','${U(201)}',8,10,80,'submitted',now()),('${U(722)}','${U(712)}','${U(202)}',4,10,40,'submitted',now());
insert into public.exam_conductors(id, full_name) values ('${U(801)}','Invigilator One'),('${U(802)}','Invigilator Two');
insert into public.exam_conductor_user_links(conductor_id, user_id) values ('${U(801)}','${U(6)}'),('${U(802)}','${U(7)}');
insert into public.exam_session_conductors(session_id, conductor_id) values ('${U(711)}','${U(801)}');
set session_replication_role = origin;`);

const who = { admin: 1, teacher_classA: 2, nurse: 8, parentA: 3, parentB: 4, pupilA: 5, conductor_S1: 6, conductor_unassigned: 7, signed_out: null };
const views = {
  subj: "select student_id from public.academic_student_subject_term_summary",
  term: "select student_id from public.academic_student_term_summary",
  welfare: "select student_id from public.welfare_student_term_summary where academic_term_id is not null",
  attempts: "select student_id, first_name from public.exam_attempt_list_v",
  sessions: "select session_id, completions from public.exam_session_summary_v",
};
const tables = {
  scores: "select distinct student_id from public.academic_assessment_scores",
  attendance: "select distinct student_id from public.student_attendance",
  attemptsTbl: "select student_id from public.exam_attempts",
};
const name = (id) => ({ [U(201)]: "A", [U(202)]: "B", [U(711)]: "S1", [U(712)]: "S2" }[id] ?? id);
const out = {};
for (const [label, n] of Object.entries(who)) {
  const row = {};
  for (const [k, sql] of Object.entries({ ...views, ...tables })) {
    await db.exec("reset role");
    if (n) await db.exec(`set test.uid = '${U(n)}'; set role authenticated;`);
    else await db.exec(`set test.uid = ''; set role anon;`);
    try {
      const r = await q(sql);
      row[k] = [...new Set(r.map((x) => name(x.student_id ?? x.session_id) + (x.first_name ? `(${x.first_name})` : "")))].sort().join(",") || "-";
    } catch (e) { row[k] = "DENIED"; if (!/permission denied/.test(e.message)) row[k] = "ERR " + e.message; }
  }
  out[label] = row;
}
await db.exec("reset role");
console.table(out);
const opts = await q(`select c.relname, c.reloptions, has_table_privilege('anon', c.oid, 'select') anon_sel from pg_class c where relname in ('academic_student_subject_term_summary','academic_student_term_summary','welfare_student_term_summary','exam_attempt_list_v','exam_session_summary_v') order by 1`);
console.table(opts);
