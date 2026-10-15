import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ClipboardList, UserRoundX } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection } from "@/components/ui/form-section";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { SessionStatusBadge } from "../../../_components/exam-ui";
import { failWithToast, NO_DB_MESSAGE, successPath } from "../../../_components/feedback";

type ConductorRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
};

type AssignmentRow = { session_id: string; conductor_id: string };

type SessionSummaryRow = {
  session_id: string;
  test_name: string;
  class_level: string | null;
  class_name: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

export default async function AdminExamSessionConductorsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: conductorsData }, { data: assignmentsData }, { data: summaryData }] = await Promise.all([
    supabase.from("exam_conductors").select("id, full_name, email, phone, active").order("full_name"),
    supabase
      .from("exam_session_conductors")
      .select("session_id, conductor_id")
      .eq("session_id", id),
    supabase
      .from("exam_session_summary_v")
      .select("session_id, test_name, class_level, class_name, status, starts_at, ends_at")
      .eq("session_id", id)
      .maybeSingle()
  ]);

  const conductors = (conductorsData ?? []) as ConductorRow[];
  const assignments = (assignmentsData ?? []) as AssignmentRow[];
  const summary = (summaryData ?? null) as SessionSummaryRow | null;

  const assignedSet = new Set(assignments.map((a) => a.conductor_id));

  async function updateAssignments(formData: FormData) {
    "use server";

    const selected = formData.getAll("conductor_id").map((v) => String(v).trim()).filter(Boolean);
    const selectedSet = new Set(selected);

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(`/admin/exams/sessions/${id}/conductors`, NO_DB_MESSAGE);

    const { data: existing } = await supabase
      .from("exam_session_conductors")
      .select("conductor_id")
      .eq("session_id", id);

    const existingIds = (existing ?? []).map((r) => (r as { conductor_id: string }).conductor_id);
    const existingSet = new Set(existingIds);

    const toAdd = selected.filter((cid) => !existingSet.has(cid));
    // Inactive conductors render as disabled checkboxes (never submitted), so keep their existing
    // assignments instead of treating them as unticked.
    const { data: inactiveRows } = existingIds.length
      ? await supabase.from("exam_conductors").select("id").in("id", existingIds).eq("active", false)
      : { data: [] as Array<{ id: string }> };
    const inactiveSet = new Set((inactiveRows ?? []).map((r) => (r as { id: string }).id));

    const toRemove = existingIds.filter((cid) => !selectedSet.has(cid) && !inactiveSet.has(cid));

    if (toAdd.length) {
      await supabase.from("exam_session_conductors").insert(toAdd.map((cid) => ({ session_id: id, conductor_id: cid })));
    }

    if (toRemove.length) {
      await supabase.from("exam_session_conductors").delete().eq("session_id", id).in("conductor_id", toRemove);
    }

    revalidatePath(`/admin/exams/sessions/${id}/conductors`);
    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
    revalidatePath("/conductor/sessions");
    redirect(successPath(`/admin/exams/sessions/${id}/conductors`, "Assignments saved"));
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/exams/sessions", label: "Back to sessions" }}
        eyebrow="Exams"
        title="Assign conductors"
        description={
          summary
            ? `${summary.test_name} • ${summary.class_level ?? ""}${summary.class_name ? ` - ${summary.class_name}` : ""}`
            : "Session"
        }
        actions={
          <>
            {summary ? <SessionStatusBadge status={summary.status} /> : null}
            <Link className={buttonClasses({ variant: "secondary" })} href={`/admin/exams/sessions/${id}/attempts`}>
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              View attempts
            </Link>
          </>
        }
      />

      <form action={updateAssignments}>
        <FormSection
          title="Conductors"
          description="Only assigned conductors can unlock students in this session."
          footer={
            <SubmitButton variant="primary" pendingText="Saving…" disabled={!conductors.length}>
              Save assignments
            </SubmitButton>
          }
        >
          {conductors.length ? (
            <ul className="space-y-2">
              {conductors.map((c) => (
                <li key={c.id}>
                  <label
                    htmlFor={`conductor-${c.id}`}
                    className={`flex items-center gap-4 rounded-xl border border-slate-200 px-4 py-3 transition ${
                      c.active ? "cursor-pointer bg-white hover:border-brand-green-200 hover:bg-brand-green-50/40" : "bg-slate-50"
                    }`}
                  >
                    <Avatar name={c.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{c.full_name}</span>
                        {!c.active ? <Badge tone="slate">Inactive</Badge> : null}
                        {assignedSet.has(c.id) ? <Badge tone="green">Assigned</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {c.email ?? "—"} {c.phone ? ` • ${c.phone}` : ""}
                      </div>
                    </div>
                    <input
                      id={`conductor-${c.id}`}
                      className="gf-checkbox h-5 w-5"
                      type="checkbox"
                      name="conductor_id"
                      value={c.id}
                      defaultChecked={assignedSet.has(c.id)}
                      disabled={!c.active}
                    />
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={UserRoundX}
              title="No conductors available yet. Create one first."
              action={
                <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href="/admin/exams/conductors">
                  Manage conductors
                </Link>
              }
            />
          )}
        </FormSection>
      </form>
    </div>
  );
}
