// Builds the email Gmail sends: a plain-text and an HTML version (UTF-8), with names and subject encoded so
// Nigerian names and "·" survive every mail app.

function encodeWord(s: string) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function address(name: string | null | undefined, email: string) {
  const clean = (name ?? "").replace(/["\r\n<>]/g, "").trim();
  return clean ? `"${encodeWord(clean)}" <${email}>` : `<${email}>`;
}

function wrap76(b64: string) {
  return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

export function buildMime(m: {
  fromName: string;
  fromEmail: string;
  toName?: string | null;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}) {
  const boundary = `gf_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const lines = [
    `From: ${address(m.fromName, m.fromEmail)}`,
    `To: ${address(m.toName, m.toEmail)}`,
    `Subject: ${encodeWord(m.subject.replace(/[\r\n]+/g, " "))}`,
    "MIME-Version: 1.0",
    ...Object.entries(m.headers ?? {}).map(([k, v]) => `${k}: ${v.replace(/[\r\n]+/g, " ")}`),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(m.text, "utf8").toString("base64")),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(m.html, "utf8").toString("base64")),
    `--${boundary}--`,
    ""
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}
