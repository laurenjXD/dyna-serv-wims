// RED test — OutgoingLedgerPage does not exist yet.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R9.1  — The Outgoing Ledger SHALL be a filtered view of authoritative
//             inventory_transactions, primarily movement_type = 'pick'.
//     R9.2  — It SHALL show authorized date/time, item code, description, lot,
//             location, quantity/UOM, pick list, destination/party, flow type,
//             dispatching user, and document references.
//     R9.3  — It SHALL support date, party/destination, flow, item/code, lot,
//             and pick-list filters subject to authorization.
//     R9.4  — It SHALL remain read-only; corrections/reversals use approved new
//             transactions, never edits/deletes of immutable history.
//     §5 acceptance criterion — "Cross-party, RLS, stale-state, invalid-scan, and
//             ledger immutability tests pass."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §9 (ledger
//     design, column list added 2026-08-08)
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation)
//
// Surface: Office — read-only ledger over pick inventory_transactions.
// Expected failure mode: "Cannot find module '../page'" — page does not exist.

import { describe, it, expect } from "vitest";

describe("OutgoingLedgerPage (app/(authenticated)/outgoing-ledger/page.tsx)", () => {
  // R9.1–R9.4 — page must exist and export a default component so the
  // read-only outgoing ledger is reachable from the office navigation shell.
  it("AC R9.1/R9.2/R9.3/R9.4: exports a default component", async () => {
    const mod = await import("../page");
    expect(typeof mod.default).toBe("function");
  });

  // R9.4 — ledger is read-only; the module must not export any mutation
  // actions directly (Server Actions for corrections belong to future approved
  // reversal flows in a separate command module, not on the ledger page itself).
  // Structural check: only `default` should be exported from the page module.
  it("AC R9.4: page module exports only the default component (no mutation side-exports)", async () => {
    const mod = await import("../page");
    const exportedKeys = Object.keys(mod);
    // A read-only page has exactly one export: `default`.
    // If a future implementation accidentally attaches a Server Action directly
    // on the ledger page export, this test will catch it.
    expect(exportedKeys).toEqual(["default"]);
  });

  // R9.2 — the component must be named so office-side error boundaries can
  // surface the ledger surface by name.
  it("AC R9.2: default export has a non-empty function name", async () => {
    const mod = await import("../page");
    expect(mod.default.name.length).toBeGreaterThan(0);
  });
});
