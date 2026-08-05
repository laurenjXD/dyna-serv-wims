# Incoming Receiving — Design

Status: Draft
Updated: 2026-08-05

## 1. Design intent

Incoming Receiving is a two-surface workflow:

1. An office-oriented pre-receiving surface encodes and prints a WRR from an external CIPL/packing-list reference.
2. A floor-oriented receiving surface reconciles physical carton scans and inbound inspection results, then submits one authoritative receipt commit.

The design preserves the boundary between expectation and inventory: `wrr_documents`/`wrr_items` describe expected inbound goods; active lots and `inventory_transactions` are created only by the authorized commit transaction. The commit creates one of two inbound posting paths — `store` (available at putaway) or `inspect` (quarantined at inspection location) — based on the per-line disposition field set before confirmation.

## 2. Foundational dependencies and core tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `brand-design-system.md`, and `revision-log.md`.
- `01-core-data-model` for the canonical inbound schema and immutable ledger design.
- `02-rbac-roles` for capabilities, party/flow scope, RLS, and current-request authorization.
- `03-offline-mode-and-client-storage` for the limited Tier 1 scan queue and replay rules.
- `04-services-and-infrastructure` for Supabase Auth, private Storage, server transactions, Realtime, email, monitoring, and migration boundaries.
- `05-ui-shell-and-navigation` for authenticated route/layout, floor/office surfaces, page headers, and shared status/error regions.
- `06-party-and-item-enrollment` for online unknown-item resolution.
- `11-transfer-and-inspection` as the shared inspection handler for quarantined-lot resolution and evidence after the commit emits an inspection case event.

### Tables touched by this feature

| Table | Use | Boundary |
| --- | --- | --- |
| `parties` | Resolve source party and authorized party/flow context. | Master data owned by `06`; receiving does not edit parties. |
| `items` | Resolve barcode/item identity and read packaging/UOM/volume/perishability data. | Master data owned by `06`; unknown items follow its enrollment path. |
| `locations` | Resolve `receiving_bay`, `inspection` (for quarantined inbound stock), and putaway recommendations/confirmation. | Location master/physical configuration is owned by the appropriate core/location feature. |
| `lots` | Create the approved inbound lot during receipt commit. Status is `available` for `store` disposition or `quarantined` for `inspect` disposition. | Core/inventory transaction boundary owns invariant enforcement. |
| `lot_location_balances` | Created at commit for each confirmed line: putaway location row for `store`, inspection location row for `inspect`. These rows are the authoritative source for `lot_inventory_totals`. | Core schema owns fields and constraints; receiving inserts via the commit transaction. |
| `wrr_documents` | Store staged WRR header and lifecycle. | Core schema owns fields/status constraints; receiving owns workflow commands. |
| `wrr_items` | Store expected lines, scan reconciliation state, and per-line disposition. | Core schema owns fields; receiving owns matching behavior. The `disposition` field (`store`/`inspect`) is a new field to be added to `01` via schema amendment. |
| `wrr_inspection_logs` | Store inbound physical conformance/non-conformance observations during arrival. Distinct from post-commit quarantine resolution owned by `11`. | Retained by approved core schema; receiving owns the write path during the scan/conformance phase. |
| `inventory_transactions` | Insert immutable receiving movements through server transactions. Both `store` and `inspect` dispositions insert a `movement_type = 'receiving'` record at commit. | No updates/deletes; inventory transaction boundary is authoritative. |

Receipt confirmation creates `lots` plus one `lot_location_balances` row per committed line. This design does not invent `stock_levels` or another duplicate ledger table.

## 3. Route and shell integration

Provisional App Router surfaces:

```text
app/(authenticated)/
  receiving/
    page.tsx                         # WRR list / receiving work queue
    new/page.tsx                     # office pre-receiving form
    [wrrId]/page.tsx                 # WRR detail/review
    [wrrId]/print/page.tsx           # printable WRR
    [wrrId]/receive/page.tsx         # floor scan/reconciliation flow
    [wrrId]/inspection/page.tsx      # inbound inspection/conformance
  incoming-ledger/page.tsx          # office/review read-only transaction view
```

