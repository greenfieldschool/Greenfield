import { ChevronRight, Megaphone } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PortalPageHeader } from "../_components/portal-ui";
import { HELP } from "@/lib/portal-help";

// School announcements for this family (the database shows only the ones sent to their children's school, section
// or class). Newest first.
export default async function PortalAnnouncementsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("announcements").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(60);
  const items = (data ?? []) as Array<{ id: string; title: string; body: string; created_at: string }>;
  return (
    <div className="space-y-6">
      <PortalPageHeader help={HELP.notifications} title="Announcements" description="News and notices from the school." />
      {error ? <Alert tone="warning">Announcements aren&apos;t available yet. Please check again soon.</Alert> : null}
      <Card>
        {items.length ? (
          <ul className="gf-stagger divide-y divide-slate-100">
            {items.map((a) => (
              <li key={a.id}>
                <a href={`/portal/announcements/${a.id}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50 active:bg-slate-100 sm:px-6">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gold-50 text-brand-gold-700">
                    <Megaphone className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{a.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-slate-600">{a.body}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatLagosDate(a.created_at)}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Megaphone} title="No announcements yet" description="When the school sends news or a notice, it appears here and on the bell." />
        )}
      </Card>
    </div>
  );
}
