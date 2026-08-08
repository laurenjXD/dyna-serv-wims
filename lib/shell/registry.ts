<<<<<<< HEAD
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
=======
// Canonical route registry for the shell navigation system.
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §3.2 (route inventory table)
//   and §5 (NavigationEntry registry contract).
// - specs/02-rbac-roles design.md §3.2 for capability key format
//   (resource.action).
//
// Rules enforced here:
// - `surface` determines which navigation presentation may show the entry;
//   it does not grant access (design.md §5).
// - `capability` references exactly one resource.action pair from the 02
//   catalog; null means unconditionally visible to all authenticated users.
// - `launchStatus: "planned"` entries are never rendered as live links
//   (design.md §5); they remain in the registry for bookkeeping/type safety.
// - Dynamic-segment routes (paths containing "[") are not rendered as
//   standalone nav links — they are in the registry only for
//   capability/surface bookkeeping and active-route matching
//   (ShellNavigation.tsx's isNavigableEntry guard).

export type RouteRegistryEntry = {
  /** Stable identifier used for analytics/tests and active-route matching. */
  id: string;
  /** Canonical route path, including dynamic segments like [wrr_id]. */
  path: string;
  /** Presentation surface — determines which nav variant shows this entry. */
  surface: "floor" | "office" | "shared" | "party";
  /** Required capability {resource, action}, or null if unconditionally visible. */
  capability: { resource: string; action: string } | null;
  /** "planned" entries are never rendered as live links. */
  launchStatus: "available" | "planned";
};

// Single source of truth for every authenticated route. Capability keys use
// the stable 02-rbac-roles §3.2 format exactly — never role names.
export const ROUTE_REGISTRY: RouteRegistryEntry[] = [
  // --- Shared routes (visible to all authenticated users) ---
  {
    id: "home",
    path: "/",
    surface: "shared",
    capability: null,
    launchStatus: "available",
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
  },
  {
    id: "profile",
    path: "/profile",
    surface: "shared",
<<<<<<< HEAD
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
=======
    capability: null,
    launchStatus: "available",
  },
  {
    id: "inspection",
    path: "/inspection",
    surface: "shared",
    capability: { resource: "inspection", action: "perform" },
    launchStatus: "available",
  },
  {
    id: "transfers",
    path: "/transfers",
    surface: "shared",
    capability: { resource: "transfers", action: "read" },
    launchStatus: "available",
  },

  // --- Floor routes ---
  {
    id: "receiving",
    path: "/receiving",
    surface: "floor",
    capability: { resource: "receiving", action: "view" },
    launchStatus: "available",
  },
  {
    id: "receiving-detail",
    path: "/receiving/[wrr_id]",
    surface: "floor",
    capability: { resource: "receiving", action: "view" },
    launchStatus: "available",
  },
  {
    id: "pick-list-detail",
    path: "/inventory/pick-list/[pick_list_id]",
    surface: "floor",
    capability: { resource: "pick_list", action: "execute" },
    launchStatus: "available",
  },
  {
    id: "inspection-detail",
    path: "/inspection/[inspection_id]",
    surface: "floor",
    capability: { resource: "inspection", action: "perform" },
    launchStatus: "available",
  },
  {
    id: "dispatch",
    path: "/dispatch/[pick_list_id]",
    surface: "floor",
    capability: { resource: "dispatch", action: "execute" },
    launchStatus: "available",
  },
  {
    id: "sync",
    path: "/sync",
    surface: "floor",
    capability: null,
    launchStatus: "available",
  },

  // --- Office routes ---
  {
    id: "settings",
    path: "/settings",
    surface: "office",
    capability: { resource: "users", action: "read" },
    launchStatus: "available",
  },
  {
    id: "inventory",
    path: "/inventory",
    surface: "office",
    capability: { resource: "inventory", action: "read" },
    launchStatus: "available",
  },
  {
    id: "pick-list-new",
    path: "/inventory/pick-list/new",
    surface: "office",
    capability: { resource: "pick_list", action: "generate" },
    launchStatus: "available",
  },
  {
    id: "documents",
    path: "/documents",
    surface: "office",
    capability: { resource: "documents", action: "read" },
    launchStatus: "available",
  },
  {
    id: "approvals",
    path: "/approvals",
    surface: "office",
    capability: { resource: "fifo_override", action: "approve" },
    launchStatus: "available",
  },
  {
    id: "parties",
    path: "/parties",
    surface: "office",
    capability: { resource: "parties", action: "read" },
    launchStatus: "available",
  },
  {
    id: "items",
    path: "/items",
    surface: "office",
    capability: { resource: "items", action: "read" },
    launchStatus: "available",
  },
  {
    id: "locations",
    path: "/locations",
    surface: "office",
    capability: { resource: "locations", action: "read" },
    launchStatus: "available",
  },
  // Planned office routes — not rendered as live links.
  {
    id: "billing-pricing",
    path: "/billing-pricing",
    surface: "office",
    capability: { resource: "reporting", action: "financial_read" },
    launchStatus: "planned",
  },
  {
    id: "reports",
    path: "/reports",
    surface: "office",
    capability: { resource: "reporting", action: "read" },
    launchStatus: "planned",
  },

  // --- Party routes (22-parties-portal, all Planned) ---
  {
    id: "portal",
    path: "/portal",
    surface: "party",
    capability: null,
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
    launchStatus: "planned",
  },
  {
    id: "portal-inventory",
    path: "/portal/inventory",
    surface: "party",
<<<<<<< HEAD
    capability: "reporting.read",
    featureSpecs: ["22-parties-portal"],
=======
    capability: { resource: "reporting", action: "read" },
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
    launchStatus: "planned",
  },
  {
    id: "portal-orders",
    path: "/portal/orders",
    surface: "party",
<<<<<<< HEAD
    capability: "pick_list.read",
    featureSpecs: ["22-parties-portal"],
=======
    capability: { resource: "pick_list", action: "read" },
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
    launchStatus: "planned",
  },
  {
    id: "portal-documents",
    path: "/portal/documents",
    surface: "party",
<<<<<<< HEAD
    capability: "documents.read",
    featureSpecs: ["22-parties-portal"],
=======
    capability: { resource: "documents", action: "read" },
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
    launchStatus: "planned",
  },
  {
    id: "portal-notifications",
    path: "/portal/notifications",
    surface: "party",
<<<<<<< HEAD
    capability: "notifications.read",
    featureSpecs: ["22-parties-portal"],
=======
    capability: { resource: "notifications", action: "read" },
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
    launchStatus: "planned",
  },
  {
    id: "portal-labels",
    path: "/portal/labels",
    surface: "party",
<<<<<<< HEAD
    capability: "shipment_labels.generate",
    featureSpecs: ["22-parties-portal"],
=======
    capability: { resource: "shipment_labels", action: "generate" },
>>>>>>> 94bc52b5ffa0381afc26f1c0ea5fea13991c1e6f
    launchStatus: "planned",
  },
];
