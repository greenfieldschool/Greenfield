"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { examRoomError } from "@/lib/exam-room";

// Unlocking pupils and adding time, from the conductor's session page and the admin Attempts page. The database
// checks again that the person is staff or a conductor assigned to the session.

function backTo(fd: FormData) {
  const b = String(fd.get("back") ?? "");
  return b.startsWith("/conductor/sessions/") || b.startsWith("/admin/exams/sessions/") ? b : "/conductor";
}

function go(url: string, message: string, type: "success" | "error" = "success"): never {
  redirect(`${url}${url.includes("?") ? "&" : "?"}toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

export async function unlockPupilsAction(fd: FormData) {
  const back = backTo(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const attempt = String(fd.get("attempt_id") ?? "") || null;
  const { data, error } = await supabase!.rpc("exam_unlock_attempts", {
    p_session: String(fd.get("session_id") ?? ""),
    p_attempt: attempt,
    p_note: String(fd.get("note") ?? "").trim() || null,
    p_reason: String(fd.get("reason") ?? "") || null
  });
  if (error) go(back, examRoomError(error.message), "error");
  revalidatePath(back);
  const n = Number(data ?? 0);
  if (!n) go(back, attempt ? "That learner isn't locked any more." : "No one is locked.", "error");
  go(back, attempt ? "Unlocked. The learner can carry on; their clock starts again when the page reloads." : `${n} learner${n === 1 ? "" : "s"} unlocked.`);
}

export async function addTimeAction(fd: FormData) {
  const back = backTo(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const everyone = String(fd.get("target") ?? "") === "everyone";
  const ticked = fd.getAll("attempt_ids").map(String).filter(Boolean);
  if (!everyone && !ticked.length) go(back, "Tick the learners to give time to, or choose everyone.", "error");
  const minutes = Number(fd.get("minutes") ?? 0);
  const { data, error } = await supabase!.rpc("exam_add_time", {
    p_session: String(fd.get("session_id") ?? ""),
    p_attempts: everyone ? null : ticked,
    p_minutes: minutes,
    p_reason: String(fd.get("reason") ?? "") || null,
    p_note: String(fd.get("note") ?? "").trim() || null
  });
  if (error) go(back, examRoomError(error.message), "error");
  revalidatePath(back);
  const n = Number(data ?? 0);
  if (!n) go(back, "No one still writing to add time for.", "error");
  go(back, `${minutes} minute${minutes === 1 ? "" : "s"} added for ${n} learner${n === 1 ? "" : "s"}.`);
}

export async function reopenAttemptAction(fd: FormData) {
  const back = backTo(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const { error } = await supabase!.rpc("exam_reopen_attempt", {
    p_attempt: String(fd.get("attempt_id") ?? ""),
    p_reason: String(fd.get("reason") ?? "").trim()
  });
  if (error) go(back, examRoomError(error.message), "error");
  revalidatePath(back);
  go(back, "Let back in. The learner carries on where they stopped, with the time they had left.");
}

export async function handInAllAction(fd: FormData) {
  const back = backTo(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "The school system is not available.", "error");
  const { data, error } = await supabase!.rpc("exam_hand_in_open", {
    p_session: String(fd.get("session_id") ?? ""),
    p_note: "end_of_exam"
  });
  if (error) go(back, examRoomError(error.message), "error");
  revalidatePath(back);
  const n = Number(data ?? 0);
  if (!n) go(back, "Everyone had already handed in.", "error");
  go(back, `${n} learner${n === 1 ? "" : "s"} handed in with the answers they had saved.`);
}
