# Transfer & Inspection — Design

Status: Approved
Updated: 2026-08-05

## 1. Design intent

This feature is a single-warehouse internal movement workflow. It turns an authorized transfer request into a validated physical movement between `locations`, optionally requiring transfer-specific inspection, and records one immutable `inventory_transaction` with `movement_type = 'transfer'`.

The design intentionally separates three concerns:

- inbound WRR/conformance in `07`;
- transfer approval decisions in `09`;
- transfer business mutation and inspection in this feature.

`11` additionally owns the shared inspection capability used across three operational contexts:

- **Inbound inspection** — context linkage owned by `07`; `11` provides `inspection_cases`, `inspection_evidence`, and `inspection_dispositions` as the shared record structure that `07` populates with a `wrr_item` source reference.
- **Outbound further inspection** — context linkage owned by `08`; `11` provides the shared record structure that `08` populates with a `pick_list_item` source reference while keeping the outbound commitment active until pass/fail resolution.
- **Routine transfer inspection** — owned entirely by `11`; the shared record structure is populated with a `transfer_line` source reference.

No context reuses another's status enums or creates incompatible inventory transitions.

## 2. Foundational dependencies and tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `brand-design-system.md`, `revision-log.md`.
- `01-core-data-model` for canonical locations/lots/transactions and the single-warehouse rule.
- `02-rbac-roles` for capability/scope/RLS/audit.
- `03-offline-mode-and-client-storage` for Tier 1 physical-observation replay.
- `04-services-and-infrastructure` for Auth, Storage, server transactions/idempotency, Realtime, jobs, notifications, and monitoring.
- `05-ui-shell-and-navigation` for office/floor shell contracts.
- `09-approval-queue` for exact transfer approval decisions.

### Core tables read or mutated

| Table | Use | Boundary |
| --- | --- | --- |
| `parties` | Resolve party/flow context where the lot or request is party-scoped. | Master data owned by `06`; scope enforced by RBAC/RLS. |
| `items` | Resolve item/barcode/UOM/packaging identity. | Master data owned by `06`. |
| `locations` | Validate source/destination, type, active state, and capacity. | Location master owns definitions; transfer owns use. |
| `lots` | Validate item/flow/status and lot identity through commit. | Inventory core owns lifecycle invariants. |
| `lot_location_balances` | Validate source/destination quantities and update the authoritative placement rows. | Inventory core owns quantity/concurrency invariants. |
| `inventory_transactions` | Insert immutable `transfer` movement with from/to location references. | No updates/deletes. |

### Transfer-owned persistence

These tables replace the earlier placeholder schema. `transfer_requests` and `transfer_lines` are the operational transfer records. `inspection_cases`, `inspection_evidence`, and `inspection_dispositions` are the shared inspection records used by `07`, `08`, and `11`.

#### Transfer records

```text
transfer_requests
  id, from_location_id, to_location_id, flow_type,
  status (staged | in_progress | completed | cancelled),
  reference, reason, requires_approval, approval_request_id,
  version, requested_by, created_at, updated_at, correlation_id

transfer_lines
  id, transfer_request_id, lot_id, item_id,
  qty_requested, qty_transferred,
  status (pending | in_transit | completed | cancelled),
  inspection_case_id   -- nullable; set when this line enters transfer inspection
```

`transfer_lines.inspection_case_id` references `inspection_cases.id`. It is null until transfer inspection is triggered for this line.

#### Shared inspection records

```text
inspection_cases
  id,
  context_type      (inbound | outbound | transfer),
  source_ref_type   (wrr_item | pick_list_item | transfer_line),
  source_ref_id     UUID -- points to wrr_items.id, pick_list_items.id, or transfer_lines.id
                         -- validated at application layer; no cross-table DB FK
  lot_id, item_id, party_id, flow_type,
  status            (open | passed | failed | cancelled),
  opened_by, opened_at, resolved_by, resolved_at

inspection_evidence
  id, inspection_case_id,
  evidence_type     (photo | note | measurement),
  payload,          -- Storage object URL for photo; free text for note; structured JSON for measurement
  captured_by, captured_at

inspection_dispositions
  id, inspection_case_id,
  disposition_type  (store | quarantine | return_to_party | hold | write_off
                     | dispatch | replace | return_to_shelf | return_to_origin),
  quantity_affected, lot_location_balance_id, notes, applied_by, applied_at
```

`source_ref_id` uses a polymorphic reference pattern validated at the application layer. Each context is responsible for populating the correct `source_ref_type`/`source_ref_id` pair; the database does not enforce a cross-table FK across the three possible targets.

