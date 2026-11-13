import Link from "next/link";
import { AlertTriangle, Boxes, ClipboardList, History, ImageIcon, Package, Plus, Settings2, Wrench } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/form-section";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { LEARN } from "@/lib/learn-guides";
import { formatLagosDate } from "@/lib/lagos-dates";
import { CONDITIONS, MISSING_DB, SCHOOL_PARTS, deactivateReasonLabel, needsAttention, schoolPartLabel } from "@/lib/inventory";
import { loadInventorySetup, loadItems, signedPhotoUrls } from "./_data";

// The inventory register (issue 11): every item, filtered by section, part of the school, location and condition.

type SP = { section?: string; part?: string; location?: string; attention?: string; q?: string; archived?: string; toast?: string };

export default async function InventoryPage({ searchParams }: { searchParams?: SP }) {
  const sp = searchParams ?? {};
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const setup = await loadInventorySetup(supabase);
  const showArchived = sp.archived === "1";
  const items = setup.missing ? [] : await loadItems(supabase, { archived: showArchived });

  const sections = setup.sections.filter((s) => s.active);
  const sectionId = sections.some((s) => s.id === sp.section) ? (sp.section as string) : "all";
  const part = SCHOOL_PARTS.some((p) => p.value === sp.part) ? (sp.part as string) : "";
  const locationId = setup.locations.some((l) => l.id === sp.location) ? (sp.location as string) : "";
  const attention = sp.attention === "1";
  const q = (sp.q ?? "").trim().toLowerCase();

  const locationName = new Map(setup.locations.map((l) => [l.id, l.name]));
  const sectionName = new Map(setup.sections.map((s) => [s.id, s.name]));

  const inScope = items.filter(
    (i) =>
      (!part || i.school_part === part) &&
      (!locationId || i.location_id === locationId) &&
      (!attention || needsAttention(i) > 0) &&
      (!q || `${i.name} ${i.description ?? ""} ${locationName.get(i.location_id ?? "") ?? ""}`.toLowerCase().includes(q))
  );
  const shown = inScope.filter((i) => sectionId === "all" || i.section_id === sectionId);

  const totals = shown.reduce(
    (t, i) => ({ lines: t.lines + 1, pieces: t.pieces + i.quantity, damaged: t.damaged + i.qty_damaged, replace: t.replace + i.qty_replace }),
    { lines: 0, pieces: 0, damaged: 0, replace: 0 }
  );

  const thumbs = await signedPhotoUrls(supabase, shown.map((i) => i.photos[0]).filter(Boolean) as string[]);

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (part) p.set("part", part);
    if (locationId) p.set("location", locationId);
    if (attention) p.set("attention", "1");
    if (q) p.set("q", sp.q ?? "");
    if (showArchived) p.set("archived", "1");
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/inventory${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <UrlToast key={sp.toast ?? "none"} />
      <PageHeader
        learn={LEARN.inventory}
        eyebrow="Management"
        title="Inventory"
        description="Everything the school owns: uniforms, furniture, classroom equipment, office, laboratory and ICT, with how many, their condition and where they are."
        actions={
          <>
            <ButtonLink href="/admin/inventory/settings" variant="ghost">
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Sections & locations
            </ButtonLink>
            <ButtonLink href="/admin/inventory/history" variant="ghost">
              <History className="h-4 w-4" aria-hidden="true" />
              History
            </ButtonLink>
            <ButtonLink href="/admin/inventory/report" variant="secondary">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Report
            </ButtonLink>
            <ButtonLink href={`/admin/inventory/new${sectionId !== "all" ? `?section=${sectionId}` : ""}`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add item
            </ButtonLink>
          </>
        }
      />

      {setup.missing ? (
        <Alert tone="warning" title="Not set up yet">
          {MISSING_DB}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Items recorded" value={totals.lines} hint={showArchived ? "Deactivated" : "Lines in the register"} icon={Boxes} />
        <StatCard label="Total pieces" value={totals.pieces.toLocaleString()} hint="All conditions" icon={Package} tone="blue" />
        <StatCard label="Damaged" value={totals.damaged} hint="Need repair" icon={AlertTriangle} tone="rose" href={keep({ attention: "1", section: sectionId === "all" ? "" : sectionId })} />
        <StatCard label="Due for replacement" value={totals.replace} hint="To budget for" icon={Wrench} tone="violet" href="/admin/inventory/report#replace" />
      </div>

      <LinkTabs
        active={sectionId}
        tabs={[
          { key: "all", label: "All sections", href: keep({}), count: inScope.length },
          ...sections.map((s) => ({ key: s.id, label: s.name, href: keep({ section: s.id }), count: inScope.filter((i) => i.section_id === s.id).length }))
        ]}
      />

      <Card>
        <CardBody>
          <form method="get" action="/admin/inventory" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
            {sectionId !== "all" ? <input type="hidden" name="section" value={sectionId} /> : null}
            <Field label="Search" htmlFor="inv-q">
              <input id="inv-q" name="q" defaultValue={sp.q ?? ""} className="gf-input" placeholder="Item, note or location" />
            </Field>
            <Field label="Part of the school" htmlFor="inv-part">
              <select id="inv-part" name="part" defaultValue={part} className="gf-select">
                <option value="">All</option>
                {SCHOOL_PARTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location" htmlFor="inv-location">
              <select id="inv-location" name="location" defaultValue={locationId} className="gf-select">
                <option value="">All locations</option>
                {setup.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.active ? "" : " (hidden)"}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-1">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="attention" value="1" defaultChecked={attention} className="h-4 w-4 rounded border-slate-300" />
                Needs attention
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} className="h-4 w-4 rounded border-slate-300" />
                Deactivated
              </label>
              <SubmitButton variant="secondary" pendingText="Filtering…">
                Filter
              </SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>

      {shown.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={items.length === 0 && !showArchived ? "No items yet" : "Nothing matches"}
          description={
            items.length === 0 && !showArchived
              ? "Start with one section, e.g. classroom furniture in each classroom. Each line is one kind of item in one place."
              : "Try a different section, location or search."
          }
          action={
            <ButtonLink href={`/admin/inventory/new${sectionId !== "all" ? `?section=${sectionId}` : ""}`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add item
            </ButtonLink>
          }
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="gf-table-wrap">
              <table className="gf-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    {sectionId === "all" ? <th>Section</th> : null}
                    <th>Location</th>
                    <th className="text-right">How many</th>
                    <th>Condition</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => {
                    const thumb = i.photos[0] ? thumbs.get(i.photos[0]) : null;
                    return (
                      <tr key={i.id}>
                        <td>
                          <Link href={`/admin/inventory/${i.id}`} className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold text-slate-900 hover:text-brand-green">{i.name}</span>
                              <span className="block text-xs text-slate-500">{schoolPartLabel(i.school_part)}</span>
                              {i.archived_at ? (
                                <span className="block text-xs font-medium text-amber-700">Deactivated: {deactivateReasonLabel(i.archive_reason, i.archive_note)}</span>
                              ) : null}
                            </span>
                          </Link>
                        </td>
                        {sectionId === "all" ? <td className="text-sm">{sectionName.get(i.section_id) ?? "—"}</td> : null}
                        <td className="text-sm">{i.location_id ? locationName.get(i.location_id) ?? "—" : "—"}</td>
                        <td className="text-right font-semibold tabular-nums">{i.quantity}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {CONDITIONS.filter((c) => i[c.column] > 0).map((c) => (
                              <Badge key={c.key} tone={c.tone}>
                                {i[c.column]} {c.label.toLowerCase()}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-xs text-slate-500">{formatLagosDate(i.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
