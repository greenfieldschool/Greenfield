import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isAdmin = pathname.startsWith("/admin");
  const isPortal = pathname.startsWith("/portal");
  const isConductor = pathname.startsWith("/conductor");

  if (!isAdmin && !isPortal && !isConductor) {
    return NextResponse.next();
  }

  if (isAdmin) {
    if (
      pathname === "/admin/login" ||
      pathname === "/admin/unauthorized" ||
      pathname.startsWith("/admin/logout")
    ) {
      return NextResponse.next();
    }
  }

  if (isPortal) {
    if (
      pathname === "/portal/login" ||
      pathname === "/portal/unauthorized" ||
      pathname.startsWith("/portal/logout")
    ) {
      return NextResponse.next();
    }
  }

  if (isConductor) {
    if (
      pathname === "/conductor/login" ||
      pathname === "/conductor/unauthorized" ||
      pathname.startsWith("/conductor/logout")
    ) {
      return NextResponse.next();
    }
  }

  const response = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const loginPath = isAdmin ? "/admin/login" : isConductor ? "/conductor/login" : "/portal/login";
    const redirectUrl = new URL(loginPath, request.url);
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as string | null | undefined;
  const isStaffRole =
    role === "super_admin" ||
    role === "admin" ||
    role === "teacher" ||
    role === "front_desk" ||
    role === "nurse";
  const isPortalRole = role === "parent" || role === "student";

  const { data: conductorLink } = isConductor
    ? await supabase
        .from("exam_conductor_user_links")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null as unknown as { user_id: string } | null };
  const isConductorUser = !!conductorLink;

  if (isAdmin && !isStaffRole) {
    return NextResponse.redirect(new URL("/admin/unauthorized", request.url));
  }
  if (isPortal && !isPortalRole) {
    return NextResponse.redirect(new URL("/portal/unauthorized", request.url));
  }
  if (isConductor && !isStaffRole && !isConductorUser) {
    return NextResponse.redirect(new URL("/conductor/unauthorized", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*", "/conductor/:path*"]
};
