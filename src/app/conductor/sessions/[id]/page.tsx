import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import UrlToast from "@/components/url-toast";
import { ExamRoom } from "@/components/exams/exam-room";

const STAFF_ROLES = new Set(["super_admin", "admin", "teacher", "front_desk", "nurse"]);

type ServerClient = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

// Staff, or a conductor linked to this user and assigned to this session. Module-level so the
// inline server actions can call it.
async function canConductSession(supabase: ServerClient, sessionId: string): Promise<{ allowed: boolean; userId: string | null }> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { allowed: false, userId: null };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role?: string | null } | null)?.role ?? null;
  if (role && STAFF_ROLES.has(role)) return { allowed: true, userId: user.id };

  const { data: link } = await supabase
    .from("exam_conductor_user_links")
    .select("conductor_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const conductorId = (link as { conductor_id?: string } | null)?.conductor_id;
  if (!conductorId) return { allowed: false, userId: user.id };

  const { data: assignment } = await supabase
    .from("exam_session_conductors")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("conductor_id", conductorId)
    .maybeSingle();
  return { allowed: !!assignment, userId: user.id };
}

export default async function ConductorSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const access = await canConductSession(supabase, id);
  if (!access.allowed) redirect("/conductor/unauthorized");

  const { data: info } = await supabase.rpc("exam_room_info", { p_session: id });
  const testName = ((Array.isArray(info) ? info[0] : info) as { test_name: string } | null)?.test_name ?? "Exam session";

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/conductor/sessions", label: "Back" }}
        eyebrow="Conductor"
        title={testName}
        description="Watch who is writing, unlock learners whose exam locked, and add time. An exam locks when a learner is away from the page for 10 seconds or more, or is cut off."
      />
      <ExamRoom supabase={supabase} sessionId={id} back={`/conductor/sessions/${id}`} />
    </div>
  );
}
