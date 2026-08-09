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

export interface RouteRegistryEntry {
  id: string;
  path: string;
  surface: ShellSurface;
  capability: string;
  featureSpecs: readonly string[];
  launchStatus: RouteLaunchStatus;
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
  },
  {
    id: "receiving",
    path: "/receiving",
    surface: "floor",
    capability: "receiving.view",
    featureSpecs: ["07-incoming-receiving"],
    launchStatus: "launch",
  },
  {
    id: "receiving-detail",
    path: "/receiving/[wrr_id]",
    surface: "floor",
    capability: "receiving.view",
    featureSpecs: ["07-incoming-receiving"],
    launchStatus: "launch",
  },
  {
    // 2026-08-08: registry corrected from `/inventory` (05 design.md's
    // original spec path) to `/pick-lists` (the path actually built).
    // `05`'s own route table has not been updated to match — flagged in
    // revision-log.md rather than silently left inconsistent.
    id: "inventory",
    path: "/pick-lists",
    surface: "office",
    capability: "pick_list.read",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
  },
  {
    id: "inventory-pick-list-execute",
    path: "/pick-lists/[pickListId]/pick",
    surface: "floor",
    capability: "pick_list.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
  },
  {
    id: "inventory-pick-list-dispatch",
    path: "/pick-lists/[pickListId]/dispatch",
    surface: "floor",
    capability: "dispatch.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
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
  },
  {
    id: "approvals",
    path: "/approvals",
    surface: "office",
    capability: "fifo_override.approve",
    featureSpecs: ["09-approval-queue"],
    launchStatus: "launch",
  },
  {
    id: "sync",
    path: "/sync",
    surface: "floor",
    capability: "none",
    featureSpecs: ["03-offline-mode-and-client-storage"],
    launchStatus: "planned",
    offlineFeatureGated: true,
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
  },
  {
    id: "items",
    path: "/master-data/items",
    surface: "office",
    capability: "items.read",
    featureSpecs: ["06-party-and-item-enrollment"],
    launchStatus: "launch",
  },
  {
    id: "locations",
    path: "/master-data/locations",
    surface: "office",
    capability: "locations.read",
    featureSpecs: ["06-party-and-item-enrollment"],
    launchStatus: "launch",
  },
  {
    id: "reports",
    path: "/reports",
    surface: "office",
    capability: "reporting.read",
    featureSpecs: ["16-reporting-and-analytics"],
    launchStatus: "planned",
  },
  {
    // 2026-08-08: was built but never registered, so it was unreachable
    // from navigation entirely (a real gap, not a naming mismatch).
    id: "incoming-ledger",
    path: "/incoming-ledger",
    surface: "office",
    capability: "receiving.confirm",
    featureSpecs: ["07-incoming-receiving"],
    launchStatus: "launch",
  },
  {
    id: "outgoing-ledger",
    path: "/outgoing-ledger",
    surface: "office",
    capability: "pick_list.read",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
  },
  {
    id: "profile",
    path: "/profile",
    surface: "shared",
    capability: "none",
    featureSpecs: ["21-user-profile-and-settings"],
    launchStatus: "launch",
  },
  {
    id: "settings",
    path: "/settings",
    surface: "office",
    capability: "users.read",
    featureSpecs: ["21-user-profile-and-settings"],
    launchStatus: "launch",
  },
  {
    id: "portal",
    path: "/portal",
    surface: "party",
    capability: "none",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
  },
  {
    id: "portal-inventory",
    path: "/portal/inventory",
    surface: "party",
    capability: "reporting.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
  },
  {
    id: "portal-orders",
    path: "/portal/orders",
    surface: "party",
    capability: "pick_list.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
  },
  {
    id: "portal-documents",
    path: "/portal/documents",
    surface: "party",
    capability: "documents.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
  },
  {
    id: "portal-notifications",
    path: "/portal/notifications",
    surface: "party",
    capability: "notifications.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
  },
  {
    id: "portal-labels",
    path: "/portal/labels",
    surface: "party",
    capability: "shipment_labels.generate",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
  },
];
