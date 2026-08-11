// Authenticated route-group layout — the actual integration point wiring
// AuthenticatedShellBoundary + ShellNavigation into the real Next.js app,
// per specs/05-ui-shell-and-navigation/design.md §4/§7.
//
// This is intentionally minimal: it hands AuthenticatedShellBoundary (a
// Client Component) a resolver whose `getContext` is the
// `resolveShellAuthorization` Server Action (./actions.ts) — the one
// function shape Next.js can serialize across the Server->Client boundary.
// See ./actions.ts for the known 02-rbac-roles backend seam gap
// (`loadAuthorizationRecord` has no real query yet).
import type { ReactNode } from "react";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { AuthenticatedShellBoundary } from "@/components/global/AuthenticatedShellBoundary";
import { ShellChrome } from "@/components/global/ShellChrome";
import { resolveShellAuthorization } from "./actions";

// Every route in this group resolves its authorization from the request's
// Supabase cookies. Prevent Next from attempting to statically prerender the
// group at build time, where no request cookie store exists.
export const dynamic = "force-dynamic";

const resolver: RequestAuthorizationResolver = {
  getContext: resolveShellAuthorization,
};

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthenticatedShellBoundary resolver={resolver}>
      <ShellChrome>{children}</ShellChrome>
    </AuthenticatedShellBoundary>
  );
}
