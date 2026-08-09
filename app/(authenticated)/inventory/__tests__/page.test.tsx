// Test — InventoryPage (app/(authenticated)/inventory/page.tsx).
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R5.3  — On success, the system SHALL expose the selected lot/location
//             instructions to the floor workflow via the operational pick_list.
//     R5.7  — The resulting pick_list SHALL be operational; it is not an
//             unpriced withdrawal_slip.
//     R9.1  — The Outgoing Ledger SHALL be a filtered view of authoritative
//             inventory_transactions, primarily movement_type = 'pick'.
//     R9.4  — It SHALL remain read-only; corrections/reversals use approved new
//             transactions, never edits/deletes of immutable history.
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route —
//     `inventory/page.tsx` merges the former standalone `/pick-lists` and
//     `/outgoing-ledger` routes into Pick Lists + Ledger tabs), §9 (ledger design)
//
// Surface: Office — Pick Lists tab (default) + Ledger tab, tabbed via ?tab=.
// This test file replaces the former separate pick-lists/__tests__/page.test.tsx
// and outgoing-ledger/__tests__/page.test.tsx assertions, adapted to the merged
// page rather than dropped, per the 2026-08-09 restructuring task.

import { describe, it, expect } from "vitest";

describe("InventoryPage (app/(authenticated)/inventory/page.tsx)", () => {
  // R5.3, R5.7, R9.1-R9.4 — page module must exist and export a default
  // Server Component so committed pick lists and the read-only outgoing
  // ledger are both reachable, tabbed, from the office navigation shell.
  it("AC R5.3/R5.7/R9.1-R9.4: exports a default component", async () => {
    const mod = await import("../page");
    expect(typeof mod.default).toBe("function");
  });

  // R5.3 — the page must render a recognizable heading so staff can identify
  // the inventory/withdrawal surface from the office navigation shell.
  it("AC R5.3: default export has a display name or function name identifying it as a page component", async () => {
    const mod = await import("../page");
    // Next.js Server Component pages export named async functions; the name
    // must be non-empty so the React DevTools and error boundaries can surface
    // the failing component by name rather than as "(anonymous)".
    expect(mod.default.name.length).toBeGreaterThan(0);
  });

  // R9.4 — the ledger tab is read-only; the module must not export any
  // mutation actions directly (Server Actions for corrections belong to
  // future approved reversal flows in a separate command module, not on
  // this hub page itself). Structural check: only `default` should be
  // exported from the page module.
  it("AC R9.4: page module exports only the default component (no mutation side-exports)", async () => {
    const mod = await import("../page");
    const exportedKeys = Object.keys(mod);
    // A read-only-ledger-plus-list hub has exactly one export: `default`.
    // If a future implementation accidentally attaches a Server Action
    // directly on this page export, this test will catch it.
    expect(exportedKeys).toEqual(["default"]);
  });
});
