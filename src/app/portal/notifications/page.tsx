import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Bell, BookOpenText, CheckCheck, ClipboardCheck, Megaphone, NotebookPen, Video, VideoOff, type LucideIcon } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { NOTIFICATION_COLUMNS, agoLabel, type NotificationRow } from "@/lib/notifications";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PortalPageHeader } from "../_components/portal-ui";
import { HELP } from "@/lib/portal-help";
import { cn } from "@/lib/cn";
import { vapidPublicKey } from "@/lib/push";
import { PushControl } from "../_components/push-control";

// Everything the school has sent this person: new work, marks, lesson notes and online classes. Newest first.

const ICONS: Record<string, LucideIcon> = {
  assignment: NotebookPen,
  assignment_marked: ClipboardCheck,
  lesson_note: BookOpenText,
  online_class: Video,
  online_class_moved: Video,
  online_class_on: Video,
  online_class_cancelled: VideoOff,
  announcement: Megaphone
};

// Parents choose which emails they get (all on unless switched off). Saved with their own login: only their row.
async function saveEmailChoices(formData: FormData) {
  "use server";
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !user) redirect("/portal/notifications");
  const { error } = await supabase.from("email_preferences").upsert(
    {
      user_id: user.id,
      notifications: formData.get("notifications") === "on",
      messages: formData.get("messages") === "on",
      announcements: formData.get("announcements") === "on",
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  redirect(`/portal/notifications?toast=${encodeURIComponent(error ? "Couldn't save. Please try again." : "Email choices saved")}&toast_type=${error ? "error" : "success"}#email`);
}

async function markAllRead() {
  "use server";
  const supabase = getSupabaseServerClient();
  if (supabase) await supabase.rpc("mark_notifications_read", { p_ids: null });
  revalidatePath("/portal", "layout");
  redirect(`/portal/notifications?toast=${encodeURIComponent("All marked as read")}&toast_type=success`);
}

export default async function PortalNotificationsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data, error }, { data: identityRows }, { data: prefData, error: prefError }, { data: auth }] = await Promise.all([
    supabase.from("notifications").select(NOTIFICATION_COLUMNS).order("created_at", { ascending: false }).limit(100),
    supabase.rpc("portal_identity"),
    supabase.from("email_preferences").select("notifications, messages, announcements").maybeSingle(),
    supabase.auth.getUser()
  ]);
  const prefs = (prefData as { notifications: boolean; messages: boolean; announcements: boolean } | null) ?? { notifications: true, messages: true, announcements: true };
  const myEmail = auth.user?.email ?? null;
  const items = (data ?? []) as NotificationRow[];
  const role = (Array.isArray(identityRows) ? (identityRows[0] as { role?: string } | undefined)?.role : null) ?? "parent";

  // Parents with several children: say which child each one is about.
  const childIds = Array.from(new Set(items.map((n) => n.student_id).filter((s): s is string => Boolean(s))));
  const { data: kids } = role === "parent" && childIds.length > 1 ? await supabase.from("students").select("id, first_name").in("id", childIds) : { data: [] };
  const childName = new Map(((kids ?? []) as Array<{ id: string; first_name: string }>).map((k) => [k.id, k.first_name] as const));

  const unread = items.filter((n) => !n.read_at).length;
  const pushKey = vapidPublicKey();
  const now = new Date();
  const dayMs = 24 * 3600 * 1000;
  const groups = [
    { title: "Today", items: items.filter((n) => now.getTime() - new Date(n.created_at).getTime() < dayMs) },
    { title: "This week", items: items.filter((n) => { const age = now.getTime() - new Date(n.created_at).getTime(); return age >= dayMs && age < 7 * dayMs; }) },
    { title: "Earlier", items: items.filter((n) => now.getTime() - new Date(n.created_at).getTime() >= 7 * dayMs) }
  ].filter((g) => g.items.length);

  return (
    <div className="space-y-6">
      <UrlToast />
      <PortalPageHeader
        help={HELP.notifications}
        title="Notifications"
        description={
          role === "student"
            ? "New work, marks, lesson notes and online classes from your teachers. Tap one to open it."
            : "New work, marks, lesson notes and online classes for your children. Tap one to open it."
        }
        actions={
          unread ? (
            <form action={markAllRead}>
              <SubmitButton variant="secondary" size="sm" pendingText="Marking…">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCheck className="h-4 w-4" aria-hidden="true" />
                  Mark all as read
                </span>
              </SubmitButton>
            </form>
          ) : undefined
        }
      />

      {error ? <Alert tone="warning">Notifications aren&apos;t available yet. Please check again soon.</Alert> : null}

      {!items.length ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="When a teacher sets work, marks it, shares a lesson note or schedules an online class, you'll see it here."
          />
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.title}>
            <CardHeader title={g.title} description={g.title === "Today" && unread ? `${unread} unread` : undefined} />
            <ul className="gf-stagger divide-y divide-slate-100">
              {g.items.map((n) => {
                const Icon = ICONS[n.kind] ?? Bell;
                const isUnread = !n.read_at;
                return (
                  <li key={n.id}>
                    <a
                      href={`/portal/notifications/open/${n.id}`}
                      className={cn("flex items-start gap-3 px-5 py-4 transition hover:bg-slate-50 active:bg-slate-100 sm:px-6", isUnread && "bg-brand-green-50/40")}
                    >
                      <span
                        className={cn(
                          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          n.kind === "online_class_cancelled" ? "bg-red-50 text-red-700" : "bg-brand-green-50 text-brand-green-700"
                        )}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={cn("text-[15px]", isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
                          {n.title}
                        </div>
                        {n.body ? <div className="mt-0.5 text-sm text-slate-600">{n.body}</div> : null}
                        <div className="mt-1 text-xs text-slate-500">
                          {agoLabel(n.created_at, now)}
                          {n.student_id && childName.get(n.student_id) ? ` · ${childName.get(n.student_id)}` : ""}
                        </div>
                      </div>
                      {isUnread ? (
                        <span className="mt-1.5 shrink-0">
                          <span className="block h-2.5 w-2.5 rounded-full bg-brand-green" aria-hidden="true" />
                          <span className="sr-only">Unread</span>
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}

      {pushKey ? <PushControl publicKey={pushKey} role={role === "student" ? "student" : "parent"} /> : null}

      {role === "parent" && !prefError ? (
        <Card id="email">
          <CardHeader
            title="Email me about"
            description={myEmail ? `Emails go to ${myEmail}. Everything always shows here on the portal too.` : "Your account has no email address, so no emails are sent."}
          />
          <form action={saveEmailChoices} className="space-y-3 px-5 pb-5 sm:px-6">
            {(
              [
                ["notifications", "New work, marks, lesson notes and online classes", prefs.notifications],
                ["messages", "New messages from teachers (and parents, if you allow them)", prefs.messages],
                ["announcements", "School announcements", prefs.announcements]
              ] as const
            ).map(([name, label, on]) => (
              <label key={name} className="flex min-h-[40px] items-center gap-3 text-sm text-slate-800">
                <input type="checkbox" name={name} defaultChecked={on} className="h-5 w-5 rounded border-slate-300 text-brand-green focus:ring-brand-green-500" />
                {label}
              </label>
            ))}
            <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
              Save email choices
            </SubmitButton>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