`inspection_dispositions.lot_location_balance_id` is a direct FK to `lot_location_balances.id` and is populated for dispositions that affect a specific balance row. It may be null for dispositions with no immediate balance effect (e.g. `hold`).

Table names and column names in this section are provisional and must be reconciled with `01-core-data-model` and migration ownership before final approval.

## 3. Route and shell integration

Provisional App Router shape:

```text
app/(authenticated)/
  transfers/
    page.tsx                      # request/review list
    new/page.tsx                  # office request form
    [transferId]/page.tsx         # detail/history
    [transferId]/inspect/page.tsx # transfer inspection
    [transferId]/execute/page.tsx # floor source/destination scan
```

Office routes use the shared shell/page-header/list/detail patterns from `05`. Execution and inspection opt into floor mode at 375–430px: solid surfaces, 16px padding, scanner-first input, card/list content, one current task, 64px primary action, and no persistent desktop sidebar during active scanning.

The queue/approval UI itself belongs to `09`; this feature links to its request/status and never duplicates reviewer decisions.

## 4. Transfer state and command boundaries

```text
draft
  → pending_approval → approved → ready_for_execution
                              → executing → inspection_pending
                                             → passed → completed
                                             → failed → exception
  → rejected/cancelled/expired
```

The exact transitions are policy-driven, but each command follows:

```text
Auth session
  → capability + party/flow scope
  → request/schema validation
  → current source/destination/lot state
  → approval/inspection policy
  → idempotency + version check
  → authoritative transaction
```

No client status update or notification marks a transfer completed. The final command owns the database transaction and returns the authoritative result.

## 5. Request and approval design

The request records the intended movement and a versioned target snapshot. It does not reserve/decrement inventory merely by existing. If approval is required, the feature submits a `transfer` approval policy request to `09` containing exact source/destination/item/lot/quantity/reason/version context.

At execution, the feature consumes the approval only after rechecking that the current transfer target is identical and still valid. A decision for one location, lot, quantity, flow, or version cannot authorize another.

The final approval capability names are owned by `02`; this design uses resource/action vocabulary only and does not check role names.

## 6. Inspection design

### 6.1 Three inspection contexts

All three contexts use the same `inspection_cases`, `inspection_evidence`, and `inspection_dispositions` tables. They differ only in their `context_type`, `source_ref_type`, and the inventory transitions that a disposition triggers.

**Inbound inspection (context owned by `07`)**

- Created when a `wrr_item` fails conformance or is routed to the inspection location.
- `context_type = 'inbound'`, `source_ref_type = 'wrr_item'`.
- `07` owns the WRR status linkage and the decision to route quantity to the inspection location.
- Available dispositions: `store` (pass — creates lot and balance), `quarantine`, `return_to_party`, `hold`, `write_off`.
- Balance effect on pass (`store`): `lots` row created with `status = 'available'`; `lot_location_balances` row created/incremented; `inventory_transaction` with `movement_type = 'receiving'` inserted.
- Balance effect on fail: see §6.3 disposition table.
- `11` provides the shared record model. `07` owns the WRR/CIPL linkage and does not route through transfer inspection. The shared `inspection_cases` table supplements but does not replace `wrr_inspection_logs`.

**Outbound further inspection (context owned by `08`)**

- Created when a picked `pick_list_item` is routed to further inspection instead of dispatch.
- `context_type = 'outbound'`, `source_ref_type = 'pick_list_item'`.
- `08` owns the commitment linkage (`inventory_commitment_lines`) and keeps the commitment `status = 'inspection_pending'` until resolution.
- The lot does **not** change location during outbound further inspection — physical movement is not a transfer.
- Available dispositions: `dispatch` (pass — completes commitment execution), `replace` (fail — new pick), `return_to_shelf` (fail — commitment released).
- Balance effect on pass (`dispatch`): commitment executed normally; `qty_committed` released and `qty_remaining` decremented; `inventory_transaction` with `movement_type = 'pick'` inserted.
- Balance effect on fail: see §6.3 disposition table.
- `11` provides the shared record model. `08` owns the commitment lifecycle. No transfer line is created for an outbound inspection case.

**Routine transfer inspection (context owned by `11`)**

- Created when a `transfer_line` is flagged for inspection during an internal location movement.
- `context_type = 'transfer'`, `source_ref_type = 'transfer_line'`.
- The lot may be physically present at an intermediate inspection location or still at the source location, depending on the approved transfer policy for when physical movement precedes the inspection pass.
- Available dispositions: `store` (pass — destination balance updated), `return_to_origin` (fail — source balance restored), `hold` (fail — lot quarantined at current location).
- Balance effect: see §6.3 disposition table.

