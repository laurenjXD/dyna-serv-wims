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
// FORMER SEAM GAP, CLOSED (2026-08-08): this file used to construct its own
// resolver with `loadAuthorizationRecord` hardcoded to return `null` —
// meaning every session, however genuinely authenticated, resolved to
// forbidden. Meanwhile `lib/auth/page-resolver.ts`'s `createPageResolver()`
// already had a complete, real implementation of the exact same query
// (user_profiles -> user_roles -> roles -> role_permissions -> permissions,
// plus active user_party_scopes), already in production use by every other
// authenticated route (`/settings`, `/profile`, `/master-data`, `/receiving`,
// etc.) — just never wired into the one resolver gating the shell itself.
// Fixed by delegating to that existing resolver instead of maintaining a
// second, divergent implementation of the same query.
import { createPageResolver } from "@/lib/auth/page-resolver";
import type { AuthorizationResolution } from "@/lib/rbac/session";

export async function resolveShellAuthorization(): Promise<AuthorizationResolution> {
  const resolver = await createPageResolver();
  return resolver.getContext();
}
