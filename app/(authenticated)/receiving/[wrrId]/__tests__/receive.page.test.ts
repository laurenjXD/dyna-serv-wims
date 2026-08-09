// RED tests — floor scan/receive page for WRR barcode reconciliation.
//
// ─── TDD GAP NOTICE ──────────────────────────────────────────────────────────
// The implementation at `[wrrId]/receive/page.tsx` already exists as of
// 2026-08-09 when these tests were first written. That means the RED step was
// skipped for this page. Per this project's TDD protocol, this is a gap —
// tests written after an implementation tend to encode what the code does
// rather than what it was supposed to do.
//
// Consequence: tests 1 and 2 below (structural existence checks) will
// PASS immediately and are therefore NOT genuinely RED. They are included
// because they anchor the spec requirements and protect against the page
// being accidentally deleted or renamed.
//
// Tests 3 and 4 below ARE genuinely RED: they test spec requirements that
// the current implementation does NOT satisfy. These will FAIL until the
// implementation is updated.
//
// ─── Playwright note ─────────────────────────────────────────────────────────
// specs/00-steering/testing.md specifies Playwright for floor surfaces with
// hardware simulation (barcode scanner input as keyboard Enter-terminated
// events). Playwright is NOT currently installed in this project. The full
// behavioral E2E layer (auto-focus verification in a real browser, scan input
// simulation, bottom-third layout verification, offline transition mocking)
// requires `@playwright/test` to be set up before it can be implemented.
// Until then, these Vitest structural and source-content tests provide the
// available coverage layer.
//
// ─── Traceability ────────────────────────────────────────────────────────────
// specs/07-incoming-receiving/requirements.md:
//   R2.4  — Starting receiving SHALL transition the WRR to
//             receiving_in_progress through an authorized server command and
//             SHALL be safe to retry.
//   R2.5  — The floor flow SHALL clearly show the WRR being received,
//             expected lines, scanned quantities, remaining quantities, and
//             exceptions.
//   R3.1  — Each carton scan SHALL be matched against the WRR's expected
//             item/line and the approved barcode/item identity mapping.
//   R7.1  — Confirmation SHALL be an explicit, authorized server command
//             with one primary floor action.
// specs/07-incoming-receiving/design.md §3 (route), §4 (state model),
//   §6 (floor scan design)
// specs/00-steering/brand-design-system.md §3 (floor surface rules —
//   mobile-first 375px base, bg-brand-navy page wrapper, one primary action,
//   primary action in bottom third, scan input auto-focused)
//
// Surface: FLOOR — scanner-ready WRR reconciliation at 375px viewport.
// Expected failure modes for RED tests:
//   Test 3 → page source does not import or call `startReceiving`
//   Test 4 → page source does not contain a "Confirm Receipt" action

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Source content helper ────────────────────────────────────────────────────
// Reading the page source directly lets us assert on spec-required patterns
// (specific imports, required JSX attributes, required CTA text) without
// needing a DOM environment or Playwright. This is appropriate for
// specification-anchor assertions that are too coarse-grained for
// unit tests but cannot yet be covered by Playwright.

