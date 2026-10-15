import { Sparkles, Star } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PillLinks, PortalPageHeader, statusBadge, PortalNotice, portalMessages } from "../_components/portal-ui";

type StudentGuardianRow = { student_id: string };

type StudentRow = { id: string; first_name: string; last_name: string };

type EnrollmentRow = {
  id: string;
  student_id: string;
  status: string;
  activities: Array<{ id: string; name: string; description: string | null }>;
};

type ActivityRow = {
  id: string;
  name: string;
  description: string | null;
};

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

export default async function PortalActivitiesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  let errorMsg: string | null = null;

  let role: string | null = null;
  let studentId: string | null = null;
  let parentStudents: StudentRow[] = [];

  try {
    const { data: identityRows, error: identityError } = await withTimeout(
      supabase.rpc("portal_identity"),
      6000
    );
    if (identityError) {
      errorMsg = String(identityError.message ?? "");
    }

    const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as {
      role?: string | null;
      student_id?: string | null;
      guardian_id?: string | null;
    } | null;

    role = identity?.role ?? null;
    if (role !== "student" && role !== "parent") return <PortalNotice title="Clubs & activities" message={portalMessages.notPortal} />;

    const sp = (await searchParams) ?? {};
    const selectedStudentIdRaw = sp.student_id;
    const selectedStudentId = Array.isArray(selectedStudentIdRaw)
      ? (selectedStudentIdRaw[0] ?? "")
      : (selectedStudentIdRaw ?? "");

    if (role === "student") {
      studentId = identity?.student_id ?? null;
    }

    if (role === "parent") {
      const guardianId = identity?.guardian_id ?? null;
      if (!guardianId) return <PortalNotice title="Clubs & activities" message={portalMessages.noGuardian} />;

      const { data: links } = await withTimeout(
        supabase.from("student_guardians").select("student_id").eq("guardian_id", guardianId),
        6000
      );

      const studentIds = (links as StudentGuardianRow[] | null | undefined)
        ?.map((r) => r.student_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0) ?? [];

      if (!studentIds.length) return <PortalNotice title="Clubs & activities" message={portalMessages.noChildren} />;

      const { data: studentsData } = await withTimeout(
        supabase
          .from("students")
          .select("id, first_name, last_name")
          .in("id", studentIds)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true }),
        6000
      );

      parentStudents = (studentsData ?? []) as StudentRow[];
      const fallbackId = parentStudents[0]?.id ?? studentIds[0] ?? null;
      studentId = selectedStudentId.length ? selectedStudentId : fallbackId;
    }
  } catch (e) {
    if (!errorMsg) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  if (!studentId)
    return (
      <PortalNotice
        title="Clubs & activities"
        message={role === "parent" ? portalMessages.noChildren : portalMessages.noStudent}
      />
    );

  let enrollments: EnrollmentRow[] = [];
  let availableActivities: ActivityRow[] = [];

  try {
    const { data: enrollmentData } = await withTimeout(
      supabase
        .from("activity_enrollments")
        .select("id, student_id, status, activities(id, name, description)")
        .eq("student_id", studentId),
      6000
    );

    enrollments = (enrollmentData ?? []).map((row) => {
      const r = row as {
        id?: string;
        student_id?: string;
        status?: string;
        activities?: unknown;
      };
      return {
        id: typeof r.id === "string" ? r.id : "",
        student_id: typeof r.student_id === "string" ? r.student_id : "",
        status: typeof r.status === "string" ? r.status : "active",
        activities: Array.isArray(r.activities)
          ? (r.activities as Array<{ id?: string; name?: string; description?: string | null }>).map((a) => ({
              id: typeof a?.id === "string" ? a.id : "",
              name: typeof a?.name === "string" ? a.name : "Activity",
              description: typeof a?.description === "string" ? a.description : null
            }))
          : r.activities && typeof r.activities === "object"
            ? [
                {
                  id: typeof (r.activities as { id?: string }).id === "string" ? (r.activities as { id: string }).id : "",
                  name:
                    typeof (r.activities as { name?: string }).name === "string"
                      ? (r.activities as { name: string }).name
                      : "Activity",
                  description:
                    typeof (r.activities as { description?: string | null }).description === "string"
                      ? (r.activities as { description: string }).description
                      : null
                }
              ]
            : []
      };
    });

    const { data: activitiesData } = await withTimeout(
      supabase.from("activities").select("id, name, description").order("name", { ascending: true }).limit(100),
      6000
    );

    availableActivities = (activitiesData ?? []) as ActivityRow[];
  } catch (e) {
    if (!errorMsg) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  const enrolledActivityIds = new Set(enrollments.flatMap((e) => e.activities.map((a) => a.id)));

  const otherActivities = availableActivities.filter((a) => !enrolledActivityIds.has(a.id));
  const childName =
    role === "parent" ? parentStudents.find((st) => st.id === studentId) : null;

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="Clubs & activities"
        description={
          childName
            ? `Clubs and activities ${childName.first_name} takes part in.`
            : "The clubs and activities you take part in, and others you could join."
        }
      />

      {role === "parent" && parentStudents.length > 1 ? (
        <PillLinks
          label="Choose a child"
          items={parentStudents.map((st) => ({
            key: st.id,
            href: `/portal/activities?student_id=${st.id}`,
            label: `${st.first_name} ${st.last_name}`,
            active: st.id === studentId
          }))}
        />
      ) : null}

      {errorMsg ? (
        <Alert tone="warning" title="Activities temporarily unavailable">
          <span className="text-xs">{errorMsg}</span>
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Enrolled" description="Activities and clubs currently joined." />
        {enrollments.length ? (
          <ul className="divide-y divide-slate-100">
            {enrollments.map((e) => {
              const activity = firstOrNull(e.activities);
              const badge = statusBadge(e.status);
              return (
                <li key={e.id} className="flex items-start gap-4 px-5 py-4 sm:px-6">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                    <Star className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{activity?.name ?? "Activity"}</span>
                      <Badge tone={badge.tone} dot>
                        {badge.label}
                      </Badge>
                    </div>
                    {activity?.description ? (
                      <p className="mt-1 text-sm text-slate-600">{activity.description}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Star}
            title="Not enrolled in any activities yet"
            description="Speak to the school office or a class teacher to join a club."
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Other activities at school" description="Clubs and activities available to join." />
        {otherActivities.length ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
            {otherActivities.map((a) => (
              <div key={a.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-brand-gold-600" aria-hidden="true" />
                  {a.name}
                </div>
                {a.description ? <p className="mt-1 text-sm text-slate-600">{a.description}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Sparkles} title="No other activities right now" />
        )}
      </Card>
    </div>
  );
}
