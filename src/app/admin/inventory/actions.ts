"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CONDITIONS, DEACTIVATE_REASONS, INVENTORY_BUCKET, LOCATION_KINDS, MAX_PHOTOS, MISSING_DB, SCHOOL_PARTS, isMissingTable } from "@/lib/inventory";

// Inventory server actions. Everything comes from the form; RLS (admins only, no deletes) is the real guard, and a
// trigger logs every change to inventory_log. There is deliberately no delete action: items are deactivated.

function go(path: string, message: string, type: "success" | "error" = "error"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

function safeReturn(raw: FormDataEntryValue | null, fallback: string) {
  const v = String(raw ?? "");
  return v.startsWith("/admin/inventory") ? v : fallback;
}

function friendly(message: string) {
  if (isMissingTable(message)) return MISSING_DB;
  if (/row-level security|permission denied/i.test(message)) return "Only admins can change the inventory";
  return message;
}

async function client(back: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "Database is not configured — nothing was saved");
  return supabase;
}

const count = (fd: FormData, key: string) => {
  const n = Math.floor(Number(String(fd.get(key) ?? "0").trim() || "0"));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : 0;
};

/** Add or update an item. Fields: id (edit), section_id, name, school_part, location_id, qty_*, description,
 *  last_checked_on, photos (repeated), return_to. */
export async function saveItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const back = safeReturn(formData.get("return_to"), id ? `/admin/inventory/${id}` : "/admin/inventory/new");
  const supabase = await client(back);

  const sectionId = String(formData.get("section_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const partRaw = String(formData.get("school_part") ?? "whole_school");
  const schoolPart = SCHOOL_PARTS.some((p) => p.value === partRaw) ? partRaw : "whole_school";
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const checked = String(formData.get("last_checked_on") ?? "").trim() || null;
  const photos = formData
    .getAll("photos")
    .map((p) => String(p))
    .filter((p) => /^items\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(p))
    .slice(0, MAX_PHOTOS);

  if (!sectionId) go(back, "Choose a section");
  if (!name) go(back, "Type the item's name");

  const row: Record<string, unknown> = {
    section_id: sectionId,
    name,
    school_part: schoolPart,
    location_id: locationId,
    description,
    last_checked_on: checked,
    photos
  };
  for (const c of CONDITIONS) row[c.column] = count(formData, c.column);
  if (CONDITIONS.every((c) => row[c.column] === 0)) go(back, "Enter how many there are (at least one condition)");

  if (id) {
    const { data: before } = await supabase.from("inventory_items").select("photos").eq("id", id).maybeSingle();
    const { error } = await supabase.from("inventory_items").update(row).eq("id", id);
    if (error) go(back, friendly(error.message));
    // Pictures taken off the item are removed from storage too.
    const removed = ((before as { photos?: string[] } | null)?.photos ?? []).filter((p) => !photos.includes(p));
    if (removed.length) await supabase.storage.from(INVENTORY_BUCKET).remove(removed);
    revalidatePath("/admin/inventory");
    go(`/admin/inventory/${id}`, "Item saved", "success");
  }

  const { data, error } = await supabase.from("inventory_items").insert(row).select("id").single();
  if (error || !data) go(back, friendly(error?.message ?? "Could not add the item"));
  revalidatePath("/admin/inventory");
  const again = String(formData.get("add_another") ?? "") === "1";
  if (again) go(`/admin/inventory/new?section=${sectionId}`, `${name} added. Add the next item.`, "success");
  go(`/admin/inventory/${(data as { id: string }).id}`, `${name} added`, "success");
}

/** Deactivate an item (take it off the register, keep its history) with a reason from the list. Inventory is never
 *  deleted. Fields: id, reason, reason_other. */
export async function deactivateItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const other = String(formData.get("reason_other") ?? "").trim().slice(0, 300);
  const back = `/admin/inventory/${id}`;
  if (!DEACTIVATE_REASONS.some((r) => r.value === reason)) go(back, "Choose a reason from the list");
  if (reason === "other" && !other) go(back, "Type the reason when you choose Other");
  const supabase = await client(back);
  const { error } = await supabase
    .from("inventory_items")
    .update({ archived_at: new Date().toISOString(), archive_reason: reason, archive_note: reason === "other" ? other : null })
    .eq("id", id)
    .is("archived_at", null);
  if (error) go(back, friendly(error.message));
  revalidatePath("/admin/inventory", "layout");
  go(back, "Item deactivated. It no longer counts in the register; its history is kept.", "success");
}

