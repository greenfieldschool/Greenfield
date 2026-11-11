// Saved management packs (table mi_pack_snapshots, docs/migrations/20261111_management_pack_history.sql).
// A finished week or month is saved once, exactly as it was shown, so it can be read again later unchanged.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMiPack, type MiPack } from "@/lib/mi-pack";
import { lagosToday, resolvePeriod, type MiPeriod, type MiView } from "@/lib/mi-periods";

/** Bump when MiPack's shape changes in a way old saved copies can't be shown with. */
export const MI_PACK_VERSION = 1;

export type SavedPackMeta = {
  view: MiView;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  source: "automatic" | "manual";
  savedAt: string;
  savedByName: string | null;
};

export type SavedPack = SavedPackMeta & { pack: MiPack };

type Row = {
  view: MiView;
  period_key: string;
  period_start: string;
  period_end: string;
  data: (MiPack & { version?: number }) | null;
  source: "automatic" | "manual";
  saved_at: string;
  saved_by_name: string | null;
};

const meta = (r: Row): SavedPackMeta => ({
  view: r.view,
  periodKey: r.period_key,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  source: r.source,
  savedAt: r.saved_at,
  savedByName: r.saved_by_name
});

/** True when the table isn't there yet (the database update hasn't been run). */
export function isMissingTable(error: { message?: string } | null | undefined) {
  return Boolean(error && /does not exist|schema cache|mi_pack_snapshots/i.test(String(error.message ?? "")));
}

/** A period can be saved once it has finished. */
export function canSave(period: MiPeriod, today = lagosToday()) {
  return period.fullEnd < today;
}

export async function getSavedPack(
  supabase: SupabaseClient,
  view: MiView,
  key: string
): Promise<{ saved: SavedPack | null; missingTable: boolean }> {
  const { data, error } = await supabase
    .from("mi_pack_snapshots")
    .select("view, period_key, period_start, period_end, data, source, saved_at, saved_by_name")
    .eq("view", view)
    .eq("period_key", key)
    .maybeSingle();
  if (error) return { saved: null, missingTable: isMissingTable(error) };
  const row = data as Row | null;
  if (!row?.data || (row.data.version ?? 1) > MI_PACK_VERSION) return { saved: null, missingTable: false };
  return { saved: { ...meta(row), pack: row.data }, missingTable: false };
}

/** Saved packs for the history page, newest first, with their figures. */
export async function listSavedPacks(supabase: SupabaseClient, view: MiView, limit = 52) {
  const { data, error } = await supabase
    .from("mi_pack_snapshots")
    .select("view, period_key, period_start, period_end, data, source, saved_at, saved_by_name")
    .eq("view", view)
    .order("period_start", { ascending: false })
    .limit(limit);
  return {
    rows: ((data ?? []) as Row[]).filter((r) => r.data).map((r) => ({ ...meta(r), pack: r.data as MiPack })),
    error: error ? (isMissingTable(error) ? "missing" : String(error.message)) : null
  };
}

/**
 * The nightly job's save: works the pack out now and stores it for a finished period, unless a copy already exists.
 * Saved copies are never replaced: the pack is read only and the history is a record. Service key only (RLS lets
 * nobody signed in write).
 */
export async function saveMiPack(opts: {
  service: SupabaseClient;
  view: MiView;
  key: string;
  today?: string;
}): Promise<{ ok: true; saved: boolean } | { ok: false; error: string }> {
  const today = opts.today ?? lagosToday();
  const period = resolvePeriod(opts.view, opts.key, today);
  if (!canSave(period, today)) return { ok: false, error: "Only a finished week or month can be saved." };

  const { data, error } = await opts.service
    .from("mi_pack_snapshots")
    .select("id")
    .eq("view", period.view)
    .eq("period_key", period.key)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data) return { ok: true, saved: false };

  const pack = await loadMiPack(opts.service, opts.service, period);
  const { error: insertError } = await opts.service.from("mi_pack_snapshots").insert({
    view: period.view,
    period_key: period.key,
    period_start: period.start,
    period_end: period.fullEnd,
    data: { ...pack, version: MI_PACK_VERSION },
    source: "automatic",
    saved_by_name: "Saved automatically",
    saved_at: new Date().toISOString()
  });
  // Another run may have saved it a moment ago: that's fine.
  if (insertError && !/duplicate key/i.test(insertError.message)) return { ok: false, error: insertError.message };
  return { ok: true, saved: !insertError };
}

/**
 * The nightly job: saves the week and month that just finished, then fills gaps in the recent history (the last
 * 8 weeks and 3 months), at most `maxSaves` packs a night so the job stays well inside its time limit.
 * A gap filled late has its "as of" figures (pupils on roll, fees owed) dated the night it was saved.
 */
export async function saveFinishedPacks(service: SupabaseClient, today = lagosToday(), maxSaves = 4) {
  // The week and month that just finished come first, then older gaps, newest first.
  const keys = (view: MiView, depth: number) => {
    const out: string[] = [];
    let key = resolvePeriod(view, undefined, today).prevKey;
    for (let i = 0; i < depth; i++) {
      out.push(key);
      key = resolvePeriod(view, key, today).prevKey;
    }
    return out;
  };
  const weeks = keys("week", 8);
  const months = keys("month", 3);
  const queue: Array<{ view: MiView; key: string }> = [
    { view: "week", key: weeks[0] },
    { view: "month", key: months[0] },
    ...weeks.slice(1).map((key) => ({ view: "week" as const, key })),
    ...months.slice(1).map((key) => ({ view: "month" as const, key }))
  ];
  const results: Array<{ view: MiView; key: string; result: string }> = [];
  let saves = 0;
  for (const { view, key } of queue) {
    if (saves >= maxSaves) break;
    const r = await saveMiPack({ service, view, key, today });
    if (r.ok && r.saved) saves++;
    results.push({ view, key, result: r.ok ? (r.saved ? "saved" : "already saved") : r.error });
  }
  return results;
}
