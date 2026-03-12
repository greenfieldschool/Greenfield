import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { CopyButton } from "@/components/copy-button";

type ProfileRow = {
  id: string;
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

type ClassRow = {
  id: string;
  level: string;
  name: string;
};

type TeacherClassAssignmentRow = {
  teacher_id: string;
  class_id: string;
  active: boolean;
  created_at: string;
  classes: ClassRow | null;
  profiles: { id: string; full_name: string | null } | null;
};

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: { q?: string; role?: string; invited?: string; invite_error?: string };
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const query = (searchParams.q ?? "").trim();
  const roleFilter = (searchParams.role ?? "").trim();
  const inviteSuccess = String(searchParams.invited ?? "").trim() === "1";
  const inviteErrorRaw = String(searchParams.invite_error ?? "").trim();
  const inviteError = inviteErrorRaw.length > 0;
  const inviteAlreadyExists = inviteErrorRaw === "exists";
  const inviteHasDetail = inviteErrorRaw !== "1" && inviteErrorRaw !== "exists";

  const cookieStore = cookies();
  const generatedMagicLink = cookieStore.get("admin_generated_magic_link")?.value ?? "";

  const {
    data: { user: currentUser }
  } = await supabase.auth.getUser();

  const { data: currentUserProfile } = currentUser
    ? await supabase.from("profiles").select("role").eq("id", currentUser.id).maybeSingle()
    : { data: null as { role?: string | null } | null };

  const currentRole = (currentUserProfile?.role ?? null) as string | null;
  const canInviteStaff = currentRole === "super_admin" || currentRole === "admin";

  const profilesClient = canInviteStaff ? getSupabaseServiceClient() : null;
  const usingServiceClient = canInviteStaff && !!profilesClient;

  const emailByUserId = new Map<string, string>();
  let listUsersErrorMessage: string | null = null;
  if (usingServiceClient && profilesClient) {
    const { data, error } = await profilesClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    listUsersErrorMessage = error?.message ?? null;
    for (const u of data?.users ?? []) {
      if (u.email) emailByUserId.set(u.id, u.email);
    }
  } else if (currentUser?.id && currentUser.email) {
    emailByUserId.set(currentUser.id, currentUser.email);
  }

  let profilesData: unknown[] | null = null;
  let profilesError: { message: string } | null = null;

  const hasSearch = query.length > 0;
  const hasRoleFilter = roleFilter.length > 0;

  if (hasSearch && usingServiceClient && profilesClient) {
    const q = query.toLowerCase();
    
    // Search by email
    const emailMatchingUserIds = Array.from(emailByUserId.entries())
      .filter(([, email]) => email.toLowerCase().includes(q))
      .map(([id]) => id);

    // Search by name (with optional role filter)
    let nameQuery = (profilesClient ?? supabase)
      .from("profiles")
      .select("id, full_name, role")
      .ilike("full_name", `%${query}%`);
    
    if (hasRoleFilter) {
      nameQuery = nameQuery.eq("role", roleFilter);
    }
    
    const { data: nameMatches } = await nameQuery.limit(100);
    
    const nameMatchingIds = (nameMatches ?? []).map((p: { id: string }) => p.id);
    
    // Combine unique IDs from both searches
    const allMatchingIds = [...new Set([...emailMatchingUserIds, ...nameMatchingIds])];
    
    if (allMatchingIds.length) {
      let finalQuery = (profilesClient ?? supabase)
        .from("profiles")
        .select("id, full_name, role")
        .in("id", allMatchingIds.slice(0, 200));
      
      if (hasRoleFilter) {
        finalQuery = finalQuery.eq("role", roleFilter);
      }
      
      const { data, error } = await finalQuery.order("full_name", { ascending: true });
      profilesData = (data as unknown[]) ?? [];
      profilesError = error ? { message: error.message } : null;
    } else {
      profilesData = [];
      profilesError = null;
    }
  } else if (hasSearch) {
    // Non-admin search by name only
    let searchQuery = supabase
      .from("profiles")
      .select("id, full_name, role")
      .ilike("full_name", `%${query}%`);
    
    if (hasRoleFilter) {
      searchQuery = searchQuery.eq("role", roleFilter);
    }
    
    const { data, error } = await searchQuery
      .order("full_name", { ascending: true })
      .limit(100);
    profilesData = (data as unknown[]) ?? [];
    profilesError = error ? { message: error.message } : null;
  } else if (hasRoleFilter) {
    // Role filter only, no search
    const { data, error } = await (profilesClient ?? supabase)
      .from("profiles")
      .select("id, full_name, role")
      .eq("role", roleFilter)
      .order("full_name", { ascending: true })
      .limit(100);
    profilesData = (data as unknown[]) ?? [];
    profilesError = error ? { message: error.message } : null;
  } else {
    // No search or filter - show recent users
    const { data, error } = await (profilesClient ?? supabase)
      .from("profiles")
      .select("id, full_name, role")
      .order("updated_at", { ascending: false })
      .limit(50);
    profilesData = (data as unknown[]) ?? [];
    profilesError = error ? { message: error.message } : null;
  }

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

  const [{ data: teachersData }, { data: classesData }, { data: teacherClassAssignmentsData }] = canInviteStaff
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "teacher")
          .order("full_name", { ascending: true }),
        supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
        supabase
          .from("teacher_class_assignments")
          .select("teacher_id, class_id, active, created_at, classes(id, level, name), profiles(id, full_name)")
          .eq("active", true)
          .order("created_at", { ascending: false })
      ])
    : [{ data: [] as unknown[] }, { data: [] as unknown[] }, { data: [] as unknown[] }];

  const teacherRows = (teachersData ?? []) as Array<{ id: string; full_name: string | null }>;
  const classRows = (classesData ?? []) as ClassRow[];
  const teacherClassAssignments = (teacherClassAssignmentsData ?? []) as unknown as TeacherClassAssignmentRow[];

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
  const classById = new Map(classRows.map((c) => [c.id, c] as const));
  const teacherById = new Map(teacherRows.map((t) => [t.id, t] as const));

  async function setQuery(formData: FormData) {
    "use server";

    const q = String(formData.get("q") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();
    
    const params = new URLSearchParams();
    if (q.length) params.set("q", q);
    if (role.length) params.set("role", role);
    
    const queryString = params.toString();
    redirect(queryString.length ? `/admin/users?${queryString}` : "/admin/users");
  }

  async function updateRole(formData: FormData) {
    "use server";

    if (!canInviteStaff) return;

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

  async function updateUserFullName(formData: FormData) {
    "use server";

    if (!canInviteStaff) return;

    const userId = String(formData.get("user_id") ?? "").trim();
    const fullNameRaw = String(formData.get("full_name") ?? "").trim();

    if (!userId) return;

    const fullName = fullNameRaw.length ? fullNameRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);

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
      return;
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
      const errorDetail = inviteError?.message ? encodeURIComponent(inviteError.message.slice(0, 200)) : "";
      redirect(
        `/admin/users?q=${encodeURIComponent(email)}&invite_error=${isAlready ? "exists" : errorDetail || "1"}`
      );
    }

    await service
      .from("profiles")
      .update({
        role,
        email,
        full_name: fullName.length ? fullName : null
      })
      .eq("id", inviteResult.user.id);

    revalidatePath("/admin/users");
    redirect(`/admin/users?q=${encodeURIComponent(email)}&invited=1`);
  }

  async function generateMagicLink(formData: FormData) {
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
      return;
    }

    const serviceClient = service;

    async function resolveUserIdByEmail(targetEmail: string) {
      const { data, error } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return null;
      const match = (data?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === targetEmail.toLowerCase());
      return match?.id ?? null;
    }

    const h = headers();
    const forwardedHost = h.get("x-forwarded-host");
    const host = forwardedHost ?? h.get("host");
    const forwardedProto = h.get("x-forwarded-proto");
    const inferredProto = host?.includes("localhost") || host?.includes("127.0.0.1") ? "http" : "https";
    const proto = forwardedProto ?? inferredProto;
    const origin = host ? `${proto}://${host}` : "";
    const redirectTo = origin ? `${origin}/auth/finish?next=${encodeURIComponent("/auth/set-password")}` : undefined;

    const created = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: fullName.length ? { full_name: fullName } : undefined
    });

    if (created.error) {
      const message = created.error.message.toLowerCase();
      const already = message.includes("already") || message.includes("exists") || message.includes("registered");
      if (!already) {
        const errorDetail = created.error?.message ? encodeURIComponent(created.error.message.slice(0, 200)) : "";
        redirect(`/admin/users?q=${encodeURIComponent(email)}&invite_error=${errorDetail || "1"}`);
      }
    }

    const userId = created.data?.user?.id ?? (await resolveUserIdByEmail(email));
    if (!userId) {
      redirect(`/admin/users?q=${encodeURIComponent(email)}&invite_error=${encodeURIComponent("Could not resolve user id")}`);
    }

    await serviceClient
      .from("profiles")
      .update({ role, email, full_name: fullName.length ? fullName : null })
      .eq("id", userId);

    const linkResult = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo }
    });

    const actionLink = linkResult.data?.properties?.action_link ?? null;
    if (linkResult.error || !actionLink) {
      const errorDetail = linkResult.error?.message ? encodeURIComponent(linkResult.error.message.slice(0, 200)) : "";
      redirect(`/admin/users?q=${encodeURIComponent(email)}&invite_error=${errorDetail || "1"}`);
    }

    const cookieStore = cookies();
    cookieStore.set("admin_generated_magic_link", actionLink, {
      httpOnly: true,
      sameSite: "lax",
      secure: proto === "https",
      maxAge: 60 * 5,
      path: "/admin/users"
    });

    revalidatePath("/admin/users");
    redirect(`/admin/users?q=${encodeURIComponent(email)}`);
  }

  async function assignTeacherClass(formData: FormData) {
    "use server";

    const teacherId = String(formData.get("teacher_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();

    if (!teacherId || !classId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/admin/login");
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (profile as { role?: string } | null)?.role ?? null;
    const isAllowed = role === "super_admin" || role === "admin";
    if (!isAllowed) {
      redirect("/admin/users");
    }

    await supabase
      .from("teacher_class_assignments")
      .upsert({ teacher_id: teacherId, class_id: classId, active: true }, { onConflict: "teacher_id,class_id" });

    revalidatePath("/admin/users");
    redirect("/admin/users");
  }

  async function removeTeacherClass(formData: FormData) {
    "use server";

    const teacherId = String(formData.get("teacher_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();

    if (!teacherId || !classId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/admin/login");
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (profile as { role?: string } | null)?.role ?? null;
    const isAllowed = role === "super_admin" || role === "admin";
    if (!isAllowed) {
      redirect("/admin/users");
    }

    await supabase
      .from("teacher_class_assignments")
      .update({ active: false })
      .eq("teacher_id", teacherId)
      .eq("class_id", classId);

    revalidatePath("/admin/users");
    redirect("/admin/users");
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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "admin":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "teacher":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "front_desk":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "nurse":
        return "bg-pink-100 text-pink-800 border-pink-200";
      case "parent":
        return "bg-cyan-100 text-cyan-800 border-cyan-200";
      case "student":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  const staffCount = profiles.filter((p) => ["super_admin", "admin", "teacher", "front_desk", "nurse"].includes(p.role)).length;
  const parentCount = profiles.filter((p) => p.role === "parent").length;
  const studentCount = profiles.filter((p) => p.role === "student").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">User Management</h1>
            <p className="mt-2 text-sm text-slate-600">
              Invite staff, manage roles, and link users to guardians or students.
            </p>
            
            {/* Stats */}
            <div className="mt-4 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-slate-700">{staffCount} Staff</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-cyan-500" />
                <span className="text-sm font-medium text-slate-700">{parentCount} Parents</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-indigo-500" />
                <span className="text-sm font-medium text-slate-700">{studentCount} Students</span>
              </div>
            </div>
          </div>

          {/* Search */}
          <form action={setQuery} className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row">
            <div className="flex flex-1 gap-2">
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green lg:w-64"
                name="q"
                placeholder="Search by email or name..."
                defaultValue={query}
              />
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="role"
                defaultValue={roleFilter}
              >
                <option value="">All roles</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="teacher">Teacher</option>
                <option value="front_desk">Front Desk</option>
                <option value="nurse">Nurse</option>
                <option value="parent">Parent</option>
                <option value="student">Student</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                type="submit"
              >
                Search
              </button>
              {(query.length > 0 || roleFilter.length > 0) ? (
                <a
                  href="/admin/users"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </a>
              ) : null}
            </div>
          </form>
        </div>

        {/* Notifications */}
        {inviteSuccess ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span className="font-semibold">✓ Invite sent</span>{query.length ? ` to ${query}` : ""}. The staff member should check their email and set a password.
          </div>
        ) : null}

        {inviteError ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <span className="font-semibold">✗ Error:</span> {inviteAlreadyExists
              ? "That email already has an account or pending invite."
              : "Could not send invite. Check Supabase email settings."}
          </div>
        ) : null}

        {canInviteStaff && inviteHasDetail ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <span className="font-semibold">Supabase error:</span> {decodeURIComponent(inviteErrorRaw)}
          </div>
        ) : null}

        {!canInviteStaff ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You are signed in as <span className="font-semibold">{currentRole ?? "unknown"}</span>. Contact an admin for elevated access.
          </div>
        ) : null}
      </div>

      {/* Diagnostics (only when empty) */}
      {canInviteStaff && profiles.length === 0 ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          <div className="font-semibold">User list is empty — diagnostics</div>
          <div className="mt-3 grid gap-2 text-amber-900">
            <div>Role: <span className="font-semibold">{currentRole ?? "unknown"}</span></div>
            <div>Service client: <span className="font-semibold">{usingServiceClient ? "enabled" : "not enabled"}</span></div>
            {!usingServiceClient && <div>Check env var <code className="rounded bg-amber-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code></div>}
            {listUsersErrorMessage && <div>listUsers error: <span className="font-semibold">{listUsersErrorMessage}</span></div>}
            {profilesError && <div>Supabase error: <span className="font-semibold">{profilesError.message}</span></div>}
          </div>
        </div>
      ) : null}

      {/* Admin Actions Panel */}
      {canInviteStaff ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Invite Staff Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-green/10">
                <svg className="h-5 w-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Invite Staff</h2>
                <p className="text-xs text-slate-500">Send email invite with role</p>
              </div>
            </div>
            <form action={inviteStaff} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">Email</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name="email"
                    placeholder="staff@school.com"
                    required
                    type="email"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Full name</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name="full_name"
                    placeholder="(optional)"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Role</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name="role"
                    defaultValue="teacher"
                  >
                    <option value="admin">Admin</option>
                    <option value="teacher">Teacher</option>
                    <option value="front_desk">Front Desk</option>
                    <option value="nurse">Nurse</option>
                  </select>
                </div>
              </div>
              <button
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95"
                type="submit"
              >
                Send Invite
              </button>
            </form>
          </div>

          {/* Generate Magic Link Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Generate Login Link</h2>
                <p className="text-xs text-slate-500">Manual link (no email sent)</p>
              </div>
            </div>
            <form action={generateMagicLink} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-600">Email</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name="email"
                    placeholder="staff@school.com"
                    required
                    type="email"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Full name</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name="full_name"
                    placeholder="(optional)"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Role</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name="role"
                    defaultValue="teacher"
                  >
                    <option value="admin">Admin</option>
                    <option value="teacher">Teacher</option>
                    <option value="front_desk">Front Desk</option>
                    <option value="nurse">Nurse</option>
                  </select>
                </div>
              </div>
              <button
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                type="submit"
              >
                Generate Link
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Teacher Class Assignments */}
      {canInviteStaff ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Teacher Class Assignments</h2>
              <p className="text-xs text-slate-500">Assign teachers to classes for access control</p>
            </div>
          </div>

          <form action={assignTeacherClass} className="mt-5 grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Teacher</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="teacher_id"
                defaultValue=""
                required
              >
                <option value="">Select teacher...</option>
                {teacherRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name ?? t.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Class</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="class_id"
                defaultValue=""
                required
              >
                <option value="">Select class...</option>
                {classRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                type="submit"
              >
                Assign
              </button>
            </div>
          </form>

          {teacherClassAssignments.length ? (
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid grid-cols-12 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div className="col-span-5">Teacher</div>
                <div className="col-span-5">Class</div>
                <div className="col-span-2 text-right">Action</div>
              </div>
              {teacherClassAssignments.map((a) => {
                const teacher = a.profiles ?? teacherById.get(a.teacher_id) ?? null;
                const cls = a.classes ?? classById.get(a.class_id) ?? null;
                return (
                  <div key={`${a.teacher_id}-${a.class_id}`} className="grid grid-cols-12 items-center border-t border-slate-100 px-4 py-3 text-sm hover:bg-slate-50">
                    <div className="col-span-5 font-medium text-slate-900">{teacher?.full_name ?? a.teacher_id}</div>
                    <div className="col-span-5 text-slate-600">{cls ? `${cls.level} - ${cls.name}` : a.class_id}</div>
                    <div className="col-span-2 flex justify-end">
                      <form action={removeTeacherClass}>
                        <input type="hidden" name="teacher_id" value={a.teacher_id} />
                        <input type="hidden" name="class_id" value={a.class_id} />
                        <button
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                          type="submit"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No teacher assignments yet. Assign teachers above.
            </div>
          )}
        </div>
      ) : null}

      {canInviteStaff && generatedMagicLink.length ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900 shadow-sm">
          <div className="font-semibold">Magic link generated</div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="break-all font-mono text-xs">{generatedMagicLink}</div>
            <div className="shrink-0">
              <CopyButton text={generatedMagicLink} />
            </div>
          </div>
          <div className="mt-2 text-xs text-emerald-900">
            This link is sensitive. Share it only with the intended recipient.
          </div>
        </div>
      ) : null}

      {/* Users List */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Users</h2>
            {query.length ? (
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                Search: &quot;{query}&quot;
              </span>
            ) : null}
            {roleFilter.length ? (
              <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${getRoleBadgeColor(roleFilter)}`}>
                {roleFilter.replace("_", " ")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {profiles.length} user{profiles.length !== 1 ? "s" : ""} found
            {!query.length && !roleFilter.length ? " (showing recent)" : ""}
          </p>
        </div>

        {profiles.length ? (
          <div className="divide-y divide-slate-100">
            {profiles.map((p) => {
              const guardianLink = guardianLinks.find((l) => l.user_id === p.id) ?? null;
              const studentLink = studentLinks.find((l) => l.user_id === p.id) ?? null;

              const linkedGuardian = guardianLink ? guardianById.get(guardianLink.guardian_id) ?? null : null;
              const linkedStudent = studentLink ? studentById.get(studentLink.student_id) ?? null : null;

              const isStaff = ["super_admin", "admin", "teacher", "front_desk", "nurse"].includes(p.role);

              return (
                <div key={p.id} className="p-6 hover:bg-slate-50/50">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
                    {/* User Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-lg font-semibold text-slate-600">
                          {(p.full_name ?? emailByUserId.get(p.id) ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-base font-semibold text-slate-900">
                              {p.full_name ?? "No name"}
                            </span>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getRoleBadgeColor(p.role)}`}>
                              {p.role.replace("_", " ")}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-sm text-slate-500">
                            {emailByUserId.get(p.id) ?? "No email"}
                          </div>
                        </div>
                      </div>
                      
                      {/* Quick Info Tags */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {linkedGuardian ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Guardian: {linkedGuardian.full_name}
                          </span>
                        ) : null}
                        {linkedStudent ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            Student: {linkedStudent.first_name} {linkedStudent.last_name}
                          </span>
                        ) : null}
                        {!linkedGuardian && !linkedStudent && !isStaff ? (
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Not linked
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 font-mono text-[10px] text-slate-400">{p.id}</div>
                    </div>

                    {/* Actions */}
                    <div className="grid w-full gap-4 xl:w-[480px]">
                      {/* Name Editor */}
                      {canInviteStaff ? (
                        <form action={updateUserFullName} className="flex items-end gap-2">
                          <input type="hidden" name="user_id" value={p.id} />
                          <div className="flex-1">
                            <label className="text-xs font-semibold text-slate-600">Full name</label>
                            <input
                              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                              name="full_name"
                              defaultValue={p.full_name ?? ""}
                              placeholder="(optional)"
                            />
                          </div>
                          <button
                            className="rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
                            type="submit"
                          >
                            Save
                          </button>
                        </form>
                      ) : null}

                      {/* Role Selector */}
                      <form action={updateRole} className="flex items-end gap-2">
                        <input type="hidden" name="user_id" value={p.id} />
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-slate-600">Change role</label>
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                            name="role"
                            defaultValue={p.role}
                          >
                            <option value="super_admin">Super Admin</option>
                            <option value="admin">Admin</option>
                            <option value="teacher">Teacher</option>
                            <option value="front_desk">Front Desk</option>
                            <option value="nurse">Nurse</option>
                            <option value="parent">Parent</option>
                            <option value="student">Student</option>
                          </select>
                        </div>
                        <button
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                          type="submit"
                        >
                          Update
                        </button>
                      </form>

                      {/* Link Controls */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {/* Guardian Link */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">Guardian Link</span>
                            {linkedGuardian ? (
                              <form action={unlinkGuardian}>
                                <input type="hidden" name="user_id" value={p.id} />
                                <button className="text-xs font-medium text-red-600 hover:text-red-700" type="submit">
                                  Unlink
                                </button>
                              </form>
                            ) : null}
                          </div>
                          <form action={linkGuardian} className="mt-2 flex gap-2">
                            <input type="hidden" name="user_id" value={p.id} />
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-green"
                              name="guardian_id"
                              defaultValue={guardianLink?.guardian_id ?? ""}
                            >
                              <option value="">Select...</option>
                              {guardians.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.full_name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="shrink-0 rounded-lg bg-brand-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95"
                              type="submit"
                            >
                              Link
                            </button>
                          </form>
                        </div>

                        {/* Student Link */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">Student Link</span>
                            {linkedStudent ? (
                              <form action={unlinkStudent}>
                                <input type="hidden" name="user_id" value={p.id} />
                                <button className="text-xs font-medium text-red-600 hover:text-red-700" type="submit">
                                  Unlink
                                </button>
                              </form>
                            ) : null}
                          </div>
                          <form action={linkStudent} className="mt-2 flex gap-2">
                            <input type="hidden" name="user_id" value={p.id} />
                            <select
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-green"
                              name="student_id"
                              defaultValue={studentLink?.student_id ?? ""}
                            >
                              <option value="">Select...</option>
                              {students.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.first_name} {s.last_name} ({s.level})
                                </option>
                              ))}
                            </select>
                            <button
                              className="shrink-0 rounded-lg bg-brand-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95"
                              type="submit"
                            >
                              Link
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">No users found</h3>
            <p className="mt-1 text-sm text-slate-500">
              {query.length ? "Try a different search term." : "Invite staff to get started."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
