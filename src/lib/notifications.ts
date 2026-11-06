// Portal notifications (migration 20261109_notifications.sql). The database writes them (triggers on assignments,
// marking, lesson notes and online classes); the portal shows a bell with the unread count and /portal/notifications.

export type NotificationRow = {
  id: string;
  student_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

export const NOTIFICATION_COLUMNS = "id, student_id, kind, title, body, link, created_at, read_at";

/** Only links inside the portal are followed (the database allows nothing else either). */
export function safePortalLink(link: string | null | undefined) {
  return link && link.startsWith("/portal/") && !link.startsWith("//") ? link : "/portal/notifications";
}

/** "5 minutes ago", "3 hours ago", "Yesterday", "Thu 12 Nov" in Lagos time. */
export function agoLabel(iso: string, now = new Date()) {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (hours < 48) return "Yesterday";
  const d = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
