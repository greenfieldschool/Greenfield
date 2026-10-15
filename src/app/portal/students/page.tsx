import { GraduationCap, Sparkles } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoItem, PortalPageHeader, portalMessages, statusBadge } from "../_components/portal-ui";

function cap(v: string | null | undefined) {
  if (!v) return "—";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type IdentityRow = {
  role: string | null;
  student_id: string | null;
  guardian_id: string | null;
};

type StudentRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  profile_photo_url: string | null;
  hobbies: string[];
  level: string;
  status: string;
  date_of_birth: string | null;
  admission_number?: string | null;
  class_id?: string | null;
  classes?:
    | { id: string; level: string; name: string }
    | Array<{ id: string; level: string; name: string }>
    | null;
  sex?: string | null;
  religion?: string | null;
  favorite_sports?: string | null;
  future_aspiration?: string | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined) {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type EnrollmentRow = {
  student_id: string;
  status: string;
  activities: Array<{ name: string; description: string | null }>;
};

export default async function PortalStudentsPage() {
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

  const { data: profile, error: profileError } = await withTimeout(
    supabase.rpc("portal_identity").maybeSingle(),
    6000
  );
  if (profileError) {
    errorMsg = String(profileError.message ?? "");
  }

  const role = ((profile ?? null) as unknown as IdentityRow | null)?.role ?? null;

  let students: StudentRow[] = [];

  if (role === "student") {
    const studentId = ((profile ?? null) as unknown as IdentityRow | null)?.student_id ?? null;
    if (studentId) {
      const { data: studentList } = await withTimeout(
        supabase
          .from("students")
          .select(
            "id, first_name, middle_name, last_name, profile_photo_url, hobbies, level, status, date_of_birth, admission_number, class_id, sex, religion, favorite_sports, future_aspiration"
          )
          .eq("id", studentId),
        6000
      );

      const rawStudents = (studentList ?? []) as Array<StudentRow>;
      if (rawStudents.length > 0) {
        const classIds = rawStudents.map((s) => s.class_id).filter((cid): cid is string => typeof cid === "string" && cid.length > 0);
        let classList: Array<{ id: string; level: string; name: string }> = [];
        if (classIds.length > 0) {
          const { data: classes } = await supabase.from("classes").select("id, level, name").in("id", classIds);
          classList = (classes ?? []) as Array<{ id: string; level: string; name: string }>;
        }
        const classMap = new Map(classList.map((c) => [c.id, c]));
        students = rawStudents.map((s) => ({
          ...s,
          classes: s.class_id ? classMap.get(s.class_id) ?? null : null
        }));
      }
    }
  }

  if (role === "parent") {
    const guardianId = ((profile ?? null) as unknown as IdentityRow | null)?.guardian_id ?? null;
    if (guardianId) {
      const { data: studentLinks } = await supabase
        .from("student_guardians")
        .select("student_id")
        .eq("guardian_id", guardianId);

      const studentIds = (studentLinks ?? [])
        .map((r) => r.student_id as string)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (studentIds.length) {
        const { data: studentList } = await withTimeout(
          supabase
            .from("students")
            .select(
              "id, first_name, middle_name, last_name, profile_photo_url, hobbies, level, status, date_of_birth, admission_number, class_id, sex, religion, favorite_sports, future_aspiration"
            )
            .in("id", studentIds)
            .order("last_name", { ascending: true }),
          6000
        );

        const rawStudents = (studentList ?? []) as Array<StudentRow>;
        if (rawStudents.length > 0) {
          const classIds = rawStudents.map((s) => s.class_id).filter((cid): cid is string => typeof cid === "string" && cid.length > 0);
          let classList: Array<{ id: string; level: string; name: string }> = [];
          if (classIds.length > 0) {
            const { data: classes } = await supabase.from("classes").select("id, level, name").in("id", classIds);
            classList = (classes ?? []) as Array<{ id: string; level: string; name: string }>;
          }
          const classMap = new Map(classList.map((c) => [c.id, c]));
          students = rawStudents.map((s) => ({
            ...s,
            classes: s.class_id ? classMap.get(s.class_id) ?? null : null
          }));
        }
      }
    }
  }

  const studentIds = students.map((s) => s.id);

  const enrollmentsByStudentId = new Map<string, EnrollmentRow[]>();
  if (studentIds.length) {
    const { data } = await supabase
      .from("activity_enrollments")
      .select("student_id, status, activities(name, description)")
      .in("student_id", studentIds);

    const rows = (data ?? []) as unknown[];
    for (const raw of rows) {
      const r = raw as {
        student_id?: unknown;
        status?: unknown;
        activities?: unknown;
      };

      const studentId = typeof r.student_id === "string" ? r.student_id : "";
      if (!studentId) continue;

      const status = typeof r.status === "string" ? r.status : "active";
      const activities = Array.isArray(r.activities)
        ? (r.activities as Array<{ name?: unknown; description?: unknown }>).map((a) => ({
            name: typeof a?.name === "string" ? a.name : "Activity",
            description: typeof a?.description === "string" ? a.description : null
          }))
        : [];

      const normalized: EnrollmentRow = { student_id: studentId, status, activities };

      const list = enrollmentsByStudentId.get(studentId) ?? [];
      list.push(normalized);
      enrollmentsByStudentId.set(studentId, list);
    }
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={role === "student" ? "My profile" : "My children"}
        description={
          role === "student"
            ? "Your details as the school has them. Spot a mistake? Tell your class teacher."
            : "Children linked to your parent account."
        }
      />

      {errorMsg ? (
        <Alert tone="warning" title="Profile temporarily unavailable">
          <span className="text-xs">{errorMsg}</span>
        </Alert>
      ) : null}

      {students.map((s) => {
        const enrollments = enrollmentsByStudentId.get(s.id) ?? [];
        const cls = firstOrNull(s.classes);
        const fullName = `${s.first_name} ${s.middle_name ? `${s.middle_name} ` : ""}${s.last_name}`;
        const status = statusBadge(s.status);
        const hobbies = s.hobbies ?? [];
        return (
          <Card key={s.id} className="overflow-hidden">
            <div className="flex flex-col gap-4 bg-gradient-to-br from-brand-green-50 to-white px-5 py-6 sm:flex-row sm:items-center sm:px-6">
              <Avatar name={fullName} src={s.profile_photo_url} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="font-display text-2xl font-semibold text-slate-900">{fullName}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                  <Badge tone="green">
                    {cls ? `${cap(cls.level)} · ${cls.name}` : s.class_id ? "Class —" : "No class yet"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-6 px-5 py-5 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <InfoItem label="Admission number">{s.admission_number ?? "—"}</InfoItem>
                <InfoItem label="Level">{cap(s.level)}</InfoItem>
                <InfoItem label="Date of birth">{s.date_of_birth ? formatLagosDate(s.date_of_birth) : "—"}</InfoItem>
                {s.sex ? <InfoItem label="Sex">{cap(s.sex)}</InfoItem> : null}
                {s.religion ? <InfoItem label="Religion">{s.religion}</InfoItem> : null}
                {s.favorite_sports ? <InfoItem label="Favourite sports">{s.favorite_sports}</InfoItem> : null}
                {s.future_aspiration ? (
                  <InfoItem label="When I grow up" className="sm:col-span-2 lg:col-span-3">
                    {s.future_aspiration}
                  </InfoItem>
                ) : null}
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-slate-700">Hobbies</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {hobbies.length ? (
                      hobbies.map((h) => (
                        <Badge key={h} tone="violet">
                          {h}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">None added</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700">Clubs & activities</div>
                  <div className="mt-2 space-y-2">
                    {enrollments.length ? (
                      enrollments.map((e, idx) => {
                        const b = statusBadge(e.status);
                        return (
                          <div
                            key={`${e.student_id}-${idx}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
                          >
                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                              <Sparkles className="h-4 w-4 text-sky-600" aria-hidden="true" />
                              {firstOrNull(e.activities)?.name ?? "Activity"}
                            </span>
                            <Badge tone={b.tone}>{b.label}</Badge>
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-sm text-slate-500">Not in any clubs yet</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {!students.length ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title={role === "student" ? "Your record isn't linked yet" : "No children linked yet"}
            description={
              role === "student"
                ? portalMessages.noStudent
                : role === "parent"
                  ? portalMessages.noChildren
                  : errorMsg
                    ? "We couldn't load your account details. Please reload the page in a moment."
                    : portalMessages.notPortal
            }
          />
        </Card>
      ) : null}
    </div>
  );
}
