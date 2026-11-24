"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { findPossibleDuplicates, linkOrCreateGuardian, STRONG_MATCH, type PossibleDuplicate } from "@/lib/pupil-intake";
import { tidyAdmissionNumber } from "@/lib/admission-login";

const ALLOWED = ["super_admin", "admin", "front_desk"];

async function staffClient() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = String(data?.role ?? "");
  if (!ALLOWED.includes(role)) return null;
  return { supabase, role };
}

/** Live check while typing: who might this child already be? */
export async function findDuplicatesAction(input: { first: string; last: string; dob: string; phone: string; email: string }): Promise<PossibleDuplicate[]> {
  const ctx = await staffClient();
  if (!ctx) return [];
  const { rows } = await findPossibleDuplicates(ctx.supabase, {
    first: input.first.slice(0, 80),
    last: input.last.slice(0, 80),
    dob: /^\d{4}-\d{2}-\d{2}$/.test(input.dob) ? input.dob : null,
    phones: [input.phone.slice(0, 40)],
    emails: [input.email.slice(0, 120)]
  });
  return rows;
}

/** Live check of an existing admission number typed in: free, or whose is it? */
export async function checkAdmissionNumberAction(raw: string): Promise<{ tidy: string; owner: { id: string; name: string } | null }> {
  const tidy = tidyAdmissionNumber(raw).slice(0, 40);
  const ctx = await staffClient();
  if (!ctx || !tidy) return { tidy, owner: null };
  const { data } = await ctx.supabase.rpc("admission_number_owner", { p_number: tidy, p_exclude: null });
  const o = ((data ?? []) as Array<{ student_id: string; full_name: string }>)[0];
  return { tidy, owner: o ? { id: o.student_id, name: o.full_name } : null };
}

export type NewPupilState = {
  error: string | null;
  duplicates: PossibleDuplicate[];
  /** Field to send focus to after an error. */
  field?: string;
};

export async function createPupilAction(_prev: NewPupilState, formData: FormData): Promise<NewPupilState> {
  const ctx = await staffClient();
  if (!ctx) return { error: "Only admins and the front desk can add learners.", duplicates: [] };
  const { supabase } = ctx;
  const s = (k: string) => String(formData.get(k) ?? "").trim();

  const first = s("first_name");
  const middle = s("middle_name");
  const last = s("last_name");
  const dob = s("date_of_birth");
  const sex = s("sex");
  const classId = s("class_id");
  const status = s("status") === "active" ? "active" : "enrolled";
  const numberMode = s("number_mode") === "keep" ? "keep" : "auto";
  const existingNumber = tidyAdmissionNumber(s("admission_number"));
  const parentName = s("parent_name");
  const parentPhone = s("parent_phone");
  const parentEmail = s("parent_email");
  const relationship = s("relationship");
  const confirmedDifferent = formData.get("confirm_different") === "on";

  if (!first) return { error: "Type the learner's first name.", duplicates: [], field: "first_name" };
  if (!last) return { error: "Type the learner's surname.", duplicates: [], field: "last_name" };
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return { error: "Check the date of birth.", duplicates: [], field: "date_of_birth" };
  if (numberMode === "keep" && !existingNumber) {
    return { error: "Type the admission number from the other portal, or choose 'Give the next number'.", duplicates: [], field: "admission_number" };
  }
  if (parentEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parentEmail)) {
    return { error: "Check the parent's email address.", duplicates: [], field: "parent_email" };
  }

  // Same child already here? Checked again on the server, whatever the page showed.
  const { rows: dups } = await findPossibleDuplicates(supabase, { first, last, dob, phones: [parentPhone], emails: [parentEmail] });
  const strong = dups.filter((d) => d.strength >= STRONG_MATCH);
  if (strong.length && !confirmedDifferent) {
    return {
      error: "This child may already be on the system. Open the matching record, or tick 'This is a different child' to add them anyway.",
      duplicates: dups,
      field: "confirm_different"
    };
  }

  let level = "primary";
  if (classId) {
    const { data: cls } = await supabase.from("classes").select("level").eq("id", classId).maybeSingle();
    if (cls?.level) level = String(cls.level);
  } else if (["creche", "primary", "secondary"].includes(s("level"))) {
    level = s("level");
  }

  const { data: created, error } = await supabase
    .from("students")
    .insert({
      first_name: first,
      middle_name: middle || null,
      last_name: last,
      date_of_birth: dob || null,
      sex: sex || null,
      class_id: classId || null,
      level,
      status,
      // Empty → the database gives the next number in the school's format.
      admission_number: numberMode === "keep" ? existingNumber : null
    })
    .select("id, admission_number")
    .maybeSingle();

  if (error || !created?.id) {
    const msg = error?.message ?? "";
    if (/already used by/i.test(msg)) return { error: msg.replace(/\.$/, "") + ". Choose another number, or open that learner's record.", duplicates: [], field: "admission_number" };
    return { error: `The learner couldn't be added${msg ? `: ${msg}` : "."}`, duplicates: [] };
  }

  const parent = await linkOrCreateGuardian(supabase, created.id as string, {
    name: parentName,
    phone: parentPhone,
    email: parentEmail,
    relationship: relationship || null
  });

  if (strong.length && confirmedDifferent) {
    await supabase.rpc("log_account_action", {
      p_action: "duplicate_override",
      p_student: created.id,
      p_detail: `Added although similar to ${strong.map((d) => `${d.full_name}${d.admission_number ? ` (${d.admission_number})` : ""}`).join(", ")}`.slice(0, 480)
    });
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin/accounts");
  const parts = [`${first} ${last} added`];
  if (created.admission_number) parts.push(`admission number ${created.admission_number}`);
  if (parent.note) parts.push(parent.note);
  redirect(`/admin/students/${created.id}?toast=${encodeURIComponent(parts.join(" · "))}&toast_type=success`);
}
