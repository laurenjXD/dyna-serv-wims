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
import { AuthenticatedShellBoundary } from "@/components/global/AuthenticatedShellBoundary";
import { ShellChrome } from "@/components/global/ShellChrome";
import { UserPreferencesProvider } from "@/lib/user-settings/preferences";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { redirect } from "next/navigation";

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Resolve the session during the server render. The previous client-side
  // server-action call could remain pending forever, leaving visitors on an
  // otherwise blank "Checking your session…" screen.
  const resolver = await createPageResolver();
  const initialResolution = await resolver.getContext();

  if (initialResolution.kind === "unauthenticated") {
    redirect("/login");
  }

  return (
    <UserPreferencesProvider>
      <AuthenticatedShellBoundary initialResolution={initialResolution}>
        <ShellChrome>{children}</ShellChrome>
      </AuthenticatedShellBoundary>
    </UserPreferencesProvider>
  );
}
