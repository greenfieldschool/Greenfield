import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { accessTokenFrom, GmailError, sendRaw } from "./gmail";
import { buildMime } from "./mime";
import { decryptSecret } from "./secret";
import { renderEmail, type OutboxRow } from "./templates";

// Sends what's waiting in email_outbox through the connected Gmail account (migration 20261110_email.sql).
// Called every few minutes by the scheduled job (/api/email/send) and right after an admin sends an announcement or
// a test. Stays under Gmail's daily limit: the rest waits for the next run.

export const DAILY_LIMIT = Math.max(1, Number(process.env.EMAIL_DAILY_LIMIT ?? 450) || 450);
export const SENDER_NAME = "Greenfield School";

export type RunResult = { sent: number; skipped: number; failed: number; waiting: number; note?: string };

type Row = OutboxRow & { attempts: number; conversation_id: string | null; message_at: string | null };

async function putBack(service: SupabaseClient, ids: string[], error: string) {
  if (ids.length) await service.from("email_outbox").update({ status: "queued", last_error: error }).in("id", ids);
}

export async function runOutbox(limit = 40): Promise<RunResult> {
  const service = getSupabaseServiceClient() as SupabaseClient | null;
  if (!service) return { sent: 0, skipped: 0, failed: 0, waiting: 0, note: "The school's service key is not set on the server." };

  const { data: settings } = await service.from("email_settings").select("sender_email, refresh_token_enc").eq("id", true).maybeSingle();
  const s = settings as { sender_email: string; refresh_token_enc: string } | null;
  const waitingCount = async () =>
    (await service.from("email_outbox").select("id", { count: "exact", head: true }).in("status", ["queued", "sending"])).count ?? 0;
  if (!s) return { sent: 0, skipped: 0, failed: 0, waiting: await waitingCount(), note: "Gmail isn't connected yet." };

  await service.rpc("email_requeue_stuck");
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: sent24 } = await service.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", since);
  const room = DAILY_LIMIT - (sent24 ?? 0);
  if (room <= 0) return { sent: 0, skipped: 0, failed: 0, waiting: await waitingCount(), note: "Today's sending limit is reached; the rest go tomorrow." };

  const { data: claimed, error: claimError } = await service.rpc("email_claim", { p_limit: Math.min(limit, room) });
  if (claimError) return { sent: 0, skipped: 0, failed: 0, waiting: 0, note: claimError.message };
  const rows = (claimed ?? []) as Row[];
  if (!rows.length) return { sent: 0, skipped: 0, failed: 0, waiting: await waitingCount() };

  const refresh = decryptSecret(s.refresh_token_enc);
  let token: string;
  try {
    if (!refresh) throw new GmailError("The saved Gmail connection can't be read (EMAIL_TOKEN_KEY changed?). Reconnect Gmail in Settings.", true);
    token = await accessTokenFrom(refresh);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't connect to Gmail";
    await putBack(service, rows.map((r) => r.id), message);
    await service.from("email_settings").update({ last_error: message, last_error_at: new Date().toISOString() }).eq("id", true);
    return { sent: 0, skipped: 0, failed: 0, waiting: await waitingCount(), note: message };
  }

  let sent = 0, skipped = 0, failed = 0;
  let note: string | undefined;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // A message they've already read on the portal doesn't need an email any more.
    if (row.category === "message" && row.conversation_id && row.message_at && row.user_id) {
      const { data: read } = await service
        .from("chat_reads")
        .select("last_read_at")
        .eq("conversation_id", row.conversation_id)
        .eq("user_id", row.user_id)
        .maybeSingle();
      const readAt = (read as { last_read_at: string } | null)?.last_read_at;
      if (readAt && new Date(readAt) >= new Date(row.message_at)) {
        await service.from("email_outbox").update({ status: "skipped", last_error: "Already read on the portal" }).eq("id", row.id);
        skipped++;
        continue;
      }
    }
    try {
      const email = renderEmail(row);
      const headers: Record<string, string> = {};
      if (email.oneClick) {
        headers["List-Unsubscribe"] = `<${email.oneClick}>`;
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
      const raw = buildMime({
        fromName: SENDER_NAME,
        fromEmail: s.sender_email,
        toName: row.to_name,
        toEmail: row.to_email,
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers
      });
      const gmailId = await sendRaw(token, raw);
      await service.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), gmail_id: gmailId, last_error: null }).eq("id", row.id);
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't send";
      if (e instanceof GmailError && (e.limitReached || e.disconnected)) {
        // Stop here: this one and the rest wait for the next run (or for an admin to reconnect).
        await putBack(service, rows.slice(i).map((r) => r.id), message);
        if (e.disconnected) await service.from("email_settings").update({ last_error: message, last_error_at: new Date().toISOString() }).eq("id", true);
        note = e.limitReached ? "Gmail's daily limit was reached; the rest go tomorrow." : message;
        break;
      }
      await service
        .from("email_outbox")
        .update({ status: row.attempts >= 3 ? "failed" : "queued", last_error: message.slice(0, 500) })
        .eq("id", row.id);
      failed++;
    }
  }
  if (sent && !note) await service.from("email_settings").update({ last_error: null, last_error_at: null }).eq("id", true);
  return { sent, skipped, failed, waiting: await waitingCount(), note };
}
