import { SITE_URL } from "./gmail";
import { sign } from "./secret";

// The school's email: one simple layout for every kind (works in Gmail, Outlook and phone mail apps: tables, inline
// styles, no images to download), plus a plain-text version.

export type EmailCategory = "notification" | "message" | "announcement" | "test";

export type OutboxRow = {
  id: string;
  user_id: string | null;
  to_email: string;
  to_name: string | null;
  category: EmailCategory;
  subject: string;
  heading: string;
  body: string | null;
  link: string | null;
};

const WHY: Record<EmailCategory, string> = {
  notification: "You get these because notification emails are on for your Greenfield School portal account.",
  message: "You get these because you have message emails on for your Greenfield School portal account.",
  announcement: "You get these because school announcement emails are on for your Greenfield School portal account.",
  test: "This is a test email sent by a Greenfield School admin."
};

const BUTTON: Record<EmailCategory, string> = {
  notification: "Open it on the portal",
  message: "Read and reply",
  announcement: "Read on the portal",
  test: "Open the portal"
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Signed link to stop one kind of email, without signing in (the page asks to confirm). */
export function unsubscribeUrl(userId: string, category: EmailCategory, oneClick = false) {
  const sig = sign(`${userId}:${category}`);
  const q = `u=${encodeURIComponent(userId)}&c=${category}&s=${sig}`;
  // Mail apps' own "Unsubscribe" button posts straight to the API (one click, RFC 8058).
  return oneClick ? `${SITE_URL}/api/email/unsubscribe?${q}` : `${SITE_URL}/email/unsubscribe?${q}`;
}

export function renderEmail(row: OutboxRow) {
  const link = `${SITE_URL}${row.link && (row.link.startsWith("/portal/") || row.link.startsWith("/admin/")) ? row.link : "/portal"}`;
  const stop = row.user_id && row.category !== "test" ? unsubscribeUrl(row.user_id, row.category) : null;
  const greeting = row.to_name ? `Dear ${row.to_name.split(" ")[0]},` : "Hello,";
  const body = (row.body ?? "").trim();

  const text = [
    greeting,
    "",
    row.heading,
    body ? `\n${body}` : "",
    "",
    `${BUTTON[row.category]}: ${link}`,
    "",
    "—",
    "Greenfield School, Lekki, Lagos",
    WHY[row.category],
    stop ? `Stop these emails: ${stop}` : ""
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(row.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:#0B3D2E;padding:16px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:12px;vertical-align:middle;"><img src="${SITE_URL}/app-icon/192" width="44" height="44" alt="Greenfield crest" style="display:block;border:0;border-radius:10px;"></td>
<td style="vertical-align:middle;">
<span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.2px;">Greenfield School</span>
<span style="color:#EDC54C;font-size:12px;display:block;margin-top:2px;text-transform:uppercase;letter-spacing:1px;">${row.category === "announcement" ? "School announcement" : row.category === "message" ? "New message" : "Parent portal"}</span>
</td></tr></table>
</td></tr>
<tr><td style="padding:24px;">
<p style="margin:0 0 12px;font-size:15px;">${esc(greeting)}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:#0f172a;">${esc(row.heading)}</h1>
${body ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">${esc(body).replace(/\n/g, "<br>")}</p>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#0B3D2E;">
<a href="${esc(link)}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${BUTTON[row.category]}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
Greenfield School, Lekki, Lagos<br>${esc(WHY[row.category])}${stop ? `<br><a href="${esc(stop)}" style="color:#64748b;">Stop these emails</a>` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: row.subject, text, html, unsubscribe: stop, oneClick: row.user_id && row.category !== "test" ? unsubscribeUrl(row.user_id, row.category, true) : null };
}
