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
import { getEffectiveGeneralSettings } from "@/app/(authenticated)/settings/general/actions";
import { ScannerSettingsProvider } from "@/components/barcode/ScannerSettingsProvider";
import { SessionIdleGuard } from "@/components/global/SessionIdleGuard";
import { getEffectiveSecuritySettings } from "@/app/(authenticated)/settings/security/actions";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Resolve the session during the server render. Unauthenticated visitors are
  // intercepted at the edge in middleware.ts; AuthenticatedShellBoundary safely
  // handles any boundary edge cases on the client without throwing render-breaking
  // Server Component redirect exceptions.
  const resolver = await createPageResolver();
  const generalSettings = await getEffectiveGeneralSettings();
  const securitySettings = await getEffectiveSecuritySettings();
  const initialResolution = await resolver.getContext();

  return (
    <UserPreferencesProvider>
      <ScannerSettingsProvider settings={generalSettings.scanner}>
        <SessionIdleGuard
          mobileIdleTimeoutMinutes={securitySettings.sessionConfig.mobileIdleTimeoutMinutes}
          desktopIdleTimeoutMinutes={securitySettings.sessionConfig.desktopIdleTimeoutMinutes}
        >
          <AuthenticatedShellBoundary initialResolution={initialResolution}>
            <ShellChrome>{children}</ShellChrome>
          </AuthenticatedShellBoundary>
        </SessionIdleGuard>
      </ScannerSettingsProvider>
    </UserPreferencesProvider>
  );
}
