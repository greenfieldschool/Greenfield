import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BellRing,
  Clock,
  Lock,
  Megaphone,
  MessageCirclePlus,
  MessagesSquare,
  Settings,
  ShieldCheck,
  UserX,
  Users
} from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  dayLabel,
  getChatRole,
  loadInbox,
  loadThread,
  outsideReplyHours,
  replyHoursText,
  shortWhen,
  timeLabel,
  UNSEND_MINUTES,
  type ChatMessage,
  type ChatRole,
  type InboxItem
} from "@/lib/chat";
import { blockUser, saveChatSettings, startConversation } from "@/lib/chat-actions";
import { school } from "@/lib/school";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Composer, LiveRefresh, MessageMenu, MessageScroller } from "./client";

export type ChatBase = "/portal/messages" | "/admin/messages";

// --- Layout ------------------------------------------------------------------------------------------------

function Shell({ list, children, threadOpen }: { list: ReactNode; children: ReactNode; threadOpen: boolean }) {
  return (
    <div className="flex h-[calc(100dvh-12rem)] min-h-[30rem] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card lg:h-[calc(100dvh-9rem)]">
      <aside className={cn("w-full shrink-0 flex-col border-r border-slate-200 md:flex md:w-80 lg:w-96", threadOpen ? "hidden" : "flex")}>
        {list}
      </aside>
      <section className={cn("min-w-0 flex-1 flex-col", threadOpen ? "flex" : "hidden md:flex")}>{children}</section>
    </div>
  );
}

function ListHeader({ base, role }: { base: ChatBase; role: ChatRole }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
      <h1 className="text-lg font-bold text-slate-900">Messages</h1>
      <div className="flex items-center gap-1">
        {role === "admin" ? (
          <Link href={`${base}/moderation`} className={buttonClasses({ variant: "ghost", size: "sm" })} title="Moderation">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Moderation</span>
          </Link>
        ) : null}
        <Link href={`${base}/settings`} className={buttonClasses({ variant: "ghost", size: "sm" })} title="Message settings">
          <Settings className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Message settings</span>
        </Link>
        <Link href={`${base}/new`} className={buttonClasses({ variant: "primary", size: "sm" })}>
          <MessageCirclePlus className="h-4 w-4" aria-hidden="true" />
          New
        </Link>
      </div>
    </div>
  );
}

function ConversationIcon({ item }: { item: Pick<InboxItem, "kind" | "title"> }) {
  if (item.kind === "class_announcements") {
    return (
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gold-50 text-brand-gold-700">
        <Megaphone className="h-5 w-5" aria-hidden="true" />
      </span>
    );
  }
  if (item.kind === "class_parents") {
    return (
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-700">
        <Users className="h-5 w-5" aria-hidden="true" />
      </span>
    );
  }
  return <Avatar name={item.title} size="md" className="shrink-0" />;
}

