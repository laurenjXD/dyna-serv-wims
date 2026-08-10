// Shared Supabase-SSR session resolver.
//
// Extracted from lib/auth/page-resolver.ts's formerly-inline
// getAuthenticatedSession closure so it can be reused as the
// `deps.getAuthenticatedSession` dependency lib/db/rls-transaction.ts's
// withRlsTransaction() requires (specs/02-rbac-roles/design.md §6.3 step 1:
// "Validate the Supabase access token on the server"), in addition to
// createPageResolver()'s existing RequestAuthorizationResolver use. Both
// call sites now share one implementation instead of two independent copies
// of the same supabase.auth.getUser() call.
//
// Traceability:
//   specs/02-rbac-roles/design.md §6.3 (RLS session propagation, step 1)
//   lib/supabase/server.ts — createClient (SSR-safe)
//   lib/rbac/session.ts — AuthSession shape

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AuthSession } from "@/lib/rbac/session";

export async function getAuthenticatedSession(): Promise<AuthSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user) {
    // 2026-08-08 diagnostic addition, temporary pending root-cause
    // confirmation: session.ts's own catches never log, so this is the
    // most direct boundary to see what the server actually received —
    // cookie names present (never values) and whether Supabase itself
    // reported an error vs. simply finding no user.
    const cookieNames = (await cookies()).getAll().map((c) => c.name);
    console.error("[get-authenticated-session] no user from getUser()", {
      supabaseError: error?.message ?? null,
      cookieNames,
    });
    return null;
  }
  return { userId: user.id };
}
