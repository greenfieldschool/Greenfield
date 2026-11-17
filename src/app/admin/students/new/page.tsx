import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";
import { NewPupilForm } from "./new-pupil-form";

// Add a pupil directly (registered at the office, or moved over from another portal). Families who apply online come
// in through Applications instead. Admins and front desk only. The database gives the admission number.

export default async function NewPupilPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login?redirectTo=/admin/students/new");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const allowed = ["super_admin", "admin", "front_desk"].includes(String(me?.role ?? ""));

  const [{ data: classes }, { data: next, error: nextError }] = await Promise.all([
    supabase.from("classes").select("id, name, level").eq("active", true).order("level").order("name"),
    supabase.rpc("preview_admission_number", { p_level: null })
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        learn={LEARN.addPupil}
        back={{ href: "/admin/students", label: "Back to students" }}
        eyebrow="Students"
        title="Add a pupil"
        description="For a child registered at the office, or moving over from another portal. Families who apply online come in through Applications."
        actions={
          <ButtonLink href="/admin/students/applications" variant="ghost">
            Applications
          </ButtonLink>
        }
      />
      {!allowed ? (
        <Alert tone="warning" title="Admins and the front desk add pupils">
          Ask the school office to add this child.
        </Alert>
      ) : (
        <>
          {nextError ? (
            <Alert tone="warning" title="Database update needed">
              Run <code>docs/migrations/20261117_admission_numbers_and_accounts.sql</code> in Supabase so numbers are given
              automatically and duplicates are checked.
            </Alert>
          ) : null}
          <NewPupilForm classes={(classes ?? []) as Array<{ id: string; name: string; level: string }>} nextNumber={(next as string | null) ?? null} />
        </>
      )}
    </div>
  );
}
