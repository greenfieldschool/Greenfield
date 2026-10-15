import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { CopyButton } from "@/components/copy-button";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import {
  AlertTriangle,
  BookOpen,
  Briefcase,
  GraduationCap,
  Link as LinkIcon,
  Mail,
  School,
  Search,
  UserPlus,
  UserRound,
  Users
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { safeFilterTerm } from "@/lib/postgrest";

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
  class_id: string | null;
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
  searchParams: { q?: string; role?: string; toast?: string; toast_type?: string; invited?: string; invite_error?: string };
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const query = (searchParams.q ?? "").trim();
  const safeQuery = safeFilterTerm(query);
  const roleFilter = (searchParams.role ?? "").trim();

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
    const perPage = 1000;
    for (let page = 1; page <= MAX_AUTH_USER_PAGES; page += 1) {
      const { data, error } = await profilesClient.auth.admin.listUsers({ page, perPage });
      if (error) {
        listUsersErrorMessage = error.message;
        break;
      }
      const batch = data?.users ?? [];
      for (const u of batch) {
        if (u.email) emailByUserId.set(u.id, u.email);
      }
      if (batch.length < perPage) break;
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
      .ilike("full_name", `%${safeQuery}%`);
    
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
      .ilike("full_name", `%${safeQuery}%`);
    
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
    .select("id, first_name, last_name, level, class_id")
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

    if (!canInviteStaff) {
      redirect(usersToast("You do not have permission to change roles"));
    }

    const userId = String(formData.get("user_id") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();

    if (!userId || !role) {
      redirect(usersToast("Pick a role to update"));
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(`/admin/users?toast=${encodeURIComponent("Server error — could not update role")}&toast_type=error`);
    }

    if (!(await isAdminUser(supabase))) {
      redirect(usersToast("You do not have permission to change roles"));
    }

    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) {
      redirect(usersToast(error.message));
    }

    revalidatePath("/admin/users");
    redirect(`/admin/users?toast=${encodeURIComponent("Role updated successfully")}&toast_type=success`);
  }

  async function updateUserFullName(formData: FormData) {
    "use server";

    if (!canInviteStaff) {
      redirect(usersToast("You do not have permission to edit users"));
    }

    const userId = String(formData.get("user_id") ?? "").trim();
    const fullNameRaw = String(formData.get("full_name") ?? "").trim();

    if (!userId) {
      redirect(usersToast("Missing user — reload and try again"));
    }

    const fullName = fullNameRaw.length ? fullNameRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(usersToast("Server error — could not save name"));
    }

    if (!(await isAdminUser(supabase))) {
      redirect(usersToast("You do not have permission to edit users"));
    }

    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
    if (error) {
      redirect(usersToast(error.message));
    }

    revalidatePath("/admin/users");
  }

  async function inviteStaff(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();

    if (!email || !role) {
      redirect(`/admin/users?toast=${encodeURIComponent("Email and role are required")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(usersToast("Server error — Supabase is not configured"));
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(`/admin/users?toast=${encodeURIComponent("You must be logged in")}&toast_type=error`);
    }

    const { data: inviterProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const inviterRole = (inviterProfile?.role ?? null) as string | null;
    const isAllowed = inviterRole === "super_admin" || inviterRole === "admin";
    if (!isAllowed) {
      redirect(`/admin/users?toast=${encodeURIComponent("You do not have permission to invite staff")}&toast_type=error`);
    }

    const service = getSupabaseServiceClient();
    if (!service) {
      redirect(`/admin/users?toast=${encodeURIComponent("Service client unavailable — check server config")}&toast_type=error`);
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
      const detail = inviteError?.message ?? "Could not send invite. Check Supabase email settings.";
      redirect(
        `/admin/users?q=${encodeURIComponent(email)}&toast=${encodeURIComponent(isAlready ? "That email already has an account or pending invite." : detail)}&toast_type=error`
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
    redirect(`/admin/users?q=${encodeURIComponent(email)}&toast=${encodeURIComponent(`Invite sent to ${email}. They should check their email.`)}&toast_type=success`);
  }

  async function generateMagicLink(formData: FormData) {
    "use server";

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim();

    if (!email || !role) {
      redirect(`/admin/users?toast=${encodeURIComponent("Email and role are required")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(usersToast("Server error — Supabase is not configured"));
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(`/admin/users?toast=${encodeURIComponent("You must be logged in")}&toast_type=error`);
    }

    const { data: inviterProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const inviterRole = (inviterProfile?.role ?? null) as string | null;
    const isAllowed = inviterRole === "super_admin" || inviterRole === "admin";
    if (!isAllowed) {
      redirect(`/admin/users?toast=${encodeURIComponent("You do not have permission to do this")}&toast_type=error`);
    }

    const service = getSupabaseServiceClient();
    if (!service) {
      redirect(`/admin/users?toast=${encodeURIComponent("Service client unavailable")}&toast_type=error`);
      return;
    }

    const serviceClient = service;

    async function resolveUserIdByEmail(targetEmail: string) {
      const perPage = 1000;
      for (let page = 1; page <= MAX_AUTH_USER_PAGES; page += 1) {
        const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
        if (error) return null;
        const batch = data?.users ?? [];
        const match = batch.find((u) => (u.email ?? "").toLowerCase() === targetEmail.toLowerCase());
        if (match) return match.id;
        if (batch.length < perPage) break;
      }
      return null;
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
        const detail = created.error?.message ?? "Could not create account";
        redirect(`/admin/users?q=${encodeURIComponent(email)}&toast=${encodeURIComponent(detail)}&toast_type=error`);
      }
    }

    const userId = created.data?.user?.id ?? (await resolveUserIdByEmail(email));
    if (!userId) {
      redirect(`/admin/users?q=${encodeURIComponent(email)}&toast=${encodeURIComponent("Could not resolve user ID — try again")}&toast_type=error`);
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
      const detail = linkResult.error?.message ?? "Failed to generate magic link";
      redirect(`/admin/users?q=${encodeURIComponent(email)}&toast=${encodeURIComponent(detail)}&toast_type=error`);
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
    redirect(`/admin/users?q=${encodeURIComponent(email)}&toast=${encodeURIComponent("Magic link generated — use Copy to copy it")}&toast_type=success`);
  }

  async function assignTeacherClass(formData: FormData) {
    "use server";

    const teacherId = String(formData.get("teacher_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();

    if (!teacherId || !classId) {
      redirect(usersToast("Pick a teacher and a class"));
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(usersToast("Server error — Supabase is not configured"));
    }

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
      redirect(usersToast("You do not have permission to assign classes"));
    }

    const { error } = await supabase
      .from("teacher_class_assignments")
      .upsert({ teacher_id: teacherId, class_id: classId, active: true }, { onConflict: "teacher_id,class_id" });
    if (error) {
      redirect(usersToast(error.message));
    }

    revalidatePath("/admin/users");
    redirect(usersToast("Teacher assigned to class", "success"));
  }

  async function removeTeacherClass(formData: FormData) {
    "use server";

    const teacherId = String(formData.get("teacher_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();

    if (!teacherId || !classId) {
      redirect(usersToast("Pick a teacher and a class"));
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(usersToast("Server error — Supabase is not configured"));
    }

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
      redirect(usersToast("You do not have permission to change class assignments"));
    }

    const { error } = await supabase
      .from("teacher_class_assignments")
      .update({ active: false })
      .eq("teacher_id", teacherId)
      .eq("class_id", classId);
    if (error) {
      redirect(usersToast(error.message));
    }

    revalidatePath("/admin/users");
    redirect(usersToast("Class assignment removed", "success"));
  }

  async function linkGuardian(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") ?? "").trim();
    const guardianId = String(formData.get("guardian_id") ?? "").trim();

    if (!userId || !guardianId) {
      redirect(usersToast("Pick a guardian to link"));
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(usersToast("Server error — Supabase is not configured"));
    }

    if (!(await isAdminUser(supabase))) {
      redirect(usersToast("You do not have permission to link accounts"));
    }

    const { error } = await supabase
      .from("guardian_user_links")
      .upsert({ user_id: userId, guardian_id: guardianId }, { onConflict: "user_id" });
    if (error) {
      redirect(usersToast(error.message));
    }

    revalidatePath("/admin/users");
  }

  async function linkStudent(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") ?? "").trim();
    const studentId = String(formData.get("student_id") ?? "").trim();

    if (!userId || !studentId) {
      redirect(usersToast("Pick a student to link"));
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(usersToast("Server error — Supabase is not configured"));
    }

    if (!(await isAdminUser(supabase))) {
      redirect(usersToast("You do not have permission to link accounts"));
    }

    const { error } = await supabase
      .from("student_user_links")
      .upsert({ user_id: userId, student_id: studentId }, { onConflict: "user_id" });
    if (error) {
      redirect(usersToast(error.message));
    }

    revalidatePath("/admin/users");
  }

  async function unlinkGuardian(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") ?? "").trim();
    if (!userId) {
      redirect(usersToast("Missing user — reload and try again"));
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(usersToast("Server error — Supabase is not configured"));
    }

    if (!(await isAdminUser(supabase))) {
      redirect(usersToast("You do not have permission to unlink accounts"));
    }

    const { error } = await supabase.from("guardian_user_links").delete().eq("user_id", userId);
    if (error) {
      redirect(usersToast(error.message));
    }

    revalidatePath("/admin/users");
  }

  async function unlinkStudent(formData: FormData) {
    "use server";

    const userId = String(formData.get("user_id") ?? "").trim();
    if (!userId) {
      redirect(usersToast("Missing user — reload and try again"));
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(usersToast("Server error — Supabase is not configured"));
    }

    if (!(await isAdminUser(supabase))) {
      redirect(usersToast("You do not have permission to unlink accounts"));
    }

    const { error } = await supabase.from("student_user_links").delete().eq("user_id", userId);
    if (error) {
      redirect(usersToast(error.message));
    }

    revalidatePath("/admin/users");
  }

  const staffCount = profiles.filter((p) => ["super_admin", "admin", "teacher", "front_desk", "nurse"].includes(p.role)).length;
  const parentCount = profiles.filter((p) => p.role === "parent").length;
  const studentCount = profiles.filter((p) => p.role === "student").length;

  const staffRoleOptions = (
    <>
      <option value="admin">Admin</option>
      <option value="teacher">Teacher</option>
      <option value="front_desk">Front Desk</option>
      <option value="nurse">Nurse</option>
    </>
  );

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Admin"
        title="User Management"
        description="Invite staff, manage roles, and link users to guardians or students."
        actions={
          canInviteStaff ? (
            <a href="#invite-staff" className={buttonClasses({ variant: "primary" })}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Invite staff
            </a>
          ) : undefined
        }
      />

      {!canInviteStaff ? (
        <Alert tone="warning">
          You are signed in as <span className="font-semibold">{currentRole ?? "unknown"}</span>. Contact an admin for elevated access.
        </Alert>
      ) : null}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Staff" value={staffCount} hint="In the list below" icon={Briefcase} tone="green" />
        <StatCard label="Parents" value={parentCount} hint="In the list below" icon={Users} tone="blue" />
        <StatCard label="Students" value={studentCount} hint="In the list below" icon={GraduationCap} tone="violet" />
      </div>

      {/* Search */}
      <Card>
        <CardBody className="py-4">
          <form action={setQuery} className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label htmlFor="users-q" className="gf-label">
                Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="users-q"
                  className="gf-input pl-10"
                  name="q"
                  placeholder="Search by email or name..."
                  defaultValue={query}
                />
              </div>
            </div>
            <div className="md:w-52">
              <label htmlFor="users-role" className="gf-label">
                Role
              </label>
              <select id="users-role" className="gf-select" name="role" defaultValue={roleFilter}>
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
              <SubmitButton variant="primary" pendingText="Searching…" showSpinner={false}>
                Search
              </SubmitButton>
              {query.length > 0 || roleFilter.length > 0 ? (
                <a href="/admin/users" className={buttonClasses({ variant: "secondary" })}>
                  Clear
                </a>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Diagnostics (only when empty) */}
      {canInviteStaff && profiles.length === 0 ? (
        <Alert tone="warning" title="User list is empty — diagnostics">
          <div className="mt-1 grid gap-1">
            <div>
              Role: <span className="font-semibold">{currentRole ?? "unknown"}</span>
            </div>
            <div>
              Service client: <span className="font-semibold">{usingServiceClient ? "enabled" : "not enabled"}</span>
            </div>
            {!usingServiceClient && (
              <div>
                Check env var <code className="rounded bg-brand-gold-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code>
              </div>
            )}
            {listUsersErrorMessage && (
              <div>
                listUsers error: <span className="font-semibold">{listUsersErrorMessage}</span>
              </div>
            )}
            {profilesError && (
              <div>
                Supabase error: <span className="font-semibold">{profilesError.message}</span>
              </div>
            )}
          </div>
        </Alert>
      ) : null}

      {canInviteStaff && generatedMagicLink.length ? (
        <Alert tone="success" title="Magic link generated">
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 break-all rounded-lg bg-white/70 px-3 py-2 font-mono text-xs ring-1 ring-inset ring-brand-green-200">
              {generatedMagicLink}
            </div>
            <div className="shrink-0">
              <CopyButton text={generatedMagicLink} />
            </div>
          </div>
          <div className="mt-2 text-xs">This link is sensitive. Share it only with the intended recipient.</div>
        </Alert>
      ) : null}

      {/* Admin Actions Panel */}
      {canInviteStaff ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={inviteStaff} id="invite-staff" className="scroll-mt-24">
            <FormSection
              className="h-full"
              title={
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
                  Invite Staff
                </span>
              }
              description="Send email invite with role"
              footer={
                <SubmitButton variant="primary" pendingText="Sending…">
                  Send Invite
                </SubmitButton>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="invite-email" required className="sm:col-span-2">
                  <input id="invite-email" className="gf-input" name="email" placeholder="staff@school.com" required type="email" />
                </Field>
                <Field label="Full name" htmlFor="invite-full-name">
                  <input id="invite-full-name" className="gf-input" name="full_name" placeholder="(optional)" />
                </Field>
                <Field label="Role" htmlFor="invite-role">
                  <select id="invite-role" className="gf-select" name="role" defaultValue="teacher">
                    {staffRoleOptions}
                  </select>
                </Field>
              </div>
            </FormSection>
          </form>

          <form action={generateMagicLink}>
            <FormSection
              className="h-full"
              title={
                <span className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-brand-gold-700" aria-hidden="true" />
                  Generate Login Link
                </span>
              }
              description="Manual link (no email sent)"
              footer={
                <SubmitButton variant="secondary" pendingText="Generating…" showSpinner={false}>
                  Generate Link
                </SubmitButton>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="magic-email" required className="sm:col-span-2">
                  <input id="magic-email" className="gf-input" name="email" placeholder="staff@school.com" required type="email" />
                </Field>
                <Field label="Full name" htmlFor="magic-full-name">
                  <input id="magic-full-name" className="gf-input" name="full_name" placeholder="(optional)" />
                </Field>
                <Field label="Role" htmlFor="magic-role">
                  <select id="magic-role" className="gf-select" name="role" defaultValue="teacher">
                    {staffRoleOptions}
                  </select>
                </Field>
              </div>
            </FormSection>
          </form>
        </div>
      ) : null}

      {/* Teacher Class Assignments */}
      {canInviteStaff ? (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <School className="h-4 w-4 text-sky-600" aria-hidden="true" />
                Teacher Class Assignments
              </span>
            }
            description="Assign teachers to classes for access control"
          />
          <CardBody className="border-b border-slate-100">
            <form action={assignTeacherClass} className="grid gap-4 sm:grid-cols-[2fr_1.5fr_auto] sm:items-end">
              <Field label="Teacher" htmlFor="assign-teacher">
                <select id="assign-teacher" className="gf-select" name="teacher_id" defaultValue="" required>
                  <option value="">Select teacher...</option>
                  {teacherRows.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name ?? t.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Class" htmlFor="assign-class">
                <select id="assign-class" className="gf-select" name="class_id" defaultValue="" required>
                  <option value="">Select class...</option>
                  {classRows.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.level} - {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <SubmitButton variant="primary" pendingText="Assigning…">
                Assign
              </SubmitButton>
            </form>
          </CardBody>

          {teacherClassAssignments.length ? (
            <div className="gf-table-wrap">
              <table className="gf-table min-w-[480px]">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Class</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherClassAssignments.map((a) => {
                    const teacher = a.profiles ?? teacherById.get(a.teacher_id) ?? null;
                    const cls = a.classes ?? classById.get(a.class_id) ?? null;
                    return (
                      <tr key={`${a.teacher_id}-${a.class_id}`}>
                        <td className="font-medium text-slate-900">{teacher?.full_name ?? a.teacher_id}</td>
                        <td>{cls ? `${cls.level} - ${cls.name}` : a.class_id}</td>
                        <td className="text-right">
                          <form action={removeTeacherClass} className="inline-flex">
                            <input type="hidden" name="teacher_id" value={a.teacher_id} />
                            <input type="hidden" name="class_id" value={a.class_id} />
                            <SubmitButton
                              className={buttonClasses({
                                variant: "ghost",
                                size: "sm",
                                className: "text-red-600 hover:bg-red-50 hover:text-red-700"
                              })}
                              pendingText="Removing…"
                              showSpinner={false}
                            >
                              Remove
                            </SubmitButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={School} title="No teacher assignments yet." description="Assign teachers above." />
          )}
        </Card>
      ) : null}

      {/* Users List */}
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Users
              {query.length ? <Badge tone="slate">Search: &quot;{query}&quot;</Badge> : null}
              {roleFilter.length ? <Badge tone={roleTone(roleFilter)}>{roleFilter.replace("_", " ")}</Badge> : null}
            </span>
          }
          description={`${profiles.length} user${profiles.length !== 1 ? "s" : ""} found${
            !query.length && !roleFilter.length ? " (showing recent)" : ""
          }`}
        />

        {profiles.length ? (
          <ul className="divide-y divide-slate-100">
            {profiles.map((p) => {
              const guardianLink = guardianLinks.find((l) => l.user_id === p.id) ?? null;
              const studentLink = studentLinks.find((l) => l.user_id === p.id) ?? null;

              const linkedGuardian = guardianLink ? guardianById.get(guardianLink.guardian_id) ?? null : null;
              const linkedStudent = studentLink ? studentById.get(studentLink.student_id) ?? null : null;

              const isStaff = ["super_admin", "admin", "teacher", "front_desk", "nurse"].includes(p.role);
              const studentNeedsLink = p.role === "student" && !linkedStudent;

              return (
                <li key={p.id} className="px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
                    {/* User Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.full_name ?? emailByUserId.get(p.id) ?? "?"} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">{p.full_name ?? "No name"}</span>
                            <Badge tone={roleTone(p.role)} className="capitalize">
                              {p.role.replace("_", " ")}
                            </Badge>
                          </div>
                          <div className="mt-0.5 truncate text-sm text-slate-500">{emailByUserId.get(p.id) ?? "No email"}</div>
                        </div>
                      </div>

                      {/* Quick Info Tags */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {linkedGuardian ? (
                          <Badge tone="blue">
                            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                            Guardian: {linkedGuardian.full_name}
                          </Badge>
                        ) : null}
                        {linkedStudent ? (
                          <Badge tone="violet">
                            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            Student: {linkedStudent.first_name} {linkedStudent.last_name} ({linkedStudent.level}
                            {linkedStudent.class_id && classById.has(linkedStudent.class_id)
                              ? ` - ${classById.get(linkedStudent.class_id)!.name}`
                              : ""}
                            )
                          </Badge>
                        ) : null}
                        {!linkedGuardian && !linkedStudent && !isStaff ? (
                          <Badge tone="gold">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            Not linked
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mt-2 break-all font-mono text-[10px] text-slate-400">{p.id}</div>
                    </div>

                    {/* Actions */}
                    <div className="grid w-full gap-3 xl:w-[500px]">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {/* Name Editor */}
                        {canInviteStaff ? (
                          <form action={updateUserFullName} className="flex items-end gap-2">
                            <input type="hidden" name="user_id" value={p.id} />
                            <div className="min-w-0 flex-1">
                              <label htmlFor={`fn-${p.id}`} className="gf-label text-xs">
                                Full name
                              </label>
                              <input
                                id={`fn-${p.id}`}
                                className="gf-input py-2"
                                name="full_name"
                                defaultValue={p.full_name ?? ""}
                                placeholder="(optional)"
                              />
                            </div>
                            <SubmitButton variant="secondary" pendingText="Saving…">
                              Save
                            </SubmitButton>
                          </form>
                        ) : null}

                        {/* Role Selector */}
                        {canInviteStaff ? (
                          <form action={updateRole} className="flex items-end gap-2">
                            <input type="hidden" name="user_id" value={p.id} />
                            <div className="min-w-0 flex-1">
                              <label htmlFor={`role-${p.id}`} className="gf-label text-xs">
                                Change role
                              </label>
                              <select id={`role-${p.id}`} className="gf-select py-2" name="role" defaultValue={p.role}>
                                <option value="super_admin">Super Admin</option>
                                <option value="admin">Admin</option>
                                <option value="teacher">Teacher</option>
                                <option value="front_desk">Front Desk</option>
                                <option value="nurse">Nurse</option>
                                <option value="parent">Parent</option>
                                <option value="student">Student</option>
                              </select>
                            </div>
                            <SubmitButton variant="secondary" pendingText="Updating…">
                              Update
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>

                      {/* Link Controls */}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {/* Guardian Link */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor={`gl-${p.id}`} className="text-xs font-semibold text-slate-600">
                              Guardian Link
                            </label>
                            {linkedGuardian ? (
                              <form action={unlinkGuardian}>
                                <input type="hidden" name="user_id" value={p.id} />
                                <SubmitButton
                                  className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  pendingText="Unlinking…"
                                  showSpinner={false}
                                >
                                  Unlink
                                </SubmitButton>
                              </form>
                            ) : null}
                          </div>
                          <form action={linkGuardian} className="mt-2 flex gap-2">
                            <input type="hidden" name="user_id" value={p.id} />
                            <select
                              id={`gl-${p.id}`}
                              className="gf-select py-1.5 pl-2.5 text-xs"
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
                            <SubmitButton variant="primary" size="sm" pendingText="Linking…" showSpinner={false}>
                              Link
                            </SubmitButton>
                          </form>
                        </div>

                        {/* Student Link */}
                        <div
                          className={cn(
                            "rounded-xl border p-3",
                            studentNeedsLink ? "border-brand-gold-300 bg-brand-gold-50" : "border-slate-200 bg-slate-50/70"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={`sl-${p.id}`}
                              className={cn(
                                "inline-flex items-center gap-1.5 text-xs font-semibold",
                                studentNeedsLink ? "text-brand-gold-800" : "text-slate-600"
                              )}
                            >
                              Student Link
                              {studentNeedsLink ? (
                                <>
                                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                  Not linked
                                </>
                              ) : null}
                            </label>
                            {linkedStudent ? (
                              <form action={unlinkStudent}>
                                <input type="hidden" name="user_id" value={p.id} />
                                <SubmitButton
                                  className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  pendingText="Unlinking…"
                                  showSpinner={false}
                                >
                                  Unlink
                                </SubmitButton>
                              </form>
                            ) : null}
                          </div>
                          {studentNeedsLink ? (
                            <p className="mt-1 text-xs text-brand-gold-800">
                              This student account will see &quot;no record found&quot; in the portal until linked.
                            </p>
                          ) : null}
                          <form action={linkStudent} className="mt-2 flex gap-2">
                            <input type="hidden" name="user_id" value={p.id} />
                            <select
                              id={`sl-${p.id}`}
                              className="gf-select py-1.5 pl-2.5 text-xs"
                              name="student_id"
                              defaultValue={studentLink?.student_id ?? ""}
                            >
                              <option value="">Select...</option>
                              {students.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.last_name} {s.first_name} ({s.level})
                                </option>
                              ))}
                            </select>
                            <SubmitButton variant="primary" size="sm" pendingText="Linking…" showSpinner={false}>
                              Link
                            </SubmitButton>
                          </form>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Users}
            title="No users found"
            description={query.length ? "Try a different search term." : "Invite staff to get started."}
          />
        )}
      </Card>
    </div>
  );
}

const MAX_AUTH_USER_PAGES = 20;

function usersToast(message: string, type: "error" | "success" = "error") {
  return `/admin/users?toast=${encodeURIComponent(message)}&toast_type=${type}`;
}

// Server-side permission check used by the inline server actions (defence in depth on top of middleware).
async function isAdminUser(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (data as { role?: string | null } | null)?.role ?? null;
  return role === "super_admin" || role === "admin";
}

function roleTone(role: string): BadgeTone {
  switch (role) {
    case "super_admin":
      return "violet";
    case "admin":
      return "blue";
    case "teacher":
      return "green";
    case "front_desk":
      return "gold";
    case "nurse":
      return "red";
    case "parent":
      return "blue";
    case "student":
      return "violet";
    default:
      return "slate";
  }
}
