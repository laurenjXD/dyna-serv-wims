// RED-step unit tests for lib/shell/active-route.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §5 ("Active
// matching uses normalized path segments and explicit dynamic-segment rules,
// not naive string prefixes") -- an explicitly documented past risk.
//
// Backing acceptance criteria: specs/05-ui-shell-and-navigation/requirements.md
// R3.6 ("The shell SHALL support nested routes, dynamic segments, query
// strings, and trailing slashes without incorrect active-state matches") and
// R3.7 ("The active destination SHALL have a non-color signal"). This file
// tests R3.6's matching logic only; R3.7's non-color-signal rendering is a
// component-level, later E2E/visual concern and out of scope here.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/active-route.ts (for frontend-builder):
//
//   import type { RouteRegistryEntry } from "./registry";
//
//   export function resolveActiveRouteId(
//     currentPath: string,
//     registry?: readonly RouteRegistryEntry[], // defaults to ROUTE_REGISTRY
//   ): string | null;
//   // Returns the matching entry's `id`, or null if no registered route
//   // matches. Matching rules:
//   //   - Strip query string (`?...`) and hash (`#...`) before matching.
//   //   - Strip exactly one trailing slash (except for the root "/" itself).
//   //   - A static-segment route matches only an EXACT segment-count path
//   //     (e.g. "/receiving" must not match "/receiving/anything").
//   //   - A dynamic-segment route (a path containing a "[param]" segment)
//   //     matches any path with the same segment COUNT and identical static
//   //     segments in every other position -- e.g.
//   //     "/receiving/[wrr_id]" matches "/receiving/WRR-2026-001" but not
//   //     "/receiving/WRR-2026-001/extra" and not bare "/receiving".
//   //   - No entry may be matched by naive `startsWith` alone -- this is the
//   //     documented past-risk this test file exists to guard against.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

describe("lib/shell/active-route — resolveActiveRouteId (R3.6, design.md §5)", () => {
  it("matches a static route path exactly", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/receiving")).toBe("receiving");
  });

  it("matches a dynamic-segment route with a concrete id in place of the bracketed param", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/inspection/INSP-2026-004")).toBe("inspection-detail");
  });

  it("does NOT falsely match a static route's own detail route when only the base path is requested (no naive prefix match)", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    // "/receiving" itself must resolve to "receiving", not "receiving-detail",
    // and must not accidentally match via startsWith("/receiving").
    expect(resolveActiveRouteId("/receiving")).toBe("receiving");
    expect(resolveActiveRouteId("/receiving")).not.toBe("receiving-detail");
  });

  it("does NOT match a dynamic-segment route when an extra nested segment is appended beyond the registered depth", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/inspection/INSP-2026-004/extra")).toBeNull();
  });

  it("does NOT match a similarly-prefixed but unrelated path (e.g. '/receivingfoo' must not match '/receiving')", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/receivingfoo")).toBeNull();
  });

  it("strips a query string before matching", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/pick-lists?from=inventory")).toBe("inventory");
  });

  it("strips a hash fragment before matching", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/documents#recent")).toBe("documents");
  });

  it("tolerates exactly one trailing slash without a false match or a missed match", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/receiving/")).toBe("receiving");
    expect(resolveActiveRouteId("/transfers/")).toBe("transfers");
  });

  it("matches the root path '/' distinctly from every other route, including when combined with a query string", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/")).toBe("root");
    expect(resolveActiveRouteId("/?ref=email")).toBe("root");
  });

  it("matches a dynamic-segment route nested three levels deep in a multi-segment path prefix (pick-lists/[pickListId]/dispatch)", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/pick-lists/PL-2026-777/dispatch")).toBe(
      "inventory-pick-list-dispatch",
    );
  });

  it("returns null for a completely unregistered path", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    expect(resolveActiveRouteId("/this-route-does-not-exist")).toBeNull();
  });

  it("does not match a dynamic-segment route's placeholder value against a route that has a different static suffix", async () => {
    const { resolveActiveRouteId } = await import("../active-route");
    // "/pick-lists/PL-2026-777/pick" must resolve to the pick-execution
    // route, never the dispatch route, even though both share the
    // "/pick-lists/[pickListId]/..." prefix.
    expect(resolveActiveRouteId("/pick-lists/PL-2026-777/pick")).toBe(
      "inventory-pick-list-execute",
    );
    expect(resolveActiveRouteId("/pick-lists/PL-2026-777/dispatch")).toBe(
      "inventory-pick-list-dispatch",
    );
  });
});
