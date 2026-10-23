import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Check, Undo2, X } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import ConfirmActionButton from "@/components/confirm-action-button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";

type Supabase = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

// Correction requests: a teacher asks for a final (locked) score to be changed; an admin approves (the change is
// applied by the database and recorded) or rejects. Shared by the result sheet and the Correction requests page.

export type CorrectionRequest = {
  id: string;
  ref: number;
  class_id: string;
  subject_id: string;
  academic_term_id: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  items: Array<{ student_id: string; column_label: string | null; old_score: number | null; new_score: number | null }>;
};

const statusTone: Record<CorrectionRequest["status"], BadgeTone> = {
  pending: "gold",
  approved: "green",
  rejected: "red",
  withdrawn: "slate"
};

export async function loadCorrectionRequests(
  supabase: Supabase,
  filter: { classId?: string; subjectId?: string; termId?: string; status?: string; limit?: number }
) {
  let q = supabase
    .from("result_correction_requests")
    .select(
      "id, ref, class_id, subject_id, academic_term_id, reason, status, requested_by, requested_by_name, requested_at, decided_by_name, decided_at, decision_note, items:result_correction_items(student_id, column_label, old_score, new_score)"
    );
  if (filter.classId) q = q.eq("class_id", filter.classId);
  if (filter.subjectId) q = q.eq("subject_id", filter.subjectId);
  if (filter.termId) q = q.eq("academic_term_id", filter.termId);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q.order("requested_at", { ascending: false }).limit(filter.limit ?? 50);
  const requests = (data ?? []) as unknown as CorrectionRequest[];

  const studentIds = Array.from(new Set(requests.flatMap((r) => r.items.map((i) => i.student_id))));
  const { data: students } = studentIds.length
    ? await supabase.from("students").select("id, first_name, last_name").in("id", studentIds)
    : { data: [] };
  const studentName = new Map(
    ((students ?? []) as Array<{ id: string; first_name: string; last_name: string }>).map((s) => [s.id, `${s.last_name} ${s.first_name}`] as const)
  );
  return { requests, studentName, error };
}

function safeReturn(path: string) {
  return path.startsWith("/admin/academics/") ? path : "/admin/academics/corrections";
}

function backTo(path: string, message: string, type: "success" | "error" = "success"): never {
  const url = new URL(safeReturn(path), "http://x");
  url.searchParams.set("toast", message);
  url.searchParams.set("toast_type", type);
  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

function revalidateAll() {
  revalidatePath("/admin/academics/corrections");
  revalidatePath("/admin/academics/results");
  revalidatePath("/admin/academics/reports");
  revalidatePath("/admin/academics/audit");
  revalidatePath("/portal/academics");
}

async function decide(formData: FormData, approve: boolean) {
  const id = String(formData.get("request_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "");
  const supabase = getSupabaseServerClient();
  if (!supabase || !id) backTo(returnTo, "Missing request", "error");
  const { error } = await supabase.rpc("decide_result_correction", { p_request: id, p_approve: approve, p_note: note || null });
  if (error) backTo(returnTo, error.message, "error");
  revalidateAll();
  backTo(returnTo, approve ? "Correction approved and applied. It is recorded in the results history." : "Correction request rejected");
}

export async function approveCorrection(formData: FormData) {
  "use server";
  await decide(formData, true);
}

export async function rejectCorrection(formData: FormData) {
  "use server";
  await decide(formData, false);
}

export async function withdrawCorrection(formData: FormData) {
  "use server";
  const id = String(formData.get("request_id") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "");
  const supabase = getSupabaseServerClient();
  if (!supabase || !id) backTo(returnTo, "Missing request", "error");
  const { error } = await supabase.rpc("withdraw_result_correction", { p_request: id });
  if (error) backTo(returnTo, error.message, "error");
  revalidateAll();
  backTo(returnTo, "Request withdrawn");
}

const fmt = (v: number | null) => (v === null || v === undefined ? "empty" : String(Number(v)));
const when = (v: string) =>
  new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

export function CorrectionRequestCard({
  request,
  studentName,
  context,
  isAdmin,
  userId,
  returnTo
}: {
  request: CorrectionRequest;
  studentName: Map<string, string>;
  /** e.g. "Mathematics · Year 3 · First Term" (shown on the inbox page) */
  context?: string;
  isAdmin: boolean;
  userId: string | null;
  returnTo: string;
}) {
  const r = request;
  const pending = r.status === "pending";
  return (
    <div className="space-y-3 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            Correction #{r.ref}
            {context ? <span className="font-normal text-slate-500"> · {context}</span> : null}
          </div>
          <div className="text-xs text-slate-500">
            Asked by {r.requested_by_name ?? "a teacher"} on {when(r.requested_at)}
          </div>
        </div>
        <Badge tone={statusTone[r.status]} dot>
          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
        </Badge>
      </div>
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
        <span className="font-semibold">Reason: </span>
        {r.reason}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="py-1 font-medium">Pupil</th>
            <th className="py-1 font-medium">Column</th>
            <th className="py-1 text-right font-medium">From → to</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((i) => (
            <tr key={`${i.student_id}-${i.column_label}`} className="border-t border-slate-100">
              <td className="py-1">{studentName.get(i.student_id) ?? "Pupil"}</td>
              <td className="py-1 text-slate-600">{i.column_label ?? "—"}</td>
              <td className="py-1 text-right tabular-nums">
                <span className="text-slate-500">{fmt(i.old_score)}</span>
                <span className="mx-1 text-slate-400">→</span>
                <span className="font-semibold text-slate-900">{fmt(i.new_score)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!pending && r.decided_at ? (
        <p className="text-xs text-slate-600">
          {r.status === "withdrawn" ? "Withdrawn" : `${r.status === "approved" ? "Approved" : "Rejected"} by ${r.decided_by_name ?? "an admin"}`} on{" "}
          {when(r.decided_at)}
          {r.decision_note ? ` — “${r.decision_note}”` : ""}
        </p>
      ) : null}
      {pending && isAdmin ? (
        <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="request_id" value={r.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <input name="note" className="gf-input sm:flex-1" placeholder="Note to the teacher (required to reject)" maxLength={300} />
          <div className="flex gap-2">
            <ConfirmActionButton
              formAction={approveCorrection}
              confirmMessage={`Approve correction #${r.ref}? The new score(s) will replace the current ones straight away and be recorded in the results history.`}
              className={buttonClasses({ variant: "primary", size: "sm" })}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Approve
            </ConfirmActionButton>
            <ConfirmActionButton
              formAction={rejectCorrection}
              confirmMessage={`Reject correction #${r.ref}? The scores stay as they are.`}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Reject
            </ConfirmActionButton>
          </div>
        </form>
      ) : null}
      {pending && !isAdmin && r.requested_by && r.requested_by === userId ? (
        <form action={withdrawCorrection}>
          <input type="hidden" name="request_id" value={r.id} />
          <input type="hidden" name="return_to" value={returnTo} />
          <SubmitButton variant="ghost" size="sm" pendingText="Withdrawing…">
            <span className="inline-flex items-center gap-1.5">
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Withdraw request
            </span>
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
