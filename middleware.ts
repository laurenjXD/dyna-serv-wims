import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Root middleware — the missing wiring for lib/supabase/middleware.ts's
// updateSession(), which that file's own header comment already described
// as needed here "once route groups/auth flows exist." They now do
// (2026-08-08): without this file, a browser-side sign-in set cookies via
// document.cookie but nothing refreshed/propagated them on the server-side
// request that follows a client navigation, so a successful login appeared
// to redirect nowhere — the shell's server-side session read never saw a
// valid session. This is the standard @supabase/ssr Next.js App Router
// pattern: refresh the session on every request, before any Server
// Component or Server Action runs.
//
// Per specs/05-ui-shell-and-navigation/design.md §3 ("Middleware may handle
// only approved lightweight concerns such as session refresh or coarse
// public/protected routing. It must not perform Drizzle/TCP database work
// or replace server-side resource authorization.") — updateSession() only
// talks to Supabase Auth over HTTP; it does not touch the database and does
// not itself decide route authorization (that remains RouteGuard/
// requirePermission(), server-side, per route).
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets and image optimization output
    // — those never need a session refresh and skipping them keeps the
    // common case (asset requests) middleware-free.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
