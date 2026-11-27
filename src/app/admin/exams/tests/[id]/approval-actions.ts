"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Sending a test for approval, approving or sending back, and choosing its term. The database checks who may do
// each (exam_submit_test, exam_review_test, RLS on exam_tests).

function go(testId: string, message: string, type: "success" | "error" = "success", back?: string): never {
  // From the Tests list, go back to the same filtered list.
  if (back && back.startsWith("/admin/exams/tests")) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}toast=${encodeURIComponent(message)}&toast_type=${type}`);
  }
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
  const back = String(fd.get("back") ?? "") || undefined;
  const supabase = getSupabaseServerClient();
  if (!supabase) go(testId, "The school system is not available.", "error", back);
  const { error } = await supabase!.rpc("exam_review_test", {
    p_test: testId,
    p_decision: decision,
    p_note: String(fd.get("note") ?? "").trim() || null,
    p_split_checked: String(fd.get("split_checked") ?? "") === "yes"
  });
  if (error) go(testId, plain(error.message), "error", back);
  refresh(testId);
  go(testId, decision === "approve" ? "Approved. It can now be opened to learners in a session." : "Sent back. The teacher has been emailed your comments.", "success", back);
}

// Admins take approval back (exam_unapprove_test checks admin, the reason and that nobody is still writing).
export async function unapproveTestAction(fd: FormData) {
  const testId = String(fd.get("test_id") ?? "");
  const reason = String(fd.get("reason") ?? "");
  const supabase = getSupabaseServerClient();
  if (!supabase) go(testId, "The school system is not available.", "error");
  if (!reason) go(testId, "Choose why you are unapproving this paper.", "error");
  const { error } = await supabase!.rpc("exam_unapprove_test", {
    p_test: testId,
    p_reason: reason,
    p_note: reason === "other" ? String(fd.get("note") ?? "").trim() || null : null
  });
  if (error) {
    const m = /could not find the function|schema cache/i.test(error.message)
      ? "Unapprove needs the 27 November 2026 database update. Ask an admin to run it."
      : plain(error.message);
    go(testId, m, "error");
  }
  refresh(testId);
  go(testId, "Unapproved and sent back. Learners can't open it until it is approved again. The teacher has been emailed the reason.");
}

// Admins hand a paper to another teacher (papers are private to the teacher who owns them).
export async function setTestOwnerAction(fd: FormData) {
  const testId = String(fd.get("test_id") ?? "");
  const owner = String(fd.get("owner") ?? "");
  const supabase = getSupabaseServerClient();
  if (!supabase) go(testId, "The school system is not available.", "error");
  if (!owner) go(testId, "Choose a teacher.", "error");
  const { error, data } = await supabase!.from("exam_tests").update({ created_by: owner }).eq("id", testId).select("id");
  if (error) go(testId, plain(error.message), "error");
  if (!data?.length) go(testId, "Only admins can hand a paper to another teacher.", "error");
  refresh(testId);
  go(testId, "Paper handed over. Only that teacher (and the admins) can open it now.");
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
