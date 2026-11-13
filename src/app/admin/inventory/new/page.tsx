import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import UrlToast from "@/components/url-toast";
import { LEARN } from "@/lib/learn-guides";
import { MISSING_DB } from "@/lib/inventory";
import { loadInventorySetup } from "../_data";
import { ItemForm } from "../_item-form";

const BACK = { href: "/admin/inventory", label: "Back to inventory" };

export default async function NewInventoryItemPage({ searchParams }: { searchParams?: { section?: string; toast?: string } }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const setup = await loadInventorySetup(supabase);
  const sections = setup.sections.filter((s) => s.active);
  const section = sections.find((s) => s.id === searchParams?.section) ?? null;

  return (
    <div className="space-y-6">
      <UrlToast key={searchParams?.toast ?? "none"} />
      <PageHeader
        learn={LEARN.inventory}
        back={BACK}
        eyebrow="Inventory"
        title={section ? `Add to ${section.name}` : "Add an item"}
        description={section?.description ?? "First choose the section the item belongs to."}
      />
      {setup.missing ? (
        <Alert tone="warning" title="Not set up yet">
          {MISSING_DB}
        </Alert>
      ) : null}

      {section ? (
        <ItemForm sectionId={section.id} sections={setup.sections} locations={setup.locations} catalogue={setup.catalogue} photos={[]} />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {sections.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/inventory/new?section=${s.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{s.name}</span>
                    {s.description ? <span className="block text-sm text-slate-500">{s.description}</span> : null}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
