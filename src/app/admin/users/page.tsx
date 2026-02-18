import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
};

type GuardianRow = {
  id: string;
  full_name: string;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  level: string;
};

type GuardianUserLinkRow = {
  user_id: string;
  guardian_id: string;
};

type StudentUserLinkRow = {
  user_id: string;
  student_id: string;
};

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: { q?: string; invited?: string; invite_error?: string };
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const query = (searchParams.q ?? "").trim();
  const inviteSuccess = String(searchParams.invited ?? "").trim() === "1";
  const inviteError = String(searchParams.invite_error ?? "").trim() === "1";

  const profilesQuery = supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .order("updated_at", { ascending: false })
    .limit(25);

  const { data: profilesData } = query.length
    ? await profilesQuery.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`)
    : await profilesQuery;

  const profiles = (profilesData ?? []) as ProfileRow[];

  const { data: guardiansData } = await supabase
    .from("guardians")
    .select("id, full_name")
    .order("full_name", { ascending: true });

  const guardians = (guardiansData ?? []) as GuardianRow[];

  const { data: studentsData } = await supabase
    .from("students")
    .select("id, first_name, last_name, level")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const students = (studentsData ?? []) as StudentRow[];

  const {
    data: { user: currentUser }
  } = await supabase.auth.getUser();

  const { data: currentUserProfile } = currentUser
    ? await supabase.from("profiles").select("role").eq("id", currentUser.id).maybeSingle()
    : { data: null as { role?: string | null } | null };

  const currentRole = (currentUserProfile?.role ?? null) as string | null;
  const canInviteStaff = currentRole === "super_admin" || currentRole === "admin";

  const userIds = profiles.map((p) => p.id);

  const { data: guardianLinksData } = userIds.length
    ? await supabase
        .from("guardian_user_links")
        .select("user_id, guardian_id")
        .in("user_id", userIds)
    : { data: [] as unknown[] };

  const guardianLinks = (guardianLinksData ?? []) as GuardianUserLinkRow[];

  const { data: studentLinksData } = userIds.length
    ? await supabase
        .from("student_user_links")
        .select("user_id, student_id")
        .in("user_id", userIds)
    : { data: [] as unknown[] };

  const studentLinks = (studentLinksData ?? []) as StudentUserLinkRow[];

  const guardianById = new Map(guardians.map((g) => [g.id, g] as const));
  const studentById = new Map(students.map((s) => [s.id, s] as const));

  async function setQuery(formData: FormData) {
    "use server";

    const q = String(formData.get("q") ?? "").trim();
    redirect(q.length ? `/admin/users?q=${encodeURIComponent(q)}` : "/admin/users");
  }

  async function updateRole(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();

    if (!userId || !role) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect("/admin/users?invite_error=1");
    }

    await supabase.from("profiles").update({ role }).eq("id", userId);

    revalidatePath("/admin/users");
  }

  async function inviteStaff(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();

    if (!email || !role) {
      redirect("/admin/users?invite_error=1");
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/admin/users?invite_error=1");
    }

    const { data: inviterProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const inviterRole = (inviterProfile?.role ?? null) as string | null;
    const isAllowed = inviterRole === "super_admin" || inviterRole === "admin";
    if (!isAllowed) {
      redirect("/admin/users?invite_error=1");
    }

    const service = getSupabaseServiceClient();
    if (!service) {
      redirect("/admin/users?invite_error=1");
    }

    const h = headers();
    const forwardedHost = h.get("x-forwarded-host");
    const host = forwardedHost ?? h.get("host");
    const forwardedProto = h.get("x-forwarded-proto");
    const inferredProto = host?.includes("localhost") || host?.includes("127.0.0.1") ? "http" : "https";
    const proto = forwardedProto ?? inferredProto;
    const origin = host ? `${proto}://${host}` : "";
    const redirectTo = origin ? `${origin}/auth/finish?next=${encodeURIComponent("/auth/set-password")}` : undefined;

    const { data: inviteResult, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: fullName.length ? { full_name: fullName } : undefined
    });

    if (inviteError || !inviteResult?.user) {
      const message = (inviteError?.message ?? "").toLowerCase();
      const isAlready = message.includes("already") || message.includes("exists") || message.includes("registered");
      redirect(`/admin/users?q=${encodeURIComponent(email)}&invite_error=${isAlready ? "exists" : "1"}`);
    }

    await service
      .from("profiles")
      .update({
        role,
        full_name: fullName.length ? fullName : null,
        email
      })
      .eq("id", inviteResult.user.id);

    revalidatePath("/admin/users");
    redirect(`/admin/users?q=${encodeURIComponent(email)}&invited=1`);
  }

  async function linkGuardian(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") ?? "").trim();
    const guardianId = String(formData.get("guardian_id") ?? "").trim();

    if (!userId || !guardianId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("guardian_user_links")
      .upsert({ user_id: userId, guardian_id: guardianId }, { onConflict: "user_id" });

    revalidatePath("/admin/users");
  }

  async function linkStudent(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") ?? "").trim();
    const studentId = String(formData.get("student_id") ?? "").trim();

    if (!userId || !studentId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("student_user_links")
      .upsert({ user_id: userId, student_id: studentId }, { onConflict: "user_id" });

    revalidatePath("/admin/users");
  }

  async function unlinkGuardian(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") ?? "").trim();
    if (!userId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("guardian_user_links").delete().eq("user_id", userId);

    revalidatePath("/admin/users");
  }

  async function unlinkStudent(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") ?? "").trim();
    if (!userId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("student_user_links").delete().eq("user_id", userId);

    revalidatePath("/admin/users");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Admin</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-2 text-sm text-slate-600">
          Search users by email/name, set roles, and link accounts to guardians/students.
        </p>

        {inviteSuccess ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Invite sent{query.length ? ` to ${query}` : ""}. The staff member should check their email and set a password.
          </div>
        ) : null}

        {inviteError ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {String(searchParams.invite_error ?? "").trim() === "exists"
              ? "That email already has an account or already has a pending invite. Ask them to use the first invite email to set a password."
              : "Could not send invite. Please confirm your Supabase email settings and that the email address is valid."}
          </div>
        ) : null}

        <form action={setQuery} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            className="w-full flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            name="q"
            placeholder="Search by email or name"
            defaultValue={query}
          />
          <button
            className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            type="submit"
          >
            Search
          </button>
        </form>

        {canInviteStaff ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="text-sm font-semibold text-slate-900">Invite staff</div>
            <div className="mt-1 text-sm text-slate-600">Send an email invite and set their initial role.</div>
            <form action={inviteStaff} className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Email</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="email"
                  placeholder="staff@school.com"
                  required
                  type="email"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-900">Role</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="role"
                  defaultValue="teacher"
                >
                  <option value="admin">admin</option>
                  <option value="teacher">teacher</option>
                  <option value="front_desk">front_desk</option>
                  <option value="nurse">nurse</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Full name</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="full_name"
                  placeholder="(optional)"
                />
              </div>
              <div className="flex items-end">
                <button
                  className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                  type="submit"
                >
                  Send invite
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {profiles.length ? (
          profiles.map((p) => {
            const guardianLink = guardianLinks.find((l) => l.user_id === p.id) ?? null;
            const studentLink = studentLinks.find((l) => l.user_id === p.id) ?? null;

            const linkedGuardian = guardianLink ? guardianById.get(guardianLink.guardian_id) ?? null : null;
            const linkedStudent = studentLink ? studentById.get(studentLink.student_id) ?? null : null;

            return (
              <div key={p.id} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-500">User</div>
                    <div className="mt-1 truncate text-base font-semibold text-slate-900">{p.email ?? "—"}</div>
                    <div className="mt-1 text-sm text-slate-600">{p.full_name ?? "—"}</div>
                    <div className="mt-2 font-mono text-xs text-slate-500">{p.id}</div>
                  </div>

                  <div className="grid w-full gap-4 lg:w-[420px]">
                    <form action={updateRole} className="grid gap-2">
                      <input type="hidden" name="user_id" value={p.id} />
                      <label className="text-sm font-semibold text-slate-900">Role</label>
                      <div className="flex gap-3">
                        <select
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                          name="role"
                          defaultValue={p.role}
                        >
                          <option value="super_admin">super_admin</option>
                          <option value="admin">admin</option>
                          <option value="teacher">teacher</option>
                          <option value="front_desk">front_desk</option>
                          <option value="nurse">nurse</option>
                          <option value="parent">parent</option>
                          <option value="student">student</option>
                        </select>
                        <button
                          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                          type="submit"
                        >
                          Save
                        </button>
                      </div>
                    </form>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold text-slate-500">Linked guardian</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {linkedGuardian ? linkedGuardian.full_name : "—"}
                        </div>
                        <div className="mt-3 grid gap-2">
                          <form action={linkGuardian} className="grid gap-2">
                            <input type="hidden" name="user_id" value={p.id} />
                            <select
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                              name="guardian_id"
                              defaultValue={guardianLink?.guardian_id ?? ""}
                            >
                              <option value="">Select guardian</option>
                              {guardians.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.full_name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
                              type="submit"
                            >
                              Link
                            </button>
                          </form>
                          <form action={unlinkGuardian}>
                            <input type="hidden" name="user_id" value={p.id} />
                            <button
                              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                              type="submit"
                            >
                              Unlink
                            </button>
                          </form>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-semibold text-slate-500">Linked student</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {linkedStudent
                            ? `${linkedStudent.first_name} ${linkedStudent.last_name}`
                            : "—"}
                        </div>
                        <div className="mt-3 grid gap-2">
                          <form action={linkStudent} className="grid gap-2">
                            <input type="hidden" name="user_id" value={p.id} />
                            <select
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                              name="student_id"
                              defaultValue={studentLink?.student_id ?? ""}
                            >
                              <option value="">Select student</option>
                              {students.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.first_name} {s.last_name} ({s.level})
                                </option>
                              ))}
                            </select>
                            <button
                              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
                              type="submit"
                            >
                              Link
                            </button>
                          </form>
                          <form action={unlinkStudent}>
                            <input type="hidden" name="user_id" value={p.id} />
                            <button
                              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                              type="submit"
                            >
                              Unlink
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
            No users found.
          </div>
        )}
      </div>
    </div>
  );
}
