# Warehouse Map Visualization — Tasks

Status: Approved
Updated: 2026-10-23 — Final PDF rack footprint and label-spacing amendment approved

The map component, route behavior, server query, and layout configuration are
approved for implementation under the requirements and design documents.

## Final PDF mapping and label-spacing amendment — 2026-10-23 (Approved)

- [x] Reconcile the canonical layout to the PDF: A 30 positions/layer × 4 layers, B–E 12/layer × 4, F–G 14/layer × 4, and H–I 12 positions/layer × 2 layers.
- [x] Keep RCV/Hold tracking rows out of rack-cell rendering while including them in the Table View/list view.
- [x] Fix SVG spacing so warehouse title, rack titles, headers, and cell labels do not overlap in desktop or focused-rack view.
- [x] Product/Operations Lead approval — User, 2026-10-23.
- [x] Technical approval and map verification — System standing approval, 2026-10-23.

## Task Group A — Contract and layout fixture

- [ ] Confirm the workbook `Racking ID` sheet is the current location source
      and record its filename/sheet in the fixture notes.
- [ ] Confirm rack A-I level/position geometry against the workbook.
- [ ] Confirm how non-rack/reference areas are represented or left unmapped.
- [ ] Confirm that pallet-position counts are reference-only until a CBM
      capacity reconciliation is approved.

## Task Group B — Server read model

- [ ] Define the authorized map query contract using `locations.read`.
- [ ] Reuse canonical location inventory/capacity queries; do not create a
      second inventory ledger or client-authoritative status.
- [ ] Define unmapped, inactive, missing-capacity, and stale-data responses.
- [ ] Add query tests for filtering, scope, status, and capacity aggregation.

## Task Group C — Layout and map UI

- [ ] Add versioned v1 rack layout configuration for racks A-I.
- [ ] Implement data-driven SVG cell rendering keyed by canonical location
      labels.
- [ ] Implement location selection, detail panel, legend, search, and filters.
- [ ] Implement Table View/Map View synchronization under the existing
      Locations tab.
- [ ] Implement `Locate on map` deep-link behavior.
- [ ] Implement responsive rack-by-rack mobile presentation and table fallback.

## Task Group D — Verification

- [ ] Add unit tests for cell mapping, orientation, and status thresholds.
- [ ] Add Playwright tests at 375px, 430px, 768px, and desktop widths.
- [ ] Run design-system audit and accessibility review.
- [x] Compare rendered map against the supplied PDF reference.
- [ ] Run the repository type-check, test suite, and build.
- [ ] Obtain both required sign-offs and change all three documents to
      `Status: Approved` before implementation completion.

## Sign-off

- [x] Technical Lead approval — User / System, 2026-10-21
- [x] Product/Operations Lead approval — User / System, 2026-10-21
- [x] Final PDF mapping and spacing approval — User / System, 2026-10-23
