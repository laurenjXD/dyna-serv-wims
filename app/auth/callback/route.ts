import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeCallbackPath } from "@/lib/auth/invite-callback";

const DEFAULT_INVITE_PATH = "/accept-invite";

function invalidInvitationRedirect(request: NextRequest, message: string) {
  const errorUrl = new URL("/login", request.url);
  errorUrl.searchParams.set("error", message);
  errorUrl.searchParams.set("next", DEFAULT_INVITE_PATH);
  return NextResponse.redirect(errorUrl);
}

// Auth callback route handler for Supabase authentication redirects.
// Used by email invitations, magic links, and password recovery.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = getSafeCallbackPath(requestUrl.searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] Failed to exchange code for session:", error.message);
      return invalidInvitationRedirect(request, "invitation_invalid");
    }
  } else if (tokenHash && (type === "invite" || type === "recovery" || type === "email" || type === "signup")) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "invite" | "recovery" | "email" | "signup",
    });
    if (error) {
      console.error("[auth/callback] Failed to verify OTP token_hash:", error.message);
      return invalidInvitationRedirect(request, "invitation_invalid");
    }
  } else if (!code && !tokenHash) {
    return invalidInvitationRedirect(request, "invitation_missing");
  } else {
    return invalidInvitationRedirect(request, "invitation_invalid");
  }

  const redirectUrl = new URL(next, request.url);
  return NextResponse.redirect(redirectUrl);
}
