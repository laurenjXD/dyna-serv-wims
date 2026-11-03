// `/settings/team` — data table of all users + Invite User flow.
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.2, tasks.md
// Task 21.6. Authorization is already enforced by ../layout.tsx's
// RouteGuard(capability: "users.read"); listTeamMembers()/listActiveParties()
// independently re-check the same capability server-side (defense in
// depth, per 02 design.md §8's stated requirement).

import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { UserManagementGrid } from "@/components/settings/UserManagementGrid";
import { ShellStateView } from "@/components/global/ShellStateView";
import {
  listActiveParties,
  listTeamMembers,
  inviteUser,
  suspendUser,
  reactivateUser,
  resendInvite,
  cancelInvite,
} from "./actions";

export default async function SettingsTeamPage() {
  const resolver = await createPageResolver();
  const access = await requirePermission(resolver, "access_assignments.grant");
  const revoke = await requirePermission(resolver, "access_assignments.revoke");
  const canManageAccess = access.kind === "authorized" && revoke.kind === "authorized" && access.context.activeRoleKeys.includes("administrator");
  const [membersResult, partiesResult] = await Promise.all([
    listTeamMembers(),
    listActiveParties(),
  ]);

  if (!membersResult.ok || !partiesResult.ok) {
    return <ShellStateView state={{ kind: "forbidden" }} />;
  }

  return (
    <UserManagementGrid
      canManageAccess={canManageAccess}
      initialMembers={membersResult.data}
      parties={partiesResult.data}
      inviteUser={inviteUser}
      suspendUser={suspendUser}
      reactivateUser={reactivateUser}
      resendInvite={resendInvite}
      cancelInvite={cancelInvite}
    />
  );
}
