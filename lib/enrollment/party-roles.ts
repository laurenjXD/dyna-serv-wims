// Party role validation helpers.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R1.4, R1.5
//   specs/06-party-and-item-enrollment/design.md §2 (party_roles), §5 Create step 4
//   lib/db/schema/enums.ts — partyRoleEnum: vendor, supplier, customer,
//     end_customer, internal_warehouse

export type PartyRoleValue =
  | "vendor"
  | "supplier"
  | "customer"
  | "end_customer"
  | "internal_warehouse";

const APPROVED_PARTY_ROLES: readonly PartyRoleValue[] = [
  "vendor",
  "supplier",
  "customer",
  "end_customer",
  "internal_warehouse",
];

export type DuplicateRoleCheck =
  | { isDuplicate: false }
  | { isDuplicate: true; reason: string };

/**
 * Returns { isDuplicate: true, reason } if newRole is already in existingRoles.
 * R1.4: Duplicate role assignments shall be rejected.
 * design.md §2: No DB-level unique constraint — server action must enforce this.
 */
export function checkDuplicatePartyRole(
  existingRoles: PartyRoleValue[],
  newRole: PartyRoleValue,
): DuplicateRoleCheck {
  if (existingRoles.includes(newRole)) {
    return {
      isDuplicate: true,
      reason: `The role '${newRole}' is already assigned to this party. Duplicate role assignments are not permitted.`,
    };
  }
  return { isDuplicate: false };
}

export type RoleValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Validates that the given value is one of the five approved business party role
 * enum values. Application-user role names (administrator, supervisor,
 * warehouse_staff) are explicitly rejected — R1.5.
 */
export function validatePartyRoleValue(role: unknown): RoleValidationResult {
  if (
    typeof role === "string" &&
    (APPROVED_PARTY_ROLES as readonly string[]).includes(role)
  ) {
    return { valid: true };
  }
  return {
    valid: false,
    reason: `'${String(role)}' is not a valid party role. Approved business roles are: ${APPROVED_PARTY_ROLES.join(", ")}.`,
  };
}
