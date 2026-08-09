// RED-step unit tests for lib/shell/registry.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.2 (route
// inventory table, as amended 2026-08-07: `/` general landing page, the
// `/parties`/`/items`/`/locations` `.read`-gate correction, and the added
// `/locations` row) and §5 (typed navigation registry contract — capability
// field format `resource.action`, `featureStatus`/launch-status semantics).
//
// Backing acceptance criteria: specs/05-ui-shell-and-navigation/requirements.md
// R3.1 ("Navigation entries SHALL be defined through a typed central
// registry"), R3.2 (minimum entry fields: identifier, path, surface, required
// capability reference), R3.3 (registry supports entries whose owning spec is
// not yet approved -- `launchStatus: "planned"`).
//
// This file tests ONLY that a route catalog module exists and its data
// matches design.md §3.2's CURRENT table exactly -- not the old `/dashboard`
// draft, not the old `.manage`-gated `/parties`/`/items`, and including the
// `/locations` row this design amended in today. It intentionally does NOT
// test capability-based visibility filtering (lib/shell/navigation.ts) or
// active-route matching (lib/shell/active-route.ts) -- those are separate
// RED files against separate modules, per this session's module-boundary
// decision (documented in lib/shell/__tests__/navigation.test.ts).
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/registry.ts (for frontend-builder):
//
//   export type ShellSurface = "floor" | "office" | "shared" | "party";
//   export type RouteLaunchStatus = "launch" | "planned";
//
//   export interface RouteRegistryEntry {
//     id: string;                       // stable, used for active-route
//                                        // matching and tests -- not a
//                                        // permission (design.md §5).
//     path: string;                     // exact route path from §3.2,
//                                        // including dynamic segments in
//                                        // their literal bracket form, e.g.
//                                        // "/receiving/[wrr_id]".
//     surface: ShellSurface;
//     capability: string;               // "resource.action" or the literal
//                                        // "none" for capability-less routes
//                                        // (design.md §5: "no capability
//                                        // field is unconditionally visible").
//     featureSpecs: readonly string[];  // one or more owning spec folder
//                                        // names, e.g. ["07-incoming-receiving"];
//                                        // more than one entry only for the
//                                        // two /inspection rows (§3.2).
//     launchStatus: RouteLaunchStatus;
//     offlineFeatureGated?: boolean;    // true ONLY for "/sync" -- its
//                                        // launch is additionally conditional
//                                        // on the offline feature being
//                                        // application-enabled, per §3.2's
//                                        // "(when offline feature enabled)"
//                                        // annotation and requirements.md's
//                                        // rule that this is not a capability
//                                        // gate.
//   }
//
//   export const ROUTE_REGISTRY: readonly RouteRegistryEntry[];
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

