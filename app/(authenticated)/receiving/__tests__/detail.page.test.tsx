// Test — WrrDetailPage (app/(authenticated)/receiving/[wrrId]/page.tsx).
//
// ─── TDD GAP — IMPLEMENTATION ALREADY EXISTS ─────────────────────────────────
//
// app/(authenticated)/receiving/[wrrId]/page.tsx was built WITHOUT a prior
// failing test. This violates the project's TDD protocol
// (specs/00-steering/testing.md). These tests are retroactive regression
// protection, NOT the RED step that should have preceded implementation. The
// structural existence tests below will PASS immediately because the page
// already exists.
//
// ─── Implementation gaps found during this test-writing pass ─────────────────
//
//   GAP 1 — Capability mismatch on the detail/review page:
//     [wrrId]/page.tsx calls requirePermission(resolver, "receiving.confirm").
//     The task specification requires "receiving.view" for a read/review surface.
//     A detail page visible to staff who can view (but not confirm) receipts
//     should gate on receiving.view, not receiving.confirm. Reconcile with
//     specs/02-rbac-roles/design.md §3.2 before sign-off.
//
//   GAP 2 — "Start Receiving" button is hardcoded disabled despite action existing:
//     [wrrId]/page.tsx renders the "Start Receiving" button with `disabled` and
//     a TODO comment stating: "Wire to startReceiving server action once added to
//     lib/actions/receiving.ts." However, startReceiving IS exported from
//     lib/actions/receiving.ts (confirmed below via AC R2.3/R2.4 test). The
//     action must be wired to the button — this is an unfinished page task, not
//     a missing action. requirements.md R2.3–R2.4 require this transition to be
//     operational.
//
// ─── Traceability ─────────────────────────────────────────────────────────────
//
//   specs/07-incoming-receiving/requirements.md
//     R2.2  — Staff SHALL be able to open a staged WRR.
//     R2.3  — Staff SHALL be able to start receiving at a receiving_bay context.
//     R2.4  — Starting receiving SHALL transition the WRR to receiving_in_progress
//              through an authorized server command, safe to retry.
//     R2.5  — The floor flow SHALL clearly show the WRR being received, expected
//              lines, scanned quantities, remaining quantities, and exceptions.
//     R3.7  — Scan capture SHALL NOT by itself create lots, increment inventory,
//              or finalize the inbound ledger (the [wrrId]/receive link is the
//              correct surface for scanning, not this detail page).
//     R10.1 — All reads SHALL use the capability/scope contract from 02-rbac-roles;
//              the UI MAY hide unavailable actions but server enforcement is
//              authoritative.
//   specs/07-incoming-receiving/design.md
//     §3    — Route: app/(authenticated)/receiving/[wrrId]/page.tsx is the WRR
//              detail/review page; the floor scan route is [wrrId]/receive/page.tsx.
//     §4    — State model: staged_pending_arrival → (startReceiving command) →
//              receiving_in_progress → (commitWrr command) → confirmed. The
//              detail page must surface both commands at the right status.
//     §5.2  — Scan-line state: matched, under-scanned, over-scanned, exception.
//   specs/00-steering/brand-design-system.md
//     §6    — Office surface: glassmorphism Level 1 cards (bg-white
//             ), WRR header + status badge, items table.
//     §3    — Touch targets h-11 (44 px) for office action buttons.
//
// Surface: Office. Permission gate: receiving.confirm (currently; see GAP 1).
// Expected failure mode if page were absent: "Cannot find module '../[wrrId]/page'".

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Source content helper ────────────────────────────────────────────────────
// Mirrors the pageSource() convention already established in
// app/(authenticated)/receiving/[wrrId]/__tests__/receive.page.test.ts —
// reading the page source directly lets us assert on a specific JSX prop
// wiring (which field feeds WRRUnitLabelGenerator's itemCode prop) without
// needing a DOM environment or a fully-mocked Server Component render tree
// (this page pulls in createPageResolver/requirePermission/db.select chains
// that a component-render test would have to mock wholesale just to reach a
// single prop expression).

function pageSource(): string {
  return readFileSync(resolve(__dirname, "../[wrrId]/page.tsx"), "utf8");
}

