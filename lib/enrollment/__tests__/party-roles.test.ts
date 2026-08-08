// RED-step unit tests for lib/enrollment/party-roles.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md §4 R1.4, R1.5
//   specs/06-party-and-item-enrollment/design.md §2 (party_roles schema note:
//     "No database-level unique constraint on (party_id, role) in the approved
//     schema; the server action must enforce no duplicate role assignment per party.")
//   specs/06-party-and-item-enrollment/design.md §5 Create step 4
//   specs/06-party-and-item-enrollment/tasks.md Testing Matrix §Unit tests
//
// Acceptance criteria covered (requirements.md §5):
//   AC: "An authorized administrator can create ... a party with business roles
//       without creating application-user access." — role validation is the gate
//   R1.4: "A party SHALL have one or more approved business `party_roles` where
//     required by the business flow; duplicate role assignments SHALL be rejected."
//   R1.5: "The form SHALL distinguish business party roles from application-user
//     roles and SHALL not create user accounts or RBAC grants as a side effect."
//
// Expected module contract for lib/enrollment/party-roles.ts (for backend-builder):
//
//   export type PartyRoleValue =
//     "vendor" | "supplier" | "customer" | "end_customer" | "internal_warehouse"
//
//   export type DuplicateRoleCheck =
//     | { isDuplicate: false }
//     | { isDuplicate: true; reason: string }
//
//   export function checkDuplicatePartyRole(
//     existingRoles: PartyRoleValue[],
//     newRole: PartyRoleValue
//   ): DuplicateRoleCheck
//   // Returns { isDuplicate: true, reason: "..." } if newRole is already in existingRoles.
//   // Returns { isDuplicate: false } if newRole is not present in existingRoles.
//   // The reason must be a non-empty, human-readable string.
//
//   export type RoleValidationResult =
//     | { valid: true }
//     | { valid: false; reason: string }
//
//   export function validatePartyRoleValue(role: unknown): RoleValidationResult
//   // Returns { valid: false, reason: "..." } if role is not a valid PartyRoleValue.
//   // Returns { valid: true } if role is one of the five approved enum values.
//   // Approved values (from enums.ts partyRoleEnum): vendor, supplier, customer,
//   //   end_customer, internal_warehouse

import { describe, expect, it } from "vitest";
import {
  checkDuplicatePartyRole,
  validatePartyRoleValue,
} from "@/lib/enrollment/party-roles";

// ---------------------------------------------------------------------------
// R1.4 — checkDuplicatePartyRole: no duplicate (party_id, role) pairs
// ---------------------------------------------------------------------------

describe("checkDuplicatePartyRole — duplicate detection (R1.4, design.md §2 party_roles, §5 Create step 4)", () => {
  it("returns isDuplicate=false when existingRoles is empty (first role for party)", () => {
    const result = checkDuplicatePartyRole([], "vendor");
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate=false when newRole is not in existingRoles", () => {
    const result = checkDuplicatePartyRole(["vendor", "supplier"], "customer");
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate=true when newRole exactly matches an existing role (R1.4: reject duplicate)", () => {
    const result = checkDuplicatePartyRole(["vendor"], "vendor");
    expect(result.isDuplicate).toBe(true);
    if (result.isDuplicate) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("returns isDuplicate=true for 'supplier' duplicate", () => {
    const result = checkDuplicatePartyRole(["vendor", "supplier"], "supplier");
    expect(result.isDuplicate).toBe(true);
  });

  it("returns isDuplicate=true for 'customer' duplicate", () => {
    const result = checkDuplicatePartyRole(["customer"], "customer");
    expect(result.isDuplicate).toBe(true);
  });

  it("returns isDuplicate=true for 'end_customer' duplicate", () => {
    const result = checkDuplicatePartyRole(["end_customer"], "end_customer");
    expect(result.isDuplicate).toBe(true);
  });

  it("returns isDuplicate=true for 'internal_warehouse' duplicate", () => {
    const result = checkDuplicatePartyRole(
      ["vendor", "internal_warehouse"],
      "internal_warehouse"
    );
    expect(result.isDuplicate).toBe(true);
  });

  it("returns isDuplicate=false when role appears similar but is different (no false positive)", () => {
    const result = checkDuplicatePartyRole(["vendor"], "supplier");
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate=false when adding 'end_customer' to a party with 'customer'", () => {
    // end_customer and customer are DISTINCT roles — adding end_customer to a customer
    // party must NOT be flagged as a duplicate
    const result = checkDuplicatePartyRole(["customer"], "end_customer");
    expect(result.isDuplicate).toBe(false);
  });

  it("provides a human-readable reason string when a duplicate is detected", () => {
    const result = checkDuplicatePartyRole(["vendor"], "vendor");
    expect(result.isDuplicate).toBe(true);
    if (result.isDuplicate) {
      expect(result.reason).toMatch(/vendor/i);
    }
  });
});

// ---------------------------------------------------------------------------
// R1.4 / R1.5 — validatePartyRoleValue: approved business role enum values only
// ---------------------------------------------------------------------------

describe("validatePartyRoleValue — approved business role values (R1.4, R1.5, design.md §2 partyRoleEnum)", () => {
  it("accepts 'vendor' (approved role from partyRoleEnum)", () => {
    expect(validatePartyRoleValue("vendor").valid).toBe(true);
  });

  it("accepts 'supplier'", () => {
    expect(validatePartyRoleValue("supplier").valid).toBe(true);
  });

  it("accepts 'customer'", () => {
    expect(validatePartyRoleValue("customer").valid).toBe(true);
  });

  it("accepts 'end_customer'", () => {
    expect(validatePartyRoleValue("end_customer").valid).toBe(true);
  });

  it("accepts 'internal_warehouse'", () => {
    expect(validatePartyRoleValue("internal_warehouse").valid).toBe(true);
  });

  it("rejects 'administrator' (application-user role, not a business party role — R1.5)", () => {
    const result = validatePartyRoleValue("administrator");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("rejects 'supervisor' (application-user role, not a business party role — R1.5)", () => {
    const result = validatePartyRoleValue("supervisor");
    expect(result.valid).toBe(false);
  });

  it("rejects 'warehouse_staff' (application-user role, not a business party role — R1.5)", () => {
    const result = validatePartyRoleValue("warehouse_staff");
    expect(result.valid).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validatePartyRoleValue("").valid).toBe(false);
  });

  it("rejects null", () => {
    expect(validatePartyRoleValue(null).valid).toBe(false);
  });

  it("rejects undefined", () => {
    expect(validatePartyRoleValue(undefined).valid).toBe(false);
  });

  it("rejects a number (wrong type)", () => {
    expect(validatePartyRoleValue(1).valid).toBe(false);
  });

  it("rejects an arbitrary free-text string (R1.5: must be from the approved set)", () => {
    const result = validatePartyRoleValue("partner");
    expect(result.valid).toBe(false);
  });

  it("provides a human-readable reason when the role value is invalid", () => {
    const result = validatePartyRoleValue("invalid-role");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});
