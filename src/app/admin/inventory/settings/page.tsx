import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/form-section";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { LEARN } from "@/lib/learn-guides";
import { LOCATION_KINDS, MISSING_DB, SCHOOL_PARTS, schoolPartLabel } from "@/lib/inventory";
import { loadInventorySetup } from "../_data";
import {
  addCatalogueItemAction,
  addLocationAction,
  addSectionAction,
  toggleCatalogueItemAction,
  updateLocationAction,
  updateSectionAction
} from "../actions";

// Inventory settings (issue 11): the sections, the usual items offered in each, and the locations.
// Nothing is hard-coded: the school's six sections and lists are only the starting point.

export default async function InventorySettingsPage({ searchParams }: { searchParams?: { toast?: string } }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const setup = await loadInventorySetup(supabase);
  const kindLabel = new Map(LOCATION_KINDS.map((k) => [k.value, k.label]));

  return (
    <div className="space-y-6">
      <UrlToast key={searchParams?.toast ?? "none"} />
      <PageHeader
        learn={LEARN.inventory}
        back={{ href: "/admin/inventory", label: "Back to inventory" }}
        eyebrow="Inventory"
        title="Sections & locations"
        description="Add a section (e.g. Library, Sports store), add items to a section's usual list, and add rooms and stores. Hide what you no longer use; nothing recorded is lost. Every change is kept in Inventory history with who made it."
      />
      {setup.missing ? (
        <Alert tone="warning" title="Not set up yet">
          {MISSING_DB}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sections" description="Untick “In use” to hide a section from the register and forms." />
          <CardBody className="space-y-3">
            {setup.sections.map((s) => (
              <form key={s.id} action={updateSectionAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={s.id} />
                <input name="name" defaultValue={s.name} className="gf-input min-w-0 flex-1" aria-label="Section name" required />
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" name="active" defaultChecked={s.active} className="h-4 w-4 rounded border-slate-300" />
                  In use
                </label>
                <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                  Save
                </SubmitButton>
              </form>
            ))}
            <form action={addSectionAction} className="space-y-2 border-t border-slate-100 pt-4">
              <Field label="New section" htmlFor="new-section">
                <input id="new-section" name="name" className="gf-input" placeholder="e.g. Library, Sports store, Kitchen" required />
              </Field>
              <input name="description" className="gf-input" placeholder="What goes in it (optional)" aria-label="Description" />
              <div className="flex justify-end">
                <SubmitButton variant="primary" size="sm" pendingText="Adding…">
                  Add section
                </SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Locations" description="Classrooms were added from the class list. Add offices, stores, halls and other places." />
          <CardBody className="space-y-3">
            {setup.locations.map((l) => (
              <form key={l.id} action={updateLocationAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={l.id} />
                <input name="name" defaultValue={l.name} className="gf-input min-w-0 flex-1" aria-label="Location name" required />
                <span className="text-xs text-slate-500">
                  {kindLabel.get(l.kind) ?? l.kind} · {schoolPartLabel(l.school_part)}
                </span>
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" name="active" defaultChecked={l.active} className="h-4 w-4 rounded border-slate-300" />
                  In use
                </label>
                <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                  Save
                </SubmitButton>
              </form>
            ))}
            <form action={addLocationAction} className="grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3">
              <Field label="New location" htmlFor="new-location" className="sm:col-span-3">
                <input id="new-location" name="name" className="gf-input" placeholder="e.g. Bursar's office, Sports store" required />
              </Field>
              <select name="kind" className="gf-select" aria-label="Kind of place" defaultValue="other">
                {LOCATION_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <select name="school_part" className="gf-select" aria-label="Part of the school" defaultValue="whole_school">
                {SCHOOL_PARTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <div className="flex justify-end">
                <SubmitButton variant="primary" size="sm" pendingText="Adding…">
                  Add location
                </SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Usual items in each section" description="These are offered when adding an item. Any other item can still be typed in." />
        <CardBody className="space-y-6">
          {setup.sections.map((s) => {
            const list = setup.catalogue.filter((c) => c.section_id === s.id);
            return (
              <section key={s.id} className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">{s.name}</h3>
                <div className="flex flex-wrap gap-2">
                  {list.map((c) => (
                    <form key={c.id} action={toggleCatalogueItemAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                      <button
                        type="submit"
                        title={c.active ? "Hide from the list" : "Show in the list again"}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          c.active ? "border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:text-red-700" : "border-dashed border-slate-300 bg-slate-50 text-slate-400 line-through hover:text-slate-700"
                        }`}
                      >
                        {c.name}
                      </button>
                    </form>
                  ))}
                </div>
                <form action={addCatalogueItemAction} className="flex gap-2">
                  <input type="hidden" name="section_id" value={s.id} />
                  <input name="name" className="gf-input max-w-xs" placeholder="Add another item to this list" aria-label={`Add an item to ${s.name}`} required />
                  <SubmitButton variant="secondary" size="sm" pendingText="Adding…">
                    Add
                  </SubmitButton>
                </form>
              </section>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
