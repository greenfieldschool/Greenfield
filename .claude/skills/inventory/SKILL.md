---
name: inventory
description: Use for the school inventory / asset register in /admin/inventory: sections, usual items, locations, item counts by condition, pictures, the change history and the inventory report.
---

# Inventory (school assets)

## When to use
Anything about recording what the school owns: uniforms, furniture, classroom equipment, office, laboratory, ICT,
or new sections (library, sports store …), stock counts, damaged / replacement lists, inventory pictures. Pupil
uniform checks are welfare (`/admin/welfare/uniform`), not this.

## Where things live
- Database: `docs/migrations/20261113c_inventory.sql`.
  - `inventory_sections` (seeded with the school's six, `slug`), `inventory_catalogue` (usual items per section,
    seeded from issue 11's lists), `inventory_locations` (seeded from active classes + offices, lab, ICT room,
    store, hall; `kind`, `school_part`).
  - `inventory_items`: one line per kind of item in one place; `school_part` primary / college / whole_school;
    counts `qty_new, qty_good, qty_fair, qty_damaged, qty_replace`, `quantity` generated; `photos text[]` (≤6
    storage paths `items/<uuid>.jpg`); `last_checked_on`; `archived_at` + `archive_reason` + `archive_note` =
    deactivated (UI word: "Deactivate"). Check constraint: a reason from the list is required when deactivated,
    Other needs text, all three are null when active.
  - `inventory_log`: trigger `inventory_items_log` records added / changed (field-by-field from→to) / archived /
    restored / deleted with who did it, plus `section_id` on every row (so history filters by section even after a
    delete). Added and deleted rows keep a full snapshot (location, part, counts). Write-only for the trigger.
  - The set-up lists are logged too: trigger `inventory_setup_log()` on sections, catalogue and locations writes
    `inventory_log` rows with `subject` = section / catalogue / location and actions added / changed / hidden /
    shown. Created after the seed inserts so the starting lists aren't logged. Every log row has `done_by` (account)
    and `done_by_name` (name or email at the time).
  - Bucket `inventory-photos`: private, 2MB, jpeg/png/webp. Admin-only policies.
  - Everything admins only (RLS `is_admin()`), as the school asked. `/admin/inventory` is in `adminOnlyPrefixes`.
  - **No deletes**: select/insert/update policies only and `revoke delete` on items, sections, usual items and
    locations. Items are deactivated with a reason; the rest are hidden (`active`).
- Code: `src/lib/inventory.ts` (conditions, school parts, location kinds, types), `src/app/admin/inventory/`
  (`page.tsx` register, `new/`, `[id]/` (form + condition + deactivate/reactivate with reason + history), `report/` (printable),
  `settings/` (sections, usual items, locations), `history/` (whole-inventory log: section tabs, action, about (items / set-up lists), dates,
  item/person search, latest 500, prints), `actions.ts`, `_data.ts` (loaders, signed photo URLs),
  `_item-form.tsx`), `src/components/inventory-photo-picker.tsx` (shrinks photos below 2MB, uploads from the
  browser). Nav: Management group in `AdminShell`. Learn Centre: `LEARN.inventory`.

## Rules
- Sections, usual items and locations are data, not code. Don't add a page per section.
- Counts by condition on one line ("30 chairs, 5 damaged"), never one line per condition.
- Pictures: shrink in the browser to fit 2MB rather than rejecting; the bucket's 2MB limit stays as the backstop.
  Removing a picture from an item deletes it from storage on save.
- Inventory is never deleted (the school asked, Nov 2026): Deactivate with a reason from `DEACTIVATE_REASONS`
  (`src/lib/inventory.ts`, in step with `inventory_items_archive_reason_check`); only Other takes typed text.
  Don't add a delete action or a delete policy.
- Describe log rows with `describeLogRow()` in `src/lib/inventory.ts` (one wording for the item page and the history
  page). A new item field must be added to the trigger's field list and to `FIELD_LABELS` there.

## Pitfalls we hit
- A CHECK whose condition is NULL passes. `archive_reason in (...)` with a NULL reason let a reason-less
  deactivation through; wrap it in `coalesce(archive_reason, '')`.
- The request (issue 11) described six separate modules with fixed item lists. Built as one register with editable
  lists (see resolve-issue-doc step 3a).
- PGlite: an `insert … select` from a table RLS hides inserts zero rows and "succeeds"; test refusals with literal
  ids, read them as the owner first.

## Verify
- PGlite with a `storage` stub: teacher can't read or write items or upload; admin add/change/deactivate/
  reactivate all logged (with the reason); deactivating without a reason, a bad reason or Other without text refused;
  admin delete of items, sections, locations refused; negative counts refused; no-op update not logged.
- `npx tsc --noEmit -p . && npx next lint --dir src && npx next build`; preview the pages with a fake client.
