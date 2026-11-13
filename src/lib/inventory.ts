// Inventory (issue 11): the school's asset register. One register with editable sections, a catalogue of usual
// items, locations, and per-item counts by condition. Database: docs/migrations/20261113c_inventory.sql.
// Admins only (route-access + RLS on every inventory table and the photo bucket).

import type { BadgeTone } from "@/components/ui/badge";

export const INVENTORY_BUCKET = "inventory-photos";
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTOS = 6;

export type Condition = "new" | "good" | "fair" | "damaged" | "replace";
export const CONDITIONS: Array<{ key: Condition; column: `qty_${Condition}`; label: string; tone: BadgeTone }> = [
  { key: "new", column: "qty_new", label: "New", tone: "blue" },
  { key: "good", column: "qty_good", label: "Good", tone: "green" },
  { key: "fair", column: "qty_fair", label: "Fair", tone: "gold" },
  { key: "damaged", column: "qty_damaged", label: "Damaged", tone: "red" },
  { key: "replace", column: "qty_replace", label: "Due for replacement", tone: "violet" }
];

export type SchoolPart = "primary" | "college" | "whole_school";
export const SCHOOL_PARTS: Array<{ value: SchoolPart; label: string }> = [
  { value: "primary", label: "Primary School" },
  { value: "college", label: "College" },
  { value: "whole_school", label: "Whole school" }
];
export const schoolPartLabel = (v: string | null | undefined) => SCHOOL_PARTS.find((p) => p.value === v)?.label ?? "Whole school";

export const LOCATION_KINDS: Array<{ value: string; label: string }> = [
  { value: "classroom", label: "Classroom" },
  { value: "office", label: "Office" },
  { value: "laboratory", label: "Laboratory" },
  { value: "ict_room", label: "ICT room" },
  { value: "store", label: "Store" },
  { value: "hall", label: "Hall" },
  { value: "outdoor", label: "Outdoor" },
  { value: "other", label: "Other" }
];

export type InventorySection = { id: string; slug: string | null; name: string; description: string | null; sort: number; active: boolean };
export type CatalogueItem = { id: string; section_id: string; name: string; sort: number; active: boolean };
export type InventoryLocation = {
  id: string;
  name: string;
  kind: string;
  school_part: SchoolPart;
  class_id: string | null;
  active: boolean;
  sort: number;
};
export type InventoryItem = {
  id: string;
  section_id: string;
  name: string;
  school_part: SchoolPart;
  location_id: string | null;
  qty_new: number;
  qty_good: number;
  qty_fair: number;
  qty_damaged: number;
  qty_replace: number;
  quantity: number;
  description: string | null;
  photos: string[];
  last_checked_on: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  archive_note: string | null;
  updated_at: string;
};

export const ITEM_COLUMNS =
  "id, section_id, name, school_part, location_id, qty_new, qty_good, qty_fair, qty_damaged, qty_replace, quantity, description, photos, last_checked_on, archived_at, archive_reason, archive_note, updated_at";

