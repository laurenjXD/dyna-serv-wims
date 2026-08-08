// Unit tests for lib/user-settings/roles.ts.

import { describe, expect, it } from "vitest";
import { roleLabel, roleRequiresPartyScope, SYSTEM_ROLE_OPTIONS } from "../roles";

describe("SYSTEM_ROLE_OPTIONS (02-rbac-roles design.md §3.1's real role keys)", () => {
  it("uses 02's actual 'administrator' role key, never 21's literal 'admin' typo", () => {
    const keys = SYSTEM_ROLE_OPTIONS.map((option) => option.key);
    expect(keys).toContain("administrator");
    expect(keys).not.toContain("admin");
  });

  it("marks only party_user as requiring a bound party scope (FR-4.2)", () => {
    const partyUser = SYSTEM_ROLE_OPTIONS.find((option) => option.key === "party_user");
    const others = SYSTEM_ROLE_OPTIONS.filter((option) => option.key !== "party_user");
    expect(partyUser?.requiresPartyScope).toBe(true);
    expect(others.every((option) => option.requiresPartyScope === false)).toBe(true);
  });
});

describe("roleLabel", () => {
  it("returns the human label for a known role key", () => {
    expect(roleLabel("administrator")).toBe("Admin");
    expect(roleLabel("party_user")).toBe("Party Client");
  });

  it("falls back to the raw key for an unrecognized value", () => {
    expect(roleLabel("unknown_role")).toBe("unknown_role");
  });
});

describe("roleRequiresPartyScope", () => {
  it("returns true only for party_user", () => {
    expect(roleRequiresPartyScope("party_user")).toBe(true);
    expect(roleRequiresPartyScope("administrator")).toBe(false);
    expect(roleRequiresPartyScope("unknown_role")).toBe(false);
  });
});