### 6.2 Context isolation invariants

- An inbound inspection case never writes or modifies `wrr_inspection_logs` except through the `07`-owned conformance path; the shared `inspection_cases` table is additive and does not replace `wrr_inspection_logs`.
- An outbound inspection case never advances the transfer lifecycle and never moves the lot's `lot_location_balances` row to a new location.
- A transfer inspection case never modifies `inventory_commitments` or `inventory_commitment_lines` and is not a substitute for outbound inspection.
- `inspection_cases.status` uses a single four-value enum (`open | passed | failed | cancelled`) shared across all contexts. Context-specific intermediate states (e.g. `inspection_pending` for outbound commitments) remain in the owning feature's tables, not in `inspection_cases`.

### 6.3 Failed inspection disposition table

| Context | Failure disposition | `disposition_type` | Balance effect |
| --- | --- | --- | --- |
| Inbound | Return to party: lot held at inspection location, party notified, WRR line flagged | `return_to_party` | `qty_remaining` decremented when physically returned; lot transitions to `quarantined` or `depleted` |
| Inbound | Hold: lot remains at inspection location in quarantined state | `hold` | No balance change until explicit resolution |
| Inbound | Write off: lot written off | `write_off` | `qty_remaining` → 0; `inventory_transaction` with `movement_type = 'inventory_reconciliation'` inserted |
| Outbound | Replace: commitment cancelled, new pick from available stock | `replace` | `qty_committed` released; new pick-list generated by `08` |
| Outbound | Return to shelf: commitment cancelled, lot returns to available | `return_to_shelf` | `qty_committed` released; lot status unchanged; stock available for future allocation |
| Transfer | Return to origin: qty returned to source location balance | `return_to_origin` | Source `lot_location_balances.qty_remaining` restored by the reversed qty; destination balance not created; `inventory_transaction` with `movement_type = 'transfer'` inserted for the reversal movement |
| Transfer | Hold: lot remains at current location in quarantined state | `hold` | No balance change until explicit resolution; lot may be quarantined |

`write_off` for inbound inspection uses `movement_type = 'inventory_reconciliation'` rather than introducing a new enum value. This must be confirmed with `01-core-data-model` before migration.

### 6.4 Reconciliation

An `inspection_cases` record open beyond a supervisor-approved time window without a disposition surfaces in the supervisor attention queue via `14-notifications-and-alerts`. `11` emits the attention event; `14` owns delivery and deduplication.

A supervisor may:

- Force a disposition directly (for example: `hold` → `quarantine`, `return_to_origin`, or `return_to_shelf`).
- Escalate to admin for `write_off` authorization, which requires a separate approval command before it may be applied.

A forced disposition follows the same balance-effect rules as a normal disposition. No inspection case may be silently closed by a client status change or notification delivery.

### 6.5 Evidence

Evidence files use private Supabase Storage and inherit the transfer/party/flow authorization of the source `inspection_cases` row. Evidence records are append-only; existing records are not deleted or replaced. A photo URL in `inspection_evidence.payload` follows the same private-bucket access pattern as `wrr_inspection_logs.evidence_photo_url`.

## 7. Physical execution and commit

The floor screen uses a two-step physical verification:

1. source scan confirms the expected item/lot/source location and quantity;
2. destination scan confirms the expected destination and item/lot before completion.

The authoritative completion transaction:

1. locks/version-checks the transfer and relevant lot/location state;
2. revalidates current authorization/scope, approval, inspection, quantity, capacity, and scan evidence;
3. moves or updates the approved `lot_location_balances` rows (see §7.1);
4. inserts one immutable `inventory_transaction` with `movement_type = 'transfer'`, `from_location_id`, and `to_location_id`;
5. marks the transfer completed and records audit/correlation data.

If any step fails, the transaction rolls back. A lost response is retried by idempotency key and returns the original result; it does not move stock twice.

### 7.1 Source/destination balance movement

All balance changes happen in one atomic database transaction together with the `inventory_transaction` insert.

**Pre-execution check (hard constraint):**
A transfer line may only proceed if `qty_remaining - qty_committed >= qty_requested` at the source `lot_location_balances` row. Committed stock cannot be transferred. If this check fails, the transfer must wait for the commitment to be released, executed, cancelled, or expired by the owning outbound process in `08`, or reduce the requested quantity to the uncoupled portion only. This check must be re-evaluated at execution time under an appropriate row-level lock, not only at request creation time.

**Source (`from_location_id`):**
The `lot_location_balances` row for `(lot_id, from_location_id)` has `qty_remaining` decremented by `qty_transferred`.

