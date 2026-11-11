import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { formatLagosDate } from "@/lib/lagos-dates";
import { loadMiPack } from "@/lib/mi-pack";
import { canSave, getSavedPack } from "@/lib/mi-history";
import { lagosToday, parseView, recentPeriods, resolvePeriod } from "@/lib/mi-periods";
import { MiPackView } from "./mi-pack-view";
import { PackBanner } from "./pack-banner";

export const dynamic = "force-dynamic";

const PATH = "/admin/management-pack";

// Management information pack for leadership: weekly or monthly, each figure against the period before.
// Read only: nothing is entered here. The figures come from what staff record day to day elsewhere in the dashboard,
// and finished weeks and months are saved by the nightly job (/api/management-pack/save).
// Admins only (adminOnlyPrefixes + nav + RLS on saved packs). Figures: src/lib/mi-pack.ts; saved copies: mi-history.ts.

export default async function ManagementPackPage({
  searchParams
}: {
  searchParams?: Promise<{ view?: string; period?: string; live?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/admin/login?redirectTo=${PATH}`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "super_admin") redirect("/admin/unauthorized");

  const today = lagosToday();
  const view = parseView(sp.view);
  const period = resolvePeriod(view, sp.period, today);
  const finished = canSave(period, today);
  const wantLive = sp.live === "1";
  const { saved, missingTable } = finished ? await getSavedPack(supabase, view, period.key) : { saved: null, missingTable: false };
  const showSaved = Boolean(saved && !wantLive);

  // The service key is used only for two totals admins can't count through their own access: portal messages and
  // emails sent. Counts only; no message or email content is read.
  const pack = showSaved && saved ? { ...saved.pack, period } : await loadMiPack(supabase, getSupabaseServiceClient(), period);

  const state = missingTable ? "no-table" : showSaved ? "saved" : finished && saved ? "live-saved" : finished ? "unsaved" : "running";
  const banner = (
    <PackBanner
      state={state}
      view={view}
      periodKey={period.key}
      saved={saved ? { savedAt: saved.savedAt, source: saved.source, savedByName: saved.savedByName } : null}
    />
  );

  return (
    <>
      <MiPackView
        pack={pack}
        periods={recentPeriods(view, today)}
        banner={banner}
        asOf={showSaved && saved ? `As of ${formatLagosDate(saved.savedAt)}` : "As of today"}
        historyHref={`${PATH}/history?view=${view}`}
      />
    </>
  );
}
