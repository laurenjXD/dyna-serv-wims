// RED-step unit tests for lib/shell/scan-loop.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §4 (shell
// composition) and the confirmed 2026-08-16 decision that hides navigation
// for the ENTIRE duration a scan-flow route is open (pure route-based
// check, not per-scan-step state), reappearing once the user navigates to
// any other page.
//
// Backing acceptance criterion: specs/05-ui-shell-and-navigation/requirements.md
// R4.3 ("During an active scan-driven floor flow, navigation SHALL be
// completely hidden and replaced by a feature-owned flow header with only
// an exit/cancel action. Bottom tabs appear only between scan steps.") and
// tasks.md §4 ("Implement mobile/floor navigation: bottom tab bar between
// steps, completely hidden navigation during active scan loops.").
//
// This file tests ONLY the pure route-matching predicate. Suppressing the
// rendered floor tab bar in ShellNavigation using this predicate is covered
// separately in components/global/__tests__/ShellNavigation.test.tsx.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/scan-loop.ts (for frontend-builder):
//
//   export function isScanLoopRoute(pathname: string): boolean;
//   // Returns true for exactly these 5 dynamic-segment scan-flow routes
//   // (matched the same way lib/shell/active-route.ts matches dynamic
//   // segments -- segment-count equality, static segments compared
//   // literally, bracketed segments treated as wildcards):
//   //   /receiving/[wrrId]/receive
//   //   /pick-lists/[pickListId]/pick
//   //   /pick-lists/[pickListId]/dispatch
//   //   /transfers/[transferId]/execute
//   //   /transfers/[transferId]/inspect
//   // Returns false for every other path, including each flow's parent
//   // list/detail page and near-miss paths that share a prefix but not the
//   // exact scan-flow suffix/segment-count.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

describe("lib/shell/scan-loop — isScanLoopRoute (R4.3, tasks.md §4)", () => {
  it("returns true for the receiving scan-flow route with a concrete wrrId", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/receiving/wrr-123/receive")).toBe(true);
  });

  it("returns true for the pick-list pick scan-flow route with a concrete pickListId", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/pick-lists/PL-2026-777/pick")).toBe(true);
  });

  it("returns true for the pick-list dispatch scan-flow route with a concrete pickListId", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/pick-lists/PL-2026-777/dispatch")).toBe(true);
  });

  it("returns true for the transfer execute scan-flow route with a concrete transferId", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/transfers/TR-2026-004/execute")).toBe(true);
  });

  it("returns true for the transfer inspect scan-flow route with a concrete transferId", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/transfers/TR-2026-004/inspect")).toBe(true);
  });

  it("returns false for the parent list pages, which are not scan flows themselves", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/receiving")).toBe(false);
    expect(isScanLoopRoute("/pick-lists")).toBe(false);
    expect(isScanLoopRoute("/transfers")).toBe(false);
  });

  it("returns false for a receiving detail page that has not entered the receive scan flow", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/receiving/wrr-123")).toBe(false);
  });

  it("returns false for a near-miss pick-lists sub-route that isn't the registered 'pick' or 'dispatch' suffix", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/pick-lists/abc/pickX")).toBe(false);
  });

  it("returns false for a transfer detail page that has not entered the execute/inspect scan flow", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/transfers/TR-2026-004")).toBe(false);
  });

  it("returns false for an unrelated top-level route", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/inventory")).toBe(false);
  });

  it("returns false when an extra segment is appended beyond a scan-flow route's registered depth", async () => {
    const { isScanLoopRoute } = await import("../scan-loop");
    expect(isScanLoopRoute("/receiving/wrr-123/receive/extra")).toBe(false);
  });
});
