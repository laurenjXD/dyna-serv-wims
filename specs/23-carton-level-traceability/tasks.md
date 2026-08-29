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
- [ ] Add carton-aware exact-pick and dispatch validation while preserving the
      existing reservation and immutable inventory transaction boundaries.
- [ ] Add shared QR/Code 128 label rendering and carton traceability views.
- [ ] Add unit, integration, and Playwright scanner simulations covering normal,
      short, late, over, wrong-item, duplicate, damaged, unexpected, picking,
      and quantity-variance cases.
