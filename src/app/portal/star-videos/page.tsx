import { ExternalLink, Star } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { STAR_VIDEO_COLUMNS, videoHost, weekLabel, type StarVideoRow } from "@/lib/star-videos";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { PillLinks, PortalNotice, PortalPageHeader } from "../_components/portal-ui";
import { HELP } from "@/lib/portal-help";
import { loadAssignmentsViewer } from "../assignments/_load";

// Pupils and parents: the "star of the week" videos teachers shared of this child. Only their own child's videos
// (the database only returns those).

const PATH = "/portal/star-videos";

export default async function PortalStarVideosPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const viewer = await loadAssignmentsViewer(supabase, sp);
  if (viewer.kind === "notice") return <PortalNotice title="Star videos" message={viewer.message} />;
  const { role, pupil, children } = viewer;

  const { data, error } = await supabase
    .from("star_videos")
    .select(STAR_VIDEO_COLUMNS)
    .eq("student_id", pupil.id)
    .order("week_start", { ascending: false })
    .limit(100);
  const videos = (data ?? []) as StarVideoRow[];
  const subjectIds = Array.from(new Set(videos.map((v) => v.subject_id)));
  const { data: subjectData } = subjectIds.length ? await supabase.from("subjects").select("id, name").in("id", subjectIds) : { data: [] };
  const subjectName = new Map(((subjectData ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name] as const));

  return (
    <div className="space-y-5">
      <PortalPageHeader
        help={HELP.starVideos}
        title="Star videos"
        description={
          role === "student"
            ? "Videos your teachers shared when you did really well in a subject that week."
            : `Videos ${pupil.first_name}'s teachers shared when ${pupil.first_name} did really well in a subject that week.`
        }
      />

      {role === "parent" && children.length > 1 ? (
        <PillLinks
          label="Choose a child"
          items={children.map((c) => ({ key: c.id, href: `${PATH}?student_id=${c.id}`, label: `${c.first_name} ${c.last_name}`, active: c.id === pupil.id }))}
        />
      ) : null}

      {error ? <Alert tone="warning">Star videos aren&apos;t available yet. Please check again soon.</Alert> : null}

      {!error && !videos.length ? (
        <Card>
          <EmptyState
            icon={Star}
            title="No star videos yet"
            description={
              role === "student"
                ? "When a teacher shares a video of you doing well, it appears here."
                : `When a teacher shares a video of ${pupil.first_name} doing well, it appears here and you get a notification.`
            }
          />
        </Card>
      ) : null}

      <div className="space-y-3 gf-stagger">
        {videos.map((v) => (
          <Card key={v.id}>
            <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gold-50 text-brand-gold-700">
                  <Star className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">Star of the week in {subjectName.get(v.subject_id) ?? "a subject"}</div>
                  <div className="text-sm text-slate-500">{weekLabel(v.week_start)}</div>
                  {v.reason ? <p className="mt-1.5 text-sm text-slate-700">{v.reason}</p> : null}
                  {v.author_name ? <p className="mt-1 text-xs text-slate-500">Shared by {v.author_name}</p> : null}
                </div>
              </div>
              <a href={v.video_url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "primary" })}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Watch on {videoHost(v.video_url)}
              </a>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
