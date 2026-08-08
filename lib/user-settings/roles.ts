// System role catalog for the Settings admin surface.
//
// Traceability: specs/02-rbac-roles/design.md §3.1 (the actual, authoritative
// role-key catalog: `warehouse_staff`, `supervisor`, `administrator`,
// `party_user` — role keys are never invented per-feature).
//
// KNOWN SPEC INCONSISTENCY (flag for integration-reviewer): both
// specs/21-user-profile-and-settings/requirements.md FR-4.1 and design.md
// §3.1's `inviteUserSchema` literally enumerate the admin role key as
// `"admin"`. `02-rbac-roles` — which owns the role model per this repo's
// steering rules ("never redefine schema inline in a feature spec") — seeds
// the actual role key as `"administrator"` (design.md §3.1's role table).
// This module uses `02`'s real key (`"administrator"`) as the stored/queried
// value, with `"Admin"` only as the display label, rather than silently
// reproducing `21`'s typo into a value that would never match a real
// `roles.key` row.
export type SystemRoleKey =
  | "administrator"
  | "supervisor"
  | "warehouse_staff"
  | "party_user";

export interface SystemRoleOption {
  key: SystemRoleKey;
  label: string;
  requiresPartyScope: boolean;
}

export const SYSTEM_ROLE_OPTIONS: readonly SystemRoleOption[] = [
  { key: "administrator", label: "Admin", requiresPartyScope: false },
  { key: "supervisor", label: "Supervisor", requiresPartyScope: false },
  { key: "warehouse_staff", label: "Staff", requiresPartyScope: false },
  { key: "party_user", label: "Party Client", requiresPartyScope: true },
];

export function roleLabel(key: string): string {
  return SYSTEM_ROLE_OPTIONS.find((option) => option.key === key)?.label ?? key;
}

export function roleRequiresPartyScope(key: string): boolean {
  return SYSTEM_ROLE_OPTIONS.find((option) => option.key === key)?.requiresPartyScope ?? false;
}
