import { redirect } from "next/navigation";
import { Mail, Phone, Users } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PortalNotice, PortalPageHeader, portalMessages } from "../_components/portal-ui";

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type GuardianRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  interests: string[];
  created_at: string | null;
};

type StudentGuardianRow = {
  student_id: string;
  relationship: string | null;
  is_primary: boolean;
  students: {
    id: string;
    first_name: string;
    last_name: string;
    admission_number: string | null;
    level: string;
  };
};

export default async function PortalProfilePage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  let errorMsg: string | null = null;

  const { data: identityRows, error: identityError } = await withTimeout(supabase.rpc("portal_identity"), 6000);
  if (identityError) {
    errorMsg = String(identityError.message ?? "");
  }

  const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : identityRows) as {
    role?: string | null;
    guardian_id?: string | null;
  } | null;

  const role = identity?.role ?? null;

  if (role === "student") {
    redirect("/portal/students");
  }

  if (role !== "parent") {
    return (
      <PortalNotice
        title="My profile"
        heading={errorMsg ? "Profile temporarily unavailable" : "Nothing to show yet"}
        message={errorMsg ? "We couldn't load your account details. Please reload the page in a moment." : portalMessages.notPortal}
      />
    );
  }

  const guardianId = identity?.guardian_id ?? null;

  const { data: guardianData } = guardianId
    ? await withTimeout(
        supabase
          .from("guardians")
          .select("id, full_name, email, phone, profile_photo_url, interests, created_at")
          .eq("id", guardianId)
          .maybeSingle(),
        6000
      )
    : { data: null as unknown };

  const guardian = (guardianData ?? null) as GuardianRow | null;

  let linkedStudents: StudentGuardianRow[] = [];
  if (guardianId) {
    const { data: studentLinks } = await withTimeout(
      supabase
        .from("student_guardians")
        .select("student_id, relationship, is_primary, students(id, first_name, last_name, admission_number, level)")
        .eq("guardian_id", guardianId),
      6000
    );
    linkedStudents = (studentLinks ?? []) as unknown as StudentGuardianRow[];
  }

  const interests = guardian?.interests ?? [];

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="My profile"
        description="Your parent / guardian details. To change anything, please contact the school office."
      />

      {errorMsg ? (
        <Alert tone="warning" title="Profile temporarily unavailable">
          <span className="text-xs">{errorMsg}</span>
        </Alert>
      ) : null}

      {!guardianId ? (
        <Alert tone="warning">{portalMessages.noGuardian}</Alert>
      ) : null}

      <Card>
        <CardBody>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar name={guardian?.full_name ?? user.email ?? "?"} src={guardian?.profile_photo_url} size="xl" />
            <div className="min-w-0 flex-1">
              <div className="font-display text-2xl font-semibold text-slate-900">{guardian?.full_name ?? "—"}</div>
              <div className="mt-2 flex flex-col gap-1.5 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-5">
                <span className="inline-flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  {guardian?.email ?? user.email ?? "—"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  {guardian?.phone ?? "—"}
                </span>
              </div>
              {guardian?.created_at ? (
                <div className="mt-2 text-xs text-slate-500">Member since {formatLagosDate(guardian.created_at)}</div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="text-sm font-medium text-slate-700">Interests</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {interests.length ? (
                interests.map((i) => (
                  <Badge key={i} tone="slate">
                    {i}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-slate-500">None added</span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Linked children" description="Children associated with your account." />
        {linkedStudents.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {linkedStudents.map((link) => {
              const student = link.students;
              const name = `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim();
              return (
                <li key={link.student_id} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                  <Avatar name={name || "?"} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{name || "—"}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {student?.admission_number ? `${student.admission_number} · ` : ""}
                      <span className="capitalize">{student?.level ?? "—"}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm capitalize text-slate-700">{link.relationship ?? "Guardian"}</span>
                    {link.is_primary ? <Badge tone="green">Primary contact</Badge> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Users} title="No children linked yet" description="Ask the school office to link your children." />
        )}
      </Card>
    </div>
  );
}
