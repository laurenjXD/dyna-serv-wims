// RED-step test for `app/(authenticated)/inventory/_lib/resolveInventoryTab.ts`,
// which does not exist yet. `page.tsx`'s inline tab-resolution ternary
// (`tabParam === "pick-lists" ? ... : tabParam === "daily-inspection" ? ... :
// "stock-view"`) is extracted into a standalone pure function so the legacy
// `?tab=daily-inspection` alias can be tested directly, without needing to
// mock the whole page's server-side DB layer (the same reasoning behind
// extracting FloorLanding/OfficeLanding/InspectionTab this session). This
// also keeps `page.tsx`'s existing single-export contract intact — see
// app/(authenticated)/inventory/__tests__/page.test.tsx's
// "AC R9.4: page module exports only the default component" assertion,
// which this new module deliberately does not touch.
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md §Terminology Alignment /
//     Acceptance criteria — "Inspection" replaces "Daily Inspection" in
//     UI labels; the URL/tab-key rename from "daily-inspection" to
//     "inspection" is the mechanical part of that rename at the routing
//     layer.
//   specs/05-ui-shell-and-navigation/requirements.md R6.7-adjacent
//     graceful-redirect philosophy already used elsewhere in this codebase
//     for retired routes — old `?tab=daily-inspection` links/bookmarks must
//     keep resolving to the same tab rather than silently falling back to
//     the default "stock-view" tab.
//
// Assumed contract (RED-step decision):
//   export type TabKey = "stock-view" | "pick-lists" | "inspection";
//   export function resolveInventoryTab(tabParam?: string): TabKey
//     - "pick-lists" -> "pick-lists"
//     - "inspection" -> "inspection"
//     - "daily-inspection" -> "inspection"  (legacy alias)
//     - anything else / undefined -> "stock-view" (default)
//   Expected failure mode if the module does not exist:
//     "Cannot find module '../resolveInventoryTab'" (or similar resolve error).

import { describe, expect, it } from "vitest";
import { resolveInventoryTab } from "../resolveInventoryTab";

describe("resolveInventoryTab (app/(authenticated)/inventory/_lib/resolveInventoryTab.ts)", () => {
  it("AC-terminology: resolves 'inspection' to the 'inspection' tab", () => {
    expect(resolveInventoryTab("inspection")).toBe("inspection");
  });

  // Legacy alias — old bookmarks/links using the retired "daily-inspection"
  // tab key must still resolve to the same (renamed) tab.
  it("AC-terminology: resolves the legacy 'daily-inspection' alias to the 'inspection' tab", () => {
    expect(resolveInventoryTab("daily-inspection")).toBe("inspection");
  });

  it("resolves 'pick-lists' to the 'pick-lists' tab", () => {
    expect(resolveInventoryTab("pick-lists")).toBe("pick-lists");
  });

  it("defaults to 'stock-view' when tabParam is undefined", () => {
    expect(resolveInventoryTab(undefined)).toBe("stock-view");
  });

  it("defaults to 'stock-view' for an unrecognized tabParam", () => {
    expect(resolveInventoryTab("not-a-real-tab")).toBe("stock-view");
  });
});
