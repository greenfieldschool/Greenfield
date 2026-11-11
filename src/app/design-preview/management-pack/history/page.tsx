import AdminShell from "@/app/admin/AdminShell";
import { HistoryView } from "@/app/admin/management-pack/history/history-view";
import { listSavedPacks } from "@/lib/mi-history";
import { parseView } from "@/lib/mi-periods";
import { previewDb } from "../sample";

export const dynamic = "force-dynamic";

// Dev-only preview of the management pack history on sample data.
export default async function ManagementPackHistoryPreview({ searchParams }: { searchParams?: Promise<{ view?: string }> }) {
  const sp = (await searchParams) ?? {};
  const view = parseView(sp.view);
  const { rows, error } = await listSavedPacks(await previewDb(), view);
  return (
    <AdminShell userEmail="admin@greenfieldschool.ng" role="admin">
      <HistoryView view={view} rows={rows} error={error} basePath="/design-preview/management-pack" />
    </AdminShell>
  );
}
