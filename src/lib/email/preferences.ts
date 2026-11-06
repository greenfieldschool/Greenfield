import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { verifySignature } from "./secret";
import type { EmailCategory } from "./templates";

export const CATEGORY_LABEL: Record<Exclude<EmailCategory, "test">, string> = {
  notification: "notification emails (new work, marks, lesson notes and online classes)",
  message: "new message emails",
  announcement: "school announcement emails"
};

const COLUMN: Record<Exclude<EmailCategory, "test">, "notifications" | "messages" | "announcements"> = {
  notification: "notifications",
  message: "messages",
  announcement: "announcements"
};

export function readUnsubscribe(params: { u?: string | null; c?: string | null; s?: string | null }) {
  const u = params.u ?? "";
  const c = params.c ?? "";
  const s = params.s ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(u) || !(c in COLUMN) || !s || !verifySignature(`${u}:${c}`, s)) return null;
  return { userId: u, category: c as Exclude<EmailCategory, "test"> };
}

/** Switches one kind of email off for someone who clicked a signed link (no sign-in needed). */
export async function unsubscribe(userId: string, category: Exclude<EmailCategory, "test">) {
  const service = getSupabaseServiceClient() as SupabaseClient | null;
  if (!service) return false;
  const { error } = await service
    .from("email_preferences")
    .upsert({ user_id: userId, [COLUMN[category]]: false, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  // Anything already waiting of that kind is not sent.
  if (!error) {
    await service
      .from("email_outbox")
      .update({ status: "skipped", last_error: "Unsubscribed" })
      .eq("user_id", userId)
      .eq("category", category)
      .eq("status", "queued");
  }
  return !error;
}
