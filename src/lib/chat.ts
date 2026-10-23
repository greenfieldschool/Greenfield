import type { getSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

// Messaging between teachers and parents and between parents of a class. Who can see and post where is decided
// by the database from enrolment (docs/migrations/20261025_messaging.sql); these helpers only read.

export const MESSAGE_MAX = 2000;
export const UNSEND_MINUTES = 15;

export type ChatRole = "admin" | "teacher" | "parent" | "none";

export type InboxItem = {
  conversation_id: string;
  kind: "class_announcements" | "class_parents" | "direct";
  direct_kind: "teacher_parent" | "parent_parent" | null;
  class_id: string | null;
  class_name: string | null;
  title: string;
  subtitle: string;
  other_user_id: string | null;
  last_message_at: string | null;
  last_preview: string | null;
  last_sender: string | null;
  unread: number;
  can_post: boolean;
};

export type ChatMessage = {
  id: string;
  sender_id: string | null;
  sender_name: string | null;
  sender_label: string | null;
  body: string | null;
  created_at: string;
  removed_at: string | null;
  removal_kind: "unsent" | "moderated" | null;
};

export async function getChatRole(supabase: Supabase, userId: string | null): Promise<ChatRole> {
  if (!userId) return "none";
  const [{ data: profile }, { data: link }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase.from("guardian_user_links").select("guardian_id").eq("user_id", userId).maybeSingle()
  ]);
  const role = (profile as { role?: string } | null)?.role ?? "";
  if (role === "admin" || role === "super_admin") return "admin";
  if (role === "teacher") return "teacher";
  if (link) return "parent";
  return "none";
}

export async function loadInbox(supabase: Supabase) {
  // Class spaces are created the first time someone in the class opens Messages.
  await supabase.rpc("chat_ensure_class_spaces");
  const { data, error } = await supabase.rpc("chat_inbox");
  return { items: (data ?? []) as InboxItem[], error };
}

export async function loadThread(supabase: Supabase, conversationId: string, limit = 200) {
  const [{ data: msgs, error }, { data: seenAt }] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, sender_id, sender_name, sender_label, body, created_at, removed_at, removal_kind")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.rpc("chat_other_read_at", { p_conversation: conversationId })
  ]);
  return {
    messages: ((msgs ?? []) as ChatMessage[]).reverse(),
    otherReadAt: (seenAt as string | null) ?? null,
    error
  };
}

// --- formatting (Lagos time) -------------------------------------------------------------------------------

const TZ = "Africa/Lagos";

function lagosDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

export function dayLabel(iso: string, now = new Date()) {
  const d = lagosDay(iso);
  const today = lagosDay(now.toISOString());
  const yesterday = lagosDay(new Date(now.getTime() - 86400000).toISOString());
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/** "14:05" today, "Yesterday", "Mon", or "12 Oct" — for the inbox list. */
export function shortWhen(iso: string | null, now = new Date()) {
  if (!iso) return "";
  const d = lagosDay(iso);
  if (d === lagosDay(now.toISOString())) return timeLabel(iso);
  if (d === lagosDay(new Date(now.getTime() - 86400000).toISOString())) return "Yesterday";
  if (now.getTime() - new Date(iso).getTime() < 6 * 86400000) {
    return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ });
  }
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
}

/** Is it outside the teacher's usual reply hours right now (Lagos time)? */
export function outsideReplyHours(hours: { reply_from: string; reply_to: string; weekdays_only: boolean }, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const hm = `${parts.hour}:${parts.minute}`;
  if (hours.weekdays_only && weekend) return true;
  return hm < hours.reply_from.slice(0, 5) || hm >= hours.reply_to.slice(0, 5);
}

export function replyHoursText(hours: { reply_from: string; reply_to: string; weekdays_only: boolean }) {
  return `${hours.weekdays_only ? "Mon–Fri, " : ""}${hours.reply_from.slice(0, 5)}–${hours.reply_to.slice(0, 5)}`;
}
