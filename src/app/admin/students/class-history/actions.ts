"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Set which class a pupil was in for one term (admins). set_student_class_for_term in
// docs/migrations/20261118b_pupil_class_history.sql checks the user is an admin, writes the term's row, logs the
// change with the admin's name and closes any "needs checking" entry for that pupil and term.

const MISSING_DB =
  "Class history is not set up in the database yet. Run docs/migrations/20261118b_pupil_class_history.sql in Supabase.";

function destination(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "").trim();
  return String(formData.get("return_to") ?? "") === "pupil" && studentId ? `/admin/students/${studentId}` : "/admin/students/class-history";
}

function back(path: string, message: string, type: "success" | "error" = "error"): never {
  redirect(`${path}?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

export async function setClassForTermAction(formData: FormData) {
  const path = destination(formData);
  const studentId = String(formData.get("student_id") ?? "").trim();
  const termId = String(formData.get("term_id") ?? "").trim();
  const classId = String(formData.get("class_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!studentId) redirect("/admin/students");
  if (!termId) back(path, "Choose the term");
  if (!classId) back(path, "Choose the class");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(path, "Database is not configured — nothing was saved");

  const { error } = await supabase.rpc("set_student_class_for_term", {
    p_student: studentId,
    p_term: termId,
    p_class: classId,
    p_note: note || null
  });
  if (error) back(path, /could not find the function|does not exist|schema cache/i.test(error.message) ? MISSING_DB : error.message);

  revalidatePath("/admin/students/class-history");
  revalidatePath(`/admin/students/${studentId}`);
  back(path, "Class for that term saved", "success");
}