// Inventory is never deleted: an item is deactivated with one of these reasons (the database checks the same list;
// keep them in step with inventory_items_archive_reason_check). Only Other takes typed text.
export const DEACTIVATE_REASONS: Array<{ value: string; label: string }> = [
  { value: "written_off", label: "Damaged beyond repair / written off" },
  { value: "lost", label: "Lost or missing" },
  { value: "stolen", label: "Stolen" },
  { value: "sold", label: "Sold" },
  { value: "donated", label: "Donated or given away" },
  { value: "mistake", label: "Entered by mistake / duplicate line" },
  { value: "other", label: "Other (type the reason)" }
];
export function deactivateReasonLabel(reason: string | null | undefined, note?: string | null) {
  if (!reason) return "—";
  if (reason === "other") return note ? `Other: ${note}` : "Other";
  return DEACTIVATE_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/** Items needing attention: damaged or due for replacement. */
export const needsAttention = (i: Pick<InventoryItem, "qty_damaged" | "qty_replace">) => i.qty_damaged + i.qty_replace;

export const MISSING_DB =
  "Inventory is not set up in the database yet. Run docs/migrations/20261113c_inventory.sql in Supabase.";

export function isMissingTable(message: string | null | undefined) {
  return /does not exist|schema cache|could not find/i.test(String(message ?? ""));
}

// ---- History (inventory_log) --------------------------------------------------------------------------------

export type InventoryLogRow = {
  id: string;
  item_id: string | null;
  item_name: string;
  action: "added" | "changed" | "archived" | "restored" | "deleted" | string;
  changes: Record<string, unknown>;
  section_id: string | null;
  /** item, or a change to the set-up lists: section / catalogue (usual item) / location. */
  subject: "item" | "section" | "catalogue" | "location" | string;
  done_by_name: string | null;
  created_at: string;
};

export const LOG_COLUMNS = "id, item_id, item_name, action, changes, section_id, subject, done_by_name, created_at";

export const LOG_SUBJECTS: Array<{ value: string; label: string; short: string }> = [
  { value: "item", label: "Items", short: "Item" },
  { value: "section", label: "Sections", short: "Section" },
  { value: "catalogue", label: "Usual items lists", short: "Usual item" },
  { value: "location", label: "Locations", short: "Location" }
];

export const LOG_ACTIONS: Array<{ value: string; label: string; tone: BadgeTone }> = [
  { value: "added", label: "Added", tone: "green" },
  { value: "changed", label: "Changed", tone: "blue" },
  { value: "archived", label: "Deactivated", tone: "gold" },
  { value: "restored", label: "Reactivated", tone: "violet" },
  { value: "hidden", label: "Hidden", tone: "slate" },
  { value: "shown", label: "Shown again", tone: "green" },
  // Deleting is no longer possible; kept so any early log rows still read properly.
  { value: "deleted", label: "Deleted", tone: "red" }
];

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  section_id: "Section",
  school_part: "Part of the school",
  location_id: "Location",
  qty_new: "New",
  qty_good: "Good",
  qty_fair: "Fair",
  qty_damaged: "Damaged",
  qty_replace: "Due for replacement",
  description: "Notes",
  photos: "Pictures",
  last_checked_on: "Last counted",
  kind: "Kind of place"
};

type Names = { sections: Map<string, string>; locations: Map<string, string> };

function showValue(field: string, v: unknown, names: Names) {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "location_id") return names.locations.get(String(v)) ?? "a removed location";
  if (field === "section_id") return names.sections.get(String(v)) ?? "a removed section";
  if (field === "school_part") return schoolPartLabel(String(v));
  if (field === "photos") return `${Array.isArray(v) ? v.length : 0} picture(s)`;
  if (field === "kind") return LOCATION_KINDS.find((k) => k.value === v)?.label ?? String(v);
  return String(v);
}

/** Plain-language lines for one log row: "Damaged: 0 → 4", or for added/deleted items what they were. */
export function describeLogRow(row: Pick<InventoryLogRow, "action" | "changes">, names: Names): string[] {
  const c = (row.changes ?? {}) as Record<string, unknown>;
  if (row.action === "changed") {
    return Object.entries(c)
      .filter(([k]) => k in FIELD_LABELS)
      .map(([k, v]) => {
        const ch = (v ?? {}) as { from?: unknown; to?: unknown };
        return `${FIELD_LABELS[k]}: ${showValue(k, ch.from, names)} → ${showValue(k, ch.to, names)}`;
      });
  }
  if (row.action === "added" || row.action === "deleted") {
    const lines: string[] = [];
    const where = [
      c.location_id ? showValue("location_id", c.location_id, names) : null,
      c.kind ? showValue("kind", c.kind, names) : null,
      c.school_part ? showValue("school_part", c.school_part, names) : null
    ]
      .filter(Boolean)
      .join(" · ");
    if (where) lines.push(where);
    const counts = CONDITIONS.filter((k) => Number(c[k.column] ?? 0) > 0).map((k) => `${c[k.column]} ${k.label.toLowerCase()}`);
    if (typeof c.quantity === "number" || typeof c.quantity === "string") lines.push(`${c.quantity} in total${counts.length ? ` (${counts.join(", ")})` : ""}`);
    return lines;
  }
  if (row.action === "archived" || row.action === "restored") {
    const reason = typeof c.reason === "string" ? c.reason : null;
    if (!reason) return [];
    const label = deactivateReasonLabel(reason, typeof c.reason_note === "string" ? c.reason_note : null);
    return [row.action === "archived" ? `Reason: ${label}` : `Had been deactivated: ${label}`];
  }
  return [];
}
