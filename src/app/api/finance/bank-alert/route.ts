import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { parseEmailAlert } from "@/lib/bank-match";
import { importBankLines, summaryMessage } from "@/lib/bank-import";

// Receives a bank alert email (forwarded by a Gmail script, Zapier, Make ...) and adds it to the bank inbox.
// Sure matches are recorded as payments straight away; the rest wait on Finance > Payments > Bank statement & alerts.
// Setup: docs/BANK_ALERTS.md. Needs BANK_ALERT_SECRET in the Vercel environment.
//
//   POST /api/finance/bank-alert
//   Header  x-bank-alert-secret: <BANK_ALERT_SECRET>
//   Body    JSON { "text": "<email body>", "message_id": "<optional, stops the same email counting twice>" }
//           or plain text (the email body).

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const expected = (process.env.BANK_ALERT_SECRET ?? "").trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "BANK_ALERT_SECRET is not set on the server." }, { status: 503 });
  }
  const given = (req.headers.get("x-bank-alert-secret") ?? "").trim();
  if (!given || !sameSecret(given, expected)) {
    return NextResponse.json({ ok: false, error: "Wrong or missing secret." }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Server is missing Supabase service configuration." }, { status: 500 });
  }

  const raw = await req.text().catch(() => "");
  if (!raw.trim()) return NextResponse.json({ ok: false, error: "Empty body." }, { status: 400 });

  let text = raw;
  let messageId = "";
  if ((req.headers.get("content-type") ?? "").includes("json")) {
    try {
      const body = JSON.parse(raw) as { text?: unknown; body?: unknown; message_id?: unknown };
      text = String(body.text ?? body.body ?? "");
      messageId = String(body.message_id ?? "").slice(0, 200);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
    }
  }

  const parsed = parseEmailAlert(text);
  if (!parsed.lines.length) {
    return NextResponse.json({ ok: true, added: 0, message: parsed.warning ?? "Nothing to record." });
  }

  // The email's own id keeps a re-sent email from counting twice; without one, the text decides.
  const summary = await importBankLines(supabase, parsed.lines, {
    autoRecord: (process.env.BANK_ALERT_AUTO_RECORD ?? "true").trim().toLowerCase() !== "false",
    recorder: { kind: "service" },
    fingerprintExtra: messageId || text.replace(/\s+/g, " ").trim().slice(0, 300)
  });
  if (summary.error) return NextResponse.json({ ok: false, error: summary.error }, { status: 500 });

  return NextResponse.json({ ok: true, ...summary, message: summaryMessage(summary) });
}
