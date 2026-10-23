import { redirect } from "next/navigation";
import type { getSupabaseServerClient } from "@/lib/supabase/server";
import type { TeacherAccess } from "@/lib/teacher-access";
import { buttonClasses } from "@/components/ui/button";

type Supabase = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

export type PickerClass = { id: string; level: string; name: string };
export type PickerTerm = { id: string; label: string };

// Report cards are the class teacher's job (and the admin's). Subject teachers only enter their own scores.
export async function loadReportPicker(supabase: Supabase, access: TeacherAccess) {
  const [{ data: classes }, { data: terms }, { data: years }] = await Promise.all([
    access.isTeacher
      ? Promise.resolve({ data: access.classes.filter((c) => access.classTeacherClassIds.includes(c.id)) })
      : supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase.from("academic_terms").select("id, name, academic_year_id, is_active").order("starts_on", { ascending: false }),
    supabase.from("academic_years").select("id, name")
  ]);
  const yearName = new Map(((years ?? []) as Array<{ id: string; name: string }>).map((y) => [y.id, y.name] as const));
  const termRows = (terms ?? []) as Array<{ id: string; name: string; academic_year_id: string; is_active: boolean }>;
  return {
    classes: (classes ?? []) as PickerClass[],
    terms: termRows.map((t) => ({ id: t.id, label: `${yearName.get(t.academic_year_id) ?? ""} · ${t.name}`.replace(/^ · /, "") })),
    activeTermId: termRows.find((t) => t.is_active)?.id ?? termRows[0]?.id ?? ""
  };
}

export function canManageClassReports(access: TeacherAccess, classId: string) {
  return !access.isTeacher || access.classTeacherClassIds.includes(classId);
}

export function reportsUrl(path: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export function reportsBack(path: string, params: Record<string, string>, message: string, type: "success" | "error" = "success"): never {
  redirect(reportsUrl(path, { ...params, toast: message, toast_type: type }));
}

export function ClassTermPicker({
  action,
  classes,
  terms,
  classId,
  termId,
  submitLabel = "Open"
}: {
  action: string;
  classes: PickerClass[];
  terms: PickerTerm[];
  classId: string;
  termId: string;
  submitLabel?: string;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
      <div>
        <label htmlFor="pick-class" className="gf-label">
          Class
        </label>
        <select id="pick-class" name="class_id" className="gf-select" defaultValue={classId} required>
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.level} - {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="pick-term" className="gf-label">
          Term
        </label>
        <select id="pick-term" name="term_id" className="gf-select" defaultValue={termId} required>
          <option value="">Select term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <button type="submit" className={buttonClasses({ variant: "primary", className: "w-full sm:w-auto" })}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
