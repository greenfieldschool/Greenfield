"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Saving and removing your own signature. The database only lets staff change their own row (RLS).

const PATH = "/admin/profile";

function back(message: string, type: "success" | "error" = "success"): never {
  redirect(`${PATH}?toast=${encodeURIComponent(message)}&toast_type=${type}#signature`);
}

function friendly(message: string) {
  if (/staff_signatures/.test(message) && /does not exist|schema cache/i.test(message)) {
    return "Signatures need a database update first. Ask the school's IT person to run 20261103_staff_signatures.sql.";
  }
  if (/staff_signatures_png/.test(message)) return "That signature couldn't be saved. Please draw it again.";
  if (/row-level security/i.test(message)) return "Only staff can save a signature, and only their own.";
  return "The signature couldn't be saved. Please try again.";
}

export async function saveSignature(formData: FormData) {
  const supabase = getSupabaseServerClient();
  if (!supabase) back("Server error — please try again later.", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) back("Please sign in again.", "error");

  const signature = String(formData.get("signature") ?? "");
  const signedName = String(formData.get("signed_name") ?? "").trim().replace(/\s+/g, " ");
  if (!signature.startsWith("data:image/png;base64,")) back("Draw your signature in the box first.", "error");
  if (signature.length > 400000) back("That signature is too large. Please draw it again, or upload a smaller photo.", "error");
  if (signedName.length < 2 || signedName.length > 80) back("Type the name to print under your signature.", "error");

  const { error } = await supabase
    .from("staff_signatures")
    .upsert({ user_id: user.id, signature, signed_name: signedName, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) back(friendly(error.message), "error");

  revalidatePath(PATH);
  back("Signature saved. It will appear on certificates you sign.");
}

export async function removeSignature() {
  const supabase = getSupabaseServerClient();
  if (!supabase) back("Server error — please try again later.", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) back("Please sign in again.", "error");

  const { error } = await supabase.from("staff_signatures").delete().eq("user_id", user.id);
  if (error) back(friendly(error.message), "error");

  revalidatePath(PATH);
  back("Signature removed. Certificates will show a blank line for you to sign by hand.");
}
