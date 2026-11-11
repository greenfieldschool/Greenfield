import AdminShell from "@/app/admin/AdminShell";
import { MiPackView } from "@/app/admin/management-pack/mi-pack-view";
import { PackBanner } from "@/app/admin/management-pack/pack-banner";
import { formatLagosDate } from "@/lib/lagos-dates";
import { loadMiPack } from "@/lib/mi-pack";
import { canSave, getSavedPack } from "@/lib/mi-history";
import { lagosToday, parseView, recentPeriods, resolvePeriod } from "@/lib/mi-periods";
import { previewDb } from "./sample";

export const dynamic = "force-dynamic";

const BASE = "/design-preview/management-pack";

// Dev-only preview of the management pack, same logic as the real page, on sample data (see sample.ts).

export default async function ManagementPackPreview({ searchParams }: { searchParams?: Promise<{ view?: string; period?: string; live?: string }> }) {
  const sp = (await searchParams) ?? {};
  const today = lagosToday();
  const view = parseView(sp.view);
  const period = resolvePeriod(view, sp.period, today);
  const db = await previewDb();
  const finished = canSave(period, today);
  const { saved } = finished ? await getSavedPack(db, view, period.key) : { saved: null };
  const showSaved = Boolean(saved && sp.live !== "1");
  const pack = showSaved && saved ? { ...saved.pack, period } : await loadMiPack(db, db, period);
  const state = showSaved ? "saved" : finished && saved ? "live-saved" : finished ? "unsaved" : "running";
  return (
    <AdminShell userEmail="admin@greenfieldschool.ng" role="admin">
      <MiPackView
        pack={pack}
        periods={recentPeriods(view, today)}
        basePath={BASE}
        banner={<PackBanner state={state} view={view} periodKey={period.key} saved={saved} basePath={BASE} />}
        asOf={showSaved && saved ? `As of ${formatLagosDate(saved.savedAt)}` : "As of today"}
        historyHref={`${BASE}/history?view=${view}`}
      />
    </AdminShell>
  );
}
