"use server";

// Server Action backing the authenticated shell's authorization resolution.
//
// Why this exists as a Server Action rather than a plain function built and
// passed from app/(authenticated)/layout.tsx: `RequestAuthorizationResolver`
// (lib/rbac/session.ts) is a `{ getContext(): Promise<...> }` object whose
// method is a real closure — a plain function reference cannot cross the
// Server Component -> Client Component boundary (AuthenticatedShellBoundary
// is a Client Component per its own test contract). A Server Action
// reference is the one function shape Next.js can serialize across that
// boundary, so it is the correct mechanism here, not a workaround.
//
// KNOWN SEAM GAP (flag for integration-reviewer and 02-rbac-roles' backend
// work): `loadAuthorizationRecord` has no real role/capability-grant query
// yet. Returning `null` is the deliberate, safe, fail-closed default
// (lib/rbac/session.ts resolves a `null` record to
// `{ kind: "forbidden", reason: "missing_profile" }`, never a false grant)
// until 02's DB-backed lookup is wired in here.

import { createClient } from "@/lib/supabase/server";
import {
  createRequestAuthorizationResolver,
  type AuthorizationResolution,
  type RawAuthorizationRecord,
} from "@/lib/rbac/session";

export async function resolveShellAuthorization(): Promise<AuthorizationResolution> {
  const resolver = createRequestAuthorizationResolver({
    async getAuthenticatedSession() {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return { userId: data.user.id };
    },
    // Intentionally ignores the userId argument for now — see the seam-gap
    // note above. TypeScript structurally allows a function with fewer
    // parameters to satisfy `(userId: string) => ...`.
    async loadAuthorizationRecord(): Promise<RawAuthorizationRecord | null> {
      return null;
    },
  });

  return resolver.getContext();
}
