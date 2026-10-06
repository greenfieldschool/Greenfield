// Columns of the term result sheet. Each column is stored as an academic_assessment of this type,
// and the default max scores add up to 100 so the raw scores are the subject total.
export const resultColumns = [
  { type: "first_ca", label: "1st CA", shortLabel: "1st CA", defaultMax: 20 },
  { type: "second_ca", label: "2nd CA", shortLabel: "2nd CA", defaultMax: 20 },
  { type: "exam_objective", label: "Exam (Objective)", shortLabel: "Obj.", defaultMax: 30 },
  { type: "exam_theory", label: "Exam (Theory)", shortLabel: "Theory", defaultMax: 30 }
] as const;

export type ResultColumnType = (typeof resultColumns)[number]["type"];

export const resultColumnTypes: string[] = resultColumns.map((c) => c.type);

export function isResultColumnType(v: string): v is ResultColumnType {
  return resultColumnTypes.includes(v);
}
