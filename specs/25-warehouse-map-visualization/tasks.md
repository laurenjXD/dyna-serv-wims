# Warehouse Map Visualization — Tasks

Status: Approved

No map component, route behavior, server query, or layout configuration may
be implemented until `requirements.md`, `design.md`, and this file are
Approved with both required sign-offs.

## Task Group A — Contract and layout fixture

- [ ] Confirm the PDF is the initial visual reference and record its source
      filename/hash in the fixture notes.
- [ ] Confirm rack A-I level/position geometry against the PDF.
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
- [ ] Compare rendered map against the PDF reference.
- [ ] Run the repository type-check, test suite, and build.
- [ ] Obtain both required sign-offs and change all three documents to
      `Status: Approved` before implementation completion.

## Sign-off

- [x] Technical Lead approval — User / System, 2026-10-21
- [x] Product/Operations Lead approval — User / System, 2026-10-21
