// Run with: node --experimental-strip-types run.ts  (env set inline)
process.env.EMAIL_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.GOOGLE_CLIENT_ID = "cid";
process.env.GOOGLE_CLIENT_SECRET = "csecret";
process.env.EMAIL_DAILY_LIMIT = "5";

const { buildMime } = await import("./lib/mime.ts");
const { encryptSecret, decryptSecret, sign, verifySignature } = await import("./lib/secret.ts");
const { renderEmail } = await import("./lib/templates.ts");
const { readUnsubscribe } = await import("./lib/preferences.ts");

let problems = 0;
const check = (label: string, ok: boolean, extra = "") => {
  if (ok) console.log("ok      ", label);
  else { problems++; console.log("WRONG   ", label, extra); }
};

// MIME
const raw = buildMime({ fromName: "Greenfield School", fromEmail: "school@gmail.com", toName: "Mrs Adébáyọ̀ \"Ada\"", toEmail: "ada@gmail.com", subject: "New assignment: Fractions · Mathematics", text: "Hello ✓", html: "<p>Hello ✓</p>", headers: { "List-Unsubscribe": "<https://x/y>" } });
const mime = Buffer.from(raw, "base64url").toString("utf8");
check("raw is base64url (no + or /)", !/[+/=]/.test(raw));
check("subject with · is encoded", /Subject: =\?UTF-8\?B\?/.test(mime));
check("name with accents is encoded and quotes removed", /To: "=\?UTF-8\?B\?[^"]+\?=" <ada@gmail.com>/.test(mime) && !mime.includes('"Ada"'));
check("plain and html parts", mime.includes("text/plain") && mime.includes("text/html"));
check("list-unsubscribe header", mime.includes("List-Unsubscribe: <https://x/y>"));
const htmlPart = mime.split("text/html")[1].split("\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
check("html body decodes", Buffer.from(htmlPart, "base64").toString("utf8") === "<p>Hello ✓</p>");
const inj = buildMime({ fromName: "A", fromEmail: "a@b.c", toEmail: "x@y.z", subject: "Hi\r\nBcc: evil@x.com", text: "t", html: "h" });
check("no header injection through the subject", !Buffer.from(inj, "base64url").toString().includes("\r\nBcc:"));

// Secrets
const sealed = encryptSecret("1//refresh-token");
check("encrypt / decrypt round trip", decryptSecret(sealed) === "1//refresh-token");
check("tampered secret is refused", decryptSecret(sealed.slice(0, -4) + "AAAA") === null);
const u = "00000000-0000-0000-0000-000000000005";
check("signed unsubscribe link accepted", readUnsubscribe({ u, c: "message", s: sign(`${u}:message`) })?.category === "message");
check("link for another person refused", readUnsubscribe({ u: "00000000-0000-0000-0000-000000000006", c: "message", s: sign(`${u}:message`) }) === null);
check("link changed to another kind refused", readUnsubscribe({ u, c: "announcement", s: sign(`${u}:message`) }) === null);
check("verifySignature rejects junk", !verifySignature("x", "junk"));

// Template
const e = renderEmail({ id: "1", user_id: u, to_email: "ada@gmail.com", to_name: "Ada Okafor", category: "announcement", subject: "Sports <day>", heading: "Sports <script>alert(1)</script>", body: "Line 1\nLine 2 & more", link: "/portal/announcements/9" });
check("html escapes heading", e.html.includes("Sports &lt;script&gt;") && !e.html.includes("<script>"));
check("body keeps line breaks", e.html.includes("Line 1<br>Line 2 &amp; more"));
check("greets by first name", e.text.startsWith("Dear Ada,"));
check("button links to the portal page", e.html.includes("https://greenfieldschool.ng/portal/announcements/9"));
check("has a stop link and a one-click link", Boolean(e.unsubscribe?.includes("/email/unsubscribe?")) && Boolean(e.oneClick?.includes("/api/email/unsubscribe?")));
const bad = renderEmail({ id: "2", user_id: u, to_email: "a@b.c", to_name: null, category: "notification", subject: "x", heading: "x", body: null, link: "https://evil.example" });
check("links outside the portal fall back to the portal", bad.html.includes('href="https://greenfieldschool.ng/portal"') && !bad.html.includes("evil.example"));

// Sending job with a fake database and a fake Google.
type Row = Record<string, any>;
function fakeService(rows: Row[], settings: Row | null, reads: Row[] = []) {
  const updates: Row[] = [];
  const q = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let head = false;
    let patch: Row | null = null;
    const api: any = {
      select: (_c: string, o?: any) => { head = Boolean(o?.head); return api; },
      eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return api; },
      in: (k: string, vs: any[]) => { filters.push((r) => vs.includes(r[k])); return api; },
      gte: (k: string, v: any) => { filters.push((r) => r[k] >= v); return api; },
      update: (p: Row) => { patch = p; return api; },
      maybeSingle: () => api,
      then: (resolve: any) => {
        const src = table === "email_settings" ? (settings ? [settings] : []) : table === "chat_reads" ? reads : rows;
        const hit = src.filter((r) => filters.every((f) => f(r)));
        if (patch) { hit.forEach((r) => Object.assign(r, patch)); updates.push({ table, patch, n: hit.length }); return resolve({ data: null, error: null }); }
        if (head) return resolve({ count: hit.length, data: null, error: null });
        return resolve({ data: table === "email_settings" || table === "chat_reads" ? hit[0] ?? null : hit, error: null });
      }
    };
    return api;
  };
  return {
    updates,
    from: q,
    rpc: async (name: string, args: any) => {
      if (name === "email_requeue_stuck") return { data: 0, error: null };
      if (name === "email_claim") {
        const take = rows.filter((r) => r.status === "queued").sort((a, b) => a.priority - b.priority).slice(0, args.p_limit);
        take.forEach((r) => { r.status = "sending"; r.attempts += 1; });
        return { data: take.map((r) => ({ ...r })), error: null };
      }
      return { data: null, error: null };
    }
  };
}
const mk = (i: number, o: Row = {}): Row => ({ id: `e${i}`, user_id: u, to_email: `p${i}@gmail.com`, to_name: "Parent", category: "notification", subject: `S${i}`, heading: `H${i}`, body: "B", link: "/portal/x", priority: 2, status: "queued", attempts: 0, conversation_id: null, message_at: null, ...o });

