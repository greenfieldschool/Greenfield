import { firstOrNull } from "@/lib/relations";
import type { getSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

export type TeacherClass = { id: string; level: string; name: string };

// What the signed-in teacher may work on. The database enforces the same rules (see
// 20261019_teacher_subject_assignments.sql); this is used to show only the right choices on the pages.
//
//  - Class teacher (teacher_class_assignments): every subject the class offers, or every subject when the
//    class has no subject list yet.
//  - Subject teacher (teacher_subject_assignments): only that subject in that class.
export type TeacherAccess = {
  userId: string | null;
  isTeacher: boolean;
  /** Classes the teacher can open, as class teacher or subject teacher. */
  classes: TeacherClass[];
  /** Classes the teacher is the class teacher of (attendance, students, publishing). */
  classTeacherClassIds: string[];
  /** Per class: the subject ids the teacher works on, or "all". */
  subjectsByClass: Record<string, string[] | "all">;
};

const NOT_A_TEACHER: TeacherAccess = {
  userId: null,
  isTeacher: false,
  classes: [],
  classTeacherClassIds: [],
  subjectsByClass: {}
};

export async function getTeacherAccess(supabase: Supabase): Promise<TeacherAccess> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NOT_A_TEACHER;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((profile as { role?: string } | null)?.role !== "teacher") return { ...NOT_A_TEACHER, userId: user.id };

  const [{ data: classRows }, { data: subjectRows }] = await Promise.all([
    supabase
      .from("teacher_class_assignments")
      .select("class_id, classes(id, level, name)")
      .eq("teacher_id", user.id)
      .eq("active", true),
    // Missing before the migration is run: treated as "no subject assignments".
    supabase
      .from("teacher_subject_assignments")
      .select("class_id, subject_id, classes(id, level, name)")
      .eq("teacher_id", user.id)
      .eq("active", true)
  ]);

  const classes = new Map<string, TeacherClass>();
  const classTeacherClassIds: string[] = [];
  for (const r of (classRows ?? []) as unknown as Array<{ class_id: string; classes: TeacherClass | TeacherClass[] | null }>) {
    const c = firstOrNull(r.classes);
    if (c) classes.set(c.id, c);
    classTeacherClassIds.push(r.class_id);
  }

  const subjectsByClass: Record<string, string[] | "all"> = {};

  // Class teacher: the class's own subject list (or everything if it has none).
  if (classTeacherClassIds.length) {
    const { data: offered } = await supabase
      .from("class_subjects")
      .select("class_id, subject_id")
      .in("class_id", classTeacherClassIds);
    const offeredByClass: Record<string, string[]> = {};
    for (const o of (offered ?? []) as Array<{ class_id: string; subject_id: string }>) {
      (offeredByClass[o.class_id] ??= []).push(o.subject_id);
    }
    for (const classId of classTeacherClassIds) {
      subjectsByClass[classId] = offeredByClass[classId] ?? "all";
    }
  }

  // Subject teacher: add the assigned subjects.
  for (const r of (subjectRows ?? []) as unknown as Array<{
    class_id: string;
    subject_id: string;
    classes: TeacherClass | TeacherClass[] | null;
  }>) {
    const c = firstOrNull(r.classes);
    if (c) classes.set(c.id, c);
    const current = subjectsByClass[r.class_id];
    if (current === "all") continue;
    subjectsByClass[r.class_id] = Array.from(new Set([...(current ?? []), r.subject_id]));
  }

  return {
    userId: user.id,
    isTeacher: true,
    classes: Array.from(classes.values()).sort((a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name)),
    classTeacherClassIds,
    subjectsByClass
  };
}

/** May this teacher work on this subject in this class? Always true for non-teachers (the database still applies its own rules). */
export function canTeach(access: TeacherAccess, classId: string, subjectId: string | null): boolean {
  if (!access.isTeacher) return true;
  const allowed = access.subjectsByClass[classId];
  if (!allowed) return false;
  if (allowed === "all") return true;
  return subjectId === null ? access.classTeacherClassIds.includes(classId) : allowed.includes(subjectId);
}

/** Does this teacher teach this subject in at least one class? Decides who may set its CBT tests. */
export function teachesSubject(access: TeacherAccess, subjectId: string | null): boolean {
  if (!access.isTeacher) return true;
  if (!subjectId) return false;
  return Object.values(access.subjectsByClass).some((v) => v === "all" || v.includes(subjectId));
}

/** Subject ids across all of the teacher's classes, or "all" when a class teacher has an unrestricted class. */
export function teacherSubjectIds(access: TeacherAccess): string[] | "all" {
  const ids = new Set<string>();
  for (const v of Object.values(access.subjectsByClass)) {
    if (v === "all") return "all";
    v.forEach((id) => ids.add(id));
  }
  return Array.from(ids);
}

/** PostgREST `or` filter limiting exam_tests to the ones a teacher may work on; null when there is no limit. */
export function teacherTestFilter(access: TeacherAccess): string | null {
  if (!access.isTeacher) return null;
  const ids = teacherSubjectIds(access);
  if (ids === "all") return null;
  const parts: string[] = [];
  if (ids.length) parts.push(`subject_id.in.(${ids.join(",")})`);
  if (access.userId) parts.push(`created_by.eq.${access.userId}`);
  return parts.length ? parts.join(",") : "id.is.null";
}

/** May this person edit the test? Teachers: tests of subjects they teach, or tests they created. */
export function canManageTest(access: TeacherAccess, test: { subject_id: string | null; created_by?: string | null }): boolean {
  if (!access.isTeacher) return true;
  return teachesSubject(access, test.subject_id) || (!!access.userId && test.created_by === access.userId);
}
