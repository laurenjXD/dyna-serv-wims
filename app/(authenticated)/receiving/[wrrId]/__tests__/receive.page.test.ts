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

    // ── Test 4 (updated 2026-08-10 per §9's per-line-commit reversal) ────────
    // R7.1 — "Confirmation SHALL be an explicit, authorized server command
    // with one primary floor action [per line]."
    // design.md §9 (Reversed 2026-08-10): the single end-of-WRR "Confirm
    // Receipt" gate is replaced by per-line immediate commit — each line
    // gets its own "Store" (§6.2, store disposition) or "Hold" (§6.3, inspect
    // disposition) action once it is fully scanned and not yet committed.
    // There is no longer a single whole-WRR "Confirm Receipt" button on this
    // screen; asserting for that text would re-encode the superseded model.
    it(
      "AC R7.1/§9: page surfaces per-line Store/Hold commit CTAs, not a whole-WRR Confirm Receipt button",
      () => {
        const source = pageSource();
        // Per-line commit actions per §6.2 (store) / §6.3 (inspect).
        expect(source).toContain("commitWrrLine");
        expect(source).toContain("Store");
        expect(source).toContain("Hold");
        // The superseded whole-WRR gate must not reappear.
        expect(source).not.toContain("Confirm Receipt");
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

    // ── Test 8 (added 2026-08-10, §6.1 flow-type mismatch) ──────────────────
    // design.md §6.1 — a scanned item whose own flow_type differs from the
    // WRR's flow_type is rejected through the same exception path as any
    // other wrong-item scan, with plain-language feedback.
    it(
      "AC §6.1: getScanErrorMessage covers flow_type_mismatch with a plain-language, supervisor-pointing message",
      () => {
        const source = pageSource();
        expect(source).toContain("flow_type_mismatch");
      },
    );

    // ── Test 9 (added 2026-08-10, §6.2 suggested location) ───────────────────
    // design.md §6.2 — the store-disposition commit UI calls the location/
    // capacity suggestion interface and renders "Location Label | Remaining
    // Box Capacity" per design.md line 623's display format.
    it(
      "AC §6.2: store-disposition commit UI calls suggestPutawayLocations and renders remaining CBM alongside the location label",
      () => {
        const source = pageSource();
        expect(source).toContain("suggestPutawayLocations");
        expect(source).toContain("remainingCbm");
      },
    );

    // ── Test 10 (added 2026-08-10, §6.3 inspection location) ─────────────────
    // design.md §6.3 — the inspect-disposition commit UI resolves the active
    // set of inspection-type locations.
    it(
      "AC §6.3: inspect-disposition commit UI queries active inspection-type locations",
      () => {
        const source = pageSource();
        expect(source).toContain('"inspection"');
        expect(source).toContain("isActive");
      },
    );

    // ── Test 11 (added 2026-08-10, §9 receipt-complete state) ────────────────
    // design.md §9 — once every line has committed_at set, the WRR is already
    // 'confirmed' server-side; the scan/commit UI must not be shown further.
    it(
      "AC §9: page renders a 'Receipt complete' state once the WRR is confirmed, instead of further scan/commit UI",
      () => {
        const source = pageSource();
        expect(source).toContain("Receipt complete");
        expect(source).toContain('"confirmed"');
      },
    );

    // ── Test 12 (added — design-system-auditor finding 1) ────────────────────
    // brand-design-system.md §3 "One primary action per floor screen": exactly
    // one full-width brand-red Store/Hold CTA may be visible at a time. Only
    // the first ready-but-uncommitted line (by wrr.items order) gets that
    // primary CTA, anchored in the sticky bottom primary-action area; any
    // OTHER ready line gets a compact secondary indicator instead of a second
    // equal-weight primary button rendered inline in the card list.
    it(
      "AC brand §3: only the first ready line gets the primary Store/Hold commit form (in the bottom sticky area); other ready lines get a secondary indicator, not a second primary CTA",
      () => {
        const source = pageSource();

        // A single "primary ready line" concept drives which line gets the
        // primary CTA.
        expect(source).toContain("primaryReadyLine");
        expect(source).toContain("isPrimaryReady");

        // The Store/Hold commit <form> must NOT be rendered inline per-card
        // any more (that was the multi-CTA violation) — it must live in the
        // sticky bottom primary-action area instead. Isolate the card-list
        // section (between the "Item progress list" and "Primary action"
        // comments) and assert it contains no <form> tag at all.
        const cardListStart = source.indexOf("Item progress list");
        const cardListEnd = source.indexOf("Primary action — bottom third");
        expect(cardListStart).toBeGreaterThan(-1);
        expect(cardListEnd).toBeGreaterThan(cardListStart);
        const cardListSection = source.slice(cardListStart, cardListEnd);
        expect(cardListSection).not.toContain("<form");

        // Non-primary ready lines get a secondary, non-brand-red indicator.
        expect(source).toContain("complete the current line first");

        // The bottom sticky primary-action area renders the commit form when
        // (and only when) a primary ready line exists, ahead of the scan input.
        expect(source).toContain("isReceivable && primaryReadyLine");
        expect(source).toContain("isReceivable && !primaryReadyLine && !allLinesScanned");
      },
    );

    // ── Test 13 (added — design-system-auditor finding 2) ────────────────────
    // brand-design-system.md §9: status badges/pills use Epilogue SemiBold
    // (the `font-label` token), not Outfit body copy.
    it(
      "AC brand §9: disposition badge uses font-label (Epilogue SemiBold), not font-outfit",
      () => {
        const source = pageSource();
        expect(source).toContain(
          'className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-body-md font-label uppercase ${'
        );
      },
    );

    // ── Test 14 (added — design-system-auditor finding 3) ────────────────────
    // brand-design-system.md §2: no text below 16px anywhere on a floor
    // screen — text-mono-md (14px) is not permitted.
    it(
      "AC brand §2: commit-error line-id feedback uses a 16px+ mono token, not text-mono-md (14px)",
      () => {
        const source = pageSource();
        expect(source).not.toContain("text-mono-md");
      },
    );

    // ── Test 15 (added — design-system-auditor finding 4) ────────────────────
    // brand-design-system.md §1.5: AAA contrast for time-critical floor text
    // — semantic red must be carried by the border/icon, not paragraph text
    // color, matching the existing scan-error/commit-error block pattern.
    it(
      "AC brand §1.5: 'no capacity'/'no inspection location' messages carry status-held via border/icon, not paragraph text color",
      () => {
        const source = pageSource();
        expect(source).not.toContain("font-body text-body-md text-status-held");
        expect(source).toContain("border-l-4 border-status-held bg-white");
      },
    );
  },
);
