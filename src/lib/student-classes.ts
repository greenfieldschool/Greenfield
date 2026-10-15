import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetch-all";

export type StudentOption = {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string | null;
  class_id: string | null;
};

export type ClassOption = { id: string; level: string; name: string };

const levelOrder: Record<string, number> = { creche: 0, primary: 1, secondary: 2 };

export function classLabel(c: ClassOption | null | undefined) {
  return c ? `${c.level} - ${c.name}` : "No class";
}

export function studentLabel(s: Pick<StudentOption, "first_name" | "last_name" | "admission_number">) {
  return `${s.last_name} ${s.first_name}${s.admission_number ? ` (${s.admission_number})` : ""}`;
}

/** Students and classes for pickers and reports, with students grouped by their current class. */
export async function loadStudentsByClass(supabase: SupabaseClient) {
  const [studentRows, { data: classes }] = await Promise.all([
    fetchAllRows<StudentOption>(() =>
      supabase
        .from("students")
        .select("id, first_name, last_name, admission_number, class_id")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .order("id", { ascending: true })
    ),
    supabase.from("classes").select("id, level, name").order("level").order("name")
  ]);

  const classRows = ((classes ?? []) as ClassOption[]).sort(
    (a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9) || a.name.localeCompare(b.name)
  );
  const classById = new Map(classRows.map((c) => [c.id, c] as const));
  const studentById = new Map(studentRows.map((s) => [s.id, s] as const));

  const groups: Array<{ label: string; classId: string | null; students: StudentOption[] }> = classRows.map((c) => ({
    label: classLabel(c),
    classId: c.id,
    students: studentRows.filter((s) => s.class_id === c.id)
  }));
  const unassigned = studentRows.filter((s) => !s.class_id || !classById.has(s.class_id));
  if (unassigned.length) groups.push({ label: "No class", classId: null, students: unassigned });

  return { students: studentRows, classes: classRows, classById, studentById, groups: groups.filter((g) => g.students.length) };
}
