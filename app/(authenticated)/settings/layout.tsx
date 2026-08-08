// `/settings` admin shell layout — specs/05-ui-shell-and-navigation
// design.md §3.2 (registry id "settings", capability "users.read", surface
// "office" — administrator only) and specs/21-user-profile-and-settings
// design.md §1.2/tasks.md Task 21.5 ("Apply middleware/RLS to strictly
// bounce non-admins").
//
// requirements.md FR-2.1 literally specifies "redirecting them back to
// /dashboard with an unauthorized alert" for a non-admin. That wording
// predates 05's later, now-approved shell convention (RouteGuard +
// ShellStateView's forbidden/not-found states, already used for every other
// capability-gated route in this app, e.g. /approvals). This layout follows
// the established RouteGuard convention instead of a bespoke
// redirect-to-/dashboard (a route that, per 05's registry, does not exist —
// "/" is the actual landing route) so /settings is gated the same way every
// other protected route in the shell is gated, per 05 design.md §7
// ("Enforce route/resource authorization again at the server action, route
// handler, or data boundary"). `/settings`'s existence is safe to disclose
// (it is a known part of the app's information architecture), so a denied
// request renders the "forbidden" state, not "not_found".

import type { ReactNode } from "react";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { RouteGuard } from "@/components/global/RouteGuard";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { resolveShellAuthorization } from "@/app/(authenticated)/actions";

const resolver: RequestAuthorizationResolver = { getContext: resolveShellAuthorization };

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard resolver={resolver} capability="users.read" existenceSafeToDisclose={true}>
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:flex-row">
        <SettingsNav />
        <div className="flex-1 p-4 md:p-office-margin">{children}</div>
      </div>
    </RouteGuard>
  );
}
