import type { ReactNode } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import PortalShell from "./PortalShell";
import { ServiceUnavailable } from "@/components/ui/service-unavailable";

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return <>{children}</>;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <>{children}</>;
  }

  let role: string | null | undefined = null;
  let studentId: string | null = null;
  let personName: string | null = null;
  try {
    const query = supabase.rpc("portal_identity");
    const { data: identityRows, error: identityError } = await withTimeout(Promise.resolve(query), 6000);

    if (identityError) {
      const msg = String(identityError.message ?? "");
      const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("databasetimeout");
      return <ServiceUnavailable area="The portal" timeout={isTimeout} detail={msg} />;
    }

    const identity = Array.isArray(identityRows) ? (identityRows[0] ?? null) : (identityRows as unknown);
    role = ((identity as { role?: string } | null)?.role as string | null | undefined) ?? null;
    studentId = ((identity as { student_id?: string } | null)?.student_id as string | null | undefined) ?? null;

    if (role === "student" && !studentId) {
      const { data: linkedStudentId } = await withTimeout(
        supabase.rpc("auto_link_student_by_email"),
        4000
      );
      if (linkedStudentId) {
        studentId = linkedStudentId as string;
      }
    }

    const guardianId = ((identity as { guardian_id?: string } | null)?.guardian_id as string | null | undefined) ?? null;
    if (role === "parent" && guardianId) {
      const { data: gData } = await supabase.from("guardians").select("full_name").eq("id", guardianId).maybeSingle();
      personName = (gData as { full_name?: string } | null)?.full_name ?? null;
    }

    if (role === "student" && studentId) {
      const { data: sData } = await supabase
        .from("students")
        .select("first_name, last_name")
        .eq("id", studentId)
        .maybeSingle();
      if (sData) {
        personName = `${(sData as { first_name: string }).first_name} ${(sData as { last_name: string }).last_name}`;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.toLowerCase().includes("timeout");
    return <ServiceUnavailable area="The portal" timeout={isTimeout} detail={msg} />;
  }

  const isPortalRole = role === "parent" || role === "student";

  if (!isPortalRole) {
    return <>{children}</>;
  }

  const displayEmail = user.email ?? "";
  const displayName = personName ?? displayEmail.split("@")[0];

  return (
    <PortalShell role={role === "student" ? "student" : "parent"} displayName={displayName} displayEmail={displayEmail}>
      {children}
    </PortalShell>
  );
}