Route names and capability references remain provisional until `05`, `02`, and the feature route inventory are approved.

- Office routes use the shared office shell and page-header/list/form contracts.
- The floor receive route opts into the floor surface: 16px padding, solid surfaces, scanner-ready input, no dense table, no persistent sidebar during active scanning, and one primary action.
- The print route uses the brand system as the source of truth for generated documents and is not a second editable WRR form.
- Feature content owns scan feedback, remaining-quantity cards, inspection choices, disposition display, and receipt confirmation. The shell owns global session/navigation/status boundaries.

## 4. State model and command boundaries

```text
Create WRR → staged_pending_arrival
                  │ print/review
                  ▼
          start receiving command
                  ▼
         receiving_in_progress
          ├── scan/reconcile
          ├── inspect/conformance (wrr_inspection_logs)
          └── exception resolution
                  │ all required checks pass
                  ▼
        confirm receipt command
                  ▼
               confirmed
          ├── store lines → lots (available) + lot_location_balances (putaway)
          ├── inspect lines → lots (quarantined) + lot_location_balances (inspection)
          ├── inventory_transactions (receiving) for all lines
          └── putaway recommendation/handoff
```

Every mutation is a server action/route-handler command with this sequence:

```text
session → capability/scope → input/schema → current WRR state
       → domain checks → idempotency key → database transaction
       → safe result + revalidation
```

No client command directly updates `lots`, `lot_location_balances`, or `inventory_transactions`. The confirmation command owns one database transaction that checks all prerequisites, writes the resulting domain records, and records the immutable ledger outcome. If the transaction fails, the WRR remains in a safe prior state.

## 5. Pre-receiving WRR design

The office form captures the approved CIPL/packing-list reference and structured expected lines. The CIPL file is an external reference; it is stored privately and is not machine-parsed in v1. Structured CIPL parsing is not in scope.

### 5.1 Expected line fields

All fields confirmed from the approved `01-core-data-model` schema, plus the `disposition` field to be added via `01` amendment:

| Field | Column | Notes |
| --- | --- | --- |
| Resolved item | `wrr_items.item_id` | Nullable until enrollment; required for commit. |
| Supplier part number | `wrr_items.item_code` | From CIPL. |
| Customer part number | `wrr_items.customer_item_code` | From CIPL. |
| Lot number | `wrr_items.lot_number` | **Single canonical business lot identifier.** `NOT NULL`. Copied verbatim to `lots.lot_number` at commit. There is no vendor lot number field; this is the only lot identifier on the line. |
| Expected quantity | `wrr_items.expected_qty` | Expected carton/unit count. |
| Scanned quantity | `wrr_items.scanned_qty` | Running scan total; updated by scan commands, default 0. |
| Unit CBM | `wrr_items.unit_cbm` | Per-carton CBM for putaway calculations. |
| UOM | `wrr_items.uom` | Unit of measure. |
| Disposition | `wrr_items.disposition` | `store` or `inspect`. Determines lot status and posting location at commit. To be added to `01` via schema amendment. |

### 5.2 Scan-line state and discrepancy

Each `wrr_items` row tracks `scanned_qty` against `expected_qty`. Discrepancy states:

| State | Condition | Confirmable? |
| --- | --- | --- |
| Matched | `scanned_qty = expected_qty` | Yes |
| Under-scanned | `scanned_qty < expected_qty` | No — resolve by scanning more or approving a shortage discrepancy |
| Over-scanned | `scanned_qty > expected_qty` | Rejected at scan time; not silently accepted |
| Exception/unresolved | Rejected scan, unknown item, or pending inspection decision | No |

`wrr_inspection_logs` records physical conformance observations per line during the scan phase. Its `action_taken` field (`'accepted_with_variance'`, `'quarantined'`, `'returned_to_vendor'`) captures the immediate physical resolution outcome. This is distinct from the `disposition` field, which is set before confirmation and determines where the committed lot is posted.

### 5.3 WRR printed fields

The generated WRR document SHALL include the following fields:

**Header section:**

