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
  },
  {
    id: "profile",
    path: "/profile",
    surface: "shared",
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
    launchStatus: "planned",
  },
  {
    id: "portal-inventory",
    path: "/portal/inventory",
    surface: "party",
    capability: { resource: "reporting", action: "read" },
    launchStatus: "planned",
  },
  {
    id: "portal-orders",
    path: "/portal/orders",
    surface: "party",
    capability: { resource: "pick_list", action: "read" },
    launchStatus: "planned",
  },
  {
    id: "portal-documents",
    path: "/portal/documents",
    surface: "party",
    capability: { resource: "documents", action: "read" },
    launchStatus: "planned",
  },
  {
    id: "portal-notifications",
    path: "/portal/notifications",
    surface: "party",
    capability: { resource: "notifications", action: "read" },
    launchStatus: "planned",
  },
  {
    id: "portal-labels",
    path: "/portal/labels",
    surface: "party",
    capability: { resource: "shipment_labels", action: "generate" },
    launchStatus: "planned",
  },
];
