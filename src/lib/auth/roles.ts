export const staffRoles = ["super_admin", "admin", "teacher", "front_desk", "nurse"] as const;

export type StaffRole = (typeof staffRoles)[number];

export const allRoles = [...staffRoles, "parent", "student"] as const;

export type AppRole = (typeof allRoles)[number];

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return typeof role === "string" && (staffRoles as readonly string[]).includes(role);
}
