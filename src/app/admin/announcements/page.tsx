import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Megaphone, Send } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatLagosDate } from "@/lib/lagos-dates";
import { runOutbox } from "@/lib/email/outbox";
import UrlToast from "@/components/url-toast";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";

// Admins: send a school announcement to the whole school, a level or a class. It shows on the portal with a
// notification, and (if ticked) is emailed to parents through the school's Gmail (migration 20261110_email.sql).

const PATH = "/admin/announcements";
const LEVELS = [
  { value: "creche", label: "Creche" },
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" }
];

type Row = { id: string; title: string; body: string; audience: "school" | "level" | "class"; level: string | null; class_id: string | null; send_email: boolean; author_name: string | null; created_at: string };

function back(message: string, type: "success" | "error" = "success"): never {
  redirect(`${PATH}?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

async function sendAnnouncement(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "").trim().replace(/\s+/g, " ");
  const body = String(formData.get("body") ?? "").trim();
  const target = String(formData.get("audience") ?? "school");
  const sendEmail = formData.get("send_email") === "on";
  if (title.length < 2) back("Give it a title", "error");
  if (body.length < 2) back("Write the announcement", "error");

  let audience: "school" | "level" | "class" = "school";
  let level: string | null = null;
  let classId: string | null = null;
  if (target.startsWith("level:")) {
    audience = "level";
    level = target.slice(6);
  } else if (target.startsWith("class:")) {
    audience = "class";
    classId = target.slice(6);
  }

  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) back("Server error — please try again later.", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null };
  const { error } = await supabase.from("announcements").insert({
    title,
    body,
    audience,
    level,
    class_id: classId,
    send_email: sendEmail,
    author_name: (me as { full_name?: string | null } | null)?.full_name || "School office"
  });
  if (error) {
    back(
      /does not exist|schema cache/i.test(error.message)
        ? "Announcements need a database update first: 20261110_email.sql."
        : /row-level security|permission/i.test(error.message)
          ? "Only admins can send school announcements."
          : error.message,
      "error"
    );
  }
  // Start sending straight away; the scheduled job carries on with the rest.
  const result = sendEmail ? await runOutbox(40).catch(() => null) : null;
  revalidatePath(PATH);
  back(
    sendEmail
      ? `Announcement sent. It's on the portal now${result ? `; ${result.sent} email${result.sent === 1 ? "" : "s"} sent${result.waiting ? `, ${result.waiting} more on the way` : ""}` : ""}.`
      : "Announcement sent. It's on the portal now (no emails)."
  );
}

export default async function AnnouncementsPage() {
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) return null;

  const [{ data, error }, { data: classData }, { data: emailStatus }] = await Promise.all([
    supabase.from("announcements").select("id, title, body, audience, level, class_id, send_email, author_name, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase.rpc("email_status")
  ]);
  const items = (data ?? []) as Row[];
  const classes = (classData ?? []) as Array<{ id: string; level: string; name: string }>;
  const className = new Map(classes.map((c) => [c.id, c.name] as const));
  const gmail = (Array.isArray(emailStatus) ? emailStatus[0] : null) as { sender_email: string | null } | null;
  const audienceLabel = (a: Row) =>
    a.audience === "school" ? "Whole school" : a.audience === "level" ? `${LEVELS.find((l) => l.value === a.level)?.label ?? a.level} section` : className.get(a.class_id ?? "") ?? "A class";

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.announcements}
        eyebrow="Admin"
        title="School announcements"
        description="Tell families something: the whole school, one section, or one class. It appears on the portal with a notification, and can be emailed to parents too."
      />

      {error ? <Alert tone="warning">Announcements need a database update first. Ask the school&apos;s IT person to run 20261110_email.sql.</Alert> : null}

      <Card>
        <CardHeader title="New announcement" description="Pupils and parents see it on the portal straight away. Check it carefully: it can't be unsent." />
        <form action={sendAnnouncement} className="space-y-4 px-5 pb-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <label htmlFor="an-title" className="gf-label">
                Title
              </label>
              <input id="an-title" name="title" required minLength={2} maxLength={160} className="gf-input" placeholder="e.g. Mid-term break: school closes Friday at 12 noon" />
            </div>
            <div>
              <label htmlFor="an-audience" className="gf-label">
                Who for
              </label>
              <select id="an-audience" name="audience" defaultValue="school" className="gf-select">
                <option value="school">Whole school</option>
                <optgroup label="A section">
                  {LEVELS.map((l) => (
                    <option key={l.value} value={`level:${l.value}`}>
                      {l.label} section
                    </option>
                  ))}
                </optgroup>
                <optgroup label="A class">
                  {classes.map((c) => (
                    <option key={c.id} value={`class:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="an-body" className="gf-label">
              Announcement
            </label>
            <textarea id="an-body" name="body" required minLength={2} maxLength={10000} rows={7} className="gf-input" placeholder="What families need to know: dates, times, what to bring, who to contact." />
          </div>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" name="send_email" defaultChecked={Boolean(gmail?.sender_email)} className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-green focus:ring-brand-green-500" />
            <span>
              Also email parents
              <span className="block text-xs text-slate-500">
                {gmail?.sender_email
                  ? `From ${gmail.sender_email}. Parents who switched announcement emails off won't get one. A free Gmail account sends about 450 a day; the rest go the next day.`
                  : "Gmail isn't connected yet (Settings → Email), so emails will wait and go once it is."}
              </span>
            </span>
          </label>
          <ConfirmSubmitButton confirmMessage="Send this announcement now? Families will see it straight away and it can't be unsent." className={buttonClasses({ variant: "primary" })}>
            <Send className="h-4 w-4" aria-hidden="true" />
            Send announcement
          </ConfirmSubmitButton>
        </form>
      </Card>

      <Card>
        <CardHeader title="Sent" description="Newest first." />
        {items.length ? (
          <ul className="divide-y divide-slate-100">
            {items.map((a) => (
              <li key={a.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{a.title}</span>
                  <Badge tone="slate">{audienceLabel(a)}</Badge>
                  {a.send_email ? <Badge tone="blue">Emailed</Badge> : null}
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                <div className="mt-1 text-xs text-slate-500">
                  {formatLagosDate(a.created_at)}
                  {a.author_name ? ` · ${a.author_name}` : ""}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <CardBody>
            <EmptyState icon={Megaphone} title="No announcements yet" description="Your first one will show here." />
          </CardBody>
        )}
      </Card>
    </div>
  );
}
