import type { SupabaseClient } from "@supabase/supabase-js";

// Signatures printed on certificates (migration 20261103): each member of staff saves theirs on My profile, and an
// admin chooses the head teacher under Settings. A line with no saved signature stays blank for signing by hand.

export type Signature = { image: string; name: string };

export type CertificateSignatures = {
  classTeacher: Signature | null;
  head: Signature | null;
  headTitle: string;
};

export type SignatureStatus = CertificateSignatures & {
  /** False until the database update has been run. */
  ready: boolean;
  /** The class's class teachers, and whether each has saved a signature. */
  classTeachers: Array<{ id: string; name: string; signed: boolean }>;
  headTeacher: { id: string; name: string; signed: boolean } | null;
};

export const NO_SIGNATURES: CertificateSignatures = { classTeacher: null, head: null, headTitle: "Head teacher" };

type SigRow = { user_id: string; signature: string; signed_name: string };

/** Who signs a class's certificates: the first class teacher with a saved signature, and the head teacher. */
export async function loadSignatureStatus(client: SupabaseClient, classId: string): Promise<SignatureStatus> {
  const [{ data: settings, error: settingsError }, { data: assigned }] = await Promise.all([
    client.from("school_settings").select("head_teacher_id, head_teacher_title").eq("id", true).maybeSingle(),
    client.from("teacher_class_assignments").select("teacher_id, created_at").eq("class_id", classId).eq("active", true).order("created_at")
  ]);
  if (settingsError) return { ...NO_SIGNATURES, ready: false, classTeachers: [], headTeacher: null };

  const s = settings as { head_teacher_id: string | null; head_teacher_title: string | null } | null;
  const teacherIds = ((assigned ?? []) as Array<{ teacher_id: string }>).map((a) => a.teacher_id);
  const headId = s?.head_teacher_id ?? null;
  const ids = Array.from(new Set([...teacherIds, ...(headId ? [headId] : [])]));

  const [{ data: sigData }, { data: profiles }] = ids.length
    ? await Promise.all([
        client.from("staff_signatures").select("user_id, signature, signed_name").in("user_id", ids),
        client.from("profiles").select("id, full_name, email").in("id", ids)
      ])
    : [{ data: [] }, { data: [] }];
  const sigs = new Map(((sigData ?? []) as SigRow[]).map((r) => [r.user_id, r] as const));
  const nameOf = new Map(
    ((profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((p) => [p.id, p.full_name || p.email || "Staff"] as const)
  );
  const toSig = (r: SigRow | undefined): Signature | null => (r ? { image: r.signature, name: r.signed_name } : null);

  const firstSigned = teacherIds.find((id) => sigs.has(id));
  return {
    ready: true,
    classTeacher: firstSigned ? toSig(sigs.get(firstSigned)) : null,
    head: headId ? toSig(sigs.get(headId)) : null,
    headTitle: s?.head_teacher_title?.trim() || "Head teacher",
    classTeachers: teacherIds.map((id) => ({ id, name: sigs.get(id)?.signed_name ?? nameOf.get(id) ?? "A class teacher", signed: sigs.has(id) })),
    headTeacher: headId ? { id: headId, name: sigs.get(headId)?.signed_name ?? nameOf.get(headId) ?? "Head teacher", signed: sigs.has(headId) } : null
  };
}
