// RED-step unit tests for lib/shell/surface.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.3 ("Floor
// versus office shell behavior" -- surface routing rules table) and §5
// (`ShellSurface = "floor" | "office" | "shared" | "party"`).
//
// Backing acceptance criteria: requirements.md §2 ("A feature declares its
// surface when registering a route. The shell must not infer floor behavior
// from a mutable client role string") and R11.2 ("present the floor summary
// presentation for a floor session and the office summary presentation for
// an office or 'party' session, per the shell surface resolved for that
// session").
//
// Two distinct, deliberately separate functions are tested here:
//
//   1. `resolveRouteSurface(path)` -- a pure registry lookup returning the
//      ShellSurface a REGISTERED ROUTE declares (floor/office/shared/party).
//      This is fixed by route registration, never inferred from the user, in
//      accordance with requirements.md §2's explicit rule.
//
//   2. `resolveSessionPresentationTier(activeRoleKeys)` -- resolves which
//      presentation TIER ("floor" | "office" | "party") a given SESSION
//      renders as, from the session's server-resolved `activeRoleKeys` (the
//      trusted array on `AuthorizationContext` -- resolved server-side by
//      `lib/rbac/session.ts`, never a client-mutable string, so this does not
//      violate requirements.md §2's rule). This tier is what a "shared"
//      surface route (e.g. `/`) or a route explicitly declaring per-tier
//      content (only `/` currently does, per R11.2) uses to pick which
//      content shape to render.
//
// Design choice (RED-step decision, since design.md does not fix an exact
// role-key precedence algorithm): role-key -> tier precedence is
// office-roles (`supervisor`, `administrator`) > `party_user` >
// `warehouse_staff` > default `"floor"` for an empty/unrecognized role set.
// The empty-set default is deliberately "floor" rather than "office",
// matching design.md §3.3's explicit safety bias: "When in doubt, a shared
// route uses floor defaults -- it is always safer to over-target the floor
// user than to assume office context." The office-over-party tie-break for
// the (admittedly unlikely) combination of both roles is this RED step's own
// documented choice, not dictated by any single design.md sentence, and
// should be revisited if a future amendment specifies otherwise.
//
// A note explicitly deferred, NOT tested here: design.md §3.3 states
// `/inspection` and `/transfers` render "floor-first layout" for EVERY
// session regardless of tier (i.e. NOT the same floor-vs-office split `/`
// uses per R11.2). A single universal "shared route render variant" function
// would therefore be WRONG for those two routes. This file does not build or
// test such a universal function; `/`'s specific tier-to-content mapping is
// covered separately in lib/shell/__tests__/landing.test.ts, scoped to `/`
// only, per this task's module-boundary decision.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/surface.ts (for frontend-builder):
//
//   import type { RouteRegistryEntry, ShellSurface } from "./registry";
//
//   export function resolveRouteSurface(
//     path: string,
//     registry?: readonly RouteRegistryEntry[], // defaults to ROUTE_REGISTRY
//   ): ShellSurface | null; // null if the path is not a registered route
//
//   export type SessionPresentationTier = "floor" | "office" | "party";
//
//   export function resolveSessionPresentationTier(
//     activeRoleKeys: readonly string[],
//   ): SessionPresentationTier;
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

describe("lib/shell/surface — resolveRouteSurface (design.md §3.2/§5, registration-fixed, not inferred)", () => {
  it("returns 'floor' for a floor-declared route", async () => {
    const { resolveRouteSurface } = await import("../surface");
    // /receiving changed to "shared" per 2026-08-09 PO amendment; using
    // /receiving/[wrr_id] which remains "floor".
    expect(resolveRouteSurface("/receiving/[wrr_id]")).toBe("floor");
  });

  it("returns 'shared' for /receiving (2026-08-09 PO amendment: surface changed floor -> shared)", async () => {
    const { resolveRouteSurface } = await import("../surface");
    expect(resolveRouteSurface("/receiving")).toBe("shared");
  });

  it("returns 'office' for an office-declared route, including the corrected /master-data/parties/.read row", async () => {
    const { resolveRouteSurface } = await import("../surface");
    expect(resolveRouteSurface("/master-data/parties")).toBe("office");
    expect(resolveRouteSurface("/master-data/locations")).toBe("office");
  });

  it("returns 'shared' for the general landing page '/'", async () => {
    const { resolveRouteSurface } = await import("../surface");
    expect(resolveRouteSurface("/")).toBe("shared");
  });

  it("returns 'party' for a /portal route", async () => {
    const { resolveRouteSurface } = await import("../surface");
    expect(resolveRouteSurface("/portal/documents")).toBe("party");
  });

  it("returns null for an unregistered path -- it must not guess a default surface", async () => {
    const { resolveRouteSurface } = await import("../surface");
    expect(resolveRouteSurface("/not-a-real-route")).toBeNull();
  });
});

describe("lib/shell/surface — resolveSessionPresentationTier (requirements.md §2, R11.2)", () => {
  it("resolves a warehouse_staff-only session to the 'floor' tier", async () => {
    const { resolveSessionPresentationTier } = await import("../surface");
    expect(resolveSessionPresentationTier(["warehouse_staff"])).toBe("floor");
  });

  it("resolves a supervisor session to the 'office' tier", async () => {
    const { resolveSessionPresentationTier } = await import("../surface");
    expect(resolveSessionPresentationTier(["supervisor"])).toBe("office");
  });

  it("resolves an administrator session to the 'office' tier", async () => {
    const { resolveSessionPresentationTier } = await import("../surface");
    expect(resolveSessionPresentationTier(["administrator"])).toBe("office");
  });

  it("resolves a party_user session to the 'party' tier", async () => {
    const { resolveSessionPresentationTier } = await import("../surface");
    expect(resolveSessionPresentationTier(["party_user"])).toBe("party");
  });

  it("defaults an empty/unrecognized role set to 'floor' (design.md §3.3's stated safety bias -- over-target floor, never assume office)", async () => {
    const { resolveSessionPresentationTier } = await import("../surface");
    expect(resolveSessionPresentationTier([])).toBe("floor");
    expect(resolveSessionPresentationTier(["some_future_unknown_role"])).toBe("floor");
  });

  it("prefers the 'office' tier over 'floor' when a session unusually holds both roles (documented tie-break)", async () => {
    const { resolveSessionPresentationTier } = await import("../surface");
    expect(resolveSessionPresentationTier(["warehouse_staff", "supervisor"])).toBe("office");
  });

  it("prefers the 'office' tier over 'party' when a session unusually holds both roles (documented tie-break)", async () => {
    const { resolveSessionPresentationTier } = await import("../surface");
    expect(resolveSessionPresentationTier(["party_user", "administrator"])).toBe("office");
  });
});