- WRR number rendered as a scannable barcode (e.g. `WRR-2026-00001`)
- Date of document generation
- CIPL/commercial invoice reference number
- Source party (vendor) name and code
- Flow type (`vmi` / `trading` / `supplies`)
- PEZA permit number and import permit (IP) number where applicable

**Per-line section (one row per `wrr_items` record):**

- Item code (Dyna-Serv item code)
- Item name/description
- Lot number
- Expected quantity and UOM
- Unit CBM
- Disposition (`STORE` or `INSPECT`)
- Scanned quantity column (blank at print time; completed on the floor)

**Footer section:**

- Received by — signature line
- Checked by — signature line
- Supervisor — signature line
- Warehouse stamp area

### 5.4 Print and reprint behavior

Printing is generated from the staged server record and does not create a receipt outcome. Any user with the `receiving.view` capability MAY reprint a WRR at any lifecycle status. A reprint SHALL be visibly watermarked "REPRINT" with the reprint timestamp and the identity of the reprinting user. Reprinting does not change WRR status, does not create inventory, and does not alter the scan baseline.

The form supports draft validation before save, server uniqueness/relationship checks, and an explicit transition to staged status. Editing is allowed while staged; once receiving starts, the scan baseline is immutable or changes through a visible versioned correction flow.

## 6. Floor scan and reconciliation design

The scan screen is a card/list workflow, not a dense table. It shows one current line/next action, total expected, scanned, remaining, and a clear exception state. Scanner input is treated as keyboard-like input per `testing.md`; the feature may provide a manual recovery input with the same validation path.

The matcher resolves:

```text
scanned barcode → active item identity → current WRR line(s)
                  → expected quantity/UOM/lot context
```

It rejects wrong WRR, wrong item, unknown item, duplicate/over quantity, invalid UOM, and unresolved lot context. A rejected scan does not increment the accepted line count.

If the item is unknown, the screen routes to the online `06` enrollment flow or records an exception. After enrollment, the scan is repeated and revalidated; the original rejected event is not retroactively accepted.

The disposition value for each line is visible on the floor scan screen. A floor supervisor with appropriate capability may change a line's disposition from `store` to `inspect` (or vice versa) before triggering confirmation.

## 7. Inbound receiving disposition

The disposition model determines the lot status and inventory posting location created for each line at confirmation time. It is a required field on the WRR line, set before confirmation and enforced atomically by the commit transaction.

### 7.1 Disposition decision

The disposition value (`store` or `inspect`) is set on each `wrr_items` line. The default is `store`. The system enforces `inspect` automatically when:

- the item's `is_perishable` flag or an explicit inspection-required item flag is active;
- the `flow_type` or vendor party configuration mandates inspection;
- a supervisor explicitly overrides the disposition to `inspect` before confirmation.

The back-office user sets the initial disposition in the pre-receiving form. The floor supervisor may change it before triggering the confirmation command.

### 7.2 Store path (`disposition = 'store'`)

```text
scan confirmed + disposition = store
        │
        ▼
commit transaction:
  lots created:
    lot_number  = wrr_items.lot_number   (single canonical identifier)
    wrr_item_id = wrr_items.id
    status      = 'available'
        │
        ▼
  lot_location_balances at putaway location:
    qty_received  = confirmed_qty
    qty_remaining = confirmed_qty
    qty_committed = 0
        │
        ▼
  inventory_transactions:
    movement_type  = 'receiving'
    to_location_id = putaway location
        │
        ▼
lot immediately eligible for FIFO/FEFO allocation
```

### 7.3 Inspect path (`disposition = 'inspect'`)

```text
scan confirmed + disposition = inspect
        │
        ▼
commit transaction:
  lots created:
    lot_number  = wrr_items.lot_number   (single canonical identifier)
    wrr_item_id = wrr_items.id
    status      = 'quarantined'
        │
        ▼
  lot_location_balances at inspection location:
    qty_received  = confirmed_qty
    qty_remaining = confirmed_qty
    qty_committed = 0
    qty_available (derived) = 0   ← NOT allocatable
        │
        ▼
  inventory_transactions:
    movement_type  = 'receiving'
    to_location_id = inspection location
        │
        ▼
inspection case event emitted → 11-transfer-and-inspection owns resolution
```

