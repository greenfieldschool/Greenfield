// Tidies a subject name as typed: trims and collapses inner whitespace.
export function cleanSubjectName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

// Matches public.subject_name_key() in the database, which a unique index uses to block exact duplicates.
export function subjectNameKey(name: string) {
  return cleanSubjectName(name).toLowerCase();
}

// Looser key used only to flag likely duplicates for review, e.g. "I.C.T" and "ICT".
export function looseSubjectKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
