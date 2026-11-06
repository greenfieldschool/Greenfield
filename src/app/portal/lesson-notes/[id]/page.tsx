import { ArrowLeft, Download, Eye, FileText } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate } from "@/lib/lagos-dates";
import { NOTE_COLUMNS, fileKind, fileSizeLabel, isNewNote, noteFileLinks, noteWeeks, weekLabel, type LessonNoteRow } from "@/lib/lesson-notes";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { PortalNotice, PortalPageHeader } from "../../_components/portal-ui";
import { HELP } from "@/lib/portal-help";
import { loadAssignmentsViewer } from "../../assignments/_load";

// One published lesson note: the typed notes and the file to open or download.
export default async function PortalLessonNotePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const viewer = await loadAssignmentsViewer(supabase, sp);
  if (viewer.kind === "notice") return <PortalNotice title="Lesson note" message={viewer.message} />;
  const { role, pupil } = viewer;

  const { data } = await supabase.from("lesson_notes").select(NOTE_COLUMNS).eq("id", id).maybeSingle();
  const note = data as LessonNoteRow | null;
  // The database only returns published notes of the family's classes; this also keeps a parent on the chosen child.
  if (!note || note.class_id !== pupil.class_id) {
    return <PortalNotice title="Lesson note" message="This lesson note isn't for this class, or the teacher has taken it down." />;
  }

  const [{ data: subject }, { data: termData }, links] = await Promise.all([
    note.subject_id ? supabase.from("subjects").select("name").eq("id", note.subject_id).maybeSingle() : Promise.resolve({ data: null }),
    note.academic_term_id
      ? supabase.from("academic_terms").select("id, name, starts_on, ends_on, academic_years(name)").eq("id", note.academic_term_id).maybeSingle()
      : Promise.resolve({ data: null }),
    noteFileLinks(supabase, note.file_path, note.file_name)
  ]);
  const term = termData as { id: string; name: string; starts_on: string | null; ends_on: string | null; academic_years: { name: string } | { name: string }[] | null } | null;
  const { weeks } = noteWeeks(term);
  const subjectName = (subject as { name: string } | null)?.name ?? "General";
  const termName = term ? [firstOrNull(term.academic_years)?.name, term.name].filter(Boolean).join(" · ") : "";
  const listHref = role === "parent" ? `/portal/lesson-notes?student_id=${pupil.id}` : "/portal/lesson-notes";
  const kind = fileKind(note.file_type, note.file_name);

  return (
    <div className="space-y-6">
      <a href={listHref} className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-brand-green-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All lesson notes
      </a>
      <PortalPageHeader
        help={HELP.lessonNotes}
        eyebrow={subjectName}
        title={note.topic}
        description={[termName, note.week ? weekLabel(note.week, weeks) : null, note.published_at ? `Shared ${formatLagosDate(note.published_at)}` : null, note.author_name ? `by ${note.author_name}` : null]
          .filter(Boolean)
          .join(" · ")}
      />
      {isNewNote(note) ? (
        <div>
          <Badge tone="blue">New this week</Badge>
        </div>
      ) : null}

      {note.file_path ? (
        <Card className="border-brand-green-200">
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-700">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-900">{note.file_name ?? "Lesson note"}</div>
                <div className="text-sm text-slate-500">
                  {kind}
                  {note.file_size ? ` · ${fileSizeLabel(note.file_size)}` : ""}
                </div>
              </div>
            </div>
            {links ? (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <a href={links.open} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "primary" })}>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Open
                </a>
                <a href={links.download} className={buttonClasses({ variant: "secondary" })}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download
                </a>
              </div>
            ) : (
              <p className="text-sm text-slate-600">The file can&apos;t be opened right now. Please try again later.</p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {note.body ? (
        <Card>
          <CardHeader title={note.file_path ? "Teacher's notes" : "Notes"} />
          <CardBody>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{note.body}</p>
          </CardBody>
        </Card>
      ) : null}

      {role === "parent" ? (
        <p className="text-sm text-slate-500">Shared with {pupil.first_name}&apos;s class. Download it to read with your child or print it.</p>
      ) : (
        <p className="text-sm text-slate-500">Download it to keep for revision. The link opens for 10 minutes; come back here to open it again.</p>
      )}
    </div>
  );
}
