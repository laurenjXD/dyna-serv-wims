# One-Time Data Migration and Simulation Seeding - Requirements

Status: Approved

## Confirmed Initial Migration Decisions

Confirmed 2026-10-17:

- Organization: UBoT Incorporated Limited.
- Inventory model: VMI/vendor-owned inventory.
- Opening snapshot: latest workbook state, using `2026-10-09` as the initial
  opening-balance date.
- Opening-stock authority: `Location Matrix`.
- `Inventory`: reconciliation/check data only; it is not a second inventory
  import and it is not the source for item enrollment.
- Item enrollment authority: `CODES`.
- `RCV`: temporary receiving/holding location, not ordinary storage.
- Unmatched or incomplete records: imported into a review queue and excluded
  from committed canonical data until resolved.
- Rates: imported for simulation billing.
- `IN`, `OUT`, `Transactions`, `SOA Details`, `CBM Ledger`, and `Storage
  Ledger`: reference-only for the initial seed.
- End-customers remain linked to inventory where applicable, but no billing is
  created for end-customers.
- Migration strategy: import the minimum canonical seed required for simulation;
  retain the complete workbook and historical sheets as linked reference
  evidence rather than creating duplicate live transactions.

## Purpose

Provide a controlled, auditable way to seed WIMS from an organization's existing
Excel inventory workbook. The first implementation targets the supplied UBoT
VMI workbook through the `ubot-vmi-v1` adapter. The same migration contract may
later support other organizations and inventory models without changing the
canonical WIMS data model.

This is a one-time migration and simulation-seeding capability. It is not a
permanent synchronization process with the legacy Excel system.

## Scope

The migration SHALL support these initial data sets:

- organizations and party roles;
- items/materials and packaging measurements;
- physical locations and location capacity metadata;
- lots and opening lot/location balances;
- optional contracts and rates needed by the simulation; and
- source-workbook and reconciliation evidence retained for audit/reference.

Historical receiving, withdrawal, and billing activity MAY be retained as
reference data or imported as a separately approved historical migration. It is
not required for the initial simulation seed.

The migration SHALL prefer a current-state opening snapshot over a full
historical replay for the initial simulation. This prevents duplicate or
conflicting balances when the workbook contains both source movements and
derived inventory, storage, or billing ledgers.

## Requirements

### R1. Workbook upload and batch identity

1. An authorized administrator SHALL be able to upload an `.xlsx` workbook as
   a named migration batch.
2. The system SHALL retain the original source file, source filename, file
   hash, uploader, upload timestamp, organization, inventory model, and batch
   status.
3. A batch SHALL progress through `uploaded`, `staged`, `needs_review`,
   `approved`, `committed`, `rejected`, or `failed` states.
4. Re-uploading the same file hash for the same organization and migration
   profile SHALL not create a second committed batch without an explicit
   authorized override.

### R2. Adapter profiles

1. Each workbook format SHALL be interpreted by a named adapter profile.
2. The first profile SHALL be `ubot-vmi-v1` for the supplied workbook.
3. An adapter SHALL map source sheet names and source columns to canonical
   concepts without changing the canonical names `parties`, `items`,
   `locations`, `lots`, and inventory balances.
4. Adapter-specific aliases and transformations SHALL remain isolated from
   workflow and inventory business rules.

### R3. Initial UBoT workbook mapping

The `ubot-vmi-v1` profile SHALL define the following behavior:

| Source sheet | Treatment |
|---|---|
| `Customers` | Stage organizations and candidate party roles |
| `CODES` | Stage items/materials, categories, dimensions, packaging, and CBM |
| `Racking ID` / `RACKING` | Stage location identifiers and capacity metadata |
| `Location Matrix` | Stage opening lot/location quantities and box counts |
| `Inventory` | Reconciliation source for opening stock, not item enrollment or a second stock import |
| `Rates` | Optional contract/rate-card staging |
| `IN`, `OUT` | Reference or separately approved historical movement staging |
| `Transactions`, `SOA Details`, `CBM Ledger`, `Storage Ledger` | Reference/reconciliation evidence by default |

