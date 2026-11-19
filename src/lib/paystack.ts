import { createHmac, timingSafeEqual } from "crypto";

// Paystack (expenses wallet). Server only: the secret key never reaches the browser. Set PAYSTACK_SECRET_KEY on
// Vercel (see docs/spending-setup.md). Without it, the pages hide "Pay through Paystack" and bank checks.
// Amounts go to Paystack in kobo.

const BASE = "https://api.paystack.co";

export function paystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export class PaystackError extends Error {}

async function call<T>(path: string, init?: RequestInit & { revalidate?: number }): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackError("Paystack isn't connected yet.");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...(init?.revalidate ? { next: { revalidate: init.revalidate } } : { cache: "no-store" }),
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new PaystackError("Couldn't reach Paystack. Check the internet connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !body?.status) {
    throw new PaystackError(body?.message ? `Paystack: ${body.message}` : `Paystack didn't accept that (error ${res.status}).`);
  }
  return body.data as T;
}

export type Bank = { name: string; code: string };

/** Nigerian banks that can receive transfers (cached for a day). */
export async function listBanks(): Promise<Bank[]> {
  if (!paystackConfigured()) return [];
  try {
    const data = await call<Array<{ name: string; code: string; active: boolean; supports_transfer?: boolean }>>(
      "/bank?country=nigeria&perPage=200",
      { revalidate: 86400 }
    );
    return data
      .filter((b) => b.active !== false && b.supports_transfer !== false)
      .map((b) => ({ name: b.name, code: b.code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** The name the bank holds for an account. */
export async function resolveAccount(accountNumber: string, bankCode: string): Promise<string> {
  const data = await call<{ account_name: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`
  );
  return data.account_name;
}

export async function createRecipient(p: { name: string; accountNumber: string; bankCode: string }) {
  const data = await call<{ recipient_code: string; details?: { account_name?: string } }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({ type: "nuban", name: p.name, account_number: p.accountNumber, bank_code: p.bankCode, currency: "NGN" })
  });
  return { code: data.recipient_code, accountName: data.details?.account_name ?? null };
}

export type TransferState = { status: string; transferCode: string | null; reason?: string | null };

export async function initiateTransfer(p: { amount: number; recipient: string; reference: string; reason: string }): Promise<TransferState> {
  const data = await call<{ status: string; transfer_code: string }>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(p.amount * 100),
      recipient: p.recipient,
      reference: p.reference,
      reason: p.reason.slice(0, 100)
    })
  });
  return { status: data.status, transferCode: data.transfer_code ?? null };
}

export async function finalizeTransfer(transferCode: string, otp: string): Promise<TransferState> {
  const data = await call<{ status: string; transfer_code: string }>("/transfer/finalize_transfer", {
    method: "POST",
    body: JSON.stringify({ transfer_code: transferCode, otp })
  });
  return { status: data.status, transferCode: data.transfer_code ?? transferCode };
}

export async function resendOtp(transferCode: string): Promise<void> {
  await call("/transfer/resend_otp", { method: "POST", body: JSON.stringify({ transfer_code: transferCode, reason: "transfer" }) });
}

export async function verifyTransfer(reference: string): Promise<TransferState> {
  const data = await call<{ status: string; transfer_code: string; reason?: string | null }>(
    `/transfer/verify/${encodeURIComponent(reference)}`
  );
  return { status: data.status, transferCode: data.transfer_code ?? null, reason: data.reason ?? null };
}

/** Naira in the Paystack balance, or null if it can't be read. */
export async function walletBalance(): Promise<number | null> {
  if (!paystackConfigured()) return null;
  try {
    const data = await call<Array<{ currency: string; balance: number }>>("/balance");
    const ngn = data.find((b) => b.currency === "NGN") ?? data[0];
    return ngn ? ngn.balance / 100 : null;
  } catch {
    return null;
  }
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body, using the secret key. */
export function validWebhookSignature(rawBody: string, signature: string | null): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = Buffer.from(createHmac("sha512", key).update(rawBody).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Paystack's own status words → what spending_paystack_result() understands. */
export function resultStatus(status: string): "success" | "failed" | "reversed" | "abandoned" | "otp" | "pending" {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "reversed":
      return "reversed";
    case "abandoned":
      return "abandoned";
    case "otp":
      return "otp";
    default:
      return "pending";
  }
}

/** Account names from two sources match closely enough (case, punctuation and word order ignored). */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  return norm(a) === norm(b);
}
