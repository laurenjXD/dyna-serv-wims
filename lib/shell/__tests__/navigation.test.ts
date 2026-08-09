// RED-step unit tests for lib/shell/navigation.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §5 ("An entry
// whose capability the user does not hold is hidden from navigation
// presentation... hiding avoids surfacing routes the user cannot use") and
// §3.3 ("Surface routing rules" -- which ShellSurface a presentation
// variant, e.g. the floor bottom-nav vs. the office sidebar, may draw from).
//
// Backing acceptance criteria: specs/05-ui-shell-and-navigation/requirements.md
// R3.4 ("Navigation visibility SHALL be derived from server-provided
// effective capability context for presentation only"), R3.5 ("The registry
// SHALL not be treated as an authorization boundary" -- proven here
// structurally: this module only ever reads `context.grants`, it has no
// separate authorization side-effect), and the AC bullet "A typed navigation
// registry can filter presentation entries from effective capabilities while
// server authorization remains independent."
//
// This file deliberately reuses the exact `AuthorizationContext`/`Grant`
// shape from lib/rbac/session.ts (per this task's instruction to "import it,
// don't reinvent it") rather than declaring a parallel shell-local context
// type.
//
// Two separate concerns are tested here, matching the two functions this
// module is expected to export:
//   1. `filterVisibleRoutes` -- capability-only visibility (does the caller
//      have the grant at all, regardless of which nav surface would render
//      it). This is what actually proves/disproves the 2026-08-07
//      /parties//items//locations route-gate fix: a route being
//      capability-visible is a statement about being ABLE TO REACH the
//      route, independent of whether a given physical nav widget (bottom
//      tab bar vs. sidebar) lists it.
//   2. `selectRoutesForPresentation` -- of the capability-visible set, which
//      subset a specific physical nav surface (floor bottom-nav / office
//      sidebar / party nav) may render, per design.md §3.3's routing rules.
//      A floor-surface presentation includes "floor" and "shared"; an
//      office-surface presentation includes "office" and "shared"; a party
//      presentation includes only "party". This second function is what
//      actually encodes "warehouse_staff sees floor routes" in nav-widget
//      terms, distinct from route-level reachability.
//
// Design choice for the "administrator sees everything" scenario: this file
// does NOT hardcode `specs/02-rbac-roles`'s current default-role grant table
// (that table is 02's to own and may be amended independently of this
// filtering mechanism). Instead it constructs a context holding EVERY
// capability referenced anywhere in ROUTE_REGISTRY and asserts the filter
// mechanism correctly includes every capability-gated + "none"-gated route
// for such a context -- proving the mechanism itself has no hidden
// exclusion, without this spec asserting a fact that belongs to 02.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/navigation.ts (for frontend-builder):
//
//   import type { AuthorizationContext } from "@/lib/rbac/session";
//   import type { RouteRegistryEntry, ShellSurface } from "./registry";
//
//   export function filterVisibleRoutes(
//     context: Pick<AuthorizationContext, "grants">,
//     registry?: readonly RouteRegistryEntry[], // defaults to ROUTE_REGISTRY
//   ): readonly RouteRegistryEntry[];
//   // A row is visible iff row.capability === "none", OR context.grants
//   // contains at least one grant with the row's exact resource+action
//   // (any scopeKind -- scope narrowing is a server/data-boundary concern,
//   // not a nav-presentation concern per design.md §5's "presentation only").
//
//   export function selectRoutesForPresentation(
//     routes: readonly RouteRegistryEntry[],
//     presentation: "floor" | "office" | "party",
//   ): readonly RouteRegistryEntry[];
//   // "floor" -> rows with surface "floor" or "shared".
//   // "office" -> rows with surface "office" or "shared".
//   // "party"  -> rows with surface "party" only.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import type { AuthorizationContext, Grant } from "@/lib/rbac/session";

function grant(resource: string, action: string): Grant {
  return { resource, action, scopeKind: "global" };
}

// Exact grant set for `warehouse_staff`, transcribed from the approved
// specs/02-rbac-roles/design.md §3.2 capability table (2026-08-07 state).
const WAREHOUSE_STAFF_GRANTS: Grant[] = [
  grant("receiving", "view"),
  grant("receiving", "scan"),
  grant("receiving", "confirm"),
  grant("inspection", "perform"),
  grant("inventory", "read"),
  grant("locations", "read"),
  grant("pick_list", "generate"),
  grant("pick_list", "execute"),
  grant("pick_list", "read"),
  grant("fifo_override", "request"),
  grant("dispatch", "read"),
  grant("dispatch", "execute"),
  // 2026-08-08: corrected from plural "transfers" to singular "transfer" —
  // 0014_transfer_rls_policies.sql's deliberate, documented capability
  // vocabulary for this feature (see revision-log.md). warehouse_staff
  // holds view/request/execute per that migration's role_permissions seed.
  grant("transfer", "view"),
  grant("transfer", "request"),
  grant("transfer", "execute"),
  grant("documents", "read"),
  grant("documents", "generate"),
  grant("documents", "download"),
  grant("parties", "read"),
  grant("items", "read"),
  grant("notifications", "read"),
];

const staffContext: Pick<AuthorizationContext, "grants"> = {
  grants: WAREHOUSE_STAFF_GRANTS,
};

const zeroGrantContext: Pick<AuthorizationContext, "grants"> = { grants: [] };

