# One-Time Data Migration and Simulation Seeding - Design

Status: Approved

## Confirmed Initial Profile Decisions

The first simulation seed is for UBoT Incorporated Limited under the VMI
inventory model. The opening-balance date is `2026-10-09`, the latest date in
the supplied workbook. `Location Matrix` is the authoritative opening-stock
source. `Inventory` is a reconciliation report only and does not enroll items;
item enrollment comes from `CODES`. `RCV` is modeled as a temporary
receiving/holding location. Unmatched records remain in review until resolved.
`Rates` is included for billing simulation. Historical movement and billing
ledgers remain reference evidence for the initial seed.

The initial seed is intentionally a current-state migration, not a historical
replay. The full workbook remains attached to the batch for traceability, while
only the canonical master data, opening balances, and approved rates become
live simulation data.

## Dependencies

Depends on `01-core-data-model` for `parties`, `party_roles`, `items`,
`locations`, `lots`, `lot_location_balances`, and `inventory_transactions`;
`02-rbac-roles` for administrator authorization and capability vocabulary;
`04-services-and-infrastructure` for upload storage, server actions, audit, and
transaction boundaries; `06-party-and-item-enrollment` for master-data rules;
`07-incoming-receiving` and `08-outgoing-withdrawal-and-two-stage-commitment`
for the meaning of receiving and withdrawal records; and `12-vmi-billing` and
`13-trading-orders-and-pricing` only when optional rates/contracts are seeded.

The migration does not redefine any dependent table. It writes through the
approved canonical ownership and inventory boundaries after review and commit.

## Architecture

```text
source workbook
    -> migration batch + immutable source file
    -> adapter discovery and raw staging
    -> normalized staging rows
    -> validation and match/review queue
    -> reconciliation report
    -> administrator approval
    -> one database transaction per committed import phase
    -> canonical WIMS records + migration audit events
```

The source file and staging records are evidence. Canonical WIMS tables remain
the operational source of truth after commit.

## Adapter contract

An adapter profile contains:

- profile key and version;
- supported file type and workbook signature;
- sheet selectors;
- header-row selectors;
- source-to-canonical column mappings;
- normalization functions;
- reference matching rules;
- required-field rules; and
- reconciliation formulas and designated comparison sheets.

`ubot-vmi-v1` is the first profile. Its opening inventory authority is
`Location Matrix`; `Inventory` is a check source and `CODES` is the item
enrollment source. If a later workbook uses
different names, a new profile or profile version is added without changing the
canonical import commands.

## Staging model

The design requires migration-owned staging records for:

- `migration_batches` - organization, inventory model, profile, source-file
  metadata, status, opening date, and approval/commit references;
- `migration_source_files` - immutable stored source files and hashes;
- `migration_source_rows` - sheet, row, raw values, normalized values, and
  validation results;
- `migration_matches` - source values matched to canonical party, item,
  location, lot, or rate records; and
- `migration_exceptions` - blocking and non-blocking issues with resolution,
  actor, and timestamp.

Exact columns, foreign keys, RLS, retention, and migration numbering require
verification against `01`, `02`, and `04` during the approval pass. Staging is
not an alternate inventory ledger and must never be queried as available stock.

## Processing phases

### 1. Discover

Read workbook metadata, identify the adapter profile, list sheets, locate header
rows, and report unsupported or missing sheets. Discovery is read-only.

### 2. Stage

Store source rows with their raw values and source coordinates. Normalize dates,
numeric values, whitespace, and item codes while preserving raw values for audit.

### 3. Match and validate

Resolve references in dependency order: parties, items, locations, lots, then
opening balances. Matching by display name alone is insufficient when an
authorized canonical code or explicit mapping is available. Ambiguous matches
remain unresolved.

### 4. Reconcile

Compare the designated opening source to the workbook's check sheets. For the
UBoT workbook, `Location Matrix` is the stock input and `Inventory` is the
comparison. Derived ledgers are evidence only and do not override source
balances.

### 5. Approve and commit

An administrator approves the complete report and exceptions. The commit writes
master data first, then lots and opening balances, with idempotency keyed by
batch and source identity. A failure rolls back the canonical phase; the source
batch remains available for diagnosis.

## Canonical import order

1. Parties and party roles
2. Items and item classifications
3. Locations and capacity metadata
4. Lots and opening lot/location balances
5. Optional contracts and rates
6. Reference-only historical evidence

Historical `IN` and `OUT` data must not be used to create duplicate opening
stock. If historical movement import is later approved, it requires a separate
mode, source authority, and reconciliation plan.

The initial implementation SHALL not create live receiving, withdrawal, or
billing transaction rows from historical sheets. Those sheets are retained as
reference evidence and may be viewed or exported with the migration batch.

## Opening balance rules

Opening balances represent the state at one explicit date; they are not
pretended receiving documents. The implementation must use the core model's
approved transaction/event convention so that stock totals, location balances,
and audit history agree. Existing carton-level traceability rules remain in
force: aggregate Excel box counts do not create fabricated individual carton
identities. The initial UBoT date is `2026-10-09`. `RCV` balances are held as
temporary receiving/holding stock according to the approved location semantics,
not silently treated as ordinary storage.

## Security and operations

Only the approved administrator capability may upload, approve, commit, or
override a migration. Read access to source files and financial/rate data follows
existing party and reporting rules. Import commands must re-check authorization
server-side and must not rely on a client-only review screen.

## Testing strategy

- Unit tests for workbook discovery, header mapping, normalization, date and
  item-code preservation, duplicate detection, and reconciliation formulas.
- Fixture tests using the supplied workbook and a deliberately malformed copy.
- Real-Postgres tests for staging constraints, idempotency, rollback, canonical
  inserts, and inventory-total reconciliation.
- Authorization tests for upload, review, approval, commit, and override.
- Playwright coverage for dry-run preview, error review, approval, commit, and
  post-seed inventory verification.

## Sign-off

- Technical Lead: User / System, 2026-10-17
- Product/Operations Lead: User / System, 2026-10-17
