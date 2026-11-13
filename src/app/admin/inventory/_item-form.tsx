import { FormSection, Field } from "@/components/ui/form-section";
import SubmitButton from "@/components/submit-button";
import { InventoryPhotoPicker, type PhotoRef } from "@/components/inventory-photo-picker";
import {
  CONDITIONS,
  SCHOOL_PARTS,
  type CatalogueItem,
  type InventoryItem,
  type InventoryLocation,
  type InventorySection
} from "@/lib/inventory";
import { saveItemAction } from "./actions";

/** Add / edit one inventory line: what it is, which part of the school, where, and how many in each condition. */
export function ItemForm({
  item,
  sectionId,
  sections,
  locations,
  catalogue,
  photos
}: {
  item?: InventoryItem | null;
  sectionId: string;
  sections: InventorySection[];
  locations: InventoryLocation[];
  catalogue: CatalogueItem[];
  photos: PhotoRef[];
}) {
  const usual = catalogue.filter((c) => c.section_id === sectionId && c.active);
  const listId = `inv-usual-${sectionId}`;
  const isNew = !item;
  const returnTo = isNew ? `/admin/inventory/new?section=${sectionId}` : `/admin/inventory/${item.id}`;

  return (
    <form action={saveItemAction}>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <input type="hidden" name="return_to" value={returnTo} />
      <FormSection
        title={isNew ? "New item" : "Item details"}
        description="One line per kind of item in one place, e.g. “Pupils’ chairs” in Year 2. Count how many are in each condition."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {isNew ? (
              <SubmitButton variant="secondary" pendingText="Saving…" name="add_another" value="1">
                Save and add another
              </SubmitButton>
            ) : null}
            <SubmitButton variant="primary" pendingText="Saving…">
              {isNew ? "Add item" : "Save changes"}
            </SubmitButton>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Section" htmlFor="inv-section" required>
            <select id="inv-section" name="section_id" className="gf-select" defaultValue={sectionId} required>
              {sections
                .filter((s) => s.active || s.id === sectionId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Item" htmlFor="inv-name" required hint={usual.length ? "Pick from the usual list or type any other item." : "Type the item's name."}>
            <input id="inv-name" name="name" className="gf-input" list={listId} defaultValue={item?.name ?? ""} required maxLength={120} autoComplete="off" />
            <datalist id={listId}>
              {usual.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Part of the school" htmlFor="inv-part" required>
            <select id="inv-part" name="school_part" className="gf-select" defaultValue={item?.school_part ?? "whole_school"}>
              {SCHOOL_PARTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location" htmlFor="inv-location" hint="Classroom, office, lab or store. Add more under Sections & locations.">
            <select id="inv-location" name="location_id" className="gf-select" defaultValue={item?.location_id ?? ""}>
              <option value="">(not set)</option>
              {locations
                .filter((l) => l.active || l.id === item?.location_id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>

        <fieldset className="mt-5">
          <legend className="gf-label">How many, by condition</legend>
          <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {CONDITIONS.map((c) => (
              <label key={c.key} className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">{c.label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  name={c.column}
                  defaultValue={item ? item[c.column] : 0}
                  className="gf-input tabular-nums"
                />
              </label>
            ))}
          </div>
          <p className="gf-hint mt-1.5">The total is added up for you. Leave a condition at 0 if none.</p>
        </fieldset>

        <div className="mt-5 grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Notes" htmlFor="inv-notes" hint="Make, model, size, serial number, supplier…">
            <textarea id="inv-notes" name="description" rows={3} className="gf-input" defaultValue={item?.description ?? ""} maxLength={1000} />
          </Field>
          <Field label="Last counted on" htmlFor="inv-checked">
            <input id="inv-checked" type="date" name="last_checked_on" className="gf-input" defaultValue={item?.last_checked_on ?? ""} />
          </Field>
        </div>

        <div className="mt-5">
          <span className="gf-label">Pictures</span>
          <div className="mt-1">
            <InventoryPhotoPicker initial={photos} />
          </div>
        </div>
      </FormSection>
    </form>
  );
}
