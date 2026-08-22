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

    // ── Test 16 (added 2026-08-20, per-unit receiving amendment, point 1) ────
    // requirements.md R3.8/R3.10, design.md §6.2 (amended 2026-08-20) — the
    // server layer no longer writes wrr_items.scanned_qty at scan time
    // (lib/actions/receiving.ts's recordScan), so there is no DB signal for
    // "which line was just scanned and is awaiting its per-unit commit."
    // recordScan's RecordScanResult already returns wrrItemId for exactly
    // this reason (see lib/actions/receiving.ts's comment on that field).
    // The floor page's successful-scan redirect must carry that id through
    // the URL so it can come back in on the next render.
    //
    // Current implementation: the scan-success redirect only encodes
    // remaining/disposition, not wrrItemId. Fails until handleScan's success
    // branch is updated.
    it(
      "AC R3.8/R3.10, design.md §6.2 (2026-08-20): successful-scan redirect carries the matched wrrItemId so the floor page can resolve which line's commit form to show next",
      () => {
        const source = pageSource();
        expect(source).toContain("wrrItemId=${scanResult.wrrItemId}");
      },
    );

    // ── Test 17 (added 2026-08-20, per-unit receiving amendment, point 2) ───
    // design.md §6.2/§9 (amended 2026-08-20) — primaryReadyLine (Test 12's
    // identifier, unchanged by name) must now be resolvable from the
    // wrrItemId URL search param (carried in by Test 16's redirect), guarded
    // by that specific line's committedAt === null so a stale/replayed URL
    // can never resurrect a commit form for an already-fully-committed line.
    // This supersedes deriving primaryReadyLine purely from the whole-line
    // `scannedQty >= expectedQty` gate, which no longer has a live signal at
    // scan time for store lines (recordScan no longer writes scanned_qty).
    //
    // Current implementation: PageProps.searchParams has no wrrItemId field,
    // and primaryReadyLine is derived solely from
    // `item.scannedQty >= item.expectedQty && item.committedAt === null`.
    // Fails on both assertions until reworked.
    it(
      "AC design.md §6.2/§9 (2026-08-20): primaryReadyLine is resolved from the wrrItemId search param (guarded by committedAt === null on that specific line), not solely from the whole-line scannedQty >= expectedQty gate",
      () => {
        const source = pageSource();

        // The page must accept a wrrItemId search param — Test 16's redirect
        // carries the just-scanned line's id back in through this param.
        expect(source).toContain("wrrItemId?: string;");

        // primaryReadyLine's own derivation must actually read that param,
        // not merely declare it elsewhere and ignore it. Isolate a window
        // around the primaryReadyLine declaration and assert it references
        // wrrItemId alongside the still-required committedAt guard.
        const declIdx = source.indexOf("const primaryReadyLine");
        expect(declIdx).toBeGreaterThan(-1);
        const derivationWindow = source.slice(Math.max(0, declIdx - 500), declIdx + 300);
        expect(derivationWindow).toContain("wrrItemId");
        expect(derivationWindow).toContain("committedAt === null");
      },
    );

    // ── Test 18 (added 2026-08-20, per-unit receiving amendment, point 3) ───
    // requirements.md R7.5, design.md §9 (amended 2026-08-20) —
    // commitWrrLine's idempotencyKey param is now REQUIRED for a
    // store-disposition unit commit (lib/actions/receiving.ts's
    // commitStoreUnit rejects a missing/empty key with a distinct error).
    // The store-disposition primary commit form must submit a fresh key
    // generated per page render, so a double-tap of the same rendered Store
    // button is idempotent (same key) but the next unit's fresh render gets
    // a fresh key.
    //
    // Current implementation: no idempotencyKey field exists anywhere in the
    // page, and no randomUUID()/crypto.randomUUID() call is present. Fails
    // until the store commit form is reworked to include it.
    it(
      "AC R7.5, design.md §9 (2026-08-20): store-disposition primary commit form carries a per-render idempotencyKey hidden field wired to commitWrrLine's now-required param",
      () => {
        const source = pageSource();
        expect(source).toContain("idempotencyKey");
        expect(source).toMatch(/randomUUID\(\)/);
      },
    );

    // ── Test 19 (added 2026-08-20, per-unit receiving amendment, point 4) ───
    // requirements.md R3.8/R8.2, design.md §6.2/§6.2a (amended 2026-08-20) —
    // the store-disposition location suggestion is now requested per
    // individually scanned unit, not once for the whole line's remaining
    // expected quantity. The old whole-line calculation
    // (`unitCbm * primaryReadyLine.expectedQty`) must not remain the basis
    // for the suggestion request; a single-unit framing must replace it.
    //
    // Current implementation: suggestPutawayLocations is called with
    // `requestedQty: primaryReadyLine.expectedQty` (the whole line's
    // remaining quantity), and both the on-screen CBM copy and the
    // PutawayLocationSelector's requestedCbm prop multiply
    // `unitCbm * primaryReadyLine.expectedQty`. Fails on the first
    // assertion until the per-unit request replaces the whole-line one.
    it(
      "AC R3.8/R8.2, design.md §6.2a (2026-08-20): store-disposition location suggestion requests capacity for exactly ONE unit, not the whole line's remaining expected quantity",
      () => {
        const source = pageSource();
        // The old whole-line calculation multiplied unitCbm by the line's
        // full expectedQty for one suggestion call covering every remaining
        // unit at once — that framing is superseded by a per-unit request.
        expect(source).not.toContain("unitCbm * primaryReadyLine.expectedQty");
        // A single-unit framing must replace it — an explicit qty of 1
        // requested from suggestPutawayLocations.
        expect(source).toMatch(/requestedQty:\s*1\b/);
      },
    );

    // ── Test 20 (added 2026-08-20, per-unit receiving amendment, point 5) ───
    // design.md §6.2/§9 (amended 2026-08-20) — once a unit commits
    // successfully, the redirect must return to the scan-input state without
    // carrying the wrrItemId param forward, so the next scan can happen and
    // a stale/replayed URL never re-shows a resolved line's commit form.
    // This is only a meaningful question once wrrItemId support exists at
    // all (Test 16/17) — the first assertion below anchors that precondition
    // so this test fails for the real reason (the feature not existing yet),
    // not a trivial absence.
    //
    // Current implementation: PageProps.searchParams has no wrrItemId field
    // at all (fails assertion 1). Once implemented, the commit-success
    // redirect (`result=committed&line=...`) must not append a
    // `wrrItemId=` query key (assertion 2, specifically checking for the
    // query-string token with its `=`, not the unrelated local `wrrItemId`
    // form-field variable already read by handleCommitLine).
    it(
      "AC design.md §6.2/§9 (2026-08-20): after a successful unit commit, the redirect returns to the scan-input state without carrying wrrItemId forward, so a stale/replayed URL never re-shows a resolved line's commit form",
      () => {
        const source = pageSource();

        expect(source).toContain("wrrItemId?: string;");

        const commitSuccessIdx = source.indexOf("if (commitResult.ok)");
        expect(commitSuccessIdx).toBeGreaterThan(-1);
        const commitSuccessBlockEnd = source.indexOf("} else {", commitSuccessIdx);
        const commitSuccessBlock = source.slice(commitSuccessIdx, commitSuccessBlockEnd);
        expect(commitSuccessBlock).not.toContain("wrrItemId=");
      },
    );

    // ── Test 21 (added 2026-08-20, per-unit receiving amendment, point 6) ───
    // design.md §6.3 (unchanged by the 2026-08-20 amendment) — the
    // inspect-disposition ("Hold") sequence stays whole-line-gated with no
    // idempotencyKey requirement; only the store-disposition branch gains
    // the new required field (Test 18). Confirms Test 10's existing
    // inspect-disposition patterns are undisturbed and that idempotencyKey
    // does not leak into the inspect branch as a universal requirement.
    //
    // Current implementation: idempotencyKey does not exist anywhere yet, so
    // this fails on the store-branch assertion (it should be present there
    // and currently is not) even though the inspect-branch absence
    // assertion is already trivially true — the test as a whole is
    // therefore genuinely RED for the real reason.
    it(
      "AC §6.3 (unchanged): inspect-disposition commit UI keeps its existing whole-line-gated pattern with no idempotencyKey requirement; the new idempotencyKey requirement is scoped to the store-disposition branch only",
      () => {
        const source = pageSource();

        // Existing inspect-disposition patterns (Test 10) still present —
        // confirms this amendment does not touch the inspect path.
        expect(source).toContain('"inspection"');
        expect(source).toContain("isActive");

        // Isolate the ternary's two branches by the disposition check.
        const ternaryIdx = source.indexOf('primaryReadyLine.disposition === "store" ?');
        expect(ternaryIdx).toBeGreaterThan(-1);
        const storeBranchEnd = source.indexOf(") : (", ternaryIdx);
        expect(storeBranchEnd).toBeGreaterThan(ternaryIdx);
        const inspectBranchEnd = source.indexOf("</form>", storeBranchEnd);
        const storeBranch = source.slice(ternaryIdx, storeBranchEnd);
        const inspectBranch = source.slice(storeBranchEnd, inspectBranchEnd);

        expect(storeBranch).toContain("idempotencyKey");
        expect(inspectBranch).not.toContain("idempotencyKey");
      },
    );

    // ── Test 22 (added 2026-08-21, design-system-auditor bug fix, point 1) ──
    // design.md §9 (amended 2026-08-20): `wrr_items.scanned_qty` was
    // redefined for STORE-disposition lines to mean "units committed so
    // far" — commitWrrLine's atomic `SET scanned_qty = scanned_qty + 1`
    // (lib/actions/receiving.ts ~line 1022-1024) is the only writer for a
    // store line; recordScan no longer increments it for store lines at all
    // (lib/actions/receiving.ts ~line 590-611). INSPECT-disposition lines
    // are unaffected — their scanned_qty genuinely still means "scanned."
    // ui-ux-design-plan.md §3.5: "Always show ... completed/total count ...
    // Users should never need to infer whether a physical action was
    // successfully committed." A store-line operator reading
    // "0 / 5 scanned" after their first unit is sitting in the primary
    // commit form (already scanned, not yet tapped Store) is being told a
    // number that is actually "committed," labeled "scanned" — exactly the
    // inference the design plan says must never be required.
    //
    // Current implementation: the item-card progress paragraph
    // (`{item.scannedQty} / {item.expectedQty} scanned`) uses one blanket
    // label for both dispositions and never references `item.disposition`.
    // Fails on the disposition-conditional-structure assertion until the
    // copy is reworked to distinguish STORE (committed-progress wording)
    // from INSPECT (unchanged "scanned" wording).
    it(
      "AC ui-ux-design-plan.md §3.5, design.md §9 (2026-08-20 scanned_qty redefinition): per-item progress copy is disposition-aware — STORE lines report committed progress, not 'scanned', since scanned_qty means units committed so far for store lines only; INSPECT lines keep their unchanged 'scanned' wording",
      () => {
        const source = pageSource();

        // Isolate the item-card "Qty progress" paragraph, between the lot
        // number paragraph and the disposition badge block, so this
        // assertion targets only that specific copy — not any other
        // unrelated "scanned"/"committed" text elsewhere on the page.
        const qtyProgressIdx = source.indexOf("Qty progress");
        expect(qtyProgressIdx).toBeGreaterThan(-1);
        const dispositionBadgeIdx = source.indexOf(
          "Disposition — label",
          qtyProgressIdx,
        );
        expect(dispositionBadgeIdx).toBeGreaterThan(qtyProgressIdx);
        const progressWindow = source.slice(qtyProgressIdx, dispositionBadgeIdx);

        // The copy must be driven by an actual disposition-conditional in
        // the source (not merely a blanket string that happens to contain
        // both words) — a blanket-presence check alone could pass without
        // the two dispositions ever actually being distinguished.
        expect(progressWindow).toContain("item.disposition");

        // Distinct wording: STORE gets committed-progress language,
        // INSPECT keeps the unchanged, still-correct "scanned" wording.
        expect(progressWindow).toMatch(/committed|stored/i);
        expect(progressWindow).toContain("scanned");
      },
    );

    // ── Test 23 (added 2026-08-21, design-system-auditor bug fix, point 2) ──
    // design.md §9 (amended 2026-08-20) / ui-ux-design-plan.md §3.5 — same
    // redefinition as Test 22, applied to the header progress summary. The
    // current header (`{fullyScannedLines} / {totalLines} lines fully
    // scanned`) overclaims "scanned" for any WRR containing store-
    // disposition lines, whose scanned_qty is committed-progress, not
    // scan-progress.
    //
    // This intentionally does NOT touch or conflict with Test 7 (line
    // ~188): Test 7 only asserts that the literal tokens "scannedQty" and
    // "expectedQty" appear somewhere in the page source (they still do —
    // in the fullyScannedLines/readyLines computations, in Test 22's
    // per-item copy, etc.). This test targets only the header paragraph's
    // literal rendered copy, a disjoint concern from Test 7's field-
    // reference check, so no compatibility change to Test 7 was needed.
    //
    // Current implementation: the header window contains the literal,
    // disposition-blind phrase "lines fully scanned" unconditionally.
    // Fails until that phrasing is replaced with disposition-aware or
    // neutral copy that does not assert "scanned" happened for lines whose
    // scanned_qty now means "committed."
    it(
      "AC ui-ux-design-plan.md §3.5, design.md §9 (2026-08-20): header progress summary no longer unconditionally claims 'scanned' now that scanned_qty means committed progress for STORE-disposition lines (Test 7 unaffected — it only checks scannedQty/expectedQty field-reference tokens, not this header's literal copy)",
      () => {
        const source = pageSource();

        const headerStart = source.indexOf("Progress — no text below 16px");
        expect(headerStart).toBeGreaterThan(-1);
        const headerEnd = source.indexOf("{!isReceivable &&", headerStart);
        expect(headerEnd).toBeGreaterThan(headerStart);
        const headerWindow = source.slice(headerStart, headerEnd);

        expect(headerWindow).not.toContain("lines fully scanned");
      },
    );

    // ── Test 24 (added 2026-08-21, design-system-auditor bug fix, point 3) ──
    // design.md §9 (amended 2026-08-20, step 8) — for a STORE-disposition
    // line, commitWrrLine's single atomic UPDATE
    // (lib/actions/receiving.ts ~line 1022-1024:
    // `set scanned_qty = scanned_qty + 1, committed_at = case when
    // scanned_qty + 1 >= expected_qty then now() else committed_at end`)
    // means `scanned_qty` reaching `expected_qty` and `committed_at`
    // becoming non-null happen in the SAME write. Consequently
    // `fullyScanned && !isCommitted` (this page's `readyToCommit`,
    // page.tsx ~line 452) can never be observably true for a store line
    // again — it is dead code for STORE, reachable only for INSPECT lines
    // (§6.3, unchanged — inspect's whole-line commit is a separate step
    // from scanning, so that gap remains real there).
    //
    // Current implementation: `const readyToCommit = fullyScanned &&
    // !isCommitted;` has no disposition scoping at all, so the two
    // secondary-indicator JSX blocks that consume it ("Ready to store —
    // complete below" / "...complete the current line first") remain
    // written generically for both dispositions even though the STORE
    // branch can never actually render. Fails until readyToCommit's own
    // declaration is scoped to inspect-disposition lines only.
    it(
      "AC design.md §9 (2026-08-20, step 8): readyToCommit is scoped to inspect-disposition lines only, since a store line's committed_at is now set atomically with scanned_qty reaching expected_qty in commitWrrLine's single UPDATE — fullyScanned && !isCommitted can no longer become true for a store line, making the generic 'Ready to store — complete below' / '...complete the current line first' secondary-indicator blocks dead code for STORE unless explicitly scoped to INSPECT",
      () => {
        const source = pageSource();

        const readyToCommitDeclIdx = source.indexOf("const readyToCommit");
        expect(readyToCommitDeclIdx).toBeGreaterThan(-1);
        const readyToCommitDeclEnd = source.indexOf(";", readyToCommitDeclIdx);
        expect(readyToCommitDeclEnd).toBeGreaterThan(readyToCommitDeclIdx);
        const readyToCommitDecl = source.slice(
          readyToCommitDeclIdx,
          readyToCommitDeclEnd,
        );

        // The dead-for-STORE path must be explicitly scoped so it can only
        // ever be true for an inspect-disposition line.
        expect(readyToCommitDecl).toMatch(
          /item\.disposition\s*===\s*["']inspect["']|item\.disposition\s*!==\s*["']store["']/,
        );
      },
    );
  },
);