The adapter SHALL preserve item codes as text and SHALL not accept Excel
scientific-notation display as proof of the intended code without validation.

### R4. Staging and normalization

1. Source rows SHALL be staged before any canonical WIMS record is created.
2. Each staged value SHALL retain source workbook, sheet, row, column, and raw
   value metadata.
3. Normalization SHALL trim accidental whitespace, normalize dates and numeric
   values, preserve leading zeroes, and retain the original raw value.
4. The system SHALL resolve source names to canonical IDs only after master
   data validation.

### R5. Validation and review

The dry run SHALL identify, at minimum:

- missing required fields;
- duplicate organization, item, location, lot, or balance keys;
- unmatched party, item, lot, or location references;
- invalid item-code conversions;
- negative or non-numeric quantities;
- invalid dates;
- unsupported location types;
- opening balances without an owner party or inventory model;
- duplicate stock represented by multiple source sheets; and
- quantity, box, and CBM inconsistencies.

The system SHALL provide a review list with source row references and a clear
resolution state. Failed rows SHALL not be silently discarded or committed.

### R6. Opening inventory import

1. The batch SHALL require an explicit opening-balance date. The first UBoT
   batch uses `2026-10-09` unless a later reviewed workbook snapshot supersedes
   it.
2. Every committed opening balance SHALL identify an item, lot, location,
   owner party, inventory model, quantity, and source batch.
3. Opening balances SHALL create the canonical lot/location state and the
   corresponding auditable opening transaction or migration event according to
   the approved core-data contract.
4. The migration SHALL not create receiving, withdrawal, inspection, or
   acknowledgement documents that do not exist in the source evidence.
5. Unresolved ownership, lot, location, or quantity issues SHALL block commit or
   be explicitly approved as migration exceptions by an authorized user.

Historical sheets SHALL remain linked to the migration batch as reference
evidence unless a separate historical-import mode is approved. A historical
import SHALL define its own source authority and SHALL reconcile to the opening
snapshot before creating live WIMS transactions.

### R7. Reconciliation

Before commit, the system SHALL produce a reconciliation report containing:

- source row count and staged row count;
- organization, item, location, lot, and balance counts;
- quantity totals by item, lot, and location;
- box and CBM totals where available;
- differences between the opening-stock source and its designated check sheet;
- rejected, unresolved, and approved exception counts; and
- the final committed totals.

The administrator SHALL approve the report before the batch can be committed.

### R8. Simulation behavior after seed

After the opening batch is committed, simulated receiving, transfers,
inspections, withdrawals, pick lists, acknowledgement receipts, and billing
events SHALL be created through normal WIMS workflows. The legacy workbook SHALL
not be treated as an active synchronization source.

### R9. Audit and safety

1. The original workbook and migration reports SHALL remain linked to the batch.
2. Every commit, rejection, exception resolution, and override SHALL record the
   acting user and timestamp.
3. A failed or rejected batch SHALL not partially change canonical inventory.
4. The migration SHALL use existing capability and audit conventions; it SHALL
   not introduce a parallel inventory ledger or a `warehouse_id`.

## Out of scope

- continuous legacy-system synchronization;
- importing every historical movement by default;
- reconstructing missing carton identities from aggregate counts;
- importing derived Excel billing ledgers as authoritative WIMS balances;
- automatic invention of missing owners, lots, locations, dates, or prices; and
- changing the approved receiving, withdrawal, inspection, or billing workflow.

## Acceptance criteria

- The supplied workbook can be dry-run through `ubot-vmi-v1` without changing
  canonical data.
- Review output identifies all blocking mapping and data-quality errors with
  source row references.
- An approved seed creates matching parties, items, locations, lots, and
  opening balances without duplicate stock.
- The reconciliation report can demonstrate whether WIMS matches the workbook
  opening snapshot.
- Replaying the same committed batch is idempotently rejected or recognized.
- Subsequent simulation activity is created through normal WIMS workflows.

## Sign-off

- Technical Lead: User / System, 2026-10-17
- Product/Operations Lead: User / System, 2026-10-17
