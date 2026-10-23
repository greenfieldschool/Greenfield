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
  if (decision.action === "allow") return response;

  // Keep any refreshed session cookies on the redirect.
  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/portal", "/portal/:path*", "/conductor", "/conductor/:path*"]
};
