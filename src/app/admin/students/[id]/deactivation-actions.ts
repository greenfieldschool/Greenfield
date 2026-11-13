"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Deactivate / reactivate / delete a pupil record (issue 11). The database functions in
// docs/migrations/20261113b_student_deactivation.sql check the user is an admin, require a reason from the list,
// and write every step to student_status_log. Form fields carry everything; nothing is captured from the page.

const MISSING_DB =
  "Deactivating pupils is not set up in the database yet. Run docs/migrations/20261113b_student_deactivation.sql in Supabase.";

function back(studentId: string, message: string, type: "success" | "error" = "error"): never {
  redirect(`/admin/students/${studentId}?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

function friendly(message: string) {
  if (/could not find the function|does not exist|schema cache/i.test(message)) return MISSING_DB;
  return message;
}

export async function deactivateStudentAction(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const other = String(formData.get("reason_other") ?? "").trim();
  const kept = String(formData.get("kept_student_id") ?? "").trim();
  if (!studentId) redirect("/admin/students");
  if (!reason) back(studentId, "Choose a reason from the list");
  if (reason === "other" && !other) back(studentId, "Type the reason when you choose Other");
  if (reason === "duplicate" && !kept) back(studentId, "Choose the record to keep");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(studentId, "Database is not configured — nothing was saved");

  const { error } = await supabase.rpc("deactivate_student", {
    p_student: studentId,
    p_reason: reason,
    p_other: reason === "other" ? other : null,
    p_kept: reason === "duplicate" ? kept : null
  });
  if (error) back(studentId, friendly(error.message));

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${studentId}`);
  if (reason === "duplicate") revalidatePath(`/admin/students/${kept}`);
  back(studentId, "Pupil deactivated. The reason has been recorded.", "success");
}

export async function reactivateStudentAction(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "").trim();
  if (!studentId) redirect("/admin/students");
  const supabase = getSupabaseServerClient();
  if (!supabase) back(studentId, "Database is not configured — nothing was saved");

  const { error } = await supabase.rpc("reactivate_student", { p_student: studentId });
  if (error) back(studentId, friendly(error.message));

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${studentId}`);
  back(studentId, "Pupil reactivated", "success");
}

export async function deleteStudentAction(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "").trim();
  const confirmName = String(formData.get("confirm_name") ?? "");
  if (!studentId) redirect("/admin/students");
  if (!confirmName.trim()) back(studentId, "Type the pupil's name to confirm");
  const supabase = getSupabaseServerClient();
  if (!supabase) back(studentId, "Database is not configured — nothing was saved");

  const { error } = await supabase.rpc("delete_student", { p_student: studentId, p_confirm_name: confirmName });
  if (error) back(studentId, friendly(error.message));

  revalidatePath("/admin/students");
  redirect(`/admin/students?toast=${encodeURIComponent("Pupil record deleted. It is still listed in the removal log.")}&toast_type=success`);
}
