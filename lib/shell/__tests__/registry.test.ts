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
  // 2026-08-17: surface corrected office -> shared. warehouse_staff (floor
  // tier) needs Master Inventory's Pick Lists tab to generate pick lists and
  // proceed to outgoing — office-only excluded floor sessions from this
  // route entirely. Same reasoning/precedent as receiving/outgoing/sync
  // above. See revision-log.md.
  { id: "inventory", path: "/inventory", surface: "shared", capability: "pick_list.read", featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"], launchStatus: "launch" },
  // 2026-08-09 PO amendment: /outgoing added as a floor pick-execution hub
  // (Active Picks + Outgoing Ledger tabs). See revision-log.md.
  // 2026-08-17: surface corrected floor -> shared, same reasoning as
  // /receiving above. outgoing/page.tsx's own header comment already
  // documented "Surface: Floor (primary) / Office (secondary review)" —
  // the Outgoing Ledger tab is office-context read-only review, same shape
  // as receiving's WRRs tab. The floor-only tag meant selectRoutesForPresentation
  // dropped /outgoing from the office sidebar entirely, contradicting both
  // that comment and multi-agent-work-division.md's confirmed sidebar target
  // (Withdrawal / Outgoing listed under MAIN). See revision-log.md.
  { id: "outgoing", path: "/outgoing", surface: "shared", capability: "pick_list.execute", featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"], launchStatus: "launch" },
  { id: "inventory-pick-list-execute", path: "/pick-lists/[pickListId]/pick", surface: "floor", capability: "pick_list.execute", featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"], launchStatus: "launch" },
  { id: "inventory-pick-list-dispatch", path: "/pick-lists/[pickListId]/dispatch", surface: "floor", capability: "dispatch.execute", featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"], launchStatus: "launch" },
  { id: "documents", path: "/documents", surface: "office", capability: "documents.read", featureSpecs: ["10-pick-list-and-acknowledgement-receipt"], launchStatus: "planned" },
  { id: "approvals", path: "/approvals", surface: "office", capability: "fifo_override.approve", featureSpecs: ["09-approval-queue"], launchStatus: "launch" },
  // 2026-08-17: surface corrected floor -> shared. multi-agent-work-division.md's
  // confirmed sidebar target lists Sync under the office sidebar's SYSTEM
  // group — a status indicator page, not a floor-scan-loop action, so there
  // is no reason to hide it from office/administrator sessions. See revision-log.md.
  { id: "sync", path: "/sync", surface: "shared", capability: "none", featureSpecs: ["03-offline-mode-and-client-storage"], launchStatus: "launch" },
  // 2026-08-17: 'transfers', 'inspection', and 'inspection-detail' rows were
  // removed from this fixture — the merged Transfer+Inspection queue
  // restructure retired their pages to redirects (see the second describe
  // block below), so they are no longer nav-visible destinations. This
  // resolves the intentional contradiction this file's second describe
  // block previously documented between the two fixtures.
  // 2026-08-09 PO amendment: /enrollment added as office Master Data hub
  // (Parties / Items / Locations tabs). See revision-log.md.
  // 2026-08-11: this is now the SOLE Master Data nav entry — the separate
  // "parties"/"items"/"locations" rows that used to sit here (each pointing
  // at /master-data/parties|items|locations as its own sidebar link) were
  // removed, since those list pages duplicated exactly what this hub's three
  // tabs already show. The underlying /master-data/parties|items|locations
  // detail/new/edit routes are unchanged and still reachable via direct
  // links from within this hub's tabs — they just no longer have their own
  // top-level registry row. See revision-log.md.
  { id: "enrollment", path: "/enrollment", surface: "office", capability: "parties.read", featureSpecs: ["06-party-and-item-enrollment"], launchStatus: "launch" },
  // 2026-08-09: added — was already in 05's design.md route table (Planned)
  // but had never been added to this registry. See revision-log.md.
  // 2026-08-24: launchStatus corrected planned -> launch — the page now
  // reads real data via getVmiCbmLedgerSummary/getTradingMarginLedger
  // (lib/billing/queries/), no mock arrays remain. See revision-log.md.
  { id: "billing-pricing", path: "/billing-pricing", surface: "office", capability: "reporting.financial_read", featureSpecs: ["12-vmi-billing", "13-trading-orders-and-pricing"], launchStatus: "launch" },
  // 2026-08-17: launchStatus corrected planned -> launch — the page is
  // fully wired to real query modules, no TODO/mock markers. See revision-log.md.
  { id: "reports", path: "/reports", surface: "office", capability: "reporting.read", featureSpecs: ["16-reporting-and-analytics"], launchStatus: "launch" },
  { id: "profile", path: "/profile", surface: "shared", capability: "none", featureSpecs: ["21-user-profile-and-settings"], launchStatus: "launch" },
  { id: "settings", path: "/settings", surface: "office", capability: "users.read", featureSpecs: ["21-user-profile-and-settings"], launchStatus: "launch" },
  { id: "portal", path: "/portal", surface: "party", capability: "none", featureSpecs: ["22-parties-portal"], launchStatus: "launch" },
  { id: "portal-inventory", path: "/portal/inventory", surface: "party", capability: "reporting.read", featureSpecs: ["22-parties-portal"], launchStatus: "launch" },
  { id: "portal-orders", path: "/portal/orders", surface: "party", capability: "pick_list.read", featureSpecs: ["22-parties-portal"], launchStatus: "launch" },
  { id: "portal-documents", path: "/portal/documents", surface: "party", capability: "documents.read", featureSpecs: ["22-parties-portal"], launchStatus: "launch" },
  { id: "portal-notifications", path: "/portal/notifications", surface: "party", capability: "notifications.read", featureSpecs: ["22-parties-portal"], launchStatus: "planned" },
  { id: "portal-labels", path: "/portal/labels", surface: "party", capability: "shipment_labels.generate", featureSpecs: ["22-parties-portal"], launchStatus: "planned" },
];

describe("lib/shell/registry — route catalog matches design.md §3.2 exactly (R3.1, R3.2)", () => {
  it("exports ROUTE_REGISTRY with exactly the current rows (no stale /dashboard, no extra/missing rows; 2026-08-11 consolidates Master Data nav down to the single /enrollment entry; 2026-08-17 retires 'transfers'/'inspection'/'inspection-detail' to redirect-only pages)", async () => {
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

  it("no longer registers standalone /master-data/parties, /master-data/items, or /master-data/locations rows — /enrollment is the sole Master Data nav entry (2026-08-11 consolidation)", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    expect(ROUTE_REGISTRY.some((row) => row.path === "/master-data/parties")).toBe(false);
    expect(ROUTE_REGISTRY.some((row) => row.path === "/master-data/items")).toBe(false);
    expect(ROUTE_REGISTRY.some((row) => row.path === "/master-data/locations")).toBe(false);

    const enrollment = ROUTE_REGISTRY.find((row) => row.path === "/enrollment");
    expect(enrollment?.capability).toBe("parties.read");
    expect(enrollment?.group).toBe("Master Data");
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

// ---------------------------------------------------------------------------
// RED step for the 2026-08-17 sidebar/IA restructure.
//
// Backing acceptance criterion: specs/05-ui-shell-and-navigation/requirements.md
// R3.2 ("Each entry SHALL support, at minimum, ... navigation group, ...").
// The specific 5(+1)-group taxonomy below is the Product Owner's confirmed
// target, recorded in specs/00-steering/multi-agent-work-division.md's
// "Sidebar structure — confirmed target (2026-08-17)" section. That section
// is this cycle's authoritative source for the exact reassignment table and
// removed-entry list -- it supersedes registry.test.ts's older
// EXPECTED_ROUTES fixture above wherever the two disagree (this new block
// intentionally does not touch that older fixture/its `id: "transfers"` /
// `id: "inspection"` rows -- those will need updating in the same PR that
// implements the removal, since the two describe blocks currently make
// contradictory assertions about the same rows on purpose, to prove this
// block is RED against the CURRENT registry.ts state).
//
// Determination made after reading the code (not assumed): the party portal
// sidebar (`surface: "party"`, tier: "party") is NOT rendered through a
// separate mechanism today -- ShellNavigation's non-floor branch renders the
// exact same `groupRoutesForSidebar()` / `GroupedSections` path for
// tier==="office" and tier==="party" alike (see
// components/global/ShellNavigation.tsx's single non-floor return block, and
// components/global/__tests__/ShellNavigation.test.tsx's "renders the
// desktop sidebar (office composition) for tier='party'" and "renders the
// drawer for tier='party' too, since party uses the office-shape sidebar"
// tests). `groupRoutesForSidebar` buckets strictly by
// `NAV_GROUP_ORDER.filter((group) => byGroup.has(group))` -- so dropping
// "Organization Portal" from NAV_GROUP_ORDER, as the work-division doc's
// prose literally suggests ("Organization Portal is deliberately absent...
// not part of this internal-staff sidebar"), would silently render ZERO
// nav sections for every party-tier session, since portal rows' `group`
// value has nowhere left to bucket into. No replacement portal-sidebar
// mechanism exists in the codebase today. Per this repo's decision
// principle (resolve by what's best-suited to the system, don't just ask),
// this test file keeps "Organization Portal" as a 6th `NAV_GROUP_ORDER`
// value rather than removing it outright -- the restructure is "5 groups
// for the internal-staff surface, plus the portal's own untouched 6th" not
// literally "NAV_GROUP_ORDER has exactly 5 entries total." Flag this to the
// builder explicitly: if the intent really was to fully separate the portal
// sidebar onto its own non-shared component, that is materially more work
// than a registry rewrite and belongs in its own spec'd task, not silently
// folded into this cycle.
describe("lib/shell/registry — 2026-08-17 sidebar/IA restructure (R3.2, multi-agent-work-division.md 'Sidebar structure — confirmed target')", () => {
  it("NAV_GROUP_ORDER is exactly the 5 restructured internal-staff groups plus the untouched 'Organization Portal' group (6 total, in this order)", async () => {
    const { NAV_GROUP_ORDER } = await import("../registry");
    expect(NAV_GROUP_ORDER).toEqual([
      "Main",
      "Reports",
      "Master Data",
      "System",
      "Account",
      "Organization Portal",
    ]);
  });

  it("NAV_GROUP_ORDER no longer contains any of the 7 retired internal-staff group names", async () => {
    const { NAV_GROUP_ORDER } = await import("../registry");
    const retired = [
      "Overview",
      "Receiving / Incoming",
      "Master Inventory",
      "Outgoing / Withdrawal",
      "Transfers & Inspection",
      "Approvals",
      "Reporting",
    ];
    for (const retiredGroup of retired) {
      expect(NAV_GROUP_ORDER).not.toContain(retiredGroup);
    }
  });

  // Reassignment table, spot-checked entry by entry (multi-agent-work-division.md
  // "Sidebar structure" section, and its "What this means for the registry
  // rewrite" bullets):
  //   root, receiving, inventory, outgoing, approvals -> "Main"
  //   reports, documents -> "Reports"
  //   enrollment, billing-pricing -> "Master Data"
  //   sync -> "System"
  //   profile, settings -> "Account"
  const REASSIGNED_TO_MAIN = ["root", "receiving", "inventory", "outgoing", "approvals"];
  const REASSIGNED_TO_REPORTS = ["reports", "documents"];
  const REASSIGNED_TO_MASTER_DATA = ["enrollment", "billing-pricing"];
  const REASSIGNED_TO_SYSTEM = ["sync"];
  const REASSIGNED_TO_ACCOUNT = ["profile", "settings"];

  it.each(REASSIGNED_TO_MAIN)("entry '%s' has group 'Main'", async (id) => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const entry = ROUTE_REGISTRY.find((row) => row.id === id);
    expect(entry, `expected a registry row with id ${id}`).toBeDefined();
    expect(entry!.group).toBe("Main");
  });

  it.each(REASSIGNED_TO_REPORTS)("entry '%s' has group 'Reports'", async (id) => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const entry = ROUTE_REGISTRY.find((row) => row.id === id);
    expect(entry, `expected a registry row with id ${id}`).toBeDefined();
    expect(entry!.group).toBe("Reports");
  });

  it.each(REASSIGNED_TO_MASTER_DATA)("entry '%s' has group 'Master Data'", async (id) => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const entry = ROUTE_REGISTRY.find((row) => row.id === id);
    expect(entry, `expected a registry row with id ${id}`).toBeDefined();
    expect(entry!.group).toBe("Master Data");
  });

  it.each(REASSIGNED_TO_SYSTEM)("entry '%s' has group 'System'", async (id) => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const entry = ROUTE_REGISTRY.find((row) => row.id === id);
    expect(entry, `expected a registry row with id ${id}`).toBeDefined();
    expect(entry!.group).toBe("System");
  });

  it.each(REASSIGNED_TO_ACCOUNT)("entry '%s' has group 'Account'", async (id) => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const entry = ROUTE_REGISTRY.find((row) => row.id === id);
    expect(entry, `expected a registry row with id ${id}`).toBeDefined();
    expect(entry!.group).toBe("Account");
  });

  // Dynamic-segment siblings: stay as entries, just inherit their
  // non-detail sibling's new group value.
  it("'receiving-detail' inherits 'receiving's new group ('Main')", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const entry = ROUTE_REGISTRY.find((row) => row.id === "receiving-detail");
    expect(entry, "expected a registry row with id receiving-detail").toBeDefined();
    expect(entry!.group).toBe("Main");
  });

  it("'inventory-pick-list-execute' and 'inventory-pick-list-dispatch' inherit 'outgoing's new group ('Main')", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    for (const id of ["inventory-pick-list-execute", "inventory-pick-list-dispatch"]) {
      const entry = ROUTE_REGISTRY.find((row) => row.id === id);
      expect(entry, `expected a registry row with id ${id}`).toBeDefined();
      expect(entry!.group).toBe("Main");
    }
  });

  // Portal rows are explicitly untouched by this restructure -- still
  // "Organization Portal".
  it("portal rows keep group 'Organization Portal', unchanged by this restructure", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    const portalIds = [
      "portal",
      "portal-inventory",
      "portal-orders",
      "portal-documents",
      "portal-notifications",
      "portal-labels",
    ];
    for (const id of portalIds) {
      const entry = ROUTE_REGISTRY.find((row) => row.id === id);
      expect(entry, `expected a registry row with id ${id}`).toBeDefined();
      expect(entry!.group).toBe("Organization Portal");
    }
  });

  // The merged Transfer+Inspection queue removal: /transfers, /inspection,
  // and /inspection/[inspection_id] become redirect-only pages, so their
  // ROUTE_REGISTRY rows must be gone -- a redirect target is not a
  // nav-visible destination.
  it("no longer registers 'transfers', 'inspection', or 'inspection-detail' rows (retired -> redirect-only pages)", async () => {
    const { ROUTE_REGISTRY } = await import("../registry");
    expect(ROUTE_REGISTRY.some((row) => row.id === "transfers")).toBe(false);
    expect(ROUTE_REGISTRY.some((row) => row.id === "inspection")).toBe(false);
    expect(ROUTE_REGISTRY.some((row) => row.id === "inspection-detail")).toBe(false);
    expect(ROUTE_REGISTRY.some((row) => row.path === "/transfers")).toBe(false);
    expect(ROUTE_REGISTRY.some((row) => row.path === "/inspection")).toBe(false);
    expect(ROUTE_REGISTRY.some((row) => row.path === "/inspection/[inspection_id]")).toBe(false);
  });
});
