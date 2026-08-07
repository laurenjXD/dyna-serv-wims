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
    id: "inventory",
    path: "/inventory",
    surface: "office",
    capability: "inventory.read",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
  },
  {
    id: "inventory-pick-list-new",
    path: "/inventory/pick-list/new",
    surface: "office",
    capability: "pick_list.generate",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
  },
  {
    id: "inventory-pick-list-detail",
    path: "/inventory/pick-list/[pick_list_id]",
    surface: "floor",
    capability: "pick_list.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
  },
  {
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
  },
  {
    id: "dispatch-detail",
    path: "/dispatch/[pick_list_id]",
    surface: "floor",
    capability: "dispatch.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
  },
  {
    id: "documents",
    path: "/documents",
    surface: "office",
    capability: "documents.read",
    featureSpecs: ["10-pick-list-and-acknowledgement-receipt"],
    launchStatus: "launch",
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
    launchStatus: "launch",
    offlineFeatureGated: true,
  },
  {
    id: "transfers",
    path: "/transfers",
    surface: "shared",
    capability: "transfers.read",
    featureSpecs: ["11-transfer-and-inspection"],
    launchStatus: "launch",
  },
  {
    id: "parties",
    path: "/parties",
    surface: "office",
    capability: "parties.read",
    featureSpecs: ["06-party-and-item-enrollment"],
    launchStatus: "launch",
  },
  {
    id: "items",
    path: "/items",
    surface: "office",
    capability: "items.read",
    featureSpecs: ["06-party-and-item-enrollment"],
    launchStatus: "launch",
  },
  {
    id: "locations",
    path: "/locations",
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
