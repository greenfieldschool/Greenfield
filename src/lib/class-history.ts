import type { SupabaseClient } from "@supabase/supabase-js";

// Which pupils were in a class in a given term. The record is `student_class_terms` (one row per pupil per term,
// see docs/migrations/20261118b_pupil_class_history.sql and the pupil-class-history skill); the database function
// `class_members_in_term` reads it with the caller's permissions, and falls back to the class's pupils now for a
// term with no history yet (e.g. next term).
//
// Use this for anything that lists a class FOR A TERM (report cards, result sheets). Lists of a class as it is
// today (registers, messaging, the class page) keep reading `students.class_id`.

export type TermPupil = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  admission_number: string | null;
  sex: string | null;
  date_of_birth: string | null;
  passport_photo_url: string | null;
  profile_photo_url: string | null;
  status: string | null;
};

const FIELDS =
  "id, first_name, middle_name, last_name, admission_number, sex, date_of_birth, passport_photo_url, profile_photo_url, status";

// PostgREST / Postgres codes for "this function doesn't exist (yet)": the database update hasn't been run.
function isMissingFunction(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /class_members_in_term/.test(error.message ?? "");
}

/** The pupils of `classId` in `termId`, sorted by surname then first name. */
export async function classPupilsInTerm(
  supabase: SupabaseClient,
  classId: string,
  termId: string
): Promise<{ data: TermPupil[]; error: { message: string } | null }> {
  if (classId && termId) {
    const { data, error } = await supabase.rpc("class_members_in_term", { p_class: classId, p_term: termId });
    if (!error) return { data: (data ?? []) as TermPupil[], error: null };
    if (!isMissingFunction(error)) return { data: [], error };
  }
  // Before the database update: the class as it is now (what every screen used before).
  const { data, error } = await supabase
    .from("students")
    .select(FIELDS)
    .eq("class_id", classId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  return { data: (data ?? []) as TermPupil[], error };
}

export const CLASS_HISTORY_SOURCES: Record<string, string> = {
  records: "Worked out from records",
  "term start": "Start of term",
  "class change": "Class changed",
  "new learner": "New learner",
  "class merge": "Classes merged",
  admin: "Set by an admin"
};
