// Typed route catalog for the shell.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.2 (route
// inventory table, 2026-08-07 amendment state: general landing page `/`,
// the `/parties`/`/items`/`/locations` `.read`-gate correction) and §5
// (typed navigation registry contract).
//
// This module owns ONLY the static route catalog. It performs no
// capability filtering (lib/shell/navigation.ts), no active-route matching
// (lib/shell/active-route.ts), and no authorization decision of any kind —
// per design.md §5, "The registry SHALL not be treated as an authorization
// boundary."

export type ShellSurface = "floor" | "office" | "shared" | "party";
export type RouteLaunchStatus = "launch" | "planned";

// Sidebar section grouping (added 2026-08-09, per Product Owner request:
// the office desktop sidebar was one flat list of ~15 links with no
// structure). Purely a presentation grouping for `ShellNavigation`'s
// office/party rendering — NOT a capability boundary and not consulted by
// `filterVisibleRoutes`/`selectRoutesForPresentation`, which still operate
// on the flat registry exactly as before. Order here is the intended
// display order of the groups themselves; entries within a group keep
// their existing relative order from ROUTE_REGISTRY.
export type NavGroup =
  | "Overview"
  | "Receiving / Incoming"
  | "Master Inventory"
  | "Outgoing / Withdrawal"
  | "Transfers & Inspection"
  | "Approvals"
  | "Master Data"
  | "Documents"
  | "Reporting"
  | "System"
  | "Account"
  | "Party Portal";

// 2026-08-11 PO correction: "Receiving" -> "Receiving / Incoming" and
// "Outbound" -> "Outgoing / Withdrawal" (clearer operational naming); Master
// Inventory split into its own group -- it is the Inventory Controller's
// table-with-expandable-rows audit/research page (owned by
// 01-core-data-model, see design.md's "Master Inventory UI Pattern"
// section), not part of the outbound pick/dispatch workflow it used to sit
// alongside. See specs/00-steering/revision-log.md.
export const NAV_GROUP_ORDER: readonly NavGroup[] = [
  "Overview",
  "Receiving / Incoming",
  "Master Inventory",
  "Outgoing / Withdrawal",
  "Transfers & Inspection",
  "Approvals",
  "Master Data",
  "Documents",
  "Reporting",
  "System",
  "Account",
  "Party Portal",
];

export interface RouteRegistryEntry {
  id: string;
  path: string;
  surface: ShellSurface;
  capability: string;
  featureSpecs: readonly string[];
  launchStatus: RouteLaunchStatus;
  group: NavGroup;
  offlineFeatureGated?: boolean;
}