The `inspection` location is a distinct enrolled `locations` record with `location_type = 'inspection'`. Multiple quarantined lots coexist at this location; each has its own `lot_location_balances` row (the `unique(lot_id, location_id)` constraint ensures one row per lot-location pair).

### 7.4 Quarantined lot: state while awaiting inspection

While a lot is in `quarantined` status at the inspection location:

- `lot_location_balances.qty_remaining` holds the physical quantity.
- `lot_location_balances.qty_committed = 0`; derived `qty_available = qty_remaining - qty_committed = 0`.
- The lot is excluded from all FIFO/FEFO allocation queries. The eligibility gate is `lots.status = 'available'` (see `01-core-data-model` §3, workflow 3); a quarantined lot never satisfies this gate.
- The lot appears in inspection queues and inventory reporting but is clearly marked non-available.
- No pick-list or commitment may be created against this lot until `11` transitions it to `available`.

### 7.5 Resolution paths (owned by `11-transfer-and-inspection`)

All post-quarantine state transitions are owned by `11`. The `07` commit emits the inspection case event; it does not implement or duplicate resolution logic.

| Inspection result | Action | Resulting lot state |
| --- | --- | --- |
| Pass | `lots.status` → `available`; `lot_location_balances` updated or transferred to putaway location; `inventory_transactions` with `movement_type = 'transfer'` from inspection to putaway. | `available` at putaway location |
| Fail — return to party | Return-to-party process; `lots.status` → `depleted`; inventory transaction records the return quantity. | `depleted` |
| Fail — hold | Lot remains `quarantined`; held pending further review or escalation. | `quarantined` (held) |
| Fail — write-off | Write-off process; `lots.status` → `depleted`; inventory transaction records the write-off quantity. | `depleted` |

**State diagram:**

```text
             quarantined
                  │
      ┌───────────┼────────────────────┐
      ▼           ▼                    ▼
[inspection    [fail: hold]     [fail: return /
    pass]                         write-off]
      │           │                    │
      ▼           ▼                    ▼
  available   quarantined           depleted
  (transferred  (held, pending     (returned to
  to putaway)    review)            party or
                                   written off)
```

## 8. Inbound inspection design

Inbound physical inspection is recorded during the `receiving_in_progress` phase, before confirmation. It captures conformance/non-conformance for physical issues found at arrival (wrong items, damaged cartons, quantity mismatches, paperwork failures).

This is distinct from the post-commit quarantine resolution described in §7.5:

- `wrr_inspection_logs` records the physical conformance observation during receiving.
- The `disposition` field determines where the committed lot is posted at confirmation time.
- Post-commit inspection of a quarantined lot is owned by `11`.

Inspection observations during receiving:

- Conformance allows the related line to proceed to confirmation.
- Non-conformance (`actionTaken = 'quarantined'`) indicates the goods need post-commit inspection; the line should carry `disposition = 'inspect'`.
- Non-conformance (`actionTaken = 'returned_to_vendor'`) means the goods are rejected outright and SHALL NOT be committed as inventory.
- Non-conformance (`actionTaken = 'accepted_with_variance'`) allows commit with noted variance; disposition may be `store` or `inspect` depending on the nature of the variance.

Evidence uses private Supabase Storage and inherits WRR/party scope. Automated email alerts, if required, are emitted from the committed server/domain event through `04` and do not determine whether inventory was posted.

`11-transfer-and-inspection` may later define transfer-specific inspection state; it must not reuse inbound WRR conformance statuses or silently change receiving commit rules.

## 9. Receipt commit and idempotency

The commit command receives a WRR ID, expected current status, client correlation ID, and idempotency key. It loads authoritative WRR lines/scans, active item/party data, conformance decisions, per-line dispositions, flow type, required lot metadata, and any approved location/capacity prerequisites.

Within one transaction it:

