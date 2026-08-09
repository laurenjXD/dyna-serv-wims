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
  | "Receiving"
  | "Outbound"
  | "Transfers & Inspection"
  | "Approvals"
  | "Master Data"
  | "Documents"
  | "Reporting"
  | "System"
  | "Account"
  | "Party Portal";

export const NAV_GROUP_ORDER: readonly NavGroup[] = [
  "Overview",
  "Receiving",
  "Outbound",
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
    group: "Receiving",
  },
  {
    id: "receiving-detail",
    path: "/receiving/[wrr_id]",
    surface: "floor",
    capability: "receiving.view",
    featureSpecs: ["07-incoming-receiving"],
    launchStatus: "launch",
    group: "Receiving",
  },
  {
    // 2026-08-09: registry corrected back to `/inventory` — the standalone
    // `/pick-lists` and `/outgoing-ledger` routes were merged into
    // `inventory/page.tsx` (Pick Lists + Ledger tabs), matching `08` design.md
    // §3's originally-approved route block. The 2026-08-08 note this replaces
    // ("corrected from /inventory to /pick-lists") is superseded, not
    // re-litigated — see revision-log.md.
    id: "inventory",
    path: "/inventory",
    surface: "office",
    capability: "pick_list.read",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
    group: "Outbound",
  },
  {
    id: "outgoing",
    path: "/outgoing",
    surface: "floor",
    capability: "pick_list.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
    group: "Outbound",
  },
  {
    id: "inventory-pick-list-execute",
    path: "/pick-lists/[pickListId]/pick",
    surface: "floor",
    capability: "pick_list.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
    group: "Outbound",
  },
  {
    id: "inventory-pick-list-dispatch",
    path: "/pick-lists/[pickListId]/dispatch",
    surface: "floor",
    capability: "dispatch.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
    group: "Outbound",
  },
  {
    // launchStatus corrected to "planned" 2026-08-08 — no /inspection page
    // has actually been built yet; this row was marked "launch" prematurely.
    id: "inspection",
    path: "/inspection",
    surface: "shared",
    capability: "inspection.perform",
    featureSpecs: [
      "07-incoming-receiving",
      "08-outgoing-withdrawal-and-two-stage-commitment",
      "11-transfer-and-inspection",
    ],
    launchStatus: "planned",
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
    launchStatus: "planned",
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
    id: "sync",
    path: "/sync",
    surface: "floor",
    capability: "none",
    featureSpecs: ["03-offline-mode-and-client-storage"],
    launchStatus: "planned",
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
    id: "enrollment",
    path: "/enrollment",
    surface: "office",
    capability: "parties.read",
    featureSpecs: ["06-party-and-item-enrollment"],
    launchStatus: "launch",
    group: "Master Data",
  },
  {
    // 2026-08-08: corrected from `/parties` to the actually-built
    // `/master-data/parties` — see revision-log.md.
    id: "parties",
    path: "/master-data/parties",
    surface: "office",
    capability: "parties.read",
    featureSpecs: ["06-party-and-item-enrollment"],
    launchStatus: "launch",
    group: "Master Data",
  },
  {
    id: "items",
    path: "/master-data/items",
    surface: "office",
    capability: "items.read",
    featureSpecs: ["06-party-and-item-enrollment"],
    launchStatus: "launch",
    group: "Master Data",
  },
  {
    id: "locations",
    path: "/master-data/locations",
    surface: "office",
    capability: "locations.read",
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
    id: "portal",
    path: "/portal",
    surface: "party",
    capability: "none",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
    group: "Party Portal",
  },
  {
    id: "portal-inventory",
    path: "/portal/inventory",
    surface: "party",
    capability: "reporting.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
    group: "Party Portal",
  },
  {
    id: "portal-orders",
    path: "/portal/orders",
    surface: "party",
    capability: "pick_list.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
    group: "Party Portal",
  },
  {
    id: "portal-documents",
    path: "/portal/documents",
    surface: "party",
    capability: "documents.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
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