describe("WrrDetailPage (app/(authenticated)/receiving/[wrrId]/page.tsx)", () => {
  // R2.2 / R10.1 — the page module must exist and export a default Server
  // Component so the WRR detail/review surface is reachable via the
  // authenticated shell. Without this export, Next.js cannot render the route.
  it("AC R2.2/R10.1: exports a default component", async () => {
    const mod = await import("../[wrrId]/page");
    expect(typeof mod.default).toBe("function");
  });

  // R2.2 — the component must be named (not anonymous) so React error
  // boundaries surface the failing component by name during triage, not as
  // "(anonymous)" — critical for the office supervisor workflow where a broken
  // detail page blocks receipt confirmation.
  it("AC R2.2: default export has a non-empty function name", async () => {
    const mod = await import("../[wrrId]/page");
    expect(mod.default.name.length).toBeGreaterThan(0);
  });

  // R10.1 — the detail page is a read/review + command surface. The commitWrr
  // and startReceiving commands are invoked through inline server actions that
  // are NOT named page exports — they must remain within the component body.
  // Only `default` must be exported from the page module.
  it("AC R10.1: page module exports only the default component (no mutation side-exports)", async () => {
    const mod = await import("../[wrrId]/page");
    expect(Object.keys(mod)).toEqual(["default"]);
  });

  // R2.3 / R2.4 — design.md §4 requires a startReceiving command that
  // transitions the WRR from staged_pending_arrival → receiving_in_progress
  // through an authorized server action. This test verifies that the action
  // is exported from lib/actions/receiving and is callable — i.e., the command
  // contract the detail page must wire to the "Start Receiving" button exists.
  //
  // NOTE: [wrrId]/page.tsx currently renders the "Start Receiving" button as
  // `disabled` (GAP 2 above). This test would still PASS because the action
  // module is correct; the failure is in the page wiring.
  it("AC R2.3/R2.4: startReceiving action is exported from lib/actions/receiving", async () => {
    const actions = await import("@/lib/actions/receiving");
    expect(typeof actions.startReceiving).toBe("function");
  });

  // R2.5 / design.md §3 — the floor scan route is [wrrId]/receive/page.tsx
  // (a distinct floor-surface route), not the detail page itself. This verifies
  // the receiving actions module also exports the recordScan command that the
  // floor route depends on — because the detail page is the gateway to that
  // route (via the "Scan Items" link visible during receiving_in_progress).
  it("AC R2.5: recordScan action is exported from lib/actions/receiving (floor scan gateway)", async () => {
    const actions = await import("@/lib/actions/receiving");
    expect(typeof actions.recordScan).toBe("function");
  });

  // ── Task E (Phase 3, 2026-08-11 completion plan) — item-code display bug ──
  //
  // specs/18-barcode-integration/requirements.md FR-3a.2 — "Every one of the
  //   N labels for a line SHALL share the same underlying item identity ...
  //   THE SYSTEM SHALL NOT print N labels carrying an identical [bare-item-
  //   code] payload for the same line" — the labels are keyed to the line's
  //   real item identity, not to the item row's internal UUID FK.
  // specs/18-barcode-integration/design.md §2.2 — "All N labels share the
  //   same underlying item identity (the line's resolved item_id/item
  //   CODE)" — the human-readable item code, not the items.id UUID.
  //
  // Bug: [wrrId]/page.tsx currently passes `itemCode={item.itemId ??
  // item.lotNumber}` to WRRUnitLabelGenerator. `item.itemId` is
  // wrr_items.item_id — the items table's UUID primary-key foreign key
  // (lib/db/queries/receiving.ts WrrItemRow.itemId), not items.code (the
  // human-readable Dyna-Serv Item Code, lib/db/schema/items.ts). Whenever a
  // scanned/staged line resolves to an enrolled item (the common case),
  // printed unit labels currently show a raw UUID where the item code
  // belongs.
  //
  // getWrrDocument (lib/db/queries/receiving.ts) does not currently select
  // items.code at all — WrrItemRow only carries itemId (the FK). Fixing this
  // for real requires extending the query to join `items` and select its
  // `code` column, threading a new `itemCode` field through WrrItemRow, not
  // just a one-line swap at the call site.
  //
  // This test pins the call-site outcome only (per this repo's existing
  // source-content testing convention for JSX prop wiring): the itemCode
  // prop must never be bound to item.itemId, and must instead reference a
  // real item-code field once one exists on WrrItemRow.
  //
  // Expected failure mode against the current bug: the page source literally
  // contains the string "itemCode={item.itemId", so the `not.toContain`
  // assertion below fails; and it does not yet contain "itemCode={item.itemCode",
  // so that assertion fails too.
  it(
    "AC 18-FR-3a.2 / design.md §2.2: WRRUnitLabelGenerator's itemCode prop never binds to item.itemId (the items UUID FK) — printed unit labels must never show a raw UUID as the item code",
    () => {
      const source = pageSource();
      expect(source).not.toContain("itemCode={item.itemId");
      expect(source).toContain("itemCode={item.itemCode");
    },
  );
});