export const ROUTE_REGISTRY: readonly RouteRegistryEntry[] = [
  {
    id: "root",
    path: "/",
    surface: "shared",
    capability: "none",
    featureSpecs: ["05-ui-shell-and-navigation"],
    launchStatus: "launch",
    group: "Overview",
  },
  {
    id: "receiving",
    path: "/receiving",
    surface: "shared",
    capability: "receiving.view",
    featureSpecs: ["07-incoming-receiving"],
    launchStatus: "launch",
    group: "Receiving / Incoming",
  },
  {
    id: "receiving-detail",
    path: "/receiving/[wrr_id]",
    surface: "floor",
    capability: "receiving.view",
    featureSpecs: ["07-incoming-receiving"],
    launchStatus: "launch",
    group: "Receiving / Incoming",
  },
  {
    // 2026-08-11: split out of "Outbound" into its own "Master Inventory"
    // group — this is the Inventory Controller's table-with-expandable-rows
    // audit/research page (owned by 01-core-data-model, not by outbound
    // pick/dispatch workflow), distinct from the /outgoing floor flow below
    // even though it's the page that generates the pick list /outgoing then
    // executes. See specs/00-steering/revision-log.md.
    id: "inventory",
    path: "/inventory",
    surface: "office",
    capability: "pick_list.read",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
    group: "Master Inventory",
  },
  {
    id: "outgoing",
    path: "/outgoing",
    surface: "floor",
    capability: "pick_list.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
    group: "Outgoing / Withdrawal",
  },
  {
    id: "inventory-pick-list-execute",
    path: "/pick-lists/[pickListId]/pick",
    surface: "floor",
    capability: "pick_list.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
    group: "Outgoing / Withdrawal",
  },
  {
    // 2026-08-11: dispatch (the scan-out-and-generate-AR step) is the one
    // genuinely floor-only stage of outbound withdrawal — see revision-log.md.
    id: "inventory-pick-list-dispatch",
    path: "/pick-lists/[pickListId]/dispatch",
    surface: "floor",
    capability: "dispatch.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
    group: "Outgoing / Withdrawal",
  },
  {
    // launchStatus updated to "launch" 2026-08-09 — /inspection page and
    // /inspection/[id] page are now built per spec 11 UI tasks.
    id: "inspection",
    path: "/inspection",
    surface: "shared",
    capability: "inspection.perform",
    featureSpecs: [
      "07-incoming-receiving",
      "08-outgoing-withdrawal-and-two-stage-commitment",
      "11-transfer-and-inspection",
    ],
    launchStatus: "launch",
    group: "Transfers & Inspection",
  },
  {
    id: "inspection-detail",
    path: "/inspection/[inspection_id]",
    surface: "floor",
    capability: "inspection.perform",
    featureSpecs: [
      "07-incoming-receiving",
      "08-outgoing-withdrawal-and-two-stage-commitment",
      "11-transfer-and-inspection",
    ],
    launchStatus: "launch",
    group: "Transfers & Inspection",
  },
  {
    // Removed 2026-08-08: the standalone `/dispatch/[pick_list_id]` row
    // that used to be here was never built. Dispatch actually lives at
    // `/pick-lists/[pickListId]/dispatch` — see the "inventory-pick-list-
    // dispatch" entry above. See revision-log.md.
    id: "documents",
    path: "/documents",
    surface: "office",
    capability: "documents.read",
    featureSpecs: ["10-pick-list-and-acknowledgement-receipt"],
    launchStatus: "planned",
    group: "Documents",
  },
  {
    id: "approvals",
    path: "/approvals",
    surface: "office",
    capability: "fifo_override.approve",
    featureSpecs: ["09-approval-queue"],
    launchStatus: "launch",
    group: "Approvals",
  },
  {
    // 2026-08-09: launchStatus updated to "launch" — /sync conflict review
    // surface is now built per spec 03 design.md §6.6/§9.1. The surface is
    // office-style (supervisor conflict review) even though the registry entry
    // lists surface "floor" (the floor only shows a shell banner pointing here;
    // the full conflict review UI is office-style per design.md §9).
    id: "sync",
    path: "/sync",
    surface: "floor",
    capability: "none",
    featureSpecs: ["03-offline-mode-and-client-storage"],
    launchStatus: "launch",
    offlineFeatureGated: true,
    group: "System",
  },
  {
    // 2026-08-08: corrected `transfers.read` -> `transfer.view` (singular).
    // 0014_transfer_rls_policies.sql deliberately seeds a singular `transfer`
    // resource as "the authoritative capability vocabulary for this
    // feature's RLS surface per design.md §5" -- this row was simply never
    // updated to match when that decision was made. See revision-log.md.
    id: "transfers",
    path: "/transfers",
    surface: "shared",
    capability: "transfer.view",
    featureSpecs: ["11-transfer-and-inspection"],
    launchStatus: "launch",
    group: "Transfers & Inspection",
  },
  {
    // 2026-08-11: this is now the SOLE Master Data nav entry. The separate
    // "parties"/"items"/"locations" registry rows that used to point at
    // /master-data/parties|items|locations as their own sidebar links were
    // removed — those list pages duplicated exactly what this hub's three
    // tabs already show. The underlying /master-data/parties|items|locations
    // detail, /new, and /[id]/edit routes are unchanged and still reachable
    // — enrollment/page.tsx links directly into them from each tab (e.g.
    // "New Party" -> /master-data/parties/new) — they simply no longer have
    // their own top-level sidebar entry. See specs/00-steering/revision-log.md.
    id: "enrollment",
    path: "/enrollment",
    surface: "office",
    capability: "parties.read",
    featureSpecs: ["06-party-and-item-enrollment"],
    launchStatus: "launch",
    group: "Master Data",
  },
  {
    id: "billing-pricing",
    path: "/billing-pricing",
    surface: "office",
    capability: "reporting.financial_read",
    featureSpecs: ["12-vmi-billing", "13-trading-orders-and-pricing"],
    launchStatus: "planned",
    group: "Reporting",
  },
  {
    id: "reports",
    path: "/reports",
    surface: "office",
    capability: "reporting.read",
    featureSpecs: ["16-reporting-and-analytics"],
    launchStatus: "planned",
    group: "Reporting",
  },
  {
    id: "profile",
    path: "/profile",
    surface: "shared",
    capability: "none",
    featureSpecs: ["21-user-profile-and-settings"],
    launchStatus: "launch",
    group: "Account",
  },
  {
    id: "settings",
    path: "/settings",
    surface: "office",
    capability: "users.read",
    featureSpecs: ["21-user-profile-and-settings"],
    launchStatus: "launch",
    group: "Account",
  },
  {
    // 2026-08-09: launchStatus updated to "launch" — /portal hub page is now
    // built per spec 22 design.md §3 (party surface, office-style glassmorphism).
    id: "portal",
    path: "/portal",
    surface: "party",
    capability: "none",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "launch",
    group: "Party Portal",
  },
  {
    // 2026-08-09: launchStatus updated to "launch" — /portal/inventory page
    // built per spec 22 design.md §5 (VMI inventory-position view, read-only).
    id: "portal-inventory",
    path: "/portal/inventory",
    surface: "party",
    capability: "reporting.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "launch",
    group: "Party Portal",
  },
  {
    // 2026-08-09: launchStatus updated to "launch" — /portal/orders page
    // built per spec 22 design.md §6 (Trading order/document history, read-only).
    id: "portal-orders",
    path: "/portal/orders",
    surface: "party",
    capability: "pick_list.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "launch",
    group: "Party Portal",
  },
  {
    // 2026-08-09: launchStatus updated to "launch" — /portal/documents page
    // built per spec 22 design.md §7 (pick lists + acknowledgement receipts,
    // read-only; VMI statements sub-task remains blocked on Task 1 gate).
    id: "portal-documents",
    path: "/portal/documents",
    surface: "party",
    capability: "documents.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "launch",
    group: "Party Portal",
  },
  {
    id: "portal-notifications",
    path: "/portal/notifications",
    surface: "party",
    capability: "notifications.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
    group: "Party Portal",
  },
  {
    id: "portal-labels",
    path: "/portal/labels",
    surface: "party",
    capability: "shipment_labels.generate",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
    group: "Party Portal",
  },
];