function InboxList({ items, base, activeId }: { items: InboxItem[]; base: ChatBase; activeId?: string }) {
  const classItems = items.filter((i) => i.kind !== "direct");
  const directItems = items.filter((i) => i.kind === "direct");
  const section = (label: string, list: InboxItem[], empty: string) => (
    <div>
      <div className="sticky top-0 z-10 bg-white/95 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
        {label}
      </div>
      {list.length ? (
        <ul>
          {list.map((i) => {
            const active = i.conversation_id === activeId;
            return (
              <li key={i.conversation_id}>
                <Link
                  href={`${base}/${i.conversation_id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 transition",
                    active ? "bg-brand-green-50" : "hover:bg-slate-50"
                  )}
                >
                  <ConversationIcon item={i} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", i.unread ? "font-bold text-slate-900" : "font-semibold text-slate-800")}>
                        {i.title}
                      </span>
                      <span className={cn("shrink-0 text-[11px]", i.unread ? "font-semibold text-brand-green-700" : "text-slate-400")}>
                        {shortWhen(i.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-xs", i.unread ? "text-slate-800" : "text-slate-500")}>
                        {i.last_preview ? `${i.kind === "direct" ? "" : `${i.last_sender ?? ""}: `}${i.last_preview}` : i.subtitle}
                      </span>
                      {i.unread ? (
                        <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-brand-green px-1.5 text-[11px] font-bold text-white">
                          {i.unread > 99 ? "99+" : i.unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-2 text-xs text-slate-500">{empty}</p>
      )}
    </div>
  );
  return (
    <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto pb-3">
      {section("Your classes", classItems, "No class spaces yet.")}
      {section("Private messages", directItems, "No private messages yet. Tap New to start one.")}
    </nav>
  );
}

async function common(base: ChatBase) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const role = await getChatRole(supabase, user?.id ?? null);
  return { supabase, userId: user?.id ?? null, role, base };
}

function NoAccess() {
  return (
    <Alert tone="info">
      Messages are for teachers, school admins and parents. Your account doesn&apos;t have access to messaging.
    </Alert>
  );
}

function MissingSetup({ message }: { message: string }) {
  return <Alert tone="danger">Messaging is not set up yet. Run docs/migrations/20261025_messaging.sql in Supabase. ({message})</Alert>;
}

// --- /messages ---------------------------------------------------------------------------------------------

export async function MessagesHome({ base }: { base: ChatBase }) {
  const ctx = await common(base);
  if (!ctx) return null;
  if (ctx.role === "none") return <NoAccess />;
  const { items, error } = await loadInbox(ctx.supabase);
  if (error) return <MissingSetup message={error.message} />;
  return (
    <>
      <UrlToast />
      <LiveRefresh intervalMs={15000} />
      <Shell threadOpen={false} list={<><ListHeader base={base} role={ctx.role} /><InboxList items={items} base={base} /></>}>
        <EmptyState
          icon={MessagesSquare}
          title="Choose a conversation"
          description={
            ctx.role === "parent"
              ? "Read your child's class announcements, chat with other parents in the class, or message a teacher privately."
              : "Post to your classes, keep an eye on the class parents' chats, or message a parent privately."
          }
          className="m-auto"
        />
      </Shell>
    </>
  );
}

// --- /messages/[id] ----------------------------------------------------------------------------------------

type Meta = InboxItem;

async function conversationMeta(ctx: NonNullable<Awaited<ReturnType<typeof common>>>, id: string, items: InboxItem[]): Promise<Meta | null> {
  const found = items.find((i) => i.conversation_id === id);
  if (found) return found;
  // Not in the inbox (e.g. an admin opening a class space or teacher-parent conversation from moderation).
  const { data } = await ctx.supabase.from("chat_conversations").select("id, kind, direct_kind, class_id").eq("id", id).maybeSingle();
  if (!data) return null;
  const c = data as { id: string; kind: InboxItem["kind"]; direct_kind: InboxItem["direct_kind"]; class_id: string | null };
  let title = "Conversation";
  let subtitle = "";
  if (c.class_id) {
    const { data: cls } = await ctx.supabase.from("classes").select("name").eq("id", c.class_id).maybeSingle();
    const name = (cls as { name: string } | null)?.name ?? "Class";
    title = `${name} · ${c.kind === "class_announcements" ? "Announcements" : "Parents"}`;
    subtitle = c.kind === "class_announcements" ? "From the teachers" : "Class parents' chat";
  } else {
    const { data: people } = await ctx.supabase.rpc("chat_conversation_people", { p_conversation: id });
    const list = (people ?? []) as Array<{ display_name: string; label: string }>;
    title = list.map((p) => p.display_name).join(" & ") || "Private conversation";
    subtitle = list.map((p) => p.label).join(" · ");
  }
  const { data: canPost } = await ctx.supabase.rpc("chat_can_post", { p_conversation: id });
  return {
    conversation_id: c.id,
    kind: c.kind,
    direct_kind: c.direct_kind,
    class_id: c.class_id,
    class_name: null,
    title,
    subtitle,
    other_user_id: null,
    last_message_at: null,
    last_preview: null,
    last_sender: null,
    unread: 0,
    can_post: Boolean(canPost)
  };
}

function Notice({ icon: Icon, tone = "slate", children }: { icon: typeof Lock; tone?: "slate" | "gold" | "green"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b px-4 py-2 text-xs",
        tone === "gold" && "border-brand-gold-200 bg-brand-gold-50 text-brand-gold-900",
        tone === "green" && "border-brand-green-100 bg-brand-green-50 text-brand-green-900",
        tone === "slate" && "border-slate-200 bg-slate-50 text-slate-700"
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function Guidelines() {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer font-semibold">Class chat guidelines</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Use it for class life: homework reminders, events, lost property, lifts and playdates.</li>
        <li>Be kind. No comments about other children, parents or staff, and no photos of other people&apos;s children.</li>
        <li>Concerns about a teacher, your child&apos;s progress or another pupil go privately to the class teacher or the school office ({school.phone}).</li>
        <li>No adverts, chain messages, politics or religion.</li>
        <li>Messages are kept by the school. Posts that break these rules can be removed and members muted.</li>
      </ul>
    </details>
  );
}

function Bubble({
  m,
  mine,
  showHeader,
  canUnsend,
  canReport,
  canRemove
}: {
  m: ChatMessage;
  mine: boolean;
  showHeader: boolean;
  canUnsend: boolean;
  canReport: boolean;
  canRemove: boolean;
}) {
  const removed = Boolean(m.removed_at);
  return (
    <div className={cn("group flex gap-2", mine ? "flex-row-reverse" : "flex-row", showHeader ? "mt-3" : "mt-0.5")}>
      {!mine ? (
        <div className="w-8 shrink-0">{showHeader ? <Avatar name={m.sender_name ?? "?"} size="sm" /> : null}</div>
      ) : null}
      <div className={cn("flex max-w-[80%] flex-col sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
        {showHeader && !mine ? (
          <div className="mb-0.5 flex flex-wrap items-baseline gap-x-1.5 px-1 text-xs">
            <span className="font-semibold text-slate-800">{m.sender_name ?? "Former member"}</span>
            {m.sender_label ? (
              <span className={cn("text-[11px]", m.sender_label === "Teacher" || m.sender_label === "School admin" ? "font-semibold text-brand-green-700" : "text-slate-500")}>
                {m.sender_label}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className={cn("flex items-center gap-1", mine ? "flex-row-reverse" : "flex-row")}>
          <div
            className={cn(
              "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
              removed
                ? "border border-dashed border-slate-300 bg-white italic text-slate-500"
                : mine
                  ? "rounded-br-md bg-brand-green text-white"
                  : "rounded-bl-md bg-slate-100 text-slate-900"
            )}
          >
            {removed ? (m.removal_kind === "moderated" ? "Removed by the school" : "Message unsent") : m.body}
          </div>
          {!removed ? <MessageMenu messageId={m.id} canUnsend={canUnsend} canReport={canReport} canRemove={canRemove} align={mine ? "right" : "left"} /> : null}
        </div>
        <span className="mt-0.5 px-1 text-[10.5px] text-slate-400">{timeLabel(m.created_at)}</span>
      </div>
    </div>
  );
}

function Announcement({ m, canRemove, canReport }: { m: ChatMessage; canRemove: boolean; canReport: boolean }) {
  const removed = Boolean(m.removed_at);
  return (
    <article className="group mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-2 flex items-center gap-2">
        <Avatar name={m.sender_name ?? "?"} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{m.sender_name ?? "Teacher"}</div>
          <div className="text-[11px] text-slate-500">
            {m.sender_label} · {timeLabel(m.created_at)}
          </div>
        </div>
        {!removed ? <MessageMenu messageId={m.id} canUnsend={false} canReport={canReport} canRemove={canRemove} align="right" /> : null}
      </header>
      <p className={cn("whitespace-pre-wrap break-words text-[15px] leading-relaxed", removed ? "italic text-slate-500" : "text-slate-800")}>
        {removed ? "This announcement was removed." : m.body}
      </p>
    </article>
  );
}

export async function ConversationView({ base, id }: { base: ChatBase; id: string }) {
  const ctx = await common(base);
  if (!ctx) return null;
  if (ctx.role === "none") return <NoAccess />;
  const { items, error } = await loadInbox(ctx.supabase);
  if (error) return <MissingSetup message={error.message} />;
  const meta = await conversationMeta(ctx, id, items);
  const list = (
    <>
      <ListHeader base={base} role={ctx.role} />
      <InboxList items={items} base={base} activeId={id} />
    </>
  );
  if (!meta) {
    return (
      <Shell threadOpen list={list}>
        <EmptyState icon={Lock} title="Conversation not available" description="It may have been for a class your child or you are no longer in." className="m-auto" />
      </Shell>
    );
  }

  await ctx.supabase.rpc("chat_mark_read", { p_conversation: id });
  const { messages, otherReadAt } = await loadThread(ctx.supabase, id);

  const { data: modData } = meta.class_id ? await ctx.supabase.rpc("chat_can_moderate", { p_conversation: id }) : { data: false };
  const canModerate = Boolean(modData);

  let hours: { reply_from: string; reply_to: string; weekdays_only: boolean } | null = null;
  if (meta.kind === "direct" && meta.direct_kind === "teacher_parent" && ctx.role === "parent" && meta.other_user_id) {
    const { data } = await ctx.supabase.rpc("chat_reply_hours", { p_user: meta.other_user_id });
    hours = ((data ?? []) as Array<{ reply_from: string; reply_to: string; weekdays_only: boolean }>)[0] ?? null;
  }
  const { data: blockedRow } =
    meta.direct_kind === "parent_parent" && meta.other_user_id && ctx.userId
      ? await ctx.supabase.from("chat_blocks").select("blocked_id").eq("blocker_id", ctx.userId).eq("blocked_id", meta.other_user_id).maybeSingle()
      : { data: null };

  const now = Date.now();
  // "Seen" only under my own message when it is the latest one in the conversation.
  const last = messages[messages.length - 1];
  const seen = Boolean(last && last.sender_id === ctx.userId && !last.removed_at && otherReadAt && new Date(otherReadAt) >= new Date(last.created_at));

  // Day separators and grouping of consecutive messages from the same person.
  const rows: ReactNode[] = [];
  let lastDay = "";
  messages.forEach((m, i) => {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) {
      rows.push(
        <div key={`day-${m.id}`} className="my-3 flex justify-center">
          <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-medium text-slate-600">{day}</span>
        </div>
      );
      lastDay = day;
    }
    const prev = messages[i - 1];
    const mine = m.sender_id === ctx.userId;
    const showHeader =
      !prev || prev.sender_id !== m.sender_id || new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60000 || dayLabel(prev.created_at) !== day;
    const canUnsend = mine && now - new Date(m.created_at).getTime() < UNSEND_MINUTES * 60000;
    const canReport = !mine;
    if (meta.kind === "class_announcements") {
      rows.push(<Announcement key={m.id} m={m} canRemove={canModerate && !mine} canReport={canReport} />);
    } else {
      rows.push(
        <Bubble key={m.id} m={m} mine={mine} showHeader={showHeader} canUnsend={canUnsend} canReport={canReport} canRemove={canModerate && !mine} />
      );
    }
  });

  const placeholder =
    meta.kind === "class_announcements" ? "Write an announcement for the class's parents…" : meta.kind === "class_parents" ? "Message the class parents…" : "Write a message…";

  return (
    <>
      <UrlToast />
      <LiveRefresh />
      <Shell threadOpen list={list}>
        <header className="flex items-center gap-3 border-b border-slate-200 px-3 py-2.5 sm:px-4">
          <Link href={base} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Back to conversations">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <ConversationIcon item={meta} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-slate-900">{meta.title}</h2>
            <p className="truncate text-xs text-slate-500">{meta.subtitle}</p>
          </div>
          {meta.direct_kind === "parent_parent" && meta.other_user_id ? (
            <form action={blockUser}>
              <input type="hidden" name="base" value={base} />
              <input type="hidden" name="user_id" value={meta.other_user_id} />
              <input type="hidden" name="back" value={`${base}/${id}`} />
              {blockedRow ? <input type="hidden" name="unblock" value="1" /> : null}
              <SubmitButton variant="ghost" size="sm" pendingText="…">
                <span className="inline-flex items-center gap-1.5">
                  <UserX className="h-4 w-4" aria-hidden="true" />
                  {blockedRow ? "Unblock" : "Block"}
                </span>
              </SubmitButton>
            </form>
          ) : null}
        </header>

        {meta.kind === "class_parents" ? (
          <Notice icon={ShieldCheck} tone="green">
            {ctx.role === "parent"
              ? "A school space for this class's parents. The class teacher and school admins can read it."
              : "Parents can see that the class teacher and school admins read this chat. Use the ⋯ menu on a message to remove it."}
            <Guidelines />
          </Notice>
        ) : null}
        {meta.kind === "class_announcements" ? (
          <Notice icon={BellRing}>
            {ctx.role === "parent"
              ? "Updates from your child's teachers. Questions? Message a teacher privately with New."
              : "Everything posted here goes to all parents in the class. Replies come to you privately."}
          </Notice>
        ) : null}
        {meta.direct_kind === "teacher_parent" ? (
          <Notice icon={Lock}>
            {hours ? (
              <>
                {meta.title} usually replies {replyHoursText(hours)}.
                {outsideReplyHours(hours) ? " It's outside those hours now, so expect a reply later." : ""} For anything urgent, call the school office on{" "}
                {school.phone}.{" "}
              </>
            ) : null}
            Messages between teachers and parents are kept as a school record.
          </Notice>
        ) : null}
        {meta.direct_kind === "parent_parent" ? (
          <Notice icon={Lock}>Private between the two of you. Use ⋯ on a message to report it to the school, or Block to stop messages.</Notice>
        ) : null}

        <MessageScroller count={messages.length} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 px-3 pb-3 sm:px-5">
          {messages.length ? (
            rows
          ) : (
            <EmptyState
              icon={meta.kind === "class_announcements" ? Megaphone : MessagesSquare}
              title={meta.kind === "class_announcements" ? "No announcements yet" : "No messages yet"}
              description={meta.can_post ? "Say hello to get things started." : undefined}
              className="py-16"
            />
          )}
          {seen ? <div className="mt-1 pr-1 text-right text-[11px] text-slate-500">Seen</div> : null}
        </MessageScroller>

        {meta.can_post ? (
          <Composer conversationId={id} placeholder={placeholder} />
        ) : (
          <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            {meta.kind === "class_announcements"
              ? "Only teachers post announcements. To ask about one, message the teacher privately."
              : meta.kind === "class_parents"
                ? "You've been muted in this chat for now. You can still message teachers privately."
                : "You can no longer send messages here (for example, the pupil has moved class or one of you has blocked the other)."}
          </div>
        )}
      </Shell>
    </>
  );
}

// --- /messages/new -----------------------------------------------------------------------------------------

export async function NewConversation({ base, q }: { base: ChatBase; q: string }) {
  const ctx = await common(base);
  if (!ctx) return null;
  if (ctx.role === "none") return <NoAccess />;
  const [{ items, error }, { data: contacts }] = await Promise.all([loadInbox(ctx.supabase), ctx.supabase.rpc("chat_contacts")]);
  if (error) return <MissingSetup message={error.message} />;
  const all = (contacts ?? []) as Array<{ user_id: string; display_name: string; label: string; kind: string; class_names: string }>;
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? all.filter((c) => `${c.display_name} ${c.label} ${c.class_names}`.toLowerCase().includes(needle))
    : all;
  const teachers = filtered.filter((c) => c.kind === "teacher_parent" && ctx.role === "parent");
  const parents = filtered.filter((c) => !(c.kind === "teacher_parent" && ctx.role === "parent"));

  const group = (label: string, rows: typeof all) =>
    rows.length ? (
      <div>
        <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <ul>
          {rows.map((c) => (
            <li key={c.user_id}>
              <form action={startConversation}>
                <input type="hidden" name="base" value={base} />
                <input type="hidden" name="user_id" value={c.user_id} />
                <button type="submit" className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                  <Avatar name={c.display_name ?? "?"} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{c.display_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {c.label} · {c.class_names}
                    </span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <>
      <UrlToast />
      <Shell threadOpen list={<><ListHeader base={base} role={ctx.role} /><InboxList items={items} base={base} /></>}>
        <header className="flex items-center gap-3 border-b border-slate-200 px-3 py-2.5 sm:px-4">
          <Link href={base} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Back to conversations">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h2 className="text-base font-semibold text-slate-900">New private message</h2>
        </header>
        <form className="border-b border-slate-200 px-4 py-3" action={`${base}/new`}>
          <label htmlFor="contact-search" className="sr-only">
            Search people
          </label>
          <input id="contact-search" name="q" defaultValue={q} placeholder="Search by name, child or class" className="gf-input" autoComplete="off" />
        </form>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {group(ctx.role === "parent" ? "Your children's teachers" : ctx.role === "admin" ? "Parents" : "Parents in your classes", ctx.role === "parent" ? teachers : parents)}
          {ctx.role === "parent" ? group("Parents in your children's classes", parents) : null}
          {!filtered.length ? (
            <EmptyState
              icon={Users}
              title={needle ? "No one matches" : "No one to message yet"}
              description={
                ctx.role === "parent"
                  ? "You can message your children's teachers, and parents in the same class who have chosen to accept messages from other parents."
                  : "You can message parents of pupils in the classes you teach."
              }
            />
          ) : null}
          {ctx.role === "parent" ? (
            <p className="px-4 pt-3 text-xs text-slate-500">
              Only parents who have switched on &ldquo;Let other parents message me&rdquo; appear here. Phone numbers and emails are never shown.
            </p>
          ) : null}
        </div>
      </Shell>
    </>
  );
}

// --- /messages/settings ------------------------------------------------------------------------------------

export async function ChatSettings({ base }: { base: ChatBase }) {
  const ctx = await common(base);
  if (!ctx) return null;
  if (ctx.role === "none") return <NoAccess />;
  const [{ data: settings, error }, { data: blocks }] = await Promise.all([
    ctx.supabase.from("chat_settings").select("allow_parent_dm, reply_from, reply_to, reply_weekdays_only").eq("user_id", ctx.userId ?? "").maybeSingle(),
    ctx.supabase.from("chat_blocks").select("blocked_id").eq("blocker_id", ctx.userId ?? "")
  ]);
  if (error) return <MissingSetup message={error.message} />;
  const s = (settings as { allow_parent_dm: boolean; reply_from: string; reply_to: string; reply_weekdays_only: boolean } | null) ?? {
    allow_parent_dm: false,
    reply_from: "08:00",
    reply_to: "16:00",
    reply_weekdays_only: true
  };
  const blockedIds = ((blocks ?? []) as Array<{ blocked_id: string }>).map((b) => b.blocked_id);
  const blockedPeople = await Promise.all(
    blockedIds.map(async (bid) => {
      const { data } = await ctx.supabase.rpc("chat_identity", { p_user: bid });
      const row = ((data ?? []) as Array<{ display_name: string; label: string }>)[0];
      return { id: bid, name: row?.display_name ?? "Parent", label: row?.label ?? "" };
    })
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <UrlToast />
      <div>
        <Link href={base} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-green">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Messages
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Message settings</h1>
      </div>

      <form action={saveChatSettings} className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <input type="hidden" name="base" value={base} />
        {ctx.role === "parent" ? (
          <div>
            <input type="hidden" name="allow_parent_dm_present" value="1" />
            <label className="flex items-start gap-3">
              <input type="checkbox" name="allow_parent_dm" defaultChecked={s.allow_parent_dm} className="mt-1 h-4 w-4" />
              <span>
                <span className="block font-semibold text-slate-900">Let other parents message me privately</span>
                <span className="block text-sm text-slate-600">
                  Only parents in your children&apos;s classes. They see your name and your children&apos;s first names, never your phone
                  number or email. You can block anyone at any time. Teachers can always message you.
                </span>
              </span>
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Clock className="h-4 w-4" aria-hidden="true" />
                When you usually reply
              </div>
              <p className="text-sm text-slate-600">
                Parents see this when they message you, so they know when to expect an answer. Messages still arrive at any time — you
                don&apos;t have to answer outside these hours.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <label className="text-sm">
                <span className="gf-label">From</span>
                <input type="time" name="reply_from" defaultValue={s.reply_from.slice(0, 5)} className="gf-input" required />
              </label>
              <label className="text-sm">
                <span className="gf-label">To</span>
                <input type="time" name="reply_to" defaultValue={s.reply_to.slice(0, 5)} className="gf-input" required />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="reply_weekdays_only" defaultChecked={s.reply_weekdays_only} className="h-4 w-4" />
              Weekdays only
            </label>
          </div>
        )}
        <div className="flex justify-end">
          <SubmitButton variant="primary" pendingText="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>

      {ctx.role === "parent" ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
          <h2 className="font-semibold text-slate-900">Blocked parents</h2>
          {blockedPeople.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {blockedPeople.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm">
                    <span className="font-medium text-slate-900">{p.name}</span> <span className="text-slate-500">{p.label}</span>
                  </span>
                  <form action={blockUser}>
                    <input type="hidden" name="base" value={base} />
                    <input type="hidden" name="user_id" value={p.id} />
                    <input type="hidden" name="unblock" value="1" />
                    <SubmitButton variant="secondary" size="sm" pendingText="…">
                      Unblock
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">You haven&apos;t blocked anyone.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