// The exact, current §3.2 route table (2026-08-07 amendment state) as this
// RED step expects it to be represented. `id` values are this test file's
// own naming choice (design.md does not fix exact ids) -- kept short/stable
// and documented here so the implementer can reuse them rather than invent a
// different, undocumented set.
const EXPECTED_ROUTES: Array<{
  id: string;
  path: string;
  surface: string;
  capability: string;
  featureSpecs: string[];
  launchStatus: string;
}> = [
  { id: "root", path: "/", surface: "shared", capability: "none", featureSpecs: ["05-ui-shell-and-navigation"], launchStatus: "launch" },
  // 2026-08-09 PO amendment: surface changed floor -> shared. /receiving hosts
  // both the floor Receive tab (warehouse staff) and the office WRRs tab
  // (supervisors), so it must be declared shared. See revision-log.md.
  { id: "receiving", path: "/receiving", surface: "shared", capability: "receiving.view", featureSpecs: ["07-incoming-receiving"], launchStatus: "launch" },
  { id: "receiving-detail", path: "/receiving/[wrr_id]", surface: "floor", capability: "receiving.view", featureSpecs: ["07-incoming-receiving"], launchStatus: "launch" },
  // 2026-08-09: corrected back to /inventory — the standalone /pick-lists
  // and /outgoing-ledger routes were merged into inventory/page.tsx (Pick
  // Lists + Ledger tabs). The floor pick/dispatch detail routes stay at
  // /pick-lists/[pickListId]/... unchanged. See revision-log.md.
  { id: "inventory", path: "/inventory", surface: "office", capability: "pick_list.read", featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"], launchStatus: "launch" },
  // 2026-08-09 PO amendment: /outgoing added as a floor pick-execution hub
  // (Active Picks + Outgoing Ledger tabs). See revision-log.md.
  { id: "outgoing", path: "/outgoing", surface: "floor", capability: "pick_list.execute", featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"], launchStatus: "launch" },
  { id: "inventory-pick-list-execute", path: "/pick-lists/[pickListId]/pick", surface: "floor", capability: "pick_list.execute", featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"], launchStatus: "launch" },
  { id: "inventory-pick-list-dispatch", path: "/pick-lists/[pickListId]/dispatch", surface: "floor", capability: "dispatch.execute", featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"], launchStatus: "launch" },
  { id: "inspection", path: "/inspection", surface: "shared", capability: "inspection.perform", featureSpecs: ["07-incoming-receiving", "08-outgoing-withdrawal-and-two-stage-commitment", "11-transfer-and-inspection"], launchStatus: "planned" },
  { id: "inspection-detail", path: "/inspection/[inspection_id]", surface: "floor", capability: "inspection.perform", featureSpecs: ["07-incoming-receiving", "08-outgoing-withdrawal-and-two-stage-commitment", "11-transfer-and-inspection"], launchStatus: "planned" },
  { id: "documents", path: "/documents", surface: "office", capability: "documents.read", featureSpecs: ["10-pick-list-and-acknowledgement-receipt"], launchStatus: "planned" },
  { id: "approvals", path: "/approvals", surface: "office", capability: "fifo_override.approve", featureSpecs: ["09-approval-queue"], launchStatus: "launch" },
  { id: "sync", path: "/sync", surface: "floor", capability: "none", featureSpecs: ["03-offline-mode-and-client-storage"], launchStatus: "planned" },
  // 2026-08-08: corrected transfers.read -> transfer.view (singular) —
  // 0014_transfer_rls_policies.sql's deliberate, documented capability
  // vocabulary for this feature. See revision-log.md.
  { id: "transfers", path: "/transfers", surface: "shared", capability: "transfer.view", featureSpecs: ["11-transfer-and-inspection"], launchStatus: "launch" },
  // 2026-08-09 PO amendment: /enrollment added as office Master Data hub
  // (Parties / Items / Locations tabs). See revision-log.md.
  { id: "enrollment", path: "/enrollment", surface: "office", capability: "parties.read", featureSpecs: ["06-party-and-item-enrollment"], launchStatus: "launch" },
  { id: "parties", path: "/master-data/parties", surface: "office", capability: "parties.read", featureSpecs: ["06-party-and-item-enrollment"], launchStatus: "launch" },
  { id: "items", path: "/master-data/items", surface: "office", capability: "items.read", featureSpecs: ["06-party-and-item-enrollment"], launchStatus: "launch" },
  { id: "locations", path: "/master-data/locations", surface: "office", capability: "locations.read", featureSpecs: ["06-party-and-item-enrollment"], launchStatus: "launch" },
  // 2026-08-09: added — was already in 05's design.md route table (Planned)
  // but had never been added to this registry. See revision-log.md.
  { id: "billing-pricing", path: "/billing-pricing", surface: "office", capability: "reporting.financial_read", featureSpecs: ["12-vmi-billing", "13-trading-orders-and-pricing"], launchStatus: "planned" },
  { id: "reports", path: "/reports", surface: "office", capability: "reporting.read", featureSpecs: ["16-reporting-and-analytics"], launchStatus: "planned" },
  { id: "profile", path: "/profile", surface: "shared", capability: "none", featureSpecs: ["21-user-profile-and-settings"], launchStatus: "launch" },
  { id: "settings", path: "/settings", surface: "office", capability: "users.read", featureSpecs: ["21-user-profile-and-settings"], launchStatus: "launch" },
  { id: "portal", path: "/portal", surface: "party", capability: "none", featureSpecs: ["22-parties-portal"], launchStatus: "planned" },
  { id: "portal-inventory", path: "/portal/inventory", surface: "party", capability: "reporting.read", featureSpecs: ["22-parties-portal"], launchStatus: "planned" },
  { id: "portal-orders", path: "/portal/orders", surface: "party", capability: "pick_list.read", featureSpecs: ["22-parties-portal"], launchStatus: "planned" },
  { id: "portal-documents", path: "/portal/documents", surface: "party", capability: "documents.read", featureSpecs: ["22-parties-portal"], launchStatus: "planned" },
  { id: "portal-notifications", path: "/portal/notifications", surface: "party", capability: "notifications.read", featureSpecs: ["22-parties-portal"], launchStatus: "planned" },
  { id: "portal-labels", path: "/portal/labels", surface: "party", capability: "shipment_labels.generate", featureSpecs: ["22-parties-portal"], launchStatus: "planned" },
];

describe("lib/shell/registry — route catalog matches design.md §3.2 exactly (R3.1, R3.2)", () => {
  it("exports ROUTE_REGISTRY with exactly the current 27 rows (no stale /dashboard, no extra/missing rows; 2026-08-09 PO amendment adds /outgoing floor pick-execution hub and /enrollment office master-data hub, changes /receiving surface to shared)", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    expect(Array.isArray(ROUTE_REGISTRY)).toBe(true);
    expect(ROUTE_REGISTRY).toHaveLength(EXPECTED_ROUTES.length);
  });

  it.each(EXPECTED_ROUTES)(
    "row for path %j has the exact surface, capability, featureSpecs, and launchStatus from §3.2",
    async (expected) => {
      const { ROUTE_REGISTRY } = await import("../registry");
      const entry = ROUTE_REGISTRY.find((row) => row.path === expected.path);
      expect(entry, `expected a registry row for path ${expected.path}`).toBeDefined();
      expect(entry!.surface).toBe(expected.surface);
      expect(entry!.capability).toBe(expected.capability);
      expect(entry!.featureSpecs).toEqual(expected.featureSpecs);
      expect(entry!.launchStatus).toBe(expected.launchStatus);
    },
  );

  it("never contains a '/dashboard' route (superseded by '/' per the 2026-08-07 route-collision resolution)", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    expect(ROUTE_REGISTRY.some((row) => row.path === "/dashboard")).toBe(false);
  });

  it("gates /master-data/parties, /master-data/items, and /master-data/locations by the .read capability, never .manage (2026-08-07 route-gate fix)", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const parties = ROUTE_REGISTRY.find((row) => row.path === "/master-data/parties");
    const items = ROUTE_REGISTRY.find((row) => row.path === "/master-data/items");
    const locations = ROUTE_REGISTRY.find((row) => row.path === "/master-data/locations");

    expect(parties?.capability).toBe("parties.read");
    expect(items?.capability).toBe("items.read");
    expect(locations?.capability).toBe("locations.read");

    // Explicitly assert the bug this fix corrected is NOT present.
    expect(parties?.capability).not.toBe("parties.manage");
    expect(items?.capability).not.toBe("items.manage");
    expect(locations?.capability).not.toBe("locations.manage");
  });

  it("marks '/sync' as offline-feature-gated rather than capability-gated (design.md §3.2 rule: not a data-access gate)", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const sync = ROUTE_REGISTRY.find((row) => row.path === "/sync");
    expect(sync?.capability).toBe("none");
    expect(sync?.offlineFeatureGated).toBe(true);
  });

  it("does not mark any other route as offlineFeatureGated", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const gatedOthers = ROUTE_REGISTRY.filter(
      (row) => row.path !== "/sync" && row.offlineFeatureGated === true,
    );
    expect(gatedOthers).toEqual([]);
  });

  it("has unique, non-empty ids and unique paths across every row", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const ids = ROUTE_REGISTRY.map((row) => row.id);
    const paths = ROUTE_REGISTRY.map((row) => row.path);
    expect(new Set(ids).size).toBe(ROUTE_REGISTRY.length);
    expect(new Set(paths).size).toBe(ROUTE_REGISTRY.length);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("every capability field is either the literal 'none' or a well-formed 'resource.action' string", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const capabilityPattern = /^none$|^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
    for (const row of ROUTE_REGISTRY) {
      expect(row.capability).toMatch(capabilityPattern);
    }
  });
});