1. locks or otherwise protects the WRR from concurrent confirmation;
2. verifies all required quantities, conformance decisions, and disposition values are present and valid;
3. for each confirmed line, applies the disposition path:
   - **`store` disposition**: creates the lot with `status = 'available'`, `lot_number` copied from `wrr_items.lot_number` (the single canonical identifier), and `wrr_item_id` set; creates `lot_location_balances` at the designated putaway location with full confirmed quantity as `qty_received` and `qty_remaining`.
   - **`inspect` disposition**: creates the lot with `status = 'quarantined'`, `lot_number` copied from `wrr_items.lot_number`, and `wrr_item_id` set; creates `lot_location_balances` at the `inspection` location with full confirmed quantity as `qty_received` and `qty_remaining`; emits an inspection case event for `11`.
4. inserts immutable `inventory_transactions` with `movement_type = 'receiving'` for every committed line, regardless of disposition; `to_location_id` is the putaway location for `store` and the inspection location for `inspect`;
5. updates WRR status to `confirmed`;
6. records audit/correlation data according to the approved cross-cutting design.

The `lot_location_balances` rows created by the commit are the authoritative source for `lot_inventory_totals`. No other balance ledger or aggregate table is created or maintained by this feature.

The idempotency mechanism returns the original authoritative result for a duplicate key. It never treats a client-local "confirmed" state as proof of commit. Failed commits roll back completely; the WRR remains in `receiving_in_progress` and the result is a safe recoverable error.

## 10. Putaway and incoming ledger

Receiving consumes the approved location/capacity suggestion interface. It may display remaining CBM and candidate `locations`, but it does not create a second capacity calculation or own location enrollment. Putaway recommendations apply only to lots committed with `store` disposition; quarantined lots at the `inspection` location are handed off to `11` for resolution before any putaway recommendation applies.

The Incoming Ledger is a server-side query/view over `inventory_transactions` filtered by `movement_type` `receiving` and `putaway`, joined through approved relationships for WRR, item, lot, party, user, and location display. It is read-only and scope-filtered. Historical corrections are new domain transactions, never ledger edits.

## 11. Offline, realtime, and infrastructure boundaries

- Only scan/reconciliation capture may be proposed for Tier 1 offline support, and each operation needs an explicit policy from this spec plus `03`.
- WRR creation/edit, CIPL upload, unknown item enrollment, inspection resolution, receipt confirmation, and putaway confirmation are Tier 2/online-only in v1. This is the complete list — no other receiving mutations are candidates for Tier 1 offline.
- On replay, the server re-authenticates and rechecks WRR status, current capability/scope, item/party state, quantity, disposition values, and idempotency. Offline data cannot create inventory directly.
- Realtime may invalidate a WRR list/attention state; authoritative refetch is required.
- CIPL/evidence files use private Storage and signed/session-authorized access.
- Sentry/monitoring receives redacted correlation/error data only.

## 12. Design verification before approval

- [x] Reconcile WRR status, line, inspection, lot, and ledger columns with approved `01-core-data-model`; confirmed from approved schema — all field names, types, and relationships verified. The `disposition` field on `wrr_items` is the only net-new field identified; a `01` schema amendment is required before implementation.
- [x] Confirm whether `wrr_inspection_logs` is retained as the inbound inspection record and define its final resolution fields — confirmed retained; `conformance_status`, `non_conformance_reason`, `remarks`, `evidence_photo_url`, and `action_taken` are confirmed from the approved schema.
- [ ] Confirm receipt commit and RLS policy matrix with `02-rbac-roles`.
- [ ] Confirm the exact Tier 1 scan command and rejection behavior with `03-offline-mode-and-client-storage`.
- [ ] Confirm Auth, Storage, email, idempotency, and server transaction boundaries with `04-services-and-infrastructure`.
- [ ] Confirm floor/office routes and feedback contracts with `05-ui-shell-and-navigation`.
- [ ] Confirm unknown item recovery with `06-party-and-item-enrollment`.
- [ ] Confirm inspection case event contract and resolution state transitions with `11-transfer-and-inspection`.
- [ ] Have `offline-sync-reviewer`, `rbac-rls-reviewer`, and `design-system-auditor` review before approval.
