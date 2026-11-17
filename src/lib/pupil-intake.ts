// Shared steps for every way a pupil arrives (approved application, added by staff, moved over from another
// portal): look for the same child already on the system, and link the parent without making a second parent
// record. Server-only; uses the signed-in user's Supabase client, so RLS applies.

import type { SupabaseClient } from "@supabase/supabase-js";

export type PossibleDuplicate = {
  student_id: string;
  full_name: string;
  admission_number: string | null;
  class_name: string | null;
  status: string;
  date_of_birth: string | null;
  reasons: string[];
  strength: number;
};

/** A match at least this strong (same name, or same name and birthday) needs "This is a different child" ticked. */
export const STRONG_MATCH = 50;

export async function findPossibleDuplicates(
  supabase: SupabaseClient,
  input: { first: string; last: string; dob?: string | null; phones?: string[]; emails?: string[]; exclude?: string | null }
): Promise<{ rows: PossibleDuplicate[]; available: boolean }> {
  if (!input.first.trim() && !input.last.trim()) return { rows: [], available: true };
  const { data, error } = await supabase.rpc("find_possible_duplicates", {
    p_first: input.first,
    p_last: input.last,
    p_dob: input.dob || null,
    p_phones: (input.phones ?? []).filter(Boolean),
    p_emails: (input.emails ?? []).filter(Boolean),
    p_exclude: input.exclude ?? null
  });
  if (error) return { rows: [], available: false };
  return { rows: (data ?? []) as PossibleDuplicate[], available: true };
}

function phoneKey(p: string | null | undefined) {
  const digits = String(p ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : "";
}

/**
 * Links the child to their parent: reuses a parent record with the same email or phone (brothers and sisters
 * share one), otherwise creates one. Returns what happened, in words, for the toast. Never throws.
 */
export async function linkOrCreateGuardian(
  supabase: SupabaseClient,
  studentId: string,
  parent: { name?: string | null; phone?: string | null; email?: string | null; relationship?: string | null }
): Promise<{ guardianId: string | null; note: string | null }> {
  const name = (parent.name ?? "").trim();
  const email = (parent.email ?? "").trim().toLowerCase();
  const phone = (parent.phone ?? "").trim();
  if (!name && !email && !phone) return { guardianId: null, note: null };

  let guardianId: string | null = null;
  let reused: string | null = null;
  if (email) {
    const { data } = await supabase.from("guardians").select("id, full_name").ilike("email", email).limit(1).maybeSingle();
    if (data?.id) {
      guardianId = data.id as string;
      reused = data.full_name as string;
    }
  }
  if (!guardianId && phoneKey(phone)) {
    // Phone numbers are stored in many shapes (+234…, 0…); compare the last 10 digits.
    const tail = phoneKey(phone);
    const { data } = await supabase.from("guardians").select("id, full_name, phone").ilike("phone", `%${tail.slice(-7)}%`).limit(20);
    const hit = ((data ?? []) as Array<{ id: string; full_name: string; phone: string | null }>).find((g) => phoneKey(g.phone) === tail);
    if (hit) {
      guardianId = hit.id;
      reused = hit.full_name;
    }
  }
  if (!guardianId) {
    if (!name) return { guardianId: null, note: "Parent not added: their name is missing." };
    const { data, error } = await supabase
      .from("guardians")
      .insert({ full_name: name, email: email || null, phone: phone || null })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) return { guardianId: null, note: "The parent couldn't be added. Add them on the Guardians page." };
    guardianId = data.id as string;
  }
  const { error: linkError } = await supabase
    .from("student_guardians")
    .upsert({ student_id: studentId, guardian_id: guardianId, relationship: parent.relationship ?? null, is_primary: true }, { onConflict: "student_id,guardian_id" });
  if (linkError) return { guardianId, note: "The parent record exists but couldn't be linked. Link them on the Guardians page." };
  return { guardianId, note: reused ? `Linked to ${reused}, already on the system as a parent.` : null };
}
