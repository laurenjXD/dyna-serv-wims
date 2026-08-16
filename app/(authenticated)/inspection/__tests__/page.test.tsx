// RED test — InspectionQueuePage (app/(authenticated)/inspection/page.tsx)
// must become a superseded entry point that forwards straight to the merged
// Master Inventory Inspection tab queue, the same pattern already used by
// `app/(authenticated)/master-data/items/page.tsx` for `/enrollment`.
//
// Traceability:
//   specs/00-steering/ui-implementation-plan.md P4 — "Sidebar/IA decision
//     locked 2026-08-17: Transfers and Inspection are no longer separate
//     pages. ... `/transfers` and `/inspection` retire as top-level pages,
//     becoming `redirect()`s into `/inventory?tab=inspection` (same pattern
//     already used for `/master-data/*` -> `/enrollment`), and both lose
//     their `lib/shell/registry.ts` nav entries."
//   specs/00-steering/multi-agent-work-division.md "Sidebar structure —
//     confirmed target (2026-08-17)" — "Remove the `transfers` and
//     `inspection` RouteRegistryEntry rows entirely (their pages become
//     redirects — see punch-list item 3)."
//   specs/11-transfer-and-inspection/requirements.md R2.2 / Acceptance
//     criteria — "Daily Inspection initiates directly from Stock View
//     (`/inventory`)" — the merged queue this page now forwards to is the
//     Inspection tab of that same Stock View entry point.
//
// Established precedent this test matches:
//   app/(authenticated)/master-data/items/page.tsx (superseded list ->
//   `redirect()` to the real destination, preserving query params; the
//   detail/action sub-route /inspection/[id] stays real and is NOT touched
//   by this change).
//
// Current state (pre-fix): `../page.tsx` still renders its own real
// floor/office inspection-queue list (permission gate, DB query, JSX)
// instead of redirecting. This test mocks `next/navigation`'s `redirect`
// (which throws in real Next.js — mocked here as a no-op spy per this
// repo's RED convention for page-redirect tests) plus this page's existing
// auth/DB dependencies (so the *current*, still-real implementation can run
// to completion without crashing on missing request context), then asserts
// `redirect` was called with `/inventory?tab=inspection`.
//
// Expected failure mode right now: the `redirect` spy is never called
// (current implementation renders real JSX and returns instead of
// redirecting) — assertion failure "expected redirectSpy to have been
// called with ... but it was not called", not a setup/import crash.

import { describe, it, expect, vi, beforeEach } from "vitest";

const redirectSpy = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectSpy(url),
}));

// Stub out the current page's auth/DB dependencies so its still-real
// implementation renders successfully (floor branch, empty list) rather
// than throwing on missing request context — once this page is rewritten
// as a pure redirect (per the master-data/items precedent), none of these
// modules will even be imported by it anymore.
vi.mock("@/lib/auth/page-resolver", () => ({
  createPageResolver: vi.fn(async () => ({})),
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: vi.fn(async () => ({
    kind: "authorized",
    context: { userId: "test-user", activeRoleKeys: ["warehouse_staff"] },
  })),
}));

vi.mock("@/lib/db/client", () => ({
  db: {},
}));

vi.mock("@/lib/db/queries/transfers", () => ({
  listInspectionCases: vi.fn(async () => ({ rows: [] })),
}));

describe("InspectionQueuePage (app/(authenticated)/inspection/page.tsx)", () => {
  beforeEach(() => {
    redirectSpy.mockClear();
    vi.resetModules();
  });

  // AC (ui-implementation-plan.md P4 / multi-agent-work-division.md
  // 2026-08-17 sidebar/IA decision): `/inspection` retires as a top-level
  // page and forwards to the merged Master Inventory Inspection tab queue.
  it("AC ui-implementation-plan.md P4: redirects to /inventory?tab=inspection", async () => {
    const { default: InspectionQueuePage } = await import("../page");

    await InspectionQueuePage({ searchParams: Promise.resolve({}) });

    expect(redirectSpy).toHaveBeenCalledWith("/inventory?tab=inspection");
  });
});
