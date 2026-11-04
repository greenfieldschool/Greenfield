import type { SupabaseClient } from "@supabase/supabase-js";
import { portalMessages } from "../_components/portal-ui";

// Who is looking at the assignments pages: a pupil (their own work) or a parent (one of their children, chosen with
// ?student_id=). Returns a notice to show instead when there is nobody to show.

export type PortalPupil = { id: string; first_name: string; last_name: string; class_id: string | null };

export type AssignmentsViewer =
  | { kind: "notice"; message: string }
  | { kind: "ok"; role: "student" | "parent"; pupil: PortalPupil; children: PortalPupil[] };

export async function loadAssignmentsViewer(
  supabase: SupabaseClient,
  sp: Record<string, string | string[] | undefined>
): Promise<AssignmentsViewer> {
  const { data: identityRows } = await supabase.rpc("portal_identity");
  const identity = (Array.isArray(identityRows) ? identityRows[0] ?? null : null) as {
    role?: string | null;
    student_id?: string | null;
    guardian_id?: string | null;
  } | null;
  const role = identity?.role ?? null;
  if (role !== "student" && role !== "parent") return { kind: "notice", message: portalMessages.notPortal };

  if (role === "student") {
    if (!identity?.student_id) return { kind: "notice", message: portalMessages.noStudent };
    const { data } = await supabase.from("students").select("id, first_name, last_name, class_id").eq("id", identity.student_id).maybeSingle();
    if (!data) return { kind: "notice", message: portalMessages.noStudent };
    return { kind: "ok", role, pupil: data as PortalPupil, children: [] };
  }

  if (!identity?.guardian_id) return { kind: "notice", message: portalMessages.noGuardian };
  const { data: links } = await supabase.from("student_guardians").select("student_id").eq("guardian_id", identity.guardian_id);
  const ids = ((links ?? []) as Array<{ student_id: string }>).map((l) => l.student_id).filter(Boolean);
  if (!ids.length) return { kind: "notice", message: portalMessages.noChildren };
  const { data: kids } = await supabase
    .from("students")
    .select("id, first_name, last_name, class_id")
    .in("id", ids)
    .order("last_name")
    .order("first_name");
  const children = (kids ?? []) as PortalPupil[];
  const wanted = typeof sp.student_id === "string" ? sp.student_id : "";
  const pupil = children.find((c) => c.id === wanted) ?? children[0];
  if (!pupil) return { kind: "notice", message: portalMessages.noChildren };
  return { kind: "ok", role, pupil, children };
}
