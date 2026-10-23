// Who may open which area. Used by src/middleware.ts (the first gate); pages and RLS still check on their own.
//
//  /admin      staff (super_admin, admin, teacher, front_desk, nurse). Some sections are admins only.
//  /portal     parents and students. Staff are sent to /admin.
//  /conductor  staff, or accounts linked to an exam conductor.
// Signed-out visitors are sent to that area's login page.

export type Area = "admin" | "portal" | "conductor";

export const staffRoles = ["super_admin", "admin", "teacher", "front_desk", "nurse"] as const;

// Keep in step with `adminOnly` items in src/app/admin/AdminShell.tsx (and with RLS).
export const adminOnlyPrefixes = [
  "/admin/users",
  "/admin/finance",
  "/admin/settings",
  "/admin/academics/subjects",
  "/admin/academics/class-subjects",
  "/admin/academics/teachers",
  "/admin/welfare/criteria",
  "/admin/messages/moderation"
];

// Pages each area serves to everyone (sign-in, sign-out, "not allowed").
const publicPaths: Record<Area, (path: string) => boolean> = {
  admin: (p) => p === "/admin/login" || p === "/admin/unauthorized" || p.startsWith("/admin/logout"),
  portal: (p) => p.startsWith("/portal/login") || p === "/portal/unauthorized" || p.startsWith("/portal/logout"),
  conductor: (p) => p === "/conductor/login" || p === "/conductor/unauthorized" || p.startsWith("/conductor/logout")
};

const loginPaths: Record<Area, string> = { admin: "/admin/login", portal: "/portal/login", conductor: "/conductor/login" };

export function areaOf(path: string): Area | null {
  for (const area of ["admin", "portal", "conductor"] as const) {
    if (path === `/${area}` || path.startsWith(`/${area}/`)) return area;
  }
  return null;
}

function under(path: string, prefix: string) {
  return path === prefix || path.startsWith(prefix + "/");
}

export type AccessDecision = { action: "allow" } | { action: "redirect"; to: string };

/**
 * @param signedIn whether there is a signed-in user
 * @param role profiles.role (null if unknown)
 * @param isConductorUser linked in exam_conductor_user_links (only needed for /conductor)
 */
export function decideAccess(path: string, signedIn: boolean, role: string | null, isConductorUser = false): AccessDecision {
  const area = areaOf(path);
  if (!area || publicPaths[area](path)) return { action: "allow" };

  if (!signedIn) {
    return { action: "redirect", to: `${loginPaths[area]}?redirectTo=${encodeURIComponent(path)}` };
  }

  const isStaff = (staffRoles as readonly string[]).includes(role ?? "");
  const isAdmin = role === "super_admin" || role === "admin";

  if (area === "admin") {
    if (!isStaff) return { action: "redirect", to: "/admin/unauthorized" };
    if (!isAdmin && adminOnlyPrefixes.some((p) => under(path, p))) return { action: "redirect", to: "/admin" };
    return { action: "allow" };
  }
  if (area === "portal") {
    if (isStaff) return { action: "redirect", to: "/admin" };
    if (role !== "parent" && role !== "student") return { action: "redirect", to: "/portal/unauthorized" };
    return { action: "allow" };
  }
  if (!isStaff && !isConductorUser) return { action: "redirect", to: "/conductor/unauthorized" };
  return { action: "allow" };
}

/** Only follow `redirectTo` back into the same area of this site (no other hosts, no `//evil.com`). */
export function safeRedirect(target: string | undefined | null, area: Area): string {
  const fallback = `/${area}`;
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) return fallback;
  return areaOf(target) === area ? target : fallback;
}
