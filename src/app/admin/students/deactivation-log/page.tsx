import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { LEARN } from "@/lib/learn-guides";
import { formatLagosDate } from "@/lib/lagos-dates";
import { fetchAllRows } from "@/lib/fetch-all";
import { reasonLabel } from "@/lib/student-deactivation";

// Every pupil record deactivated, reactivated or permanently deleted, with the reason and who did it (issue 11).
// Admins only (route-access + RLS on student_status_log). Deleted records keep their name and admission number here.

type LogRow = {
  id: string;
  student_id: string | null;
  student_name: string;
  admission_number: string | null;
  action: string;
  reason: string | null;
  reason_other: string | null;
  kept_student_id: string | null;
  done_by_name: string | null;
  created_at: string;
};

const ACTION = {
  deactivated: { label: "Deactivated", tone: "gold" },
  reactivated: { label: "Reactivated", tone: "green" },
  deleted: { label: "Deleted", tone: "red" }
} as const;

export default async function DeactivationLogPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  let missing = false;
  const rows = await fetchAllRows<LogRow>(() => {
    const q = supabase
      .from("student_status_log")
      .select("id, student_id, student_name, admission_number, action, reason, reason_other, kept_student_id, done_by_name, created_at")
      .order("created_at", { ascending: false })
      .order("id");
    return {
      range: async (from: number, to: number) => {
        const res = await q.range(from, to);
        if (res.error) missing = true;
        return res as { data: LogRow[] | null; error: unknown };
      }
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        learn={LEARN.deactivatePupils}
        back={{ href: "/admin/students", label: "Back to students" }}
        eyebrow="Students"
        title="Deactivation log"
        description="Every pupil record that was deactivated, brought back or deleted, with the reason and who did it."
      />
      {missing ? (
        <Alert tone="warning" title="Not set up yet">
          Run docs/migrations/20261113b_student_deactivation.sql in Supabase to start recording deactivations.
        </Alert>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="Nothing yet" description="When an admin deactivates a pupil, it is listed here." />
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="gf-table-wrap">
              <table className="gf-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Pupil</th>
                    <th>What happened</th>
                    <th>Reason</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = ACTION[r.action as keyof typeof ACTION] ?? { label: r.action, tone: "slate" as const };
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{formatLagosDate(r.created_at)}</td>
                        <td>
                          {r.student_id ? (
                            <Link className="gf-link" href={`/admin/students/${r.student_id}`}>
                              {r.student_name}
                            </Link>
                          ) : (
                            <span>{r.student_name}</span>
                          )}
                          {r.admission_number ? <span className="ml-1 text-xs text-slate-500">({r.admission_number})</span> : null}
                        </td>
                        <td>
                          <Badge tone={a.tone}>{a.label}</Badge>
                        </td>
                        <td>
                          {reasonLabel(r.reason, r.reason_other)}
                          {r.kept_student_id && r.reason === "duplicate" ? (
                            <>
                              {" · "}
                              <Link className="gf-link" href={`/admin/students/${r.kept_student_id}`}>
                                record kept
                              </Link>
                            </>
                          ) : null}
                        </td>
                        <td>{r.done_by_name ?? "Admin"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
