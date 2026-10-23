import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherAccess } from "@/lib/teacher-access";
import UrlToast from "@/components/url-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/tabs";
import { CorrectionRequestCard, loadCorrectionRequests } from "./_requests";

const PATH = "/admin/academics/corrections";

// Admins: every request, to approve or reject. Teachers: the requests for the classes and subjects they teach
// (the database decides which rows each person can see).
export default async function CorrectionRequestsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const tab = sp.status === "all" ? "all" : "pending";
  const access = await getTeacherAccess(supabase);
  const { data: me } = access.userId
    ? await supabase.from("profiles").select("role").eq("id", access.userId).maybeSingle()
    : { data: null };
  const isAdmin = ["admin", "super_admin"].includes((me as { role?: string } | null)?.role ?? "");

  const [{ requests, studentName, error }, { count: pendingCount }, { data: classes }, { data: subjects }, { data: terms }] = await Promise.all([
    loadCorrectionRequests(supabase, { status: tab === "pending" ? "pending" : undefined, limit: 100 }),
    supabase.from("result_correction_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("classes").select("id, name"),
    supabase.from("subjects").select("id, name"),
    supabase.from("academic_terms").select("id, name")
  ]);
  const name = (rows: unknown, id: string) => ((rows ?? []) as Array<{ id: string; name: string }>).find((r) => r.id === id)?.name;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Correction requests"
        description={
          isAdmin
            ? "Teachers can't change scores once a sheet is final or published. They send a request with the corrected score and a reason; approve it to apply the change, or reject it with a note. Everything is recorded in the results history."
            : "Once a result sheet is final or published you can't change it yourself. Open the sheet, enter the corrected score(s) with a reason and send a correction request. An admin approves or rejects it."
        }
      />

      <LinkTabs
        tabs={[
          { key: "pending", label: "Waiting for a decision", href: PATH, count: pendingCount ?? 0 },
          { key: "all", label: "All requests", href: `${PATH}?status=all` }
        ]}
        active={tab}
      />

      {error ? (
        <Alert tone="danger">
          Correction requests are not set up yet. Run docs/migrations/20261024_result_corrections.sql in Supabase. ({error.message})
        </Alert>
      ) : (
        <Card>
          <CardHeader title={tab === "pending" ? "Waiting for a decision" : "All requests"} description="Newest first." />
          {requests.length ? (
            <div className="divide-y divide-slate-100">
              {requests.map((r) => (
                <div key={r.id}>
                  <CorrectionRequestCard
                    request={r}
                    studentName={studentName}
                    context={[name(subjects, r.subject_id), name(classes, r.class_id), name(terms, r.academic_term_id)].filter(Boolean).join(" · ")}
                    isAdmin={isAdmin}
                    userId={access.userId}
                    returnTo={tab === "all" ? `${PATH}?status=all` : PATH}
                  />
                  <div className="-mt-2 px-5 pb-4 sm:px-6">
                    <Link
                      className="text-xs font-semibold text-brand-green-700 hover:underline"
                      href={`/admin/academics/results?class_id=${r.class_id}&subject_id=${r.subject_id}&term_id=${r.academic_term_id}`}
                    >
                      Open result sheet
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileCheck2}
              title={tab === "pending" ? "Nothing waiting" : "No requests yet"}
              description={tab === "pending" ? "There are no correction requests waiting for a decision." : undefined}
            />
          )}
        </Card>
      )}
    </div>
  );
}