function pageSource(): string {
  return readFileSync(resolve(__dirname, "../receive/page.tsx"), "utf8");
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe(
  "ReceiveFloorPage (app/(authenticated)/receiving/[wrrId]/receive/page.tsx)",
  () => {
    // ── Test 1 (structural — WILL PASS; TDD gap) ────────────────────────────
    // R2.5, R3.1 — the floor scan route must exist as a loadable module so
    // the warehouse warehouseman can reach the scanner-ready surface at all.
    // This test would have been the RED anchor if written before the page was
    // created; it is retained as a regression guard.
    it(
      "AC R2.5/R3.1: exports a default component (floor scan route exists)",
      async () => {
        const mod = await import("../receive/page");
        expect(typeof mod.default).toBe("function");
      },
    );

    // ── Test 2 (structural — WILL PASS; TDD gap) ────────────────────────────
    // R3.1 — the component must be named so React error boundaries and server
    // logs surface the failing component by name during floor incidents where
    // fast triage matters.
    it(
      "AC R3.1: default export has a non-empty function name (traceable in error boundaries)",
      async () => {
        const mod = await import("../receive/page");
        expect(mod.default.name.length).toBeGreaterThan(0);
      },
    );

    // ── Test 3 (RED — WILL FAIL against current implementation) ─────────────
    // R2.4 — "Starting receiving SHALL transition the WRR to
    // receiving_in_progress through an authorized server command and SHALL be
    // safe to retry."
    //
    // The floor scan page is reached when a warehouseman navigates to it from
    // the WRR detail. If the WRR is still in `staged_pending_arrival`, the
    // page MUST automatically invoke the `startReceiving` server action to
    // transition it, rather than showing a passive warning that requires the
    // user to manually navigate back and find a separate "Start Receiving"
    // button. This keeps the floor flow one-action-per-screen and avoids dead
    // ends for warehousemen who navigate directly to the scan URL.
    //
    // Current implementation: shows a `role="alert"` warning but does NOT
    // import or call `startReceiving`. Test will fail until the page imports
    // and invokes `startReceiving` from `@/lib/actions/receiving`.
    it(
      "AC R2.4: page references startReceiving to auto-initiate WRR status transition on load",
      () => {
        const source = pageSource();
        // The page must import or otherwise reference `startReceiving` from
        // the receiving actions module so that it can transition
        // staged_pending_arrival → receiving_in_progress when the floor user
        // reaches this route.
        expect(source).toContain("startReceiving");
      },
    );

    // ── Test 4 (RED — WILL FAIL against current implementation) ─────────────
    // R7.1 — "Confirmation SHALL be an explicit, authorized server command
    // with one primary floor action."
    // brand-design-system.md §3 — "one primary action per screen", "primary
    // action in the bottom third of the viewport, full-width, always visible."
    //
    // After all WRR lines reach `scanned_qty >= expected_qty`, the scan page
    // must surface the Confirm Receipt CTA as the single primary floor action.
    // The warehouseman should not need to navigate back to a different screen
    // to confirm — the scan-and-confirm loop belongs on one floor surface.
    //
    // Current implementation: the page renders a scan-only form (submit arrow
    // button with aria-label "Submit scan") with no "Confirm Receipt" button
    // or text anywhere in the JSX. Test will fail until a confirmation action
    // is added to the receive page, conditional on all lines being fully scanned.
    it(
      "AC R7.1: page surfaces a Confirm Receipt primary CTA when all lines are fully scanned",
      () => {
        const source = pageSource();
        // The text "Confirm Receipt" (or a close variant matching the CTA
        // wording required by the spec's one-primary-action floor rule) must
        // appear in the page JSX so the warehouseman can submit the authorised
        // commit command without leaving the floor scan surface.
        expect(source).toContain("Confirm Receipt");
      },
    );

    // ── Test 5 (source-content) ──────────────────────────────────────────────
    // brand-design-system.md §3 — barcode scanner input must have autoFocus so
    // it captures keyboard-emulated scanner events immediately on mount without
    // requiring the warehouseman to tap the input first.
    // testing.md — "Barcode scanner input → simulated as keyboard
    // Enter-terminated input events in Playwright."
    //
    // NOTE: This test verifies the `autoFocus` attribute is present in the
    // JSX source. Full verification that the element is actually focused in a
    // real browser viewport requires Playwright (not yet installed).
    it(
      "AC R3.1 / brand §3: scan input carries autoFocus so barcode scanner fires immediately on mount",
      () => {
        const source = pageSource();
        expect(source).toContain("autoFocus");
      },
    );

    // ── Test 6 (source-content) ──────────────────────────────────────────────
    // R2.5 — "The floor flow SHALL clearly show the WRR being received,
    // expected lines, scanned quantities, remaining quantities, and exceptions."
    //
    // The page must render the WRR reference (lot number / WRR number) so the
    // warehouseman can verify they are scanning against the correct document.
    it(
      "AC R2.5: page renders WRR reference (wrrNumber) for warehouseman verification",
      () => {
        const source = pageSource();
        // wrr.wrrNumber must appear in the JSX so the document reference is
        // visible on the floor scan screen.
        expect(source).toContain("wrrNumber");
      },
    );

    // ── Test 7 (source-content) ──────────────────────────────────────────────
    // R2.5 — progress (X of Y lines matched) must be visible.
    // brand-design-system.md §3 — one task per screen, current progress visible.
    it(
      "AC R2.5: page tracks and displays per-line scan progress (scanned vs expected)",
      () => {
        const source = pageSource();
        // Both scannedQty and expectedQty must be referenced in the JSX so the
        // running reconciliation progress is visible on the floor surface.
        expect(source).toContain("scannedQty");
        expect(source).toContain("expectedQty");
      },
    );
  },
);
