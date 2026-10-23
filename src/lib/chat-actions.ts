"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { MESSAGE_MAX } from "@/lib/chat";

// Server actions for messaging. The database enforces every rule (who may post, unsend window, moderation),
// so these only pass requests through and report errors back.

export type ActionResult = { ok: true } | { ok: false; error: string };

function client() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Database is not configured");
  return supabase;
}

function safeBase(base: string) {
  return base === "/admin/messages" ? "/admin/messages" : "/portal/messages";
}

export async function sendMessage(conversationId: string, body: string): Promise<ActionResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Type a message first" };
  if (text.length > MESSAGE_MAX) return { ok: false, error: `Messages can be up to ${MESSAGE_MAX} characters` };
  const supabase = client();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("chat_messages").insert({ conversation_id: conversationId, body: text, sender_id: user?.id });
  if (error) return { ok: false, error: error.message.includes("row-level security") ? "You can't post in this conversation" : error.message };
  revalidatePath("/portal/messages", "layout");
  revalidatePath("/admin/messages", "layout");
  return { ok: true };
}

export async function unsendMessage(messageId: string): Promise<ActionResult> {
  const { error } = await client().rpc("chat_unsend", { p_message: messageId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function reportMessage(messageId: string, reason: string): Promise<ActionResult> {
  if (reason.trim().length < 3) return { ok: false, error: "Say briefly what is wrong" };
  const { error } = await client().rpc("chat_report", { p_message: messageId, p_reason: reason.trim() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function removeMessage(messageId: string, reason: string): Promise<ActionResult> {
  const { error } = await client().rpc("chat_remove_message", { p_message: messageId, p_reason: reason.trim() });
  if (!error) revalidatePath("/admin/messages", "layout");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function startConversation(formData: FormData) {
  const base = safeBase(String(formData.get("base") ?? ""));
  const target = String(formData.get("user_id") ?? "").trim();
  const supabase = client();
  const { data, error } = await supabase.rpc("chat_start_direct", { p_target: target });
  if (error || !data) redirect(`${base}/new?toast=${encodeURIComponent(error?.message ?? "Could not start the conversation")}&toast_type=error`);
  redirect(`${base}/${data as string}`);
}

export async function saveChatSettings(formData: FormData) {
  const base = safeBase(String(formData.get("base") ?? ""));
  const supabase = client();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`${base}/settings`);
  const values: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
  if (formData.has("allow_parent_dm_present")) values.allow_parent_dm = formData.get("allow_parent_dm") === "on";
  const from = String(formData.get("reply_from") ?? "");
  const to = String(formData.get("reply_to") ?? "");
  if (/^\d{2}:\d{2}$/.test(from) && /^\d{2}:\d{2}$/.test(to)) {
    if (from >= to) redirect(`${base}/settings?toast=${encodeURIComponent("The end time must be after the start time")}&toast_type=error`);
    values.reply_from = from;
    values.reply_to = to;
    values.reply_weekdays_only = formData.get("reply_weekdays_only") === "on";
  }
  const { error } = await supabase.from("chat_settings").upsert(values, { onConflict: "user_id" });
  revalidatePath(`${base}`, "layout");
  redirect(`${base}/settings?toast=${encodeURIComponent(error ? error.message : "Settings saved")}&toast_type=${error ? "error" : "success"}`);
}

export async function blockUser(formData: FormData) {
  const base = safeBase(String(formData.get("base") ?? ""));
  const target = String(formData.get("user_id") ?? "").trim();
  const back = String(formData.get("back") ?? `${base}/settings`);
  const supabase = client();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const unblock = formData.get("unblock") === "1";
  const { error } = unblock
    ? await supabase.from("chat_blocks").delete().eq("blocker_id", user?.id ?? "").eq("blocked_id", target)
    : await supabase.from("chat_blocks").upsert({ blocker_id: user?.id, blocked_id: target }, { onConflict: "blocker_id,blocked_id" });
  revalidatePath(base, "layout");
  const dest = back.startsWith(base) ? back : `${base}/settings`;
  redirect(
    `${dest}${dest.includes("?") ? "&" : "?"}toast=${encodeURIComponent(error ? error.message : unblock ? "Unblocked" : "Blocked. They can no longer message you privately.")}&toast_type=${error ? "error" : "success"}`
  );
}

export async function muteMember(formData: FormData) {
  const classId = String(formData.get("class_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const days = Number(formData.get("days") ?? "0");
  const reason = String(formData.get("reason") ?? "");
  const back = String(formData.get("back") ?? "/admin/messages/moderation");
  const { error } = await client().rpc("chat_mute", { p_class: classId, p_user: userId, p_days: days, p_reason: reason });
  revalidatePath("/admin/messages", "layout");
  const dest = back.startsWith("/admin/messages") ? back : "/admin/messages/moderation";
  redirect(
    `${dest}${dest.includes("?") ? "&" : "?"}toast=${encodeURIComponent(error ? error.message : days > 0 ? `Muted for ${days} day(s)` : "Unmuted")}&toast_type=${error ? "error" : "success"}`
  );
}

export async function dismissReport(formData: FormData) {
  const id = String(formData.get("report_id") ?? "");
  const note = String(formData.get("note") ?? "");
  const { error } = await client().rpc("chat_dismiss_report", { p_report: id, p_note: note });
  revalidatePath("/admin/messages/moderation");
  redirect(`/admin/messages/moderation?toast=${encodeURIComponent(error ? error.message : "Report dismissed")}&toast_type=${error ? "error" : "success"}`);
}

export async function removeReportedMessage(formData: FormData) {
  const id = String(formData.get("message_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const { error } = await client().rpc("chat_remove_message", { p_message: id, p_reason: reason });
  revalidatePath("/admin/messages", "layout");
  redirect(
    `/admin/messages/moderation?toast=${encodeURIComponent(error ? error.message : "Message removed. The original is kept in the school record.")}&toast_type=${error ? "error" : "success"}`
  );
}
