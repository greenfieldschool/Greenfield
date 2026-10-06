// Supabase returns many-to-one embeds as a single object (or null), but some
// typings model them as arrays. Normalise either shape to one row.
export function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
