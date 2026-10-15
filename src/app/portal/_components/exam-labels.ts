// Friendly names for exam question types, shared by the exam runner and the results review.
export function questionTypeLabel(type: string | null | undefined) {
  switch (type) {
    case "mcq_single":
      return "Multiple choice";
    case "true_false":
      return "True or false";
    case "fill_blank":
      return "Fill in the blank";
    case "short_answer":
      return "Short answer";
    case "essay":
    case "theory":
      return "Written answer";
    default:
      return type ? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Question";
  }
}

export function marksLabel(marks: number | null | undefined) {
  const n = Number(marks ?? 0);
  return `${n} mark${n === 1 ? "" : "s"}`;
}