**Destination (`to_location_id`):**

- If a `lot_location_balances` row for `(lot_id, to_location_id)` already exists, its `qty_remaining` is incremented by `qty_transferred`.
- If no such row exists, a new `lot_location_balances` row is created with `qty_received = qty_transferred`, `qty_remaining = qty_transferred`, and `qty_committed = 0`.

**Post-transaction invariants (enforced by existing DB CHECK constraints in `01`):**

- `qty_remaining >= 0` at source after decrement.
- `qty_committed <= qty_remaining` at source after decrement.
- Destination balance row always has `qty_committed = 0` at the moment of creation.

**`inventory_transaction` record for a completed transfer:**

- `movement_type = 'transfer'`
- `from_location_id` = transfer source location
- `to_location_id` = transfer destination location
- `lot_id`, `item_id`, `flow_type`, `qty`, `performed_by_user_id`, `created_at`
- Source `transfer_lines.id` referenced via the correlation/reference field

## 8. Committed quantities and outbound inspection rules

### 8.1 Committed stock cannot be transferred

A transfer line for a lot-location pair where `lot_location_balances.qty_committed > 0` for the affected row must use only uncoupled quantity. The pre-execution check (`qty_remaining - qty_committed >= qty_requested`) enforces this as a hard constraint. If the full requested quantity is committed, the transfer cannot proceed until the commitment is released, executed, cancelled, or expired by the owning outbound process in `08`.

The server command must re-evaluate this constraint at execution time with an appropriate lock, not only at request creation time.

### 8.2 Outbound further inspection differs from transfer inspection

Outbound further inspection (`context_type = 'outbound'`) is not a transfer:

- The lot does **not** move to a new `location_id` during outbound inspection. The `lot_location_balances` row remains at the pick location.
- The `inventory_commitment_lines` reservation stays `status = 'inspection_pending'` and `qty_committed` is not released until pass/fail resolution.
- No `inspection_case_id` is set on any `transfer_lines` row, because no transfer line exists for an outbound inspection case.
- The outbound inspection case is linked to a `pick_list_item`, not a `transfer_line`.

Transfer inspection (`context_type = 'transfer'`) involves physical location movement. The lot's authoritative location changes on a passed transfer. A failed transfer inspection with `return_to_origin` disposition reverses the source balance decrement and does not create a destination balance row.

## 9. Offline and infrastructure integration

The only candidate Tier 1 operation is a physical source/destination scan observation. It is stored and replayed through the shared `03` command envelope, but the server rechecks current transfer state, approval, inspection, authorization, and idempotency.

Request, approval, inspection resolution, final completion, and reversal are online-only. Service-worker/background sync may request replay but cannot perform privileged direct writes. Realtime is an invalidation signal; polling/manual refresh remains available.

## 10. Ledger and reporting integration

The transfer history reads transfer-owned request/inspection state plus the authoritative `inventory_transactions` row. Reporting features such as `16` consume the immutable transaction; they do not create a transfer-specific ledger copy.

## 11. Design verification before approval

- [x] Internal location-to-location scope defined; inter-warehouse transfer explicitly excluded.
- [x] Shared inspection data model (`inspection_cases`, `inspection_evidence`, `inspection_dispositions`) defined with three context types and context isolation invariants.
- [x] Transfer request/line persistence defined (`transfer_requests`, `transfer_lines`).
- [x] Source/destination balance movement using `lot_location_balances` defined with atomic transaction invariants.
- [x] Committed stock transfer block rule defined.
- [x] Outbound inspection distinction from transfer inspection defined.
- [x] Failed inspection disposition table with balance effects defined for all three contexts.
- [x] Reconciliation and supervisor escalation path defined.
- [ ] Confirm which transfer types require approval and which may use an approved routine-transfer shortcut.
- [ ] Reconcile `inspection_cases` table names and polymorphic `source_ref` pattern with `01-core-data-model` migration ownership.
- [ ] Confirm `write_off` movement type with `01-core-data-model` (currently mapped to `inventory_reconciliation`).
- [ ] Confirm lot/location quantity and failed-physical-movement behavior with core inventory design.
- [ ] Confirm transfer approval policy/consumption with `09` and capabilities/RLS with `02`.
- [ ] Confirm Tier 1 scan-observation payload and rejected-sync behavior with `03`.
- [ ] Confirm evidence Storage, notifications, Realtime, idempotency, and runbooks with `04`.
- [ ] Confirm floor/office routes and feedback with `05`.
- [ ] Run `offline-sync-reviewer`, `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier` before approval.
