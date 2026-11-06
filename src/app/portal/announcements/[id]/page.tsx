import { ArrowLeft, Megaphone } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card, CardBody } from "@/components/ui/card";
import { PortalNotice, PortalPageHeader } from "../../_components/portal-ui";
import { HELP } from "@/lib/portal-help";

// One school announcement. The database shows it only to families it was sent to.
export default async function PortalAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase.from("announcements").select("id, title, body, author_name, created_at").eq("id", id).maybeSingle();
  const a = data as { id: string; title: string; body: string; author_name: string | null; created_at: string } | null;
  if (!a) return <PortalNotice title="Announcement" message="This announcement isn't available." />;
  return (
    <div className="space-y-6">
      <a href="/portal/announcements" className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-brand-green-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All announcements
      </a>
      <PortalPageHeader help={HELP.notifications} eyebrow="School announcement" title={a.title} description={`${formatLagosDate(a.created_at)}${a.author_name ? ` · ${a.author_name}` : ""}`} />
      <Card>
        <CardBody className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gold-50 text-brand-gold-700">
            <Megaphone className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="min-w-0 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{a.body}</p>
        </CardBody>
      </Card>
    </div>
  );
}