/** Put a deactivated item back on the register. Fields: id. */
export async function reactivateItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const back = `/admin/inventory/${id}`;
  const supabase = await client(back);
  const { error } = await supabase
    .from("inventory_items")
    .update({ archived_at: null, archive_reason: null, archive_note: null })
    .eq("id", id);
  if (error) go(back, friendly(error.message));
  revalidatePath("/admin/inventory", "layout");
  go(back, "Item is back on the register", "success");
}

// ---- Settings: sections, usual items, locations -------------------------------------------------------------

const SETTINGS = "/admin/inventory/settings";

export async function addSectionAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) go(SETTINGS, "Type the section's name");
  const supabase = await client(SETTINGS);
  const { error } = await supabase.from("inventory_sections").insert({ name, description, sort: 200 });
  if (error) go(SETTINGS, friendly(error.message));
  revalidatePath("/admin/inventory", "layout");
  go(SETTINGS, `Section "${name}" added`, "success");
}

export async function updateSectionAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "on";
  if (!id || !name) go(SETTINGS, "The section needs a name");
  const supabase = await client(SETTINGS);
  const { error } = await supabase.from("inventory_sections").update({ name, active }).eq("id", id);
  if (error) go(SETTINGS, friendly(error.message));
  revalidatePath("/admin/inventory", "layout");
  go(SETTINGS, "Section saved", "success");
}

export async function addCatalogueItemAction(formData: FormData) {
  const sectionId = String(formData.get("section_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!sectionId || !name) go(SETTINGS, "Choose a section and type the item");
  const supabase = await client(SETTINGS);
  const { error } = await supabase.from("inventory_catalogue").insert({ section_id: sectionId, name, sort: 500 });
  if (error) go(SETTINGS, /duplicate|unique/i.test(error.message) ? `"${name}" is already in that section's list` : friendly(error.message));
  revalidatePath(SETTINGS);
  go(SETTINGS, `"${name}" added to the list`, "success");
}

export async function toggleCatalogueItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "1";
  const supabase = await client(SETTINGS);
  const { error } = await supabase.from("inventory_catalogue").update({ active }).eq("id", id);
  if (error) go(SETTINGS, friendly(error.message));
  revalidatePath(SETTINGS);
  go(SETTINGS, active ? "Item shown in the list again" : "Item hidden from the list", "success");
}

export async function addLocationAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const kindRaw = String(formData.get("kind") ?? "other");
  const kind = LOCATION_KINDS.some((k) => k.value === kindRaw) ? kindRaw : "other";
  const partRaw = String(formData.get("school_part") ?? "whole_school");
  const schoolPart = SCHOOL_PARTS.some((p) => p.value === partRaw) ? partRaw : "whole_school";
  if (!name) go(SETTINGS, "Type the location's name");
  const supabase = await client(SETTINGS);
  const { error } = await supabase.from("inventory_locations").insert({ name, kind, school_part: schoolPart, sort: 200 });
  if (error) go(SETTINGS, /duplicate|unique/i.test(error.message) ? `There is already a location called "${name}"` : friendly(error.message));
  revalidatePath("/admin/inventory", "layout");
  go(SETTINGS, `Location "${name}" added`, "success");
}

export async function updateLocationAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const active = String(formData.get("active") ?? "") === "on";
  if (!id || !name) go(SETTINGS, "The location needs a name");
  const supabase = await client(SETTINGS);
  const { error } = await supabase.from("inventory_locations").update({ name, active }).eq("id", id);
  if (error) go(SETTINGS, /duplicate|unique/i.test(error.message) ? `There is already a location called "${name}"` : friendly(error.message));
  revalidatePath("/admin/inventory", "layout");
  go(SETTINGS, "Location saved", "success");
}
