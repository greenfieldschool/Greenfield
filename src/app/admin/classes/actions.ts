"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Delete / merge a class. Used from the Classes list and from a class's own page; the database
// functions (docs/migrations/20261016_class_delete_merge.sql) do the work and check the user is an admin.

const MIGRATION_MISSING =
  "Deleting and merging classes is not set up in the database yet. Run docs/migrations/20261016_class_delete_merge.sql in Supabase.";

function toast(path: string, message: string, type: "success" | "error"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

function explain(message: string) {
  return /could not find the function|does not exist/i.test(message) ? MIGRATION_MISSING : message;
}

// Only ever send people back to a Classes page.
function safeReturn(raw: FormDataEntryValue | null, fallback: string) {
  const v = String(raw ?? "").trim();
  return /^\/admin\/classes(\/[0-9a-f-]+)?$/i.test(v) ? v : fallback;
}

async function requireAdmin(returnTo: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) toast(returnTo, "Server error — Supabase is not configured", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") toast(returnTo, "Only admins can delete or merge classes", "error");
  return supabase;
}

function revalidateClasses(...ids: string[]) {
  revalidatePath("/admin/classes");
  ids.forEach((id) => revalidatePath(`/admin/classes/${id}`));
  revalidatePath("/admin/finance/fees/classes");
  revalidatePath("/admin/students");
  revalidatePath("/admin/exams/sessions");
  revalidatePath("/admin/academics/teachers");
}

/** Deletes a class nothing uses. Form fields: class_id, return_to (optional). */
export async function deleteClassAction(formData: FormData) {
  const classId = String(formData.get("class_id") ?? "").trim();
  const returnTo = safeReturn(formData.get("return_to"), "/admin/classes");
  if (!classId) toast(returnTo, "Choose a class to delete", "error");

  const supabase = await requireAdmin(returnTo);
  const { error } = await supabase.rpc("delete_class", { p_class: classId });
  if (error) toast(returnTo, explain(error.message), "error");

  revalidateClasses(classId);
  toast("/admin/classes", "Class deleted", "success");
}

/** Moves everything from the duplicate onto the class being kept, then deletes the duplicate. Form fields: source_id, target_id. */
export async function mergeClassAction(formData: FormData) {
  const sourceId = String(formData.get("source_id") ?? "").trim();
  const targetId = String(formData.get("target_id") ?? "").trim();
  const returnTo = safeReturn(formData.get("return_to"), "/admin/classes");
  if (!sourceId) toast(returnTo, "Choose the class to remove", "error");
  if (!targetId || targetId === sourceId) toast(returnTo, "Choose the class to keep", "error");

  const supabase = await requireAdmin(returnTo);
  const { data, error } = await supabase.rpc("merge_classes", { p_source: sourceId, p_target: targetId });
  if (error) toast(returnTo, explain(error.message), "error");

  const moved = Number((data as { moved_students?: number } | null)?.moved_students ?? 0);
  revalidateClasses(sourceId, targetId);
  // Back to the list unless the admin was on the class page of the one that is now gone.
  const next = returnTo === `/admin/classes/${sourceId}` ? `/admin/classes/${targetId}` : returnTo;
  toast(
    next,
    `Classes merged. ${moved} student${moved === 1 ? "" : "s"} moved, with their results, attendance, fees and exams.`,
    "success"
  );
}
