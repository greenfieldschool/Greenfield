import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, CircleAlert, Mail, Send, Unplug } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { formatLagosDate } from "@/lib/lagos-dates";
import { googleConfigured } from "@/lib/email/gmail";
import { DAILY_LIMIT, runOutbox } from "@/lib/email/outbox";
import { decryptSecret } from "@/lib/email/secret";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { FormSection } from "@/components/ui/form-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";

// Settings → Email (Gmail): connect the school's Gmail account, see how sending is going, send a test.
// The connection itself is made by /api/email/google/start and /callback; sending by lib/email/outbox.ts.

const PATH = "/admin/settings";

function back(message: string, type: "success" | "error" = "success"): never {
  redirect(`${PATH}?toast=${encodeURIComponent(message)}&toast_type=${type}#email`);
}

async function requireAdmin() {
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) back("Server error — please try again later.", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  if (!user || !["admin", "super_admin"].includes((me as { role?: string } | null)?.role ?? "")) back("Only admins can change email settings.", "error");
  return { supabase, user };
}

function resultMessage(r: Awaited<ReturnType<typeof runOutbox>>) {
  const parts = [`${r.sent} sent`];
  if (r.skipped) parts.push(`${r.skipped} not needed (already read or switched off)`);
  if (r.failed) parts.push(`${r.failed} couldn't be sent`);
  if (r.waiting) parts.push(`${r.waiting} still waiting`);
  return `${parts.join(", ")}.${r.note ? ` ${r.note}` : ""}`;
}

async function sendTestEmail() {
  "use server";
  const { user } = await requireAdmin();
  const service = getSupabaseServiceClient() as SupabaseClient | null;
  if (!service) back("The school's service key is not set on the server.", "error");
  const { error } = await service.rpc("email_enqueue", {
    p_user: user.id,
    p_category: "test",
    p_subject: "Test email from the school website",
    p_heading: "Email from the school website is working",
    p_body: "If you can read this, parents will get notifications, message alerts and announcements by email from this address.",
    p_link: "/admin/settings",
    p_ref: null,
    p_priority: 0
  });
  if (error) back(/does not exist|schema cache|function/i.test(error.message) ? "Run the database update 20261110_email.sql first." : error.message, "error");
  const result = await runOutbox(5);
  revalidatePath(PATH);
  back(result.sent ? `Test email sent to ${user.email}. Check that inbox (and Spam the first time).` : `The test didn't go: ${resultMessage(result)}`, result.sent ? "success" : "error");
}

async function sendNow() {
  "use server";
  await requireAdmin();
  const result = await runOutbox(40);
  revalidatePath(PATH);
  back(resultMessage(result), result.failed || (result.note && !result.sent) ? "error" : "success");
}

async function disconnectGmail() {
  "use server";
  await requireAdmin();
  const service = getSupabaseServiceClient() as SupabaseClient | null;
  if (!service) back("The school's service key is not set on the server.", "error");
  const { data } = await service.from("email_settings").select("refresh_token_enc").eq("id", true).maybeSingle();
  const refresh = data ? decryptSecret((data as { refresh_token_enc: string }).refresh_token_enc) : null;
  // Also withdraw the website's access at Google, so the key can't be used again.
  if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => undefined);
  await service.from("email_settings").delete().eq("id", true);
  revalidatePath(PATH);
  back("Gmail disconnected. Emails wait in the queue until it's connected again.");
}

type Status = { sender_email: string | null; connected_at: string | null; last_error: string | null; last_error_at: string | null; sent_24h: number; queued: number; failed_7d: number };

export async function EmailSection() {
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("email_status");
  const status = (Array.isArray(data) ? data[0] : null) as Status | null;
  const missingDb = Boolean(error && /does not exist|schema cache|function/i.test(error.message));
  const checks = [
    { ok: googleConfigured(), label: "Google sign-in details (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) and EMAIL_TOKEN_KEY" },
    { ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), label: "The school's service key (SUPABASE_SERVICE_ROLE_KEY)" },
    { ok: Boolean(process.env.CRON_SECRET), label: "CRON_SECRET, for the job that sends every few minutes" },
    { ok: !missingDb, label: "Database update 20261110_email.sql" }
  ];
  const ready = checks.every((c) => c.ok);
  const connected = Boolean(status?.sender_email);

  return (
    <FormSection
      id="email"
      title="Email (Gmail)"
      description="Parents get their notifications, new-message alerts and school announcements by email from the school's Gmail account. Each parent can switch any of these off."
    >
      <div className="space-y-4">
        {!ready ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Set-up on the server</div>
            <ul className="mt-2 space-y-1.5">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm text-slate-700">
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-600" aria-hidden="true" />
                  ) : (
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold-600" aria-hidden="true" />
                  )}
                  <span>
                    {c.label}
                    <span className="sr-only">{c.ok ? " (done)" : " (not done yet)"}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Whoever looks after the website follows docs/email-setup.md once; then connect Gmail here.</p>
          </div>
        ) : null}

        {connected && status ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green" dot>
                Connected
              </Badge>
              <span className="text-sm text-slate-700">
                Sending from <span className="font-semibold">{status.sender_email}</span> since {formatLagosDate(status.connected_at)}
              </span>
            </div>
            {status.last_error ? (
              <Alert tone="danger" title="Sending has a problem">
                {status.last_error}
              </Alert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium text-slate-500">Sent in the last 24 hours</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                  {status.sent_24h} <span className="text-sm font-normal text-slate-500">of {DAILY_LIMIT}</span>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium text-slate-500">Waiting to go</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{status.queued}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-medium text-slate-500">Couldn&apos;t be sent (7 days)</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{status.failed_7d}</div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              A free Gmail account can send to about 500 people a day, so the website stops at {DAILY_LIMIT}. Messages go first, then notifications, then
              announcements; anything over the limit goes the next day.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={sendTestEmail}>
                <SubmitButton variant="primary" size="sm" pendingText="Sending…">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    Send me a test email
                  </span>
                </SubmitButton>
              </form>
              {status.queued ? (
                <form action={sendNow}>
                  <SubmitButton variant="secondary" size="sm" pendingText="Sending…">
                    <span className="inline-flex items-center gap-1.5">
                      <Send className="h-4 w-4" aria-hidden="true" />
                      Send waiting emails now
                    </span>
                  </SubmitButton>
                </form>
              ) : null}
              <a href="/api/email/google/start" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Reconnect
              </a>
              <form action={disconnectGmail}>
                <ConfirmSubmitButton
                  confirmMessage="Disconnect Gmail? No emails will be sent until it's connected again (they wait in the queue)."
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  <Unplug className="h-4 w-4" aria-hidden="true" />
                  Disconnect
                </ConfirmSubmitButton>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-700">
              Not connected. Click below and sign in to Google as <span className="font-semibold">greenfieldschslekki@gmail.com</span>, then allow the website to
              send email. It can only send; it can&apos;t read the mailbox.
            </p>
            {status?.queued ? <p className="text-sm text-slate-600">{status.queued} emails are waiting and will go once Gmail is connected.</p> : null}
            {ready ? (
              <a href="/api/email/google/start" className={buttonClasses({ variant: "primary" })}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Connect Gmail
              </a>
            ) : (
              <button type="button" disabled className={buttonClasses({ variant: "secondary" })}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Connect Gmail (finish the set-up above first)
              </button>
            )}
          </>
        )}
      </div>
    </FormSection>
  );
}
