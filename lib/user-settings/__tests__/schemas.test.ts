// Unit tests for lib/user-settings/schemas.ts — validates the conditional
// party_user/partyId logic from specs/21-user-profile-and-settings/design.md
// §3.1 and requirements.md FR-4.3 ("The UI SHALL strictly validate that a
// party_user cannot exist without a bound party_id").

import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  displayNameSchema,
  inviteUserSchema,
  suspendUserSchema,
} from "../schemas";

describe("inviteUserSchema (design.md §3.1, FR-4.3)", () => {
  it("accepts a valid non-party_user invite with no partyId", () => {
    const result = inviteUserSchema.safeParse({
      email: "staff@example.com",
      displayName: "Jane Staff",
      role: "warehouse_staff",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a party_user invite with no partyId (FR-4.3)", () => {
    const result = inviteUserSchema.safeParse({
      email: "vendor@example.com",
      displayName: "Vendor Contact",
      role: "party_user",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes("partyId"));
      expect(issue).toBeDefined();
    }
  });

  it("accepts a party_user invite with a valid partyId", () => {
    const result = inviteUserSchema.safeParse({
      email: "vendor@example.com",
      displayName: "Vendor Contact",
      role: "party_user",
      partyId: "3e2f6f3a-8f77-4a6a-9a8f-1a2b3c4d5e6f",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = inviteUserSchema.safeParse({
      email: "not-an-email",
      displayName: "Jane Staff",
      role: "warehouse_staff",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a role outside 02-rbac-roles' real role-key catalog", () => {
    const result = inviteUserSchema.safeParse({
      email: "staff@example.com",
      displayName: "Jane Staff",
      role: "admin", // 21's own literal typo — not a real 02 role key
    });
    expect(result.success).toBe(false);
  });
});

describe("displayNameSchema", () => {
  it("rejects a name shorter than 2 characters", () => {
    expect(displayNameSchema.safeParse({ displayName: "J" }).success).toBe(false);
  });

  it("accepts a valid display name", () => {
    expect(displayNameSchema.safeParse({ displayName: "Jane Doe" }).success).toBe(true);
  });
});

describe("changePasswordSchema", () => {
  it("rejects mismatched passwords", () => {
    const result = changePasswordSchema.safeParse({
      newPassword: "supersecret1",
      confirmPassword: "supersecret2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = changePasswordSchema.safeParse({
      newPassword: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  it("accepts matching, sufficiently long passwords", () => {
    const result = changePasswordSchema.safeParse({
      newPassword: "supersecret1",
      confirmPassword: "supersecret1",
    });
    expect(result.success).toBe(true);
  });
});

describe("suspendUserSchema", () => {
  it("requires a non-empty reason", () => {
    const result = suspendUserSchema.safeParse({
      userId: "3e2f6f3a-8f77-4a6a-9a8f-1a2b3c4d5e6f",
      reason: "",
    });
    expect(result.success).toBe(false);
  });
});
