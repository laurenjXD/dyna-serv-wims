// Capability-based navigation presentation filtering.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §5 (an entry
// whose capability the user does not hold is hidden from navigation
// presentation) and §3.3 (surface routing rules — which ShellSurface a
// given nav-widget presentation may draw from).
//
// This module is presentation-only (requirements.md R3.4, R3.5): it never
// performs an authorization side effect, it only reads `context.grants` to
// decide what is worth rendering. Real authorization happens again at the
// server action/route handler/data boundary (design.md §7).

import type { AuthorizationContext } from "@/lib/rbac/session";
import { NAV_GROUP_ORDER, ROUTE_REGISTRY, type NavGroup, type RouteRegistryEntry } from "./registry";

export function filterVisibleRoutes(
  context: Pick<AuthorizationContext, "grants">,
  registry: readonly RouteRegistryEntry[] = ROUTE_REGISTRY,
): readonly RouteRegistryEntry[] {
  return registry.filter((row) => {
    if (row.capability === "none") return true;
    const [resource, action] = row.capability.split(".");
    return context.grants.some(
      (grant) => grant.resource === resource && grant.action === action,
    );
  });
}

export function selectRoutesForPresentation(
  routes: readonly RouteRegistryEntry[],
  presentation: "floor" | "office" | "party",
): readonly RouteRegistryEntry[] {
  if (presentation === "floor") {
    return routes.filter((row) => row.surface === "floor" || row.surface === "shared");
  }
  if (presentation === "office") {
    return routes.filter((row) => row.surface === "office" || row.surface === "shared");
  }
  return routes.filter((row) => row.surface === "party");
}

export interface NavSection {
  group: NavGroup;
  entries: readonly RouteRegistryEntry[];
}

// Buckets an already-filtered/presented route list into sections for the
// office/party desktop sidebar (added 2026-08-09 — the sidebar was
// previously one flat list of ~15 links). Section order follows
// `NAV_GROUP_ORDER`, not the order groups happen to first appear in
// `routes`; entries within a section keep their existing relative order.
// Not used by the floor bottom tab bar, which stays a flat row by design —
// a floor session's visible entry count is small and horizontal grouping
// would cost tap-target space for no real benefit (brand-design-system.md
// §3's floor-priority rules favor fewer, larger targets over taxonomy).
// A group with zero visible entries after filtering is omitted entirely,
// never rendered as an empty header.
export function groupRoutesForSidebar(
  routes: readonly RouteRegistryEntry[],
): readonly NavSection[] {
  const byGroup = new Map<NavGroup, RouteRegistryEntry[]>();
  for (const entry of routes) {
    const bucket = byGroup.get(entry.group);
    if (bucket) {
      bucket.push(entry);
    } else {
      byGroup.set(entry.group, [entry]);
    }
  }
  return NAV_GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({
    group,
    entries: byGroup.get(group)!,
  }));
}
