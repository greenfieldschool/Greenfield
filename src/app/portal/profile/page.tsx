import { getSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: profile, error: profileError } = await withTimeout(
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    6000
  );
  if (profileError) {
    errorMsg = String(profileError.message ?? "");
  }

  const role = profile?.role as string | null | undefined;

  if (role !== "parent") {
    return null;
  }

  const { data: guardianLink } = await supabase
    .from("guardian_user_links")
    .select("guardian_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const guardianId = (guardianLink?.guardian_id as string | undefined) ?? null;

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

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">Portal</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">My profile</h1>
      <p className="mt-2 text-sm text-slate-600">Your parent/guardian profile (managed by school admin).</p>

      {errorMsg ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <div className="text-sm font-semibold">Profile temporarily unavailable</div>
          <div className="mt-2 text-xs opacity-80">{errorMsg}</div>
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {guardian?.profile_photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="h-full w-full object-cover" alt="" src={guardian.profile_photo_url} />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900">{guardian?.full_name ?? "—"}</div>
            <div className="mt-1 text-sm text-slate-600">{guardian?.email ?? user.email ?? "—"}</div>
            <div className="mt-1 text-sm text-slate-600">{guardian?.phone ?? "—"}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-xs font-semibold text-slate-500">Interests</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(guardian?.interests ?? []).length ? (
              (guardian?.interests ?? []).map((i) => (
                <span key={i} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                  {i}
                </span>
              ))
            ) : (
              <div className="text-sm text-slate-600">—</div>
            )}
          </div>
        </div>

        {guardian?.created_at ? (
          <div className="mt-4 text-xs text-slate-500">
            Member since: {new Date(guardian.created_at).toLocaleDateString()}
          </div>
        ) : null}
      </div>

      {linkedStudents.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-slate-900">Linked students</h2>
          <p className="mt-1 text-sm text-slate-600">Students associated with your guardian account.</p>
          <div className="mt-4 space-y-3">
            {linkedStudents.map((link) => {
              const student = link.students;
              return (
                <div
                  key={link.student_id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {student?.first_name} {student?.last_name}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {student?.admission_number ? `Admission: ${student.admission_number} • ` : ""}
                      Level: {student?.level ?? "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold text-slate-700">
                      {link.relationship ?? "Guardian"}
                    </div>
                    {link.is_primary ? (
                      <div className="mt-1 text-xs text-brand-green font-semibold">Primary contact</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!guardianId ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          No guardian record is linked to this account yet.
        </div>
      ) : null}
    </div>
  );
}
