import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Auth callback route handler for Supabase authentication redirects.
// Used by email invitations, magic links, and password recovery.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next") ?? "/accept-invite";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] Failed to exchange code for session:", error.message);
      // Redirect to login with error parameter if code exchange fails
      const errorUrl = new URL("/login", request.url);
      errorUrl.searchParams.set("error", "The invitation or auth link has expired or is invalid. Please ask your administrator to resend it.");
      return NextResponse.redirect(errorUrl);
    }
  } else if (token_hash && (type === "invite" || type === "recovery" || type === "email" || type === "signup")) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "invite" | "recovery" | "email" | "signup",
    });
    if (error) {
      console.error("[auth/callback] Failed to verify OTP token_hash:", error.message);
      const errorUrl = new URL("/login", request.url);
      errorUrl.searchParams.set("error", "The invitation or auth link has expired or is invalid.");
      return NextResponse.redirect(errorUrl);
    }
  }

  // URL to redirect to after sign in process completes
  const redirectUrl = new URL(next, request.url);
  return NextResponse.redirect(redirectUrl);
}
