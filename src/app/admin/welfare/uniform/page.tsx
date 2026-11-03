import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { firstOrNull } from "@/lib/relations";
import { CheckCircle2, Shirt, Trash2, Users, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { addDays, mondayOf, weekRange } from "@/lib/welfare";
import { cn } from "@/lib/cn";
import { BackToScoreSheet, deleteLinkClasses, scoreSheetBack } from "../_ui";
import { LEARN } from "@/lib/learn-guides";

// Uniform checks for a whole class on one day: everyone starts as "Neat", mark the pupils who weren't, save once.
// The welfare score sheet works out each week's Uniform & appearance mark from these checks.

const PATH = "/admin/welfare/uniform";

type ClassRow = { id: string; level: string; name: string };
type StudentRow = { id: string; first_name: string; last_name: string };
type CheckRow = { id: string; student_id: string; date: string; ok: boolean; notes: string | null };

// Today's date in Lagos (UTC+1, no daylight saving), as YYYY-MM-DD.
function lagosToday() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function sheetUrl(classId: string, date: string, back: string | null, toast?: { message: string; type: "success" | "error" }) {
  const params = new URLSearchParams();
  if (classId) params.set("class_id", classId);
  if (date) params.set("date", date);
  if (back) params.set("back", back);
  if (toast) {
    params.set("toast", toast.message);
    params.set("toast_type", toast.type);
  }
  return `${PATH}?${params.toString()}`;
}

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// Module-level actions: they can't capture anything from the page render.
async function saveUniformSheet(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const back = scoreSheetBack(String(formData.get("back") ?? ""));
  if (!classId || !isDay(date)) redirect(sheetUrl(classId, date, back, { message: "Choose a class and a date", type: "error" }));

  const supabase = getSupabaseServerClient();
  if (!supabase) redirect(sheetUrl(classId, date, back, { message: "Database is not configured", type: "error" }));

  // The term the date falls in, so the check counts for the right report card.
  const { data: term } = await supabase
    .from("academic_terms")
    .select("id, academic_year_id")
    .lte("starts_on", date)
    .gte("ends_on", date)
    .limit(1)
    .maybeSingle();
  const t = term as { id: string; academic_year_id: string } | null;
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const rows: Array<Record<string, unknown>> = [];
  for (const [key, value] of Array.from(formData.entries())) {
    if (!key.startsWith("ok:")) continue;
    const studentId = key.slice(3);
    const ok = String(value) === "yes";
    const note = String(formData.get(`note:${studentId}`) ?? "").trim();
    const orig = String(formData.get(`orig:${studentId}`) ?? "");
    const origNote = String(formData.get(`orignote:${studentId}`) ?? "");
    if (orig === String(value) && origNote === note) continue;
    rows.push({
      student_id: studentId,
      academic_year_id: t?.academic_year_id ?? null,
      academic_term_id: t?.id ?? null,
      date,
      ok,
      notes: note.length ? note : null,
      recorded_by: user?.id ?? null,
      updated_at: new Date().toISOString()
    });
  }
  if (rows.length) {
    const { error } = await supabase.from("student_uniform_checks").upsert(rows, { onConflict: "student_id,date" });
    if (error) redirect(sheetUrl(classId, date, back, { message: error.message, type: "error" }));
  }
  revalidatePath(PATH);
  revalidatePath("/admin/welfare/scores");
  redirect(
    sheetUrl(classId, date, back, {
      message: rows.length ? `Uniform check saved: ${rows.length} pupil${rows.length === 1 ? "" : "s"} updated` : "Nothing had changed",
      type: "success"
    })
  );
}

async function deleteDayChecks(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const back = scoreSheetBack(String(formData.get("back") ?? ""));
  const ids = formData.getAll("id").map(String).filter(Boolean);
  const supabase = getSupabaseServerClient();
  if (!supabase || !ids.length) redirect(sheetUrl(classId, date, back, { message: "Nothing to remove", type: "error" }));
  const { error } = await supabase.from("student_uniform_checks").delete().in("id", ids);
  revalidatePath(PATH);
  revalidatePath("/admin/welfare/scores");
  if (error) redirect(sheetUrl(classId, date, back, { message: error.message, type: "error" }));
  redirect(sheetUrl(classId, date, back, { message: "That day's uniform check was removed", type: "success" }));
}

export default async function AdminWelfareUniformPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const back = scoreSheetBack(sp.back);

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  const isTeacher = (profile as { role?: string } | null)?.role === "teacher";

  // Teachers see the classes they are class teacher of; other staff see every class.
  const [{ data: teacherClasses }, { data: allClasses }] = await Promise.all([
    isTeacher && user
      ? supabase.from("teacher_class_assignments").select("classes(id, level, name)").eq("teacher_id", user.id).eq("active", true)
      : Promise.resolve({ data: [] as unknown[] }),
    !isTeacher
      ? supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name")
      : Promise.resolve({ data: [] as unknown[] })
  ]);
  const classes = isTeacher
    ? ((teacherClasses ?? []) as Array<{ classes: ClassRow | ClassRow[] | null }>).map((r) => firstOrNull(r.classes)).filter((c): c is ClassRow => Boolean(c))
    : ((allClasses ?? []) as ClassRow[]);

  const today = lagosToday();
  const requestedClass = typeof sp.class_id === "string" ? sp.class_id : "";
  const classId = classes.some((c) => c.id === requestedClass) ? requestedClass : classes[0]?.id ?? "";
  const date = typeof sp.date === "string" && isDay(sp.date) ? sp.date : today;
  const cls = classes.find((c) => c.id === classId) ?? null;

  const { data: studentData } = classId
    ? await supabase.from("students").select("id, first_name, last_name").eq("class_id", classId).order("last_name").order("first_name")
    : { data: [] };
  const students = (studentData ?? []) as StudentRow[];
  const ids = students.length ? students.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"];

  const monday = mondayOf(date);
  const weekDays = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const { data: weekData } = await supabase
    .from("student_uniform_checks")
    .select("id, student_id, date, ok, notes")
    .in("student_id", ids)
    .gte("date", weekDays[0])
    .lte("date", weekDays[4]);
  const weekChecks = (weekData ?? []) as CheckRow[];
  const dayChecks = weekChecks.filter((c) => String(c.date).slice(0, 10) === date);
  const checkByStudent = new Map(dayChecks.map((c) => [c.student_id, c] as const));
  const checkedByDay = new Map<string, number>();
  for (const c of weekChecks) checkedByDay.set(String(c.date).slice(0, 10), (checkedByDay.get(String(c.date).slice(0, 10)) ?? 0) + 1);

  const neat = dayChecks.filter((c) => c.ok).length;
  const notNeat = dayChecks.length - neat;
  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.welfareRecords}
        eyebrow="Welfare"
        title="Uniform checks"
        description="Check a whole class's uniform and appearance on a day. The welfare score sheet works out each week's Uniform mark from these checks."
      />

      <BackToScoreSheet href={back} what="the uniform check for the days you checked" />

      {!classes.length ? (
        <Alert tone="warning">
          {isTeacher ? "No classes are assigned to you yet. Ask an admin to make you the class teacher of a class." : "There are no classes yet."}
        </Alert>
      ) : (
        <>
          <Card>
            <CardBody>
              <form method="get" action={PATH} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                {back ? <input type="hidden" name="back" value={back} /> : null}
                <div className="min-w-0 flex-1">
                  <label htmlFor="uni-class" className="gf-label">
                    Class
                  </label>
                  <select id="uni-class" name="class_id" defaultValue={classId} className="gf-select">
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.level} · {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="uni-date" className="gf-label">
                    Day
                  </label>
                  <input id="uni-date" name="date" type="date" defaultValue={date} className="gf-input" />
                </div>
                <button type="submit" className={buttonClasses({ variant: "secondary" })}>
                  Open
                </button>
              </form>
            </CardBody>
          </Card>

          <nav aria-label="Days of this week" className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Week of {weekRange(monday)}</div>
            <ol className="grid grid-cols-5 gap-2">
              {weekDays.map((d) => {
                const n = checkedByDay.get(d) ?? 0;
                const isSelected = d === date;
                const future = d > today;
                return (
                  <li key={d}>
                    <a
                      href={sheetUrl(classId, d, back)}
                      aria-current={isSelected ? "date" : undefined}
                      className={cn(
                        "flex flex-col rounded-xl border px-2 py-2 text-center transition sm:px-3",
                        isSelected
                          ? "border-brand-green-500 bg-brand-green-50 ring-2 ring-brand-green-500/20"
                          : future
                            ? "border-dashed border-slate-200 bg-slate-50 text-slate-400"
                            : "border-slate-200 bg-white hover:border-brand-green-300"
                      )}
                    >
                      <span className="text-xs font-semibold text-slate-800">
                        {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                      </span>
                      <span className="text-[11px] text-slate-500">{Number(d.slice(8, 10))}</span>
                      <span className={cn("mt-1 text-[11px] font-medium", n ? "text-brand-green-700" : "text-slate-400")}>{n ? "Checked" : "—"}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-slate-500">You don&apos;t need to check every day: the week&apos;s mark comes from the days you did check.</p>
          </nav>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Pupils in class" value={students.length} hint={cls ? cls.name : ""} icon={Users} tone="slate" />
            <StatCard label="Neat" value={neat} hint={dayChecks.length ? `on ${dateLabel}` : "not checked this day"} icon={CheckCircle2} tone="green" />
            <StatCard label="Not neat" value={notNeat} hint="needs follow-up" icon={XCircle} tone="rose" />
          </div>

          <Card>
            <CardHeader
              title={`Uniform check · ${dateLabel}`}
              description="Everyone starts as Neat: mark the pupils whose uniform or appearance wasn't right (add a note if you like), then save once."
              action={
                <Badge tone={dayChecks.length >= students.length && students.length ? "green" : dayChecks.length ? "gold" : "slate"} dot>
                  {dayChecks.length}/{students.length} saved
                </Badge>
              }
            />
            {students.length ? (
              <form action={saveUniformSheet}>
                <input type="hidden" name="class_id" value={classId} />
                <input type="hidden" name="date" value={date} />
                {back ? <input type="hidden" name="back" value={back} /> : null}
                <ul className="divide-y divide-slate-100">
                  {students.map((s) => {
                    const c = checkByStudent.get(s.id);
                    const current = c ? (c.ok ? "yes" : "no") : "";
                    return (
                      <li key={s.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,16rem)] sm:items-center sm:gap-4 sm:px-6">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">
                            {s.first_name} {s.last_name}
                          </div>
                          <div className="text-xs">
                            {c ? <span className="text-slate-500">Saved: {c.ok ? "Neat" : "Not neat"}</span> : <span className="font-medium text-brand-gold-800">Not saved yet</span>}
                          </div>
                        </div>
                        <input type="hidden" name={`orig:${s.id}`} value={current} />
                        <input type="hidden" name={`orignote:${s.id}`} value={c?.notes ?? ""} />
                        <fieldset className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-0.5 sm:inline-flex">
                          <legend className="sr-only">
                            Uniform for {s.first_name} {s.last_name}
                          </legend>
                          {[
                            { v: "yes", label: "Neat", on: "peer-checked:bg-brand-green peer-checked:text-white" },
                            { v: "no", label: "Not neat", on: "peer-checked:bg-red-600 peer-checked:text-white" }
                          ].map((o) => (
                            <label key={o.v} className="cursor-pointer">
                              <input type="radio" name={`ok:${s.id}`} value={o.v} defaultChecked={(current || "yes") === o.v} className="peer sr-only" />
                              <span
                                className={`flex h-10 items-center justify-center rounded-lg px-3 text-xs font-semibold text-slate-600 transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-green-500/40 sm:h-8 ${o.on}`}
                              >
                                {o.label}
                              </span>
                            </label>
                          ))}
                        </fieldset>
                        <input
                          name={`note:${s.id}`}
                          defaultValue={c?.notes ?? ""}
                          placeholder="Note (optional), e.g. no tie"
                          aria-label={`Note for ${s.first_name} ${s.last_name}`}
                          className="gf-input"
                        />
                      </li>
                    );
                  })}
                </ul>
                <div className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-b-2xl border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <p className="text-xs text-slate-500">Saves every pupil above for {dateLabel}.</p>
                  <SubmitButton variant="primary" pendingText="Saving…">
                    <span className="inline-flex items-center gap-2">
                      <Shirt className="h-4 w-4" aria-hidden="true" />
                      Save uniform check
                    </span>
                  </SubmitButton>
                </div>
              </form>
            ) : (
              <EmptyState icon={Shirt} title="No pupils in this class" description="Add pupils to the class first." />
            )}
          </Card>

          {dayChecks.length ? (
            <form action={deleteDayChecks} className="flex justify-end">
              <input type="hidden" name="class_id" value={classId} />
              <input type="hidden" name="date" value={date} />
              {back ? <input type="hidden" name="back" value={back} /> : null}
              {dayChecks.map((c) => (
                <input key={c.id} type="hidden" name="id" value={c.id} />
              ))}
              <ConfirmSubmitButton className={deleteLinkClasses} confirmMessage={`Remove the uniform check for ${dateLabel}? Use this if the class wasn't checked that day.`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Remove this day&apos;s check
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
