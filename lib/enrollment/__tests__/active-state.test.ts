// RED-step unit tests for lib/enrollment/active-state.ts (does not exist yet).
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md §4 R1.7, R4.9, R3.7
//   specs/06-party-and-item-enrollment/design.md §5 Edit/deactivate (party impact)
//   specs/06-party-and-item-enrollment/design.md §6 Item deactivation impact
//   specs/06-party-and-item-enrollment/design.md §6a Edit/deactivate (location impact)
//   specs/06-party-and-item-enrollment/tasks.md Testing Matrix §Unit tests
//     "Active/inactive and optimistic-concurrency state helpers."
//
// Acceptance criteria covered (requirements.md §5):
//   AC: "Historical references remain valid after deactivation, and destructive
//     deletion is blocked when references exist." — the is_active gate is the
//     in-application enforcement mechanism that backs this.
//   R1.7: "Deactivation SHALL prevent new use where the owning workflow requires
//     an active party."
//   R4.9: "Item deactivation SHALL prevent new operational use where required."
//   R3.7: "Deactivation SHALL prevent new use of the location where the owning
//     inventory/putaway workflow requires an active location."
//
// Expected module contract for lib/enrollment/active-state.ts (for backend-builder):
//
//   export type ActiveCheckResult =
//     | { active: true }
//     | { active: false; entityType: string; entityId: string; reason: string }
//
//   export function checkPartyIsActive(party: {
//     id: string;
//     isActive: boolean;
//   }): ActiveCheckResult
//   // Returns { active: false, entityType: "party", entityId: party.id, reason: "..." }
//   // when isActive is false; { active: true } otherwise.
//
//   export function checkItemIsActive(item: {
//     id: string;
//     isActive: boolean;
//   }): ActiveCheckResult
//   // Returns { active: false, entityType: "item", ... } when isActive is false.
//
//   export function checkLocationIsActive(location: {
//     id: string;
//     isActive: boolean;
//   }): ActiveCheckResult
//   // Returns { active: false, entityType: "location", ... } when isActive is false.

import { describe, expect, it } from "vitest";
import {
  checkPartyIsActive,
  checkItemIsActive,
  checkLocationIsActive,
} from "@/lib/enrollment/active-state";

// ---------------------------------------------------------------------------
// R1.7 — checkPartyIsActive: inactive party is blocked from operational use
// ---------------------------------------------------------------------------

describe("checkPartyIsActive — party is_active gate (R1.7, design.md §5 Edit/deactivate)", () => {
  it("returns active=true when party.isActive is true", () => {
    const result = checkPartyIsActive({ id: "party-001", isActive: true });
    expect(result.active).toBe(true);
  });

  it("returns active=false when party.isActive is false (R1.7: deactivation blocks new use)", () => {
    const result = checkPartyIsActive({ id: "party-001", isActive: false });
    expect(result.active).toBe(false);
  });

  it("populates entityType = 'party' in the failure result", () => {
    const result = checkPartyIsActive({ id: "party-001", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(result.entityType).toBe("party");
    }
  });

  it("populates entityId matching party.id in the failure result", () => {
    const result = checkPartyIsActive({ id: "party-abc-999", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(result.entityId).toBe("party-abc-999");
    }
  });

  it("provides a non-empty human-readable reason string in the failure result", () => {
    const result = checkPartyIsActive({ id: "party-001", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// R4.9 — checkItemIsActive: inactive item is blocked from new operational use
// ---------------------------------------------------------------------------

describe("checkItemIsActive — item is_active gate (R4.9, design.md §6 Item deactivation impact)", () => {
  it("returns active=true when item.isActive is true", () => {
    const result = checkItemIsActive({ id: "item-001", isActive: true });
    expect(result.active).toBe(true);
  });

  it("returns active=false when item.isActive is false (R4.9: blocks new WRR lines, lots, pick-list generation)", () => {
    const result = checkItemIsActive({ id: "item-001", isActive: false });
    expect(result.active).toBe(false);
  });

  it("populates entityType = 'item' in the failure result", () => {
    const result = checkItemIsActive({ id: "item-001", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(result.entityType).toBe("item");
    }
  });

  it("populates entityId matching item.id in the failure result", () => {
    const result = checkItemIsActive({ id: "item-xyz-777", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(result.entityId).toBe("item-xyz-777");
    }
  });

  it("provides a non-empty human-readable reason string in the failure result", () => {
    const result = checkItemIsActive({ id: "item-001", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// R3.7 — checkLocationIsActive: inactive location is blocked from new placement
// ---------------------------------------------------------------------------

describe("checkLocationIsActive — location is_active gate (R3.7, design.md §6a Edit/deactivate)", () => {
  it("returns active=true when location.isActive is true", () => {
    const result = checkLocationIsActive({ id: "loc-001", isActive: true });
    expect(result.active).toBe(true);
  });

  it("returns active=false when location.isActive is false (R3.7: blocks new putaway/placement)", () => {
    const result = checkLocationIsActive({ id: "loc-001", isActive: false });
    expect(result.active).toBe(false);
  });

  it("populates entityType = 'location' in the failure result", () => {
    const result = checkLocationIsActive({ id: "loc-001", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(result.entityType).toBe("location");
    }
  });

  it("populates entityId matching location.id in the failure result", () => {
    const result = checkLocationIsActive({ id: "loc-bay-3", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(result.entityId).toBe("loc-bay-3");
    }
  });

  it("provides a non-empty human-readable reason string in the failure result", () => {
    const result = checkLocationIsActive({ id: "loc-001", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-entity: the three helpers are structurally independent (no cross-bleed)
// ---------------------------------------------------------------------------

describe("active-state helpers — structural isolation (no cross-entity bleed)", () => {
  it("checkPartyIsActive and checkItemIsActive report different entityType for same id", () => {
    const partyResult = checkPartyIsActive({ id: "shared-id", isActive: false });
    const itemResult = checkItemIsActive({ id: "shared-id", isActive: false });
    expect(partyResult.active).toBe(false);
    expect(itemResult.active).toBe(false);
    if (!partyResult.active && !itemResult.active) {
      expect(partyResult.entityType).toBe("party");
      expect(itemResult.entityType).toBe("item");
    }
  });

  it("checkLocationIsActive reports entityType='location', never 'party' or 'item'", () => {
    const result = checkLocationIsActive({ id: "shared-id", isActive: false });
    expect(result.active).toBe(false);
    if (!result.active) {
      expect(result.entityType).toBe("location");
      expect(result.entityType).not.toBe("party");
      expect(result.entityType).not.toBe("item");
    }
  });
});
