import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  INVENTORY_BUCKET,
  ITEM_COLUMNS,
  isMissingTable,
  type CatalogueItem,
  type InventoryItem,
  type InventoryLocation,
  type InventorySection
} from "@/lib/inventory";

type Client = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

/** Sections, locations and the usual-items list. `missing` = the migration hasn't been run. */
export async function loadInventorySetup(supabase: Client) {
  const [sectionsRes, locationsRes, catalogueRes] = await Promise.all([
    supabase.from("inventory_sections").select("id, slug, name, description, sort, active").order("sort").order("name"),
    supabase.from("inventory_locations").select("id, name, kind, school_part, class_id, active, sort").order("sort").order("name"),
    supabase.from("inventory_catalogue").select("id, section_id, name, sort, active").order("sort").order("name")
  ]);
  const missing = [sectionsRes.error, locationsRes.error, catalogueRes.error].some((e) => e && isMissingTable(e.message));
  return {
    missing,
    sections: (sectionsRes.data ?? []) as InventorySection[],
    locations: (locationsRes.data ?? []) as InventoryLocation[],
    catalogue: (catalogueRes.data ?? []) as CatalogueItem[]
  };
}

/** Every active item, or the deactivated ones when asked, paged past Supabase's 1000-row cap. */
export async function loadItems(supabase: Client, { archived = false }: { archived?: boolean } = {}) {
  return fetchAllRows<InventoryItem>(() => {
    let q = supabase.from("inventory_items").select(ITEM_COLUMNS);
    q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    return q.order("name").order("id");
  });
}

/** Short-lived links to show private pictures (admins only by the bucket's rules). */
export async function signedPhotoUrls(supabase: Client, paths: string[]) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const out = new Map<string, string>();
  if (!unique.length) return out;
  for (let i = 0; i < unique.length; i += 100) {
    const { data } = await supabase.storage.from(INVENTORY_BUCKET).createSignedUrls(unique.slice(i, i + 100), 60 * 30);
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  }
  return out;
}