describe("lib/shell/navigation — filterVisibleRoutes (R3.4, R3.5)", () => {
  it("a warehouse_staff context can reach /master-data/parties, /master-data/items, and /master-data/locations via the .read capability (proves the 2026-08-07 route-gate fix)", async () => {
    const { filterVisibleRoutes } = await import("../navigation");
    const visible = filterVisibleRoutes(staffContext);
    const visiblePaths = visible.map((row) => row.path);

    expect(visiblePaths).toContain("/master-data/parties");
    expect(visiblePaths).toContain("/master-data/items");
    expect(visiblePaths).toContain("/master-data/locations");
  });

  it("a warehouse_staff context cannot reach /approvals, /reports, or /portal/labels (capabilities it never holds)", async () => {
    const { filterVisibleRoutes } = await import("../navigation");
    const visible = filterVisibleRoutes(staffContext);
    const visiblePaths = visible.map((row) => row.path);

    expect(visiblePaths).not.toContain("/approvals");
    expect(visiblePaths).not.toContain("/reports");
    expect(visiblePaths).not.toContain("/portal/labels");
    expect(visiblePaths).not.toContain("/portal/inventory");
  });

  it("a warehouse_staff context also reaches its own floor-surface routes (/receiving, /inspection, /pick-lists/[pickListId]/pick)", async () => {
    const { filterVisibleRoutes } = await import("../navigation");
    const visible = filterVisibleRoutes(staffContext);
    const visiblePaths = visible.map((row) => row.path);

    expect(visiblePaths).toContain("/receiving");
    expect(visiblePaths).toContain("/receiving/[wrr_id]");
    expect(visiblePaths).toContain("/inspection");
    expect(visiblePaths).toContain("/pick-lists/[pickListId]/pick");
  });

  it("a context holding EVERY capability referenced by ROUTE_REGISTRY sees every capability-gated and 'none'-gated route (mechanism has no hidden exclusion)", async () => {
    const { filterVisibleRoutes } = await import("../navigation");
    const { ROUTE_REGISTRY } = await import("../registry");

    const allGrants: Grant[] = ROUTE_REGISTRY.filter((row) => row.capability !== "none").map(
      (row) => {
        const [resource, action] = row.capability.split(".");
        return grant(resource, action);
      },
    );

    const fullContext: Pick<AuthorizationContext, "grants"> = { grants: allGrants };
    const visible = filterVisibleRoutes(fullContext);

    expect(visible).toHaveLength(ROUTE_REGISTRY.length);
    expect(new Set(visible.map((row) => row.path))).toEqual(
      new Set(ROUTE_REGISTRY.map((row) => row.path)),
    );
  });

  it("a context with zero grants sees only the 'none'-capability routes ('/', '/profile', '/sync', '/portal')", async () => {
    const { filterVisibleRoutes } = await import("../navigation");
    const visible = filterVisibleRoutes(zeroGrantContext);
    const visiblePaths = visible.map((row) => row.path).sort();

    expect(visiblePaths).toEqual(["/", "/portal", "/profile", "/sync"].sort());
  });

  it("does not mutate or expand the caller-supplied context (registry filtering is presentation-only, R3.5)", async () => {
    const { filterVisibleRoutes } = await import("../navigation");
    const before = JSON.stringify(staffContext);
    filterVisibleRoutes(staffContext);
    expect(JSON.stringify(staffContext)).toBe(before);
  });
});

describe("lib/shell/navigation — selectRoutesForPresentation (design.md §3.3 surface routing rules)", () => {
  it("floor presentation includes 'floor' and 'shared' surface routes but never 'office'-only or 'party' routes, even when capability-visible", async () => {
    const { filterVisibleRoutes, selectRoutesForPresentation } = await import("../navigation");
    const visible = filterVisibleRoutes(staffContext); // includes /master-data/parties (office-only surface)
    const floorNav = selectRoutesForPresentation(visible, "floor");
    const floorPaths = floorNav.map((row) => row.path);

    expect(floorPaths).toContain("/receiving"); // floor surface
    expect(floorPaths).toContain("/inspection"); // shared surface
    expect(floorPaths).not.toContain("/master-data/parties"); // office-only surface, even though capability-visible
    expect(floorPaths).not.toContain("/pick-lists"); // office-only surface
  });

  it("office presentation includes 'office' and 'shared' surface routes but never 'floor'-only or 'party' routes", async () => {
    const { filterVisibleRoutes, selectRoutesForPresentation } = await import("../navigation");
    const visible = filterVisibleRoutes(staffContext);
    const officeNav = selectRoutesForPresentation(visible, "office");
    const officePaths = officeNav.map((row) => row.path);

    expect(officePaths).toContain("/master-data/parties");
    expect(officePaths).toContain("/inspection"); // shared surface
    expect(officePaths).not.toContain("/receiving/[wrr_id]"); // floor-only surface
  });

  it("party presentation includes only 'party' surface routes", async () => {
    const { filterVisibleRoutes, selectRoutesForPresentation } = await import("../navigation");
    const { ROUTE_REGISTRY } = await import("../registry");
    const allGrants: Grant[] = ROUTE_REGISTRY.filter((row) => row.capability !== "none").map(
      (row) => {
        const [resource, action] = row.capability.split(".");
        return grant(resource, action);
      },
    );
    const visible = filterVisibleRoutes({ grants: allGrants });
    const partyNav = selectRoutesForPresentation(visible, "party");
    const partyPaths = partyNav.map((row) => row.path);

    expect(partyPaths.every((path) => path.startsWith("/portal"))).toBe(true);
    expect(partyPaths).not.toContain("/");
    expect(partyPaths).not.toContain("/inspection");
  });
});
