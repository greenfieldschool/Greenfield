import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function getHeader(req: Request, name: string) {
  const v = req.headers.get(name);
  return v ? v.trim() : "";
}

function verifySignatureWithHeaders(rawBody: string, secret: string, signature: string, webhookId: string, timestamp: string) {
  const data = `${webhookId}__${timestamp}__${rawBody}`;
  const computed = crypto.createHmac("sha256", secret).update(data, "utf8").digest("base64");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function asNumber(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function scaledAmount(raw: number) {
  const scaleRaw = (process.env.MONIEPOINT_AMOUNT_SCALE ?? "100").trim();
  const scale = Number(scaleRaw);
  if (!Number.isFinite(scale) || scale <= 0) return raw;
  return raw / scale;
}

export async function POST(req: Request) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Server is missing Supabase service configuration." },
      { status: 500 }
    );
  }

  const rawBody = await req.text().catch(() => "");
  if (!rawBody) {
    return NextResponse.json({ ok: false, error: "Missing body." }, { status: 400 });
  }

  const secret = (process.env.MONIEPOINT_WEBHOOK_SECRET ?? "").trim();
  const signature = getHeader(req, "moniepoint-webhook-signature");
  const webhookId = getHeader(req, "moniepoint-webhook-id");
  const timestamp = getHeader(req, "moniepoint-webhook-timestamp");

  if (secret) {
    if (!signature || !webhookId || !timestamp) {
      return NextResponse.json({ ok: false, error: "Missing signature headers." }, { status: 401 });
    }
    if (!verifySignatureWithHeaders(rawBody, secret, signature, webhookId, timestamp)) {
      return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });
    }
  }

  const payload = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  })();

  if (!payload) {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const providerEventId =
    typeof payload?.eventId === "string"
      ? payload.eventId
      : typeof payload?.id === "string"
        ? payload.id
        : null;

  const eventType = typeof payload?.eventType === "string" ? payload.eventType : null;

  const dataObj = (payload?.data ?? null) as Record<string, unknown> | null;
  const referenceCandidates: Array<string> = [];
  const payloadReference = typeof payload?.reference === "string" ? payload.reference : null;
  const transactionReference = typeof dataObj?.transactionReference === "string" ? (dataObj.transactionReference as string) : null;
  const merchantReference = typeof dataObj?.merchantReference === "string" ? (dataObj.merchantReference as string) : null;

  if (payloadReference) referenceCandidates.push(payloadReference);
  if (transactionReference) referenceCandidates.push(transactionReference);
  if (merchantReference) referenceCandidates.push(merchantReference);

  const customFields = (dataObj?.customFields ?? null) as Record<string, unknown> | null;
  const customInvoiceId = typeof customFields?.["Invoice ID"] === "string" ? (customFields["Invoice ID"] as string) : null;
  if (customInvoiceId) referenceCandidates.push(customInvoiceId);

  const reference = referenceCandidates.length ? referenceCandidates[0] : null;

  const headersObj: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headersObj[key] = value;
  });

  const { data: inserted, error: insertError } = await supabase
    .from("finance_payment_events")
    .insert({
      provider: "moniepoint",
      event_type: eventType,
      provider_event_id: providerEventId,
      reference,
      payload,
      headers: headersObj
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    if (code === "23505") {
      const { data: existing } = await supabase
        .from("finance_payment_events")
        .select("id, processed_at, payment_transaction_id")
        .eq("provider", "moniepoint")
        .eq("provider_event_id", providerEventId)
        .maybeSingle();

      const existingEventId = existing?.id ?? null;
      if (existing?.processed_at && existing?.payment_transaction_id) {
        return NextResponse.json(
          { ok: true, deduped: true, event_id: existingEventId, processed: true },
          { status: 200 }
        );
      }

      // If event exists but is not processed, continue processing below.
      const eventId = existingEventId;

      const transactionStatus = typeof dataObj?.transactionStatus === "string" ? (dataObj.transactionStatus as string) : null;
      const responseCode = typeof dataObj?.responseCode === "string" ? (dataObj.responseCode as string) : null;

      const approved = transactionStatus?.toUpperCase() === "APPROVED" || responseCode === "00";
      const providerTxnId = transactionReference ?? providerEventId;

      if (!approved || !providerTxnId) {
        return NextResponse.json({ ok: true, deduped: true, event_id: eventId, processed: false }, { status: 200 });
      }

      const amountRaw = asNumber(dataObj?.amount);
      const amount = amountRaw === null ? null : scaledAmount(amountRaw);

      const intentReference = referenceCandidates.find((r) => r && r.trim().length) ?? null;
      const { data: intent } = intentReference
        ? await supabase
            .from("finance_payment_intents")
            .select("id, invoice_id, guardian_id, student_id, academic_year_id, academic_term_id, amount, currency")
            .eq("provider", "moniepoint")
            .eq("reference", intentReference)
            .maybeSingle()
        : { data: null };

      const paymentAmount = amount ?? (intent?.amount ?? null);
      const currency = (intent?.currency ?? "NGN") as string;

      if (!paymentAmount || paymentAmount <= 0) {
        return NextResponse.json({ ok: true, deduped: true, event_id: eventId, processed: false }, { status: 200 });
      }

      const { data: paymentTxn, error: paymentUpsertError } = await supabase
        .from("finance_payment_transactions")
        .upsert(
          {
            direction: "inflow",
            guardian_id: intent?.guardian_id ?? null,
            student_id: intent?.student_id ?? null,
            academic_year_id: intent?.academic_year_id ?? null,
            academic_term_id: intent?.academic_term_id ?? null,
            amount: paymentAmount,
            currency,
            provider: "moniepoint",
            provider_txn_id: providerTxnId,
            method: "online",
            reference: intentReference,
            status: "posted"
          },
          { onConflict: "provider,provider_txn_id" }
        )
        .select("id")
        .maybeSingle();

      if (paymentUpsertError || !paymentTxn?.id) {
        return NextResponse.json({ ok: true, deduped: true, event_id: eventId, processed: false }, { status: 200 });
      }

      if (intent?.invoice_id) {
        await supabase.from("finance_payment_allocations").upsert(
          {
            payment_transaction_id: paymentTxn.id,
            invoice_id: intent.invoice_id,
            amount: paymentAmount
          },
          { onConflict: "payment_transaction_id,invoice_id" }
        );
      }

      if (eventId) {
        await supabase
          .from("finance_payment_events")
          .update({ processed_at: new Date().toISOString(), payment_transaction_id: paymentTxn.id })
          .eq("id", eventId);
      }

      return NextResponse.json(
        { ok: true, deduped: true, event_id: eventId, processed: true, payment_transaction_id: paymentTxn.id },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: false, error: "Failed to record event." }, { status: 500 });
  }

  const eventId = inserted?.id ?? null;

  const transactionStatus = typeof dataObj?.transactionStatus === "string" ? (dataObj.transactionStatus as string) : null;
  const responseCode = typeof dataObj?.responseCode === "string" ? (dataObj.responseCode as string) : null;

  const approved = transactionStatus?.toUpperCase() === "APPROVED" || responseCode === "00";
  const providerTxnId = transactionReference ?? providerEventId;

  if (!approved || !providerTxnId) {
    return NextResponse.json({ ok: true, event_id: eventId, processed: false }, { status: 200 });
  }

  const amountRaw = asNumber(dataObj?.amount);
  const amount = amountRaw === null ? null : scaledAmount(amountRaw);

  const intentReference = referenceCandidates.find((r) => r && r.trim().length) ?? null;
  const { data: intent } = intentReference
    ? await supabase
        .from("finance_payment_intents")
        .select("id, invoice_id, guardian_id, student_id, academic_year_id, academic_term_id, amount, currency")
        .eq("provider", "moniepoint")
        .eq("reference", intentReference)
        .maybeSingle()
    : { data: null };

  const paymentAmount = amount ?? (intent?.amount ?? null);
  const currency = (intent?.currency ?? "NGN") as string;

  if (!paymentAmount || paymentAmount <= 0) {
    return NextResponse.json({ ok: true, event_id: eventId, processed: false }, { status: 200 });
  }

  const { data: paymentTxn, error: paymentUpsertError } = await supabase
    .from("finance_payment_transactions")
    .upsert(
      {
        direction: "inflow",
        guardian_id: intent?.guardian_id ?? null,
        student_id: intent?.student_id ?? null,
        academic_year_id: intent?.academic_year_id ?? null,
        academic_term_id: intent?.academic_term_id ?? null,
        amount: paymentAmount,
        currency,
        provider: "moniepoint",
        provider_txn_id: providerTxnId,
        method: "online",
        reference: intentReference,
        status: "posted"
      },
      { onConflict: "provider,provider_txn_id" }
    )
    .select("id")
    .maybeSingle();

  if (paymentUpsertError || !paymentTxn?.id) {
    return NextResponse.json({ ok: true, event_id: eventId, processed: false }, { status: 200 });
  }

  if (intent?.invoice_id && paymentTxn?.id) {
    await supabase.from("finance_payment_allocations").upsert(
      {
        payment_transaction_id: paymentTxn.id,
        invoice_id: intent.invoice_id,
        amount: paymentAmount
      },
      { onConflict: "payment_transaction_id,invoice_id" }
    );
  }

  if (eventId && paymentTxn?.id) {
    await supabase
      .from("finance_payment_events")
      .update({ processed_at: new Date().toISOString(), payment_transaction_id: paymentTxn.id })
      .eq("id", eventId);
  }

  return NextResponse.json({ ok: true, event_id: eventId, processed: true }, { status: 200 });
}
