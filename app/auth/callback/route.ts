import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Auth callback route handler for Supabase authentication redirects.
// Used by email invitations, magic links, and password recovery.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/accept-invite";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] Failed to exchange code for session:", error.message);
      // Redirect to login with error parameter if code exchange fails
      const errorUrl = new URL("/login", request.url);
      errorUrl.searchParams.set("error", "The invitation or auth link has expired or is invalid.");
      return NextResponse.redirect(errorUrl);
    }
  }

  // URL to redirect to after sign in process completes
  const redirectUrl = new URL(next, request.url);
  return NextResponse.redirect(redirectUrl);
}
