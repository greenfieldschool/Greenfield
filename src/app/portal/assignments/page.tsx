import { ChevronRight, NotebookPen } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  ASSIGNMENT_COLUMNS,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  dueLabel,
  pupilStatus,
  type AssignmentRow,
  type PupilStatus
} from "@/lib/assignments";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PillLinks, PortalNotice, PortalPageHeader } from "../_components/portal-ui";
import { HELP } from "@/lib/portal-help";
import { loadAssignmentsViewer } from "./_load";

// Pupils: everything set for their class, grouped by what they need to do. Parents: the same for a chosen child.

type Group = { key: string; title: string; description: string; statuses: PupilStatus[] };

const GROUPS: Group[] = [
  { key: "todo", title: "To do", description: "Not handed in yet. Late ones first.", statuses: ["overdue", "to_do"] },
  { key: "in", title: "Handed in", description: "Waiting for the teacher to mark.", statuses: ["handed_in", "late"] },
  { key: "marked", title: "Marked", description: "With the mark and the teacher's comment.", statuses: ["marked"] }
];

export default async function PortalAssignmentsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const viewer = await loadAssignmentsViewer(supabase, sp);
  if (viewer.kind === "notice") return <PortalNotice title="Assignments" message={viewer.message} />;
  const { role, pupil, children } = viewer;

  const [{ data: aData, error }, { data: subData }] = pupil.class_id
    ? await Promise.all([
        supabase.from("assignments").select(ASSIGNMENT_COLUMNS).eq("class_id", pupil.class_id).order("due_at", { ascending: true, nullsFirst: false }).limit(200),
        supabase.from("assignment_submissions").select("assignment_id, submitted_at, marked_at, score").eq("student_id", pupil.id)
      ])
    : [{ data: [], error: null }, { data: [] }];
  const assignments = (aData ?? []) as AssignmentRow[];
  const subs = new Map(
    ((subData ?? []) as Array<{ assignment_id: string; submitted_at: string | null; marked_at: string | null; score: number | null }>).map((s) => [s.assignment_id, s] as const)
  );
  const { data: subjectData } = assignments.length
    ? await supabase.from("subjects").select("id, name").in("id", Array.from(new Set(assignments.map((a) => a.subject_id).filter((s): s is string => Boolean(s)))))
    : { data: [] };
  const subjectName = new Map(((subjectData ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name] as const));

  const now = new Date();
  const withStatus = assignments.map((a) => ({ a, s: subs.get(a.id), status: pupilStatus(a, subs.get(a.id), now) }));
  const overdue = withStatus.filter((x) => x.status === "overdue").length;
  const studentQuery = role === "parent" ? `?student_id=${pupil.id}` : "";

  return (
    <div className="space-y-6">
      <PortalPageHeader
        help={HELP.assignments}
        title="Assignments"
        description={
          role === "student"
            ? "Work your teachers have set. Open one to read it and hand it in: type your answer or add a photo of your work."
            : `Work set for ${pupil.first_name}'s class, what's been handed in, and the marks.`
        }
      />

      {role === "parent" && children.length > 1 ? (
        <PillLinks
          label="Choose a child"
          items={children.map((c) => ({ key: c.id, href: `/portal/assignments?student_id=${c.id}`, label: `${c.first_name} ${c.last_name}`, active: c.id === pupil.id }))}
        />
      ) : null}

      {error ? <Alert tone="warning">Assignments aren&apos;t available yet. Please check again soon.</Alert> : null}
      {overdue ? (
        <Alert tone="warning">
          {role === "student"
            ? `${overdue} piece${overdue === 1 ? " is" : "s are"} past the due date. Hand ${overdue === 1 ? "it" : "them"} in as soon as you can.`
            : `${pupil.first_name} has ${overdue} piece${overdue === 1 ? "" : "s"} of work past the due date.`}
        </Alert>
      ) : null}

      {!assignments.length ? (
        <Card>
          <EmptyState icon={NotebookPen} title="No assignments yet" description="When a teacher sets work for the class, it appears here." />
        </Card>
      ) : (
        GROUPS.map((g) => {
          const items = withStatus.filter((x) => g.statuses.includes(x.status));
          if (!items.length) return null;
          if (g.key === "todo") items.sort((x, y) => Number(y.status === "overdue") - Number(x.status === "overdue"));
          if (g.key === "marked") items.reverse();
          return (
            <Card key={g.key}>
              <CardHeader title={`${g.title} (${items.length})`} description={g.description} />
              <ul className="gf-stagger divide-y divide-slate-100">
                {items.map(({ a, s, status }) => (
                  <li key={a.id}>
                    <a
                      href={`/portal/assignments/${a.id}${studentQuery}`}
                      className="flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50 active:bg-slate-100 sm:px-6"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">{a.title}</span>
                          {a.kind === "classwork" ? <Badge tone="blue">{KIND_LABEL.classwork}</Badge> : null}
                        </div>
                        <div className="mt-0.5 text-sm text-slate-500">
                          {a.subject_id ? subjectName.get(a.subject_id) ?? "Subject" : "General"} · {dueLabel(a.due_at)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={STATUS_TONE[status]} dot>
                          {STATUS_LABEL[status]}
                        </Badge>
                        {status === "marked" && s?.score !== null && s?.score !== undefined ? (
                          <span className="text-sm font-bold tabular-nums text-slate-900">
                            {Number(s.score)}
                            {a.max_score ? <span className="text-xs font-medium text-slate-400">/{Number(a.max_score)}</span> : null}
                          </span>
                        ) : null}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
