import Link from "next/link";
import { CalendarClock, ChevronRight, UserRoundX } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { SessionStatusBadge } from "../_components/status-badges";

type SessionRow = {
  id: string;
  test_id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  exam_tests:
    | { id: string; name: string }
    | Array<{ id: string; name: string }>
    | null;
  classes:
    | { id: string; level: string; name: string }
    | Array<{ id: string; level: string; name: string }>
    | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined) {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type ConductorLinkRow = { conductor_id: string };

type SessionConductorRow = {
  session_id: string;
  exam_test_sessions: Array<SessionRow>;
};

export default async function ConductorSessionsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: linkData } = await supabase
    .from("exam_conductor_user_links")
    .select("conductor_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const link = (linkData ?? null) as ConductorLinkRow | null;
  if (!link) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Conductor" title="My sessions" />
        <Card>
          <EmptyState
            icon={UserRoundX}
            title="No conductor profile linked"
            description="Ask an admin to link your user account to a conductor."
          />
        </Card>
      </div>
    );
  }

  const { data } = await supabase
    .from("exam_session_conductors")
    .select(
      "session_id, exam_test_sessions(id, test_id, starts_at, ends_at, status, exam_tests(id, name), classes(id, level, name))"
    )
    .eq("conductor_id", link.conductor_id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as SessionConductorRow[];
  const sessions = rows.map((r) => firstOrNull(r.exam_test_sessions)).filter(Boolean) as SessionRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/conductor", label: "Dashboard" }}
        eyebrow="Conductor"
        title="My sessions"
        description="Sessions you are assigned to conduct."
      />

      <Card>
        <CardHeader title="Assigned sessions" description={`${sessions.length} session${sessions.length === 1 ? "" : "s"}`} />
        {sessions.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Class</th>
                  <th>Status</th>
                  <th className="text-right">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const test = firstOrNull(s.exam_tests);
                  const cls = firstOrNull(s.classes);
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/conductor/sessions/${s.id}`} className="font-semibold text-slate-900 hover:text-brand-green hover:underline">
                          {test?.name ?? s.test_id}
                        </Link>
                      </td>
                      <td>{cls ? `${cls.level} - ${cls.name}` : "—"}</td>
                      <td>
                        <SessionStatusBadge status={s.status} />
                      </td>
                      <td className="text-right">
                        <Link href={`/conductor/sessions/${s.id}`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                          Open
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="No sessions assigned yet."
            description="Sessions appear here once an admin assigns you to them."
          />
        )}
      </Card>
    </div>
  );
}
