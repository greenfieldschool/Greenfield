import Link from "next/link";
import type { ReactNode } from "react";
import { Flag, Megaphone, MessagesSquare, ShieldCheck, Users, VolumeX } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getChatRole, shortWhen } from "@/lib/chat";
import { dismissReport, muteMember, removeReportedMessage } from "@/lib/chat-actions";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/tabs";

const PATH = "/admin/messages/moderation";

type ReportRow = {
  id: string;
  reason: string;
  status: string;
  created_at: string;
  reported_by: string | null;
  resolution_note: string | null;
  chat_messages: {
    id: string;
    body: string | null;
    sender_id: string | null;
    sender_name: string | null;
    sender_label: string | null;
    created_at: string;
    removed_at: string | null;
    conversation_id: string;
    chat_conversations: { id: string; kind: string; direct_kind: string | null; class_id: string | null } | null;
  } | null;
};

export default async function MessageModerationPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const tab = typeof sp.tab === "string" && ["spaces", "direct", "muted"].includes(sp.tab) ? sp.tab : "reports";

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const role = await getChatRole(supabase, user?.id ?? null);
  if (role !== "admin") return <Alert tone="danger">Only admins can moderate messages.</Alert>;

  await supabase.rpc("chat_ensure_class_spaces");
  const [{ data: reportsData, error }, { data: classes }, { count: openCount }] = await Promise.all([
    supabase
      .from("chat_reports")
      .select(
        "id, reason, status, created_at, reported_by, resolution_note, chat_messages(id, body, sender_id, sender_name, sender_label, created_at, removed_at, conversation_id, chat_conversations(id, kind, direct_kind, class_id))"
      )
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase.from("chat_reports").select("id", { count: "exact", head: true }).eq("status", "open")
  ]);
  if (error) return <Alert tone="danger">Messaging is not set up yet. Run docs/migrations/20261025_messaging.sql in Supabase. ({error.message})</Alert>;
  const reports = (reportsData ?? []) as unknown as ReportRow[];
  const classRows = (classes ?? []) as Array<{ id: string; level: string; name: string }>;
  const className = new Map(classRows.map((c) => [c.id, c.name] as const));

  const tabs = [
    { key: "reports", label: "Reports", href: PATH, count: openCount ?? 0 },
    { key: "spaces", label: "Class spaces", href: `${PATH}?tab=spaces` },
    { key: "direct", label: "Teacher–parent messages", href: `${PATH}?tab=direct` },
    { key: "muted", label: "Muted", href: `${PATH}?tab=muted` }
  ];

  let body: ReactNode = null;

  if (tab === "reports") {
    const reporterIds = Array.from(new Set(reports.map((r) => r.reported_by).filter((v): v is string => !!v)));
    const reporters = new Map<string, string>();
    await Promise.all(
      reporterIds.map(async (rid) => {
        const { data } = await supabase.rpc("chat_identity", { p_user: rid });
        const row = ((data ?? []) as Array<{ display_name: string; label: string }>)[0];
        reporters.set(rid, row ? `${row.display_name} (${row.label})` : "Someone");
      })
    );
    body = (
      <Card>
        <CardHeader title="Reported messages" description="Remove a message (the original is kept in the school record) or dismiss the report. In class chats you can also mute the sender." />
        {reports.length ? (
          <ul className="divide-y divide-slate-100">
            {reports.map((r) => {
              const m = r.chat_messages;
              const c = m?.chat_conversations;
              const where = c?.class_id
                ? `${className.get(c.class_id) ?? "Class"} · ${c.kind === "class_announcements" ? "Announcements" : "Parents"}`
                : c?.direct_kind === "parent_parent"
                  ? "Private message between parents"
                  : "Teacher–parent message";
              return (
                <li key={r.id} className="space-y-3 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      <Badge tone="red">Reported</Badge> {shortWhen(r.created_at)} by {r.reported_by ? reporters.get(r.reported_by) : "someone"} · {where}
                    </span>
                    {c && (c.class_id || c.direct_kind === "teacher_parent") ? (
                      <Link className="font-semibold text-brand-green-700 hover:underline" href={`/admin/messages/${c.id}`}>
                        Open conversation
                      </Link>
                    ) : null}
                  </div>
                  <blockquote className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <div className="text-xs font-semibold text-slate-700">
                      {m?.sender_name ?? "Unknown"} <span className="font-normal text-slate-500">{m?.sender_label}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-slate-900">{m?.removed_at ? <em>Already removed</em> : m?.body}</p>
                  </blockquote>
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Why: </span>
                    {r.reason}
                  </p>
                  <div className="flex flex-col gap-2 lg:flex-row">
                    <form action={removeReportedMessage} className="flex flex-1 gap-2">
                      <input type="hidden" name="message_id" value={m?.id ?? ""} />
                      <input name="reason" className="gf-input" placeholder="Reason for removing (kept on record)" minLength={3} required />
                      <SubmitButton variant="danger" size="sm" pendingText="…">
                        Remove
                      </SubmitButton>
                    </form>
                    <form action={dismissReport} className="flex flex-1 gap-2">
                      <input type="hidden" name="report_id" value={r.id} />
                      <input name="note" className="gf-input" placeholder="Note (optional)" />
                      <SubmitButton variant="secondary" size="sm" pendingText="…">
                        Dismiss
                      </SubmitButton>
                    </form>
                  </div>
                  {c?.class_id && c.kind === "class_parents" && m?.sender_id ? (
                    <form action={muteMember} className="flex flex-wrap items-center gap-2 text-sm">
                      <input type="hidden" name="class_id" value={c.class_id} />
                      <input type="hidden" name="user_id" value={m.sender_id} />
                      <input type="hidden" name="back" value={PATH} />
                      <VolumeX className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      Mute {m.sender_name} in this class chat for
                      <select name="days" className="gf-select !w-auto" defaultValue="7">
                        <option value="1">1 day</option>
                        <option value="7">7 days</option>
                        <option value="30">30 days</option>
                      </select>
                      <input name="reason" className="gf-input !w-56" placeholder="Reason" />
                      <SubmitButton variant="secondary" size="sm" pendingText="…">
                        Mute
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Flag} title="No open reports" description="When a parent or teacher reports a message it appears here." />
        )}
      </Card>
    );
  }

  if (tab === "spaces") {
    const { data: convs } = await supabase.from("chat_conversations").select("id, kind, class_id, last_message_at").not("class_id", "is", null);
    const byClass = new Map<string, Array<{ id: string; kind: string; last_message_at: string | null }>>();
    for (const c of (convs ?? []) as Array<{ id: string; kind: string; class_id: string; last_message_at: string | null }>) {
      byClass.set(c.class_id, [...(byClass.get(c.class_id) ?? []), c]);
    }
    body = (
      <Card>
        <CardHeader title="Class spaces" description="Every class has an announcements channel and a parents' chat. Admins can read and post in all of them." />
        <ul className="divide-y divide-slate-100">
          {classRows.map((cl) => {
            const list = byClass.get(cl.id) ?? [];
            const ann = list.find((x) => x.kind === "class_announcements");
            const par = list.find((x) => x.kind === "class_parents");
            return (
              <li key={cl.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
                <span className="font-medium text-slate-900">
                  {cl.level} - {cl.name}
                </span>
                <span className="flex gap-4 text-sm">
                  {ann ? (
                    <Link className="inline-flex items-center gap-1 font-semibold text-brand-green-700 hover:underline" href={`/admin/messages/${ann.id}`}>
                      <Megaphone className="h-4 w-4" aria-hidden="true" />
                      Announcements <span className="font-normal text-slate-500">{shortWhen(ann.last_message_at)}</span>
                    </Link>
                  ) : null}
                  {par ? (
                    <Link className="inline-flex items-center gap-1 font-semibold text-brand-green-700 hover:underline" href={`/admin/messages/${par.id}`}>
                      <Users className="h-4 w-4" aria-hidden="true" />
                      Parents <span className="font-normal text-slate-500">{shortWhen(par.last_message_at)}</span>
                    </Link>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  if (tab === "direct") {
    const { data: convs } = await supabase
      .from("chat_conversations")
      .select("id, last_message_at")
      .eq("direct_kind", "teacher_parent")
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(50);
    const rows = await Promise.all(
      ((convs ?? []) as Array<{ id: string; last_message_at: string }>).map(async (c) => {
        const { data } = await supabase.rpc("chat_conversation_people", { p_conversation: c.id });
        return { ...c, people: (data ?? []) as Array<{ display_name: string; label: string }> };
      })
    );
    body = (
      <Card>
        <CardHeader
          title="Teacher–parent messages"
          description="Kept as a school record. Private messages between parents are not shown here unless a message is reported."
        />
        {rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/messages/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 sm:px-6">
                  <span className="text-sm">
                    {r.people.map((p, i) => (
                      <span key={i}>
                        {i ? <span className="mx-1 text-slate-400">↔</span> : null}
                        <span className="font-medium text-slate-900">{p.display_name}</span> <span className="text-slate-500">({p.label})</span>
                      </span>
                    ))}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{shortWhen(r.last_message_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={MessagesSquare} title="No teacher–parent messages yet" />
        )}
      </Card>
    );
  }

  if (tab === "muted") {
    const { data: mutes } = await supabase
      .from("chat_mutes")
      .select("class_id, user_id, muted_until, reason")
      .gt("muted_until", new Date().toISOString())
      .order("muted_until", { ascending: false });
    const rows = await Promise.all(
      ((mutes ?? []) as Array<{ class_id: string; user_id: string; muted_until: string; reason: string | null }>).map(async (m) => {
        const { data } = await supabase.rpc("chat_identity", { p_user: m.user_id, p_class: m.class_id });
        const who = ((data ?? []) as Array<{ display_name: string; label: string }>)[0];
        return { ...m, who };
      })
    );
    body = (
      <Card>
        <CardHeader title="Muted in class chats" description="Muted parents can still read the class spaces and message teachers privately." />
        {rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((m) => (
              <li key={`${m.class_id}-${m.user_id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
                <span className="text-sm">
                  <span className="font-medium text-slate-900">{m.who?.display_name ?? "Parent"}</span>{" "}
                  <span className="text-slate-500">
                    {m.who?.label} · {className.get(m.class_id)} · until {new Date(m.muted_until).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos" })}
                    {m.reason ? ` · ${m.reason}` : ""}
                  </span>
                </span>
                <form action={muteMember}>
                  <input type="hidden" name="class_id" value={m.class_id} />
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <input type="hidden" name="days" value="0" />
                  <input type="hidden" name="back" value={`${PATH}?tab=muted`} />
                  <SubmitButton variant="secondary" size="sm" pendingText="…">
                    Unmute
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={VolumeX} title="No one is muted" />
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Messages"
        title="Moderation"
        description="Keep class chats safe and on-topic. Removing a message hides it from the chat but keeps the original in the school record."
        back={{ href: "/admin/messages", label: "Messages" }}
        actions={<ShieldCheck className="h-6 w-6 text-brand-green-600" aria-hidden="true" />}
      />
      <LinkTabs tabs={tabs} active={tab} />
      {body}
    </div>
  );
}
