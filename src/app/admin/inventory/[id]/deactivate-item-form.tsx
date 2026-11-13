"use client";

import { useState } from "react";
import { PackageX } from "lucide-react";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { buttonClasses } from "@/components/ui/button";
import { DEACTIVATE_REASONS } from "@/lib/inventory";
import { deactivateItemAction } from "../actions";

/** Deactivate an inventory item: reason from a fixed list, typed text only for Other. Inventory is never deleted. */
export function DeactivateItemForm({ id, name }: { id: string; name: string }) {
  const [reason, setReason] = useState("");
  return (
    <form action={deactivateItemAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor="inv-deactivate-reason" className="gf-label">
          Reason
        </label>
        <select id="inv-deactivate-reason" name="reason" className="gf-select" required value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="" disabled>
            Choose a reason…
          </option>
          {DEACTIVATE_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {reason === "other" ? (
        <div>
          <label htmlFor="inv-deactivate-other" className="gf-label">
            Type the reason
          </label>
          <input id="inv-deactivate-other" name="reason_other" className="gf-input" required maxLength={300} placeholder="e.g. Sent away for repair" />
        </div>
      ) : null}
      <div className="flex justify-end">
        <ConfirmSubmitButton
          className={buttonClasses({ variant: "danger", size: "sm" })}
          confirmMessage={`Deactivate ${name}? It will no longer count in the register or the report. Its history is kept and you can reactivate it.`}
        >
          <PackageX className="h-4 w-4" aria-hidden="true" />
          Deactivate
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}
