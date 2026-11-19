import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { resultStatus, validWebhookSignature } from "@/lib/paystack";

// Paystack tells us how a transfer from the expenses wallet ended. Set this URL in the Paystack dashboard
// (Settings → API keys & webhooks): https://greenfieldschool.ng/api/spending/paystack-webhook
// Only signed events are used, only our own references are looked at, and the database ignores an event it has
// already handled, so a repeated event changes nothing.
const EVENTS = new Set(["transfer.success", "transfer.failed", "transfer.reversed"]);

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (!validWebhookSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let event: { event?: string; data?: { reference?: string; status?: string; transfer_code?: string; reason?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const reference = event.data?.reference ?? "";
  if (!event.event || !EVENTS.has(event.event) || !reference.startsWith("greenfield-sr-")) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const service = getSupabaseServiceClient();
  if (!service) return NextResponse.json({ ok: false }, { status: 500 });
  const status = resultStatus(event.event.replace("transfer.", ""));
  const { data, error } = await service.rpc("spending_paystack_result", {
    p_reference: reference,
    p_status: status,
    p_transfer_code: event.data?.transfer_code ?? null,
    p_message: event.data?.reason ?? null
  });
  // A 500 makes Paystack try again later, which is what we want if the database was briefly unavailable.
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