let sends: string[] = [];
let mode: "ok" | "limit-after-2" | "expired" = "ok";
(globalThis as any).fetch = async (url: string, init: any) => {
  if (url.includes("oauth2.googleapis.com/token")) {
    if (mode === "expired") return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    return new Response(JSON.stringify({ access_token: "at" }), { status: 200 });
  }
  if (url.includes("gmail.googleapis.com")) {
    if (mode === "limit-after-2" && sends.length >= 2) return new Response(JSON.stringify({ error: { message: "Daily limit", errors: [{ reason: "dailyLimitExceeded" }] } }), { status: 429 });
    sends.push(JSON.parse(init.body).raw);
    return new Response(JSON.stringify({ id: `g${sends.length}` }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};
const { runOutbox } = await import("./lib/outbox.ts");
const settings = { id: true, sender_email: "greenfieldschslekki@gmail.com", refresh_token_enc: encryptSecret("rt") };

// 1. Normal run: a read message is skipped, the rest go, messages first.
let rows = [mk(1), mk(2, { category: "message", priority: 1, conversation_id: "c1", message_at: "2026-11-06T10:00:00Z" }), mk(3, { category: "message", priority: 1, conversation_id: "c2", message_at: "2026-11-06T10:00:00Z" })];
(globalThis as any).__service = fakeService(rows, settings, [{ conversation_id: "c1", user_id: u, last_read_at: "2026-11-06T10:05:00Z" }]);
sends = []; mode = "ok";
let r = await runOutbox(10);
check("sends 2, skips the message already read", r.sent === 2 && r.skipped === 1, JSON.stringify(r));
check("statuses saved", rows.filter((x) => x.status === "sent").length === 2 && rows.find((x) => x.id === "e2")?.status === "skipped");
const firstSent = Buffer.from(sends[0], "base64url").toString();
check("messages go before notifications", firstSent.includes("To: \"Parent\" <p3@gmail.com>"));
check("sent from the school's account with the school name", firstSent.includes('From: "Greenfield School" <greenfieldschslekki@gmail.com>'));

// 2. Daily limit: 5 a day, 4 already sent today → only 1 goes.
rows = [mk(1), mk(2), mk(3), ...Array.from({ length: 4 }, (_, i) => mk(10 + i, { status: "sent", sent_at: new Date().toISOString() }))];
(globalThis as any).__service = fakeService(rows, settings);
sends = [];
r = await runOutbox(10);
check("keeps under the daily limit", r.sent === 1 && r.waiting === 2, JSON.stringify(r));

// 3. Gmail says the limit is reached part-way: the rest go back in the queue, nothing marked failed.
rows = [mk(1), mk(2), mk(3), mk(4)];
(globalThis as any).__service = fakeService(rows, settings);
sends = []; mode = "limit-after-2"; process.env.EMAIL_DAILY_LIMIT = "450";
r = await runOutbox(10);
check("stops at Gmail's limit and keeps the rest", r.sent === 2 && rows.filter((x) => x.status === "queued").length === 2 && !rows.some((x) => x.status === "failed"), JSON.stringify(r));

// 4. Connection expired: nothing is lost, the error is shown to admins.
rows = [mk(1), mk(2)];
const svc = fakeService(rows, settings);
(globalThis as any).__service = svc;
sends = []; mode = "expired";
r = await runOutbox(10);
check("expired connection: all go back in the queue", r.sent === 0 && rows.every((x) => x.status === "queued"), JSON.stringify(r));
check("admins see why", svc.updates.some((u2) => u2.table === "email_settings" && /Reconnect/.test(u2.patch.last_error ?? "")));

// 5. Not connected.
(globalThis as any).__service = fakeService([mk(1)], null);
r = await runOutbox(10);
check("not connected: nothing sent, says so", r.sent === 0 && /isn't connected/.test(r.note ?? ""), JSON.stringify(r));

console.log(problems ? `${problems} problem(s)` : "all checks passed");
