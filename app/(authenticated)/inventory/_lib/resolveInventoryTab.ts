// Pure tab-key resolver for the Master Inventory page's `?tab=` query param.
//
// Extracted from the inline ternary in `app/(authenticated)/inventory/page.tsx`
// so it can be unit-tested directly, and so `page.tsx` can keep its
// "exports only `default`" contract (see
// app/(authenticated)/inventory/__tests__/page.test.tsx AC R9.4).
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md §Terminology Alignment —
//     "Inspection" replaces "Daily Inspection" in UI labels; the tab key
//     rename from "daily-inspection" to "inspection" is the routing-layer
//     part of that rename.
//   specs/05-ui-shell-and-navigation/requirements.md R6.7-adjacent
//     graceful-redirect philosophy — old `?tab=daily-inspection` bookmarks
//     must keep resolving to the same (renamed) tab.

export type TabKey = "stock-view" | "pick-lists" | "inspection";

export function resolveInventoryTab(tabParam?: string): TabKey {
  if (tabParam === "pick-lists") return "pick-lists";
  if (tabParam === "inspection" || tabParam === "daily-inspection") return "inspection";
  return "stock-view";
}
