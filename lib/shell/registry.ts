// Typed route catalog for the shell.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.2 (route
// inventory table) and §5 (typed navigation registry contract).
//
// This module owns ONLY the static route catalog. It performs no
// capability filtering (lib/shell/navigation.ts), no active-route matching
// (lib/shell/active-route.ts), and no authorization decision of any kind —
// per design.md §5, "The registry SHALL not be treated as an authorization
// boundary."

export type ShellSurface = "floor" | "office" | "shared" | "party";
export type RouteLaunchStatus = "launch" | "planned";

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
  | "Organization Portal";

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
  "Organization Portal",
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
    id: "inventory-pick-list-dispatch",
    path: "/pick-lists/[pickListId]/dispatch",
    surface: "floor",
    capability: "dispatch.execute",
    featureSpecs: ["08-outgoing-withdrawal-and-two-stage-commitment"],
    launchStatus: "launch",
    group: "Outgoing / Withdrawal",
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
    launchStatus: "launch",
    offlineFeatureGated: true,
    group: "System",
  },
  {
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
    launchStatus: "launch",
    group: "Organization Portal",
  },
  {
    id: "portal-inventory",
    path: "/portal/inventory",
    surface: "party",
    capability: "reporting.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "launch",
    group: "Organization Portal",
  },
  {
    id: "portal-orders",
    path: "/portal/orders",
    surface: "party",
    capability: "pick_list.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "launch",
    group: "Organization Portal",
  },
  {
    id: "portal-documents",
    path: "/portal/documents",
    surface: "party",
    capability: "documents.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "launch",
    group: "Organization Portal",
  },
  {
    id: "portal-notifications",
    path: "/portal/notifications",
    surface: "party",
    capability: "notifications.read",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
    group: "Organization Portal",
  },
  {
    id: "portal-labels",
    path: "/portal/labels",
    surface: "party",
    capability: "shipment_labels.generate",
    featureSpecs: ["22-parties-portal"],
    launchStatus: "planned",
    group: "Organization Portal",
  },
];
