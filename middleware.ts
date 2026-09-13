import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Root middleware — coarse public/protected routing and session refresh
// per specs/05-ui-shell-and-navigation/design.md §3:
// "Middleware is restricted to lightweight session refresh or coarse
// public/protected routing; it does not execute TCP/Drizzle database queries
// or replace server resource authorization."
//
// By handling unauthenticated redirects at the HTTP level here, we prevent
// Server Components / layouts from throwing mid-render redirect() exceptions
// inside Suspense loading boundaries, avoiding Next.js App Router fiber
// corruption and React Error #310.
export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const pathname = request.nextUrl.pathname;
  const isAuthRoute =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/accept-invite");
  const isApiRoute = pathname.startsWith("/api");

  // Redirect unauthenticated visitors attempting to access protected routes to /login
  if (!user && !isAuthRoute && !isApiRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const redirectResponse = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }


  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and image optimization output
    // — those never need a session refresh and skipping them keeps the
    // common case (asset requests) middleware-free.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
