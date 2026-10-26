# Amendment — Migration Carton-Level Traceability

Status: Approved

## Decision

Opening migration balances SHALL receive an immediately available lot QR even
when the source workbook does not provide a carton count. The lot QR identifies
the aggregate lot/location balance and remains valid for the lifetime of that
lot.

When `BOXES ON HAND` is present and reviewed, the migration MAY create
migration-generated carton identities. These are distinct from WRR-origin
carton identities and SHALL be explicitly marked as migration-origin records;
the system SHALL NOT create synthetic WRR records to support them.

When `BOXES ON HAND` is absent or ambiguous, the opening balance SHALL be
committed as aggregate lot/location stock with carton traceability marked
`pending`. An administrator MAY resolve the physical carton count later,
without re-importing the workbook or changing the original aggregate quantity.

## Data-model amendment

`inventory_units` SHALL support one of these origins:

- `wrr` — linked to a WRR item line; or
- `migration` — linked to a migration batch and lot.

Migration-origin units SHALL include the lot, location, migration batch,
stable unit ID, carton ID, unit index, status, and provenance timestamps. A
synthetic `wrr_item_id` SHALL NOT be used for migration-origin units.

## Deferred resolution

The migration review and inventory administration surfaces SHALL allow an
administrator to:

1. See lots whose carton traceability is pending.
2. Enter carton count per lot/location, including a confirmed partial-carton
   quantity where applicable.
3. Review the suggested count when `QTY / SPQ` is an exact whole number.
4. Confirm the count and create migration-origin `inventory_units`
   idempotently.
5. Print all generated carton QRs in one print job.

The original opening quantity, source row, source workbook, and migration
batch SHALL remain immutable audit evidence. A later carton-count resolution
does not create a second lot balance or duplicate inventory transaction.

## QR contracts

- Lot QR: one QR per lot, encoding the existing lot identity and resolving to
  aggregate inventory information.
- Carton QR: one unique QR per `inventory_unit`, resolving to the carton and
  its parent lot/location.
- Bulk carton printing SHALL be available only for confirmed carton units.
- A lot with pending carton traceability SHALL still support lot QR printing.

## Acceptance criteria

- A migration with no box count commits a lot balance and lot QR, with no fake
  carton units.
- A later confirmed count creates exactly the confirmed number of
  migration-origin units and no duplicates on retry.
- A migration with a reviewed box count can print all carton QRs in one job.
- Scanning a migration carton QR resolves the same lot, item, owner, and
  location represented by the inventory record.
- Lot QR behavior remains unchanged before and after carton resolution.

## Required sign-off

- [x] Technical Lead Sign-off — User / System, 2026-10-27
- [x] Product/Operations Lead Sign-off — User / System, 2026-10-27
