import { ChevronRight, Video } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  ONLINE_CLASS_COLUMNS,
  PLATFORM_LABEL,
  STATE_LABEL,
  STATE_TONE,
  classState,
  dayHeading,
  lagosDay,
  startsIn,
  whenLabel,
  type OnlineClassRow
} from "@/lib/online-classes";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PillLinks, PortalNotice, PortalPageHeader } from "../_components/portal-ui";
import { HELP } from "@/lib/portal-help";
import { loadAssignmentsViewer } from "../assignments/_load";
import { joinOnlineClass } from "./actions";

// Pupils and parents: the class's online lessons. What's on now (with a Join button), what's coming up by day, and
// what's been held (with whether the pupil was there).

const PATH = "/portal/online-classes";
const ATTENDED: Record<string, string> = { present: "Present", late: "Late", absent: "Absent" };

export default async function PortalOnlineClassesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const viewer = await loadAssignmentsViewer(supabase, sp);
  if (viewer.kind === "notice") return <PortalNotice title="Online classes" message={viewer.message} />;
  const { role, pupil, children } = viewer;

  const [{ data, error }, { data: attData }] = pupil.class_id
    ? await Promise.all([
        supabase.from("online_classes").select(ONLINE_CLASS_COLUMNS).eq("class_id", pupil.class_id).order("starts_at", { ascending: true }).limit(300),
        supabase.from("online_class_attendance").select("online_class_id, joined_at, status").eq("student_id", pupil.id)
      ])
    : [{ data: [], error: null }, { data: [] }];
  const all = (data ?? []) as OnlineClassRow[];
  const att = new Map(((attData ?? []) as Array<{ online_class_id: string; joined_at: string | null; status: string | null }>).map((a) => [a.online_class_id, a] as const));
  const subjectIds = Array.from(new Set(all.map((o) => o.subject_id).filter((s): s is string => Boolean(s))));
  const { data: subjectData } = subjectIds.length ? await supabase.from("subjects").select("id, name").in("id", subjectIds) : { data: [] };
  const subjectName = new Map(((subjectData ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name] as const));
  const subjectOf = (o: OnlineClassRow) => (o.subject_id ? subjectName.get(o.subject_id) ?? "Subject" : "General");

  const now = new Date();
  const today = lagosDay(now.toISOString());
  const withState = all.map((o) => ({ o, state: classState(o, now) }));
  const open = withState.filter((x) => x.state === "live" || x.state === "soon");
  const upcoming = withState.filter((x) => x.state === "upcoming" || (x.state === "cancelled" && new Date(x.o.starts_at) >= now));
  const past = withState.filter((x) => x.state === "ended" || (x.state === "cancelled" && new Date(x.o.starts_at) < now)).reverse().slice(0, 30);
  const byDay: Array<{ day: string; items: typeof upcoming }> = [];
  for (const x of upcoming) {
    const day = lagosDay(x.o.starts_at);
    const last = byDay[byDay.length - 1];
    if (last && last.day === day) last.items.push(x);
    else byDay.push({ day, items: [x] });
  }
  const child = role === "parent" ? `?student_id=${pupil.id}` : "";
  const here = `${PATH}${child}`;

  const Row = ({ o, state }: { o: OnlineClassRow; state: ReturnType<typeof classState> }) => {
    const a = att.get(o.id);
    const badge =
      state === "ended" ? (
        <Badge tone={a?.status === "absent" || (!a?.status && !a?.joined_at) ? "slate" : "green"}>
          {a?.status ? ATTENDED[a.status] : a?.joined_at ? "Joined" : "Didn't join"}
        </Badge>
      ) : (
        <Badge tone={STATE_TONE[state]} dot>
          {state === "upcoming" ? `Starts ${startsIn(o.starts_at, now)}` : STATE_LABEL[state]}
        </Badge>
      );
    return (
      <li>
        <a href={`${PATH}/${o.id}${child}`} className="flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50 active:bg-slate-100 sm:px-6">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-700">
            <Video className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className={state === "cancelled" ? "font-semibold text-slate-500 line-through" : "font-semibold text-slate-900"}>{o.topic}</div>
            <div className="mt-0.5 text-sm text-slate-500">
              {subjectOf(o)} · {whenLabel(o.starts_at, o.duration_minutes)}
            </div>
            {state === "cancelled" && o.cancel_reason ? <div className="mt-0.5 text-sm text-red-700">Cancelled: {o.cancel_reason}</div> : null}
            {state === "cancelled" ? null : <div className="mt-1.5 sm:hidden">{badge}</div>}
          </div>
          {/* Under the text on phones so the topic keeps the full width; on the right from sm up. */}
          <div className="hidden shrink-0 sm:block">{badge}</div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
        </a>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <UrlToast />
      <PortalPageHeader
        help={HELP.onlineClasses}
        title="Online classes"
        description={
          role === "student"
            ? "Lessons your teachers hold online. When one is on, tap Join: it opens Zoom, Google Meet or Teams."
            : `Online lessons for ${pupil.first_name}'s class. When one is on, tap Join to open it on this phone or computer.`
        }
      />

      {role === "parent" && children.length > 1 ? (
        <PillLinks
          label="Choose a child"
          items={children.map((c) => ({ key: c.id, href: `${PATH}?student_id=${c.id}`, label: `${c.first_name} ${c.last_name}`, active: c.id === pupil.id }))}
        />
      ) : null}

      {error ? <Alert tone="warning">Online classes aren&apos;t available yet. Please check again soon.</Alert> : null}

      {open.map(({ o, state }) => (
        <Card key={o.id} className="!border-brand-green-300 bg-brand-green-50/40">
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATE_TONE[state]} dot>
                {state === "live" ? "Live now" : `Starts ${startsIn(o.starts_at, now)}`}
              </Badge>
              <span className="text-sm text-slate-600">{subjectOf(o)}</span>
            </div>
            <div>
              <div className="font-display text-xl font-semibold text-slate-900">{o.topic}</div>
              <div className="mt-1 text-sm text-slate-600">
                {whenLabel(o.starts_at, o.duration_minutes)} · {PLATFORM_LABEL[o.platform]}
                {o.meeting_code ? (
                  <>
                    {" "}
                    · Passcode <span className="font-semibold text-slate-900">{o.meeting_code}</span>
                  </>
                ) : null}
              </div>
            </div>
            <form action={joinOnlineClass} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="student_id" value={pupil.id} />
              <input type="hidden" name="back" value={here} />
              <SubmitButton pendingText="Opening…" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-green px-6 text-base font-semibold text-white shadow-sm transition hover:bg-brand-green-700 disabled:opacity-60 sm:w-auto">
                <span className="inline-flex items-center gap-2">
                  <Video className="h-5 w-5" aria-hidden="true" />
                  Join {role === "parent" ? `for ${pupil.first_name}` : "now"}
                </span>
              </SubmitButton>
              <a href={`${PATH}/${o.id}${child}`} className="text-center text-sm font-semibold text-brand-green-700 hover:underline sm:ml-2">
                What to prepare
              </a>
            </form>
          </CardBody>
        </Card>
      ))}

      {!all.length ? (
        <Card>
          <EmptyState icon={Video} title="No online classes yet" description="When a teacher schedules an online lesson for the class, it appears here with the time and a Join button." />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Coming up" description="You can join from 15 minutes before the start." />
            {byDay.length ? (
              <div className="divide-y divide-slate-100">
                {byDay.map((g) => (
                  <section key={g.day} aria-label={dayHeading(g.day, today)}>
                    <h3 className="bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-6">{dayHeading(g.day, today)}</h3>
                    <ul className="gf-stagger divide-y divide-slate-100">
                      {g.items.map((x) => (
                        <Row key={x.o.id} o={x.o} state={x.state} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <CardBody>
                <p className="text-sm text-slate-600">Nothing else scheduled yet.</p>
              </CardBody>
            )}
          </Card>

          {past.length ? (
            <Card>
              <CardHeader title="Earlier" description={role === "parent" ? `Whether ${pupil.first_name} was there.` : "Whether you were there."} />
              <ul className="divide-y divide-slate-100">
                {past.map((x) => (
                  <Row key={x.o.id} o={x.o} state={x.state} />
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
