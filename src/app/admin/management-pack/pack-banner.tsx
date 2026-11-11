import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { formatLagosDate } from "@/lib/lagos-dates";
import type { MiView } from "@/lib/mi-periods";

// The line under the period picker that says whether these figures are the saved copy or worked out today.
// Read only: the pack has no buttons that change anything; the nightly job saves finished weeks and months.

export type PackBannerState = "no-table" | "saved" | "live-saved" | "unsaved" | "running";

export function PackBanner({
  state,
  view,
  periodKey,
  saved,
  basePath = "/admin/management-pack"
}: {
  state: PackBannerState;
  view: MiView;
  periodKey: string;
  saved: { savedAt: string; source: "automatic" | "manual"; savedByName: string | null } | null;
  basePath?: string;
}) {
  const word = view === "week" ? "week" : "month";
  const here = `${basePath}?view=${view}&period=${periodKey}`;
  if (state === "no-table") {
    return (
      <Alert tone="warning" title="History isn't switched on yet" className="print:hidden">
        Saving packs needs a database update: run 20261111_management_pack_history.sql in Supabase. The figures below are worked out from
        today&apos;s records.
      </Alert>
    );
  }

  if (state === "saved" && saved) {
    const how = saved.source === "automatic" ? "automatically" : `by ${saved.savedByName ?? "an admin"}`;
    return (
      <Alert
        tone="info"
        title={`Saved copy, kept ${formatLagosDate(saved.savedAt)} (${how})`}
        action={
          <Link href={`${here}&live=1`} className={`${buttonClasses({ variant: "secondary", size: "sm" })} print:hidden`}>
            Today&apos;s figures
          </Link>
        }
      >
        These are the figures as they stood when the pack was saved. Records entered or corrected since then are not included.
      </Alert>
    );
  }

  if (state === "live-saved" && saved) {
    return (
      <Alert
        tone="warning"
        title="Worked out from today's records"
        className="print:hidden"
        action={
          <Link href={here} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Saved copy
          </Link>
        }
      >
        These figures include records entered or corrected after the {word} ended, so they can differ from the saved copy kept on{" "}
        {formatLagosDate(saved.savedAt)}. The saved copy is what goes in the history.
      </Alert>
    );
  }

  if (state === "unsaved") {
    return (
      <Alert tone="info" title={`This ${word} isn't in the history yet`} className="print:hidden">
        It will be saved automatically tonight. Until then, these figures are worked out from today&apos;s records.
      </Alert>
    );
  }

  return (
    <p className="text-sm text-slate-500 print:hidden">
      This {word} is still running. It will be saved to the history automatically the night after it ends.
    </p>
  );
}
