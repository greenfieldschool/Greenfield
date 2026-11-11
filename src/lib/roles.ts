// Account roles and who may give them. The database enforces the same rules in public.role_change_problem()
// (docs/migrations/20261111_lock_role_changes.sql); keep the two in step. See the role-management skill.

export const ROLES = ["super_admin", "admin", "teacher", "front_desk", "nurse", "parent", "student"] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: readonly Role[] = ["super_admin", "admin", "teacher", "front_desk", "nurse"];
/** Roles only a super admin may give or take away. */
export const TOP_ROLES: readonly Role[] = ["super_admin", "admin"];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  teacher: "Teacher",
  front_desk: "Front Desk",
  nurse: "Nurse",
  parent: "Parent",
  student: "Student"
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: string | null | undefined) {
  return isRole(role) ? ROLE_LABELS[role] : role ?? "Unknown";
}

export function isAdminRole(role: string | null | undefined) {
  return role === "super_admin" || role === "admin";
}

/** The roles this person may give to someone else. */
export function assignableRoles(actorRole: string | null | undefined): Role[] {
  if (actorRole === "super_admin") return [...ROLES];
  if (actorRole === "admin") return ROLES.filter((r) => !TOP_ROLES.includes(r));
  return [];
}

/**
 * Why this role change is not allowed, in plain words, or null when it is.
 * `from` is the account's current role ("parent" for a brand-new account).
 */
export function roleChangeProblem(args: {
  actorId: string;
  actorRole: string | null | undefined;
  targetId: string | null;
  from: string | null | undefined;
  to: string;
}): string | null {
  const { actorId, actorRole, targetId, from, to } = args;
  if (!isRole(to)) return "Pick a role from the list.";
  if (from === to) return null;
  if (!isAdminRole(actorRole)) return "Only an admin can change roles.";
  if (targetId && targetId === actorId) return "You cannot change your own role. Ask another admin.";
  if (actorRole === "super_admin") return null;
  if (isRole(from) && TOP_ROLES.includes(from)) return "Only a super admin can change the role of an admin or super admin.";
  if (TOP_ROLES.includes(to)) return "Only a super admin can make someone an admin or super admin.";
  return null;
}
