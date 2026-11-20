import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { areaOf, decideAccess } from "@/lib/route-access";

// First gate for /admin, /portal and /conductor (rules in src/lib/route-access.ts). It also refreshes the
// Supabase session cookie. Pages and RLS still check access themselves.
// Must live in src/ because the app uses a src directory (a root-level middleware.ts is ignored).
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const area = areaOf(pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!area || !url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  let role: string | null = null;
  let isConductorUser = false;
  if (user) {
    const [{ data: profile }, conductor] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      area === "conductor"
        ? supabase.from("exam_conductor_user_links").select("user_id").eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null })
    ]);
    role = ((profile as { role?: string } | null)?.role as string | undefined) ?? null;
    isConductorUser = Boolean(conductor.data);
  }

  const decision = decideAccess(pathname, Boolean(user), role, isConductorUser);

  // A temporary password from the school lasts until the end of term (20261119c). After that, a parent or pupil still
  // using it must choose their own before going anywhere else in the portal.
  if (decision.action === "allow" && area === "portal" && user && (role === "parent" || role === "student")) {
    const meta = (user.user_metadata ?? {}) as { must_change_password?: boolean; temp_password_expires_at?: string | null };
    const expires = meta.temp_password_expires_at ? Date.parse(meta.temp_password_expires_at) : NaN;
    if (meta.must_change_password && Number.isFinite(expires) && expires <= Date.now() && !pathname.startsWith("/portal/change-password") && !pathname.startsWith("/portal/logout")) {
      const to = NextResponse.redirect(new URL("/portal/change-password?expired=1", request.url));
      response.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
      return to;
    }
  }
  if (decision.action === "allow") return response;

  // Keep any refreshed session cookies on the redirect.
  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/portal", "/portal/:path*", "/conductor", "/conductor/:path*"]
};
