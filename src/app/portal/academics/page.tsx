import { BookOpen } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { buildClassReport } from "@/lib/term-report";
import ReportCard from "@/components/report-card";
import PrintButton from "@/components/print-button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PillLinks, PortalPageHeader, PortalNotice, portalMessages } from "../_components/portal-ui";

type IdentityRow = {
  role: string | null;
  student_id: string | null;
  guardian_id: string | null;
};

type PubRow = {
  id: string;
  academic_term_id: string | null;
  published_at: string;
  academic_years: { name: string } | Array<{ name: string }> | null;
  academic_terms: { name: string } | Array<{ name: string }> | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined) {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function EmptyAcademics({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <PortalPageHeader title="Report card" description="Term results published by the school." />
      <Card>
        <EmptyState icon={BookOpen} title="Nothing to show yet" description={message} />
      </Card>
    </div>
  );
}

export default async function PortalAcademicsPage({
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

  const { data: identityRows } = await supabase.rpc("portal_identity");
  const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as unknown as IdentityRow | null;
  const role = identity?.role ?? null;

  if (role !== "student" && role !== "parent") return <PortalNotice title="Report card" message={portalMessages.notPortal} />;

  const sp = (await searchParams) ?? {};
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const selectedStudentId = pick(sp.student_id);

  let studentId: string | null = null;
  let parentStudents: Array<{ id: string; first_name: string; last_name: string }> = [];

  if (role === "student") {
    studentId = identity?.student_id ?? null;
  } else {
    const guardianId = identity?.guardian_id ?? null;
    if (!guardianId) return <EmptyAcademics message={portalMessages.noGuardian} />;

    const { data: links } = await supabase.from("student_guardians").select("student_id").eq("guardian_id", guardianId);
    const studentIds = ((links ?? []) as Array<{ student_id: string }>).map((r) => r.student_id).filter(Boolean);
    if (!studentIds.length) return <EmptyAcademics message={portalMessages.noChildren} />;

    const { data: studentsData } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .in("id", studentIds)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });
    parentStudents = (studentsData ?? []) as Array<{ id: string; first_name: string; last_name: string }>;

    // Only the parent's own children: the report below is read with the school's service key.
    studentId = studentIds.includes(selectedStudentId) ? selectedStudentId : (parentStudents[0]?.id ?? studentIds[0] ?? null);
  }

  if (!studentId) {
    return <PortalNotice title="Report card" message={role === "parent" ? portalMessages.noChildren : portalMessages.noStudent} />;
  }

  const { data: studentData } = await supabase.from("students").select("id, first_name, last_name, class_id").eq("id", studentId).maybeSingle();
  const student = studentData as { id: string; first_name: string; last_name: string; class_id: string | null } | null;
  const classId = student?.class_id ?? null;
  if (!student || !classId) {
    return <EmptyAcademics message="Not assigned to a class yet — please contact the school office." />;
  }

  const { data: pubsData } = await supabase
    .from("result_publications")
    .select("id, academic_term_id, published_at, academic_years(name), academic_terms(name)")
    .eq("scope", "term_results")
    .eq("class_id", classId)
    .order("published_at", { ascending: false })
    .limit(6);
  const pubs = ((pubsData ?? []) as unknown as PubRow[]).filter((p) => p.academic_term_id);
  const selectedPub = pick(sp.pub);
  const latest = pubs.find((p) => p.id === selectedPub) ?? pubs[0] ?? null;

  if (!latest?.academic_term_id) {
    return (
      <EmptyAcademics message="No term results have been published for this class yet. You'll see the report card here as soon as the school releases it." />
    );
  }

  // Class averages, highest scores and positions need the whole class, which parents can't read directly, so the
  // published report is built with the service key. Without it, the report is built from the pupil's own records.
  const service = getSupabaseServiceClient();
  const report = await buildClassReport((service ?? supabase) as SupabaseClient, classId, latest.academic_term_id);
  const mine = report?.students.find((r) => r.student.id === studentId) ?? null;

  if (!report || !mine) {
    return <EmptyAcademics message="This report card isn't available yet — please contact the school office." />;
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PortalPageHeader
          eyebrow={[firstOrNull(latest.academic_years)?.name, firstOrNull(latest.academic_terms)?.name].filter(Boolean).join(" · ") || undefined}
          title="Report card"
          description={role === "parent" ? `${student.first_name} ${student.last_name} · ${report.cls.name}` : report.cls.name}
          actions={<PrintButton label="Print / save as PDF" variant="secondary" />}
        />
      </div>

      {role === "parent" && parentStudents.length > 1 ? (
        <div className="print:hidden">
          <PillLinks
            label="Choose a child"
            items={parentStudents.map((st) => ({
              key: st.id,
              href: `/portal/academics?student_id=${st.id}`,
              label: `${st.first_name} ${st.last_name}`,
              active: st.id === studentId
            }))}
          />
        </div>
      ) : null}

      {pubs.length > 1 ? (
        <div className="print:hidden">
          <PillLinks
            label="Choose a term"
            items={pubs.map((p) => {
              const params = new URLSearchParams({ pub: p.id });
              if (role === "parent") params.set("student_id", studentId!);
              return {
                key: p.id,
                href: `/portal/academics?${params.toString()}`,
                label: `${firstOrNull(p.academic_years)?.name ?? ""} ${firstOrNull(p.academic_terms)?.name ?? "Term"}`.trim(),
                active: p.id === latest.id
              };
            })}
          />
        </div>
      ) : null}

      <ReportCard report={report} student={mine} showPositions={Boolean(service)} />
    </div>
  );
}
