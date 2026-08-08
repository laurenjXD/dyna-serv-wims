// `/settings/team` — data table of all users + Invite User flow.
//
// Traceability: specs/21-user-profile-and-settings/design.md §1.2, tasks.md
// Task 21.6. Authorization is already enforced by ../layout.tsx's
// RouteGuard(capability: "users.read"); listTeamMembers()/listActiveParties()
// independently re-check the same capability server-side (defense in
// depth, per 02 design.md §8's stated requirement).

import { UserManagementGrid } from "@/components/settings/UserManagementGrid";
import { ShellStateView } from "@/components/global/ShellStateView";
import {
  listActiveParties,
  listTeamMembers,
  inviteUser,
  suspendUser,
  reactivateUser,
} from "./actions";

export default async function SettingsTeamPage() {
  const [membersResult, partiesResult] = await Promise.all([
    listTeamMembers(),
    listActiveParties(),
  ]);

  if (!membersResult.ok || !partiesResult.ok) {
    return <ShellStateView state={{ kind: "forbidden" }} />;
  }

  return (
    <UserManagementGrid
      initialMembers={membersResult.data}
      parties={partiesResult.data}
      inviteUser={inviteUser}
      suspendUser={suspendUser}
      reactivateUser={reactivateUser}
    />
  );
}
