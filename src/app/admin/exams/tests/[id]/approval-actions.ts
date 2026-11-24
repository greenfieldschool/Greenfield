"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Sending a test for approval, approving or sending back, and choosing its term. The database checks who may do
// each (exam_submit_test, exam_review_test, RLS on exam_tests).

function go(testId: string, message: string, type: "success" | "error" = "success"): never {
  redirect(`/admin/exams/tests/${testId}?toast=${encodeURIComponent(message)}&toast_type=${type}#approval`);
}

function plain(message: string) {
  if (/could not find the function|does not exist|schema cache/i.test(message)) {
    return "This needs the 24 November 2026 database update. Ask an admin to run it.";
  }
  return message.replace(/^.*?exception:\s*/i, "");
}

function refresh(testId: string) {
  revalidatePath(`/admin/exams/tests/${testId}`);
  revalidatePath("/admin/exams/tests");
  revalidatePath("/admin/exams/sessions");
}

export async function submitTestAction(fd: FormData) {
  const testId = String(fd.get("test_id") ?? "");
  const supabase = getSupabaseServerClient();
  if (!supabase) go(testId, "The school system is not available.", "error");
  const { error } = await supabase!.rpc("exam_submit_test", { p_test: testId, p_note: String(fd.get("note") ?? "").trim() || null });
  if (error) go(testId, plain(error.message), "error");
  refresh(testId);
  go(testId, "Sent for approval. The admins will approve it or send it back with comments.");
}

export async function reviewTestAction(fd: FormData) {
  const testId = String(fd.get("test_id") ?? "");
  const decision = String(fd.get("decision") ?? "");
  const supabase = getSupabaseServerClient();
  if (!supabase) go(testId, "The school system is not available.", "error");
  const { error } = await supabase!.rpc("exam_review_test", {
    p_test: testId,
    p_decision: decision,
    p_note: String(fd.get("note") ?? "").trim() || null,
    p_split_checked: String(fd.get("split_checked") ?? "") === "yes"
  });
  if (error) go(testId, plain(error.message), "error");
  refresh(testId);
  go(testId, decision === "approve" ? "Approved. It can now be opened to learners in a session." : "Sent back. The teacher has been emailed your comments.");
}

export async function setTestTermAction(fd: FormData) {
  const testId = String(fd.get("test_id") ?? "");
  const term = String(fd.get("academic_term_id") ?? "") || null;
  const supabase = getSupabaseServerClient();
  if (!supabase) go(testId, "The school system is not available.", "error");
  const { error, data } = await supabase!.from("exam_tests").update({ academic_term_id: term }).eq("id", testId).select("id");
  if (error) go(testId, plain(error.message), "error");
  if (!data?.length) go(testId, "You can't change this test.", "error");
  refresh(testId);
  go(testId, "Term saved.");
}
