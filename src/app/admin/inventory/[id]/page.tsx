import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveRestore } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { LEARN } from "@/lib/learn-guides";
import { formatLagosDate, formatLagosDateTime } from "@/lib/lagos-dates";
import { CONDITIONS, ITEM_COLUMNS, LOG_ACTIONS, LOG_COLUMNS, deactivateReasonLabel, describeLogRow, schoolPartLabel, type InventoryItem, type InventoryLogRow } from "@/lib/inventory";
import { loadInventorySetup, signedPhotoUrls } from "../_data";
import { ItemForm } from "../_item-form";
import { reactivateItemAction } from "../actions";
import { DeactivateItemForm } from "./deactivate-item-form";

const BACK = { href: "/admin/inventory", label: "Back to inventory" };

export default async function InventoryItemPage({ params, searchParams }: { params: { id: string }; searchParams?: { toast?: string } }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [setup, itemRes, logRes] = await Promise.all([
    loadInventorySetup(supabase),
    supabase.from("inventory_items").select(ITEM_COLUMNS).eq("id", params.id).maybeSingle(),
    supabase.from("inventory_log").select(LOG_COLUMNS).eq("item_id", params.id).order("created_at", { ascending: false }).limit(50)
  ]);
  const item = (itemRes.data ?? null) as InventoryItem | null;
  if (!item) notFound();
  const log = (logRes.data ?? []) as InventoryLogRow[];

  const urls = await signedPhotoUrls(supabase, item.photos);
  const photos = item.photos.map((path) => ({ path, url: urls.get(path) ?? null }));
  const sectionName = setup.sections.find((s) => s.id === item.section_id)?.name ?? "Inventory";
  const locationName = new Map(setup.locations.map((l) => [l.id, l.name]));
  const names = { sections: new Map(setup.sections.map((s) => [s.id, s.name])), locations: locationName };


  return (
    <div className="space-y-6">
      <UrlToast key={searchParams?.toast ?? "none"} />
      <PageHeader
        learn={LEARN.inventory}
        back={BACK}
        eyebrow={sectionName}
        title={item.name}
        description={`${schoolPartLabel(item.school_part)} · ${item.location_id ? locationName.get(item.location_id) ?? "No location" : "No location"} · ${item.quantity} in total`}
      />

      {item.archived_at ? (
        <Alert tone="warning" title="Deactivated">
          Deactivated on {formatLagosDate(item.archived_at)} · Reason: <strong>{deactivateReasonLabel(item.archive_reason, item.archive_note)}</strong>. It
          doesn&apos;t count in the register or the report. Reactivate it below if this was a mistake.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ItemForm item={item} sectionId={item.section_id} sections={setup.sections} locations={setup.locations} catalogue={setup.catalogue} photos={photos} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Condition" />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {CONDITIONS.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3">
                    <Badge tone={c.tone}>{c.label}</Badge>
                    <span className="font-semibold tabular-nums">{item[c.column]}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{item.quantity}</span>
                </li>
              </ul>
              {item.last_checked_on ? <p className="gf-hint mt-3">Last counted on {formatLagosDate(item.last_checked_on)}.</p> : null}
            </CardBody>
          </Card>

          <Card>
            {item.archived_at ? (
              <>
                <CardHeader title="Deactivated" description="This item doesn't count in the register or the report. Its history is kept." />
                <CardBody>
                  <form action={reactivateItemAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmSubmitButton
                      className={buttonClasses({ variant: "secondary", size: "sm" })}
                      confirmMessage={`Reactivate ${item.name}? It goes back on the register with its current counts.`}
                    >
                      <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                      Reactivate
                    </ConfirmSubmitButton>
                  </form>
                </CardBody>
              </>
            ) : (
              <>
                <CardHeader
                  title="Deactivate"
                  description="For items that are gone or were entered by mistake. Inventory is never deleted: the item and its history stay, and it stops counting."
                />
                <CardBody>
                  <DeactivateItemForm id={item.id} name={item.name} />
                </CardBody>
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="History" description="Every change to this item and who made it." action={<Link className="gf-link text-sm" href="/admin/inventory/history">All inventory history</Link>} />
            <CardBody>
              {log.length === 0 ? (
                <p className="text-sm text-slate-500">No changes recorded yet.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {log.map((l) => {
                    const lines = describeLogRow(l, names);
                    return (
                      <li key={l.id} className="border-l-2 border-slate-200 pl-3">
                        <div className="font-semibold text-slate-900">{LOG_ACTIONS.find((a) => a.value === l.action)?.label ?? l.action}</div>
                        {lines.length ? (
                          <ul className="mt-0.5 text-xs text-slate-600">
                            {lines.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="text-xs text-slate-500">
                          {formatLagosDateTime(l.created_at)} · {l.done_by_name ?? "Admin"}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
