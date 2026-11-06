// Server only. Talks to Google directly (no extra packages): OAuth to connect the school's Gmail account once, then
// the Gmail API to send. Scopes: send email only (plus the account's address), never read the mailbox.

export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"];

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://greenfieldschool.ng").replace(/\/$/, "");

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.EMAIL_TOKEN_KEY);
}

export function googleAuthUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    // Always ask, so Google returns a long-lived key even when reconnecting.
    prompt: "consent",
    include_granted_scopes: "true",
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }),
    cache: "no-store"
  });
  return (await res.json().catch(() => ({ error: "bad_response" }))) as TokenResponse;
}

export async function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

export class GmailError extends Error {
  constructor(
    message: string,
    /** The connection itself is broken (key withdrawn or expired): an admin must reconnect. */
    public readonly disconnected = false,
    /** Gmail's daily sending limit was reached: try again tomorrow. */
    public readonly limitReached = false
  ) {
    super(message);
  }
}

export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  if (!t.access_token) {
    const gone = t.error === "invalid_grant" || t.error === "unauthorized_client";
    throw new GmailError(gone ? "The Gmail connection has expired or was removed. Reconnect it in Settings." : `Google refused: ${t.error ?? "unknown"}`, gone);
  }
  return t.access_token;
}

export async function accountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const data = (await res.json().catch(() => null)) as { email?: string; email_verified?: boolean } | null;
  return data?.email && data.email_verified !== false ? data.email : null;
}

export async function sendRaw(accessToken: string, raw: string): Promise<string> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
    cache: "no-store"
  });
  const data = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> } } | null;
  if (res.ok && data?.id) return data.id;
  const reason = data?.error?.errors?.[0]?.reason ?? data?.error?.status ?? String(res.status);
  const limit = res.status === 429 || /dailyLimitExceeded|userRateLimitExceeded|rateLimitExceeded|quotaExceeded/i.test(reason);
  throw new GmailError(data?.error?.message ?? `Gmail refused the email (${reason})`, res.status === 401 || (res.status === 403 && /insufficient|scope/i.test(reason)), limit);
}
