import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { buildPayload, inBatches, pushConfigured, sendPush, type StoredSubscription } from "@/lib/push";

// The sending job for phone notifications (migration 20261111_push_notifications.sql). The database lines alerts up
// in push_outbox when a portal notification is written; this takes them, sends one to each phone the person turned
// on, removes phones that have gone, and leaves alerts the push service couldn't take to be tried again (3 tries,
// within a day). Push is a bonus: the bell and emails still carry everything if a phone misses one.

const URGENT_KINDS = new Set(["online_class_moved", "online_class_cancelled", "online_class_on"]);

type Claimed = {
  outbox_id: string;
  notification_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  ref_id: string | null;
  unread: number;
};

export type PushRunResult = { ok: boolean; reason?: string; alerts: number; sent: number; removedPhones: number; waiting: number };

export async function runPushOutbox(timeBudgetMs = 45000): Promise<PushRunResult> {
  const result: PushRunResult = { ok: true, alerts: 0, sent: 0, removedPhones: 0, waiting: 0 };
  if (!pushConfigured()) return { ...result, ok: false, reason: "Phone notification keys (VAPID) are not set" };
  const supabase = getSupabaseServiceClient();
  if (!supabase) return { ...result, ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY is not set" };

  const started = Date.now();
  while (Date.now() - started < timeBudgetMs) {
    const { data, error } = await supabase.rpc("push_claim", { p_limit: 100 });
    if (error) return { ...result, ok: false, reason: error.message };
    const claimed = (data ?? []) as Claimed[];
    if (!claimed.length) break;
    result.alerts += claimed.length;

    const userIds = Array.from(new Set(claimed.map((c) => c.user_id)));
    const { data: subRows, error: subError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id")
      .in("user_id", userIds);
    if (subError) return { ...result, ok: false, reason: subError.message };
    const subsByUser = new Map<string, StoredSubscription[]>();
    for (const s of (subRows ?? []) as Array<StoredSubscription & { user_id: string }>) {
      subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);
    }

    const gone = new Set<string>();
    const used = new Set<string>();
    const done: string[] = [];
    const jobs = claimed.flatMap((c) =>
      (subsByUser.get(c.user_id) ?? []).map((sub) => ({ c, sub }))
    );
    const outcomes = await inBatches(jobs, 20, async ({ c, sub }) => {
      const payload = buildPayload({
        title: c.title,
        body: c.body ?? undefined,
        url: `/portal/notifications/open/${c.notification_id}`,
        tag: c.ref_id ? `${c.kind}:${c.ref_id}` : c.notification_id,
        unread: c.unread
      });
      const r = await sendPush(sub, payload, { urgent: URGENT_KINDS.has(c.kind) });
      if (r === "gone") gone.add(sub.id);
      if (r === "sent") used.add(sub.id);
      return { outbox: c.outbox_id, r };
    });

    for (const c of claimed) {
      const mine = outcomes.filter((o) => o.outbox === c.outbox_id);
      // Finished unless every try hit a busy push service (then it waits for the next run).
      if (!mine.length || mine.some((o) => o.r !== "retry")) done.push(c.outbox_id);
      else result.waiting++;
    }
    result.sent += outcomes.filter((o) => o.r === "sent").length;

    if (gone.size) {
      await supabase.from("push_subscriptions").delete().in("id", Array.from(gone));
      result.removedPhones += gone.size;
    }
    if (used.size) {
      await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", Array.from(used));
    }
    if (done.length) await supabase.rpc("push_done", { p_ids: done });
    if (claimed.length < 100) break;
  }
  return result;
}
