import { BookOpenText, ChevronRight, FileText, Search, X } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { NOTE_COLUMNS, fileKind, isNewNote, noteWeeks, weekLabel, type LessonNoteRow } from "@/lib/lesson-notes";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import AutoSubmitSelect from "@/components/auto-submit-select";
import { PillLinks, PortalNotice, PortalPageHeader } from "../_components/portal-ui";
import { HELP } from "@/lib/portal-help";
import { loadAssignmentsViewer } from "../assignments/_load";

// Pupils and parents: the published lesson notes of the class, by term and week, with subject, week and topic search.

const PATH = "/portal/lesson-notes";

type TermRow = { id: string; name: string; academic_year_id: string; starts_on: string | null; ends_on: string | null; is_active: boolean };

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function url(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${PATH}?${s}` : PATH;
}

export default async function PortalLessonNotesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const viewer = await loadAssignmentsViewer(supabase, sp);
  if (viewer.kind === "notice") return <PortalNotice title="Lesson notes" message={viewer.message} />;
  const { role, pupil, children } = viewer;

  const [{ data: noteData, error }, { data: termData }, { data: yearData }] = pupil.class_id
    ? await Promise.all([
        supabase.from("lesson_notes").select(NOTE_COLUMNS).eq("class_id", pupil.class_id).eq("status", "published").order("published_at", { ascending: false }).limit(500),
        supabase.from("academic_terms").select("id, name, academic_year_id, starts_on, ends_on, is_active").order("starts_on", { ascending: false }),
        supabase.from("academic_years").select("id, name")
      ])
    : [{ data: [], error: null }, { data: [] }, { data: [] }];
  const allNotes = (noteData ?? []) as LessonNoteRow[];
  const yearName = new Map(((yearData ?? []) as Array<{ id: string; name: string }>).map((y) => [y.id, y.name] as const));
  // Only terms that have notes, newest first; the current term is chosen unless it has none.
  const termIdsWithNotes = new Set(allNotes.map((n) => n.academic_term_id).filter(Boolean));
  const terms = ((termData ?? []) as TermRow[]).filter((t) => termIdsWithNotes.has(t.id));
  const termLabel = (t: TermRow) => [yearName.get(t.academic_year_id), t.name].filter(Boolean).join(" · ");

  const requestedTerm = str(sp.term);
  const defaultTerm = terms.find((t) => t.is_active)?.id ?? terms[0]?.id ?? "all";
  const termId = requestedTerm === "all" || terms.some((t) => t.id === requestedTerm) ? requestedTerm : defaultTerm;
  const term = terms.find((t) => t.id === termId) ?? null;
  const subjectId = str(sp.subject);
  const week = Number(str(sp.week)) || null;
  const q = str(sp.q);

  const subjectIds = Array.from(new Set(allNotes.map((n) => n.subject_id).filter((s): s is string => Boolean(s))));
  const { data: subjectData } = subjectIds.length ? await supabase.from("subjects").select("id, name").in("id", subjectIds) : { data: [] };
  const subjectName = new Map(((subjectData ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name] as const));
  const subjectOf = (n: LessonNoteRow) => (n.subject_id ? subjectName.get(n.subject_id) ?? "Subject" : "General");

  const inTerm = allNotes.filter((n) => termId === "all" || n.academic_term_id === termId);
  const subjectsHere = Array.from(new Set(inTerm.map((n) => n.subject_id ?? "none")))
    .map((id) => ({ id, name: id === "none" ? "General" : subjectName.get(id) ?? "Subject" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const needle = q.toLowerCase();
  const notes = inTerm.filter(
    (n) =>
      (!subjectId || (n.subject_id ?? "none") === subjectId) &&
      (!week || n.week === week) &&
      (!needle || n.topic.toLowerCase().includes(needle) || subjectOf(n).toLowerCase().includes(needle))
  );
  const { weeks, current } = noteWeeks(term);
  const termsById = new Map(terms.map((t) => [t.id, t] as const));
  const newCount = allNotes.filter((n) => isNewNote(n)).length;

  // Group: one term → by week (latest first); all terms → by term.
  const groups: Array<{ key: string; title: string; items: LessonNoteRow[] }> = [];
  const sorted = [...notes].sort(
    (a, b) =>
      (termId === "all" ? (termsById.get(b.academic_term_id ?? "")?.starts_on ?? "").localeCompare(termsById.get(a.academic_term_id ?? "")?.starts_on ?? "") : 0) ||
      (b.week ?? 0) - (a.week ?? 0) ||
      (b.published_at ?? "").localeCompare(a.published_at ?? "")
  );
  for (const n of sorted) {
    const key = termId === "all" ? n.academic_term_id ?? "none" : String(n.week ?? "none");
    const title =
      termId === "all"
        ? termsById.get(n.academic_term_id ?? "")
          ? termLabel(termsById.get(n.academic_term_id ?? "") as TermRow)
          : "Other notes"
        : weekLabel(n.week, weeks);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(n);
    else groups.push({ key, title, items: [n] });
  }

  const child = role === "parent" ? pupil.id : undefined;
  const keep = { student_id: child, term: termId !== defaultTerm ? termId : undefined };
  const filtered = Boolean(subjectId || week || q);
  const noteHref = (id: string) => `${PATH}/${id}${child ? `?student_id=${child}` : ""}`;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        help={HELP.lessonNotes}
        title="Lesson notes"
        description={
          role === "student"
            ? "Notes your teachers have shared, by subject and week. Open one to read it or download it for revision."
            : `Notes the teachers have shared with ${pupil.first_name}'s class. Open one to read it or download it.`
        }
      />

      {role === "parent" && children.length > 1 ? (
        <PillLinks
          label="Choose a child"
          items={children.map((c) => ({ key: c.id, href: url({ student_id: c.id }), label: `${c.first_name} ${c.last_name}`, active: c.id === pupil.id }))}
        />
      ) : null}

      {error ? <Alert tone="warning">Lesson notes aren&apos;t available yet. Please check again soon.</Alert> : null}
      {!pupil.class_id ? <Alert tone="info">{pupil.first_name} isn&apos;t in a class yet, so there are no lesson notes to show.</Alert> : null}

      {!allNotes.length ? (
        <Card>
          <EmptyState icon={BookOpenText} title="No lesson notes yet" description="When a teacher shares notes with the class, they appear here." />
        </Card>
      ) : (
        <>
          {newCount ? (
            <Alert tone="info">
              {newCount} new lesson note{newCount === 1 ? "" : "s"} this week{role === "parent" ? ` for ${pupil.first_name}'s class` : ""}.
            </Alert>
          ) : null}

          {terms.length > 1 ? (
            <PillLinks
              label="Term"
              items={[
                ...terms.map((t) => ({ key: t.id, href: url({ student_id: child, term: t.id === defaultTerm ? undefined : t.id }), label: termLabel(t), active: t.id === termId })),
                { key: "all", href: url({ student_id: child, term: "all" }), label: "All terms", active: termId === "all" }
              ]}
            />
          ) : null}

          {subjectsHere.length > 1 ? (
            <PillLinks
              label="Subject"
              items={[
                { key: "all", href: url({ ...keep, week: week ? String(week) : undefined, q: q || undefined }), label: "All subjects", active: !subjectId },
                ...subjectsHere.map((sub) => ({
                  key: sub.id,
                  href: url({ ...keep, subject: sub.id, week: week ? String(week) : undefined, q: q || undefined }),
                  label: sub.name,
                  active: subjectId === sub.id
                }))
              ]}
            />
          ) : null}

          <form method="get" action={PATH} className="flex flex-col gap-2 sm:flex-row" role="search">
            {child ? <input type="hidden" name="student_id" value={child} /> : null}
            {keep.term ? <input type="hidden" name="term" value={keep.term} /> : null}
            {subjectId ? <input type="hidden" name="subject" value={subjectId} /> : null}
            <div className="flex min-w-0 flex-1 gap-2">
              <label htmlFor="pn-q" className="sr-only">
                Search by topic
              </label>
              <input id="pn-q" name="q" type="search" defaultValue={q} className="gf-input min-w-0 flex-1" placeholder="Search by topic, e.g. fractions" />
              <button type="submit" className={buttonClasses({ variant: "primary" })} aria-label="Find notes">
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Find</span>
              </button>
            </div>
            {termId !== "all" ? (
              <div className="flex gap-2">
                <label htmlFor="pn-week" className="sr-only">
                  Week
                </label>
                <AutoSubmitSelect id="pn-week" name="week" defaultValue={week ? String(week) : ""} className="gf-select min-w-0 flex-1 sm:w-56">
                  <option value="">All weeks</option>
                  {weeks.map((w) => (
                    <option key={w.number} value={w.number}>
                      {w.label}
                      {w.number === current ? " (this week)" : ""}
                    </option>
                  ))}
                </AutoSubmitSelect>
                {filtered ? (
                  <a href={url(keep)} className={buttonClasses({ variant: "secondary" })} aria-label="Clear the search">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </form>

          {groups.length ? (
            groups.map((g) => (
              <Card key={g.key}>
                <CardHeader
                  title={g.title}
                  description={`${g.items.length} note${g.items.length === 1 ? "" : "s"}${termId !== "all" && g.key === String(current) ? " · this week" : ""}`}
                />
                <ul className="gf-stagger divide-y divide-slate-100">
                  {g.items.map((n) => (
                    <li key={n.id}>
                      <a href={noteHref(n.id)} className="flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50 active:bg-slate-100 sm:px-6">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-700">
                          <FileText className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">{n.topic}</span>
                            {isNewNote(n) ? <Badge tone="blue">New</Badge> : null}
                          </div>
                          <div className="mt-0.5 text-sm text-slate-500">
                            {subjectOf(n)}
                            {termId === "all" && n.week ? ` · Week ${n.week}` : ""}
                            {n.file_path ? ` · ${fileKind(n.file_type, n.file_name)}` : " · Notes to read"}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            ))
          ) : (
            <Card>
              <EmptyState
                icon={Search}
                title="No notes match"
                description="Try another subject or week, check the spelling, or look in All terms."
                action={
                  <a href={url(keep)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    Show all notes
                  </a>
                }
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
