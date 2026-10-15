import { studentLabel, type StudentOption } from "@/lib/student-classes";

// Student picker grouped by class, so staff can find a child by class.
export default function StudentSelect({
  groups,
  defaultValue,
  className
}: {
  groups: Array<{ label: string; classId: string | null; students: StudentOption[] }>;
  defaultValue?: string;
  className: string;
}) {
  return (
    <select className={className} name="student_id" defaultValue={defaultValue ?? ""}>
      <option value="">—</option>
      {groups.map((g) => (
        <optgroup key={g.classId ?? "none"} label={g.label}>
          {g.students.map((s) => (
            <option key={s.id} value={s.id}>
              {studentLabel(s)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
