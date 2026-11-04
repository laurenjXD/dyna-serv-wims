# Carton-Level Traceability — Tasks

Status: Approved
Updated: 2026-08-28

## Sign-off

- Technical Lead: User / System, 2026-08-28
- Product/Operations Lead: User / System, 2026-08-28

## Implementation tasks

- [x] Add the stable Carton ID and immutable status-history tables with RLS,
      uniqueness, non-negative quantity, and source-transaction constraints.
- [x] Backfill existing physical-unit rows without changing inventory totals.
- [ ] Add receiving carton registration, scan validation, duplicate handling,
      expected/actual variance, and receiving-exception commands.
- [ ] Add atomic Stage 1 reservation of exactly one existing carton row per
      committed box, bound to the pick-list item and exact item/lot/location.
- [ ] Add a `reserved` carton lifecycle state and verified release/expiry
      behavior; preserve `selected` for an accepted physical carton scan.
- [ ] Keep To Pick review/approval non-scanning. In Dispatch require each
      assigned carton QR exactly once; remove shared item/lot QR batch-count
      behavior and never infer unscanned carton identities.
- [ ] At final dispatch transition only the exact assigned and scanned carton
      rows, write immutable carton history, and preserve the aggregate inventory
      transaction boundary.
- [ ] Add shared QR/Code 128 label rendering and carton traceability views.
- [ ] Add unit, integration, and Playwright scanner simulations covering normal,
      short, late, over, wrong-item, duplicate, damaged, unexpected, picking,
      and quantity-variance cases.

## Approved amendment — exact outbound carton assignment and scan evidence (2026-11-04)

- [x] Product Owner approval: Lauren, 2026-11-04 (explicit approval to proceed and selection of verifiable per-carton scans in Dispatch).
- [x] Second approval: System standing approval convention, 2026-11-04.
