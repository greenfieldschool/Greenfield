import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CircleCheck, ClipboardList, Lock, LockOpen, Users } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import UrlToast from "@/components/url-toast";
import { AttemptStatusBadge } from "../../_components/status-badges";

type AttemptRow = {
  attempt_id: string;
  session_id: string;
  student_id: string;
  admission_number: string | null;
  first_name: string;
  last_name: string;
  obtained_marks: number;
  max_marks: number;
  percent: number;
  status: string;
  locked_at: string | null;
  lock_count: number;
  started_at: string;
  submitted_at: string | null;
};

const STAFF_ROLES = new Set(["super_admin", "admin", "teacher", "front_desk", "nurse"]);

type ServerClient = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

// Staff, or a conductor linked to this user and assigned to this session. Module-level so the
// inline server actions can call it.
async function canConductSession(supabase: ServerClient, sessionId: string): Promise<{ allowed: boolean; userId: string | null }> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { allowed: false, userId: null };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role?: string | null } | null)?.role ?? null;
  if (role && STAFF_ROLES.has(role)) return { allowed: true, userId: user.id };

  const { data: link } = await supabase
    .from("exam_conductor_user_links")
    .select("conductor_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const conductorId = (link as { conductor_id?: string } | null)?.conductor_id;
  if (!conductorId) return { allowed: false, userId: user.id };

  const { data: assignment } = await supabase
    .from("exam_session_conductors")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("conductor_id", conductorId)
    .maybeSingle();
  return { allowed: !!assignment, userId: user.id };
}

function failWithToast(sessionId: string, message: string): never {
  redirect(`/conductor/sessions/${sessionId}?toast=${encodeURIComponent(message)}&toast_type=error`);
}

export default async function ConductorSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const access = await canConductSession(supabase, id);
  if (!access.allowed) redirect("/conductor/unauthorized");

  const { data: attemptsData } = await supabase
    .from("exam_attempt_list_v")
    .select(
      "attempt_id, session_id, student_id, admission_number, first_name, last_name, obtained_marks, max_marks, percent, status, locked_at, lock_count, started_at, submitted_at"
    )
    .eq("session_id", id)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const attempts = (attemptsData ?? []) as AttemptRow[];

  async function unlockAttempt(formData: FormData) {
    "use server";

    const attemptId = String(formData.get("attempt_id") ?? "").trim();
    const note = String(formData.get("unlock_note") ?? "").trim();

    if (!attemptId) failWithToast(id, "Attempt not found.");

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(id, "Database is not configured.");

    const access = await canConductSession(supabase, id);
    if (!access.allowed) redirect("/conductor/unauthorized");
    const user = access.userId ? { id: access.userId } : null;

    await supabase
      .from("exam_attempts")
      .update({
        locked_at: null,
        locked_reason: null,
        unlocked_at: new Date().toISOString(),
        unlocked_by: user?.id ?? null,
        unlock_note: note.length ? note : null
      })
      .eq("id", attemptId)
      .eq("session_id", id);

    await supabase.from("exam_malpractice_events").insert({
      attempt_id: attemptId,
      event_type: "unlock",
      event_data: { unlock_note: note.length ? note : null }
    });

    revalidatePath(`/conductor/sessions/${id}`);
  }

  async function bulkUnlock(formData: FormData) {
    "use server";

    const note = String(formData.get("unlock_note") ?? "").trim();
    if (!note) failWithToast(id, "Enter a reason for the bulk unlock.");

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast(id, "Database is not configured.");

    const access = await canConductSession(supabase, id);
    if (!access.allowed) redirect("/conductor/unauthorized");
    const user = access.userId ? { id: access.userId } : null;

    const { data: lockedAttempts } = await supabase
      .from("exam_attempts")
      .select("id")
      .eq("session_id", id)
      .not("locked_at", "is", null);

    const ids = (lockedAttempts ?? []).map((r) => (r as { id: string }).id).filter((v) => v.length);
    if (!ids.length) failWithToast(id, "No locked attempts to unlock.");

    await supabase
      .from("exam_attempts")
      .update({
        locked_at: null,
        locked_reason: null,
        unlocked_at: new Date().toISOString(),
        unlocked_by: user?.id ?? null,
        unlock_note: note
      })
      .in("id", ids);

    await supabase
      .from("exam_malpractice_events")
      .insert(ids.map((attemptId) => ({ attempt_id: attemptId, event_type: "bulk_unlock", event_data: { note } })));

    revalidatePath(`/conductor/sessions/${id}`);
  }

  const lockedCount = attempts.filter((a) => !!a.locked_at).length;
  const submittedCount = attempts.filter((a) => !!a.submitted_at).length;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/conductor/sessions", label: "Back" }}
        eyebrow="Conductor"
        title="Session"
        description="Unlock students if their exam is locked."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Attempts" value={attempts.length} hint="Students who started" icon={Users} tone="blue" />
        <StatCard label="Submitted" value={submittedCount} hint="Finished and handed in" icon={CircleCheck} tone="green" />
        <StatCard label="Locked" value={lockedCount} hint="Waiting to be unlocked" icon={Lock} tone="rose" />
      </div>

      <form action={bulkUnlock}>
        <FormSection
          title="Bulk unlock (outage)"
          description="Unlock all locked attempts for this session. Note is required."
          footer={
            <SubmitButton variant="primary" pendingText="Unlocking…">
              <LockOpen className="h-4 w-4" aria-hidden="true" />
              Bulk unlock
            </SubmitButton>
          }
        >
          <Field label="Reason" htmlFor="bulk-unlock-note" required>
            <input id="bulk-unlock-note" className="gf-input" name="unlock_note" placeholder="e.g. Power outage" required />
          </Field>
        </FormSection>
      </form>

      <Card>
        <CardHeader title="Students" description={`${attempts.length} attempt${attempts.length === 1 ? "" : "s"} · ${lockedCount} locked`} />
        {attempts.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Adm no</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.attempt_id} className={a.locked_at ? "bg-red-50/40" : undefined}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={`${a.first_name} ${a.last_name}`} size="sm" />
                        <span className="font-semibold text-slate-900">
                          {a.first_name} {a.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="text-slate-600">{a.admission_number ?? "—"}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <AttemptStatusBadge status={a.status} />
                        {a.locked_at ? (
                          <Badge tone="red">
                            <Lock className="h-3 w-3" aria-hidden="true" />
                            locked({a.lock_count ?? 0})
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {a.locked_at ? (
                        <form action={unlockAttempt} className="flex items-center gap-2">
                          <input type="hidden" name="attempt_id" value={a.attempt_id} />
                          <input
                            aria-label={`Unlock note for ${a.first_name} ${a.last_name}`}
                            className="gf-input min-w-[10rem] flex-1 py-2"
                            name="unlock_note"
                            placeholder="(optional note)"
                          />
                          <SubmitButton variant="primary" size="sm" pendingText="Unlocking…">
                            <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            Unlock
                          </SubmitButton>
                        </form>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={ClipboardList} title="No attempts yet." description="Students appear here once they start the exam." />
        )}
      </Card>
    </div>
  );
}
