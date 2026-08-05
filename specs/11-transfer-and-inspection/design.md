# Transfer & Inspection — Design

Status: Draft

## 1. Design intent

This feature is a single-warehouse internal movement workflow. It turns an authorized transfer request into a validated physical movement between `locations`, optionally requiring transfer-specific inspection, and records one immutable `inventory_transaction` with `movement_type = 'transfer'`.

The design intentionally separates three concerns:

- inbound WRR/conformance in `07`;
- transfer approval decisions in `09`;
- transfer business mutation and inspection in this feature.

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
|---|---|---|
| `parties` | Resolve party/flow context where the lot or request is party-scoped. | Master data owned by `06`; scope enforced by RBAC/RLS. |
| `items` | Resolve item/barcode/UOM/packaging identity. | Master data owned by `06`. |
| `locations` | Validate source/destination, type, active state, and capacity. | Location master owns definitions; transfer owns use. |
| `lots` | Validate item/flow/status and lot identity through commit. | Inventory core owns lifecycle invariants. |
| `lot_location_balances` | Validate source/destination quantities and update the authoritative placement rows. | Inventory core owns quantity/concurrency invariants. |
| `inventory_transactions` | Insert immutable `transfer` movement with from/to location references. | No updates/deletes. |

### Transfer-owned persistence

The current core model has no finalized transfer request/inspection tables. The intended feature-owned records are:

```text
transfer_requests
  id, reference, status, reason, requested_by,
  source_location_id, destination_location_id,
  flow_type, version, requires_approval, approval_request_id,
  created_at, updated_at, correlation_id

transfer_items
  transfer_id, item_id, lot_id, requested_qty,
  scanned_source_qty, scanned_destination_qty, uom,
  inspection_required, executed_qty

transfer_inspections
  transfer_id, transfer_item_id, result,
  reason, remarks, evidence_object_ref,
  inspected_by, inspected_at, resolution
```

These names and whether transfer lines/inspection records live in one or separate tables must be approved before migrations. They must reference canonical core records and must not duplicate inventory quantity as an independent source of truth.

## 3. Route and shell integration

Provisional App Router shape:

```text
app/(authenticated)/
  transfers/
    page.tsx                     # request/review list
    new/page.tsx                 # office request form
    [transferId]/page.tsx        # detail/history
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

Transfer inspection is a separate record and state from `wrr_inspection_logs`. It may inspect packaging, identity, destination, damage, or movement-specific conditions defined by the approved policy. It cannot:

- turn an unreceived WRR into inventory;
- bypass inbound conformance in `07`;
- approve a FIFO override;
- alter a lot’s authoritative history without a transfer/reconciliation transaction.

Non-conformance creates a blocked/exception state with reason, remarks, evidence, and resolution. Evidence uses private Storage with the same transfer/party/flow authorization as the source record.

## 7. Physical execution and commit

The floor screen uses a two-step physical verification:

1. source scan confirms the expected item/lot/source location and quantity;
2. destination scan confirms the expected destination and item/lot before completion.

The authoritative completion transaction:

1. locks/version-checks the transfer and relevant lot/location state;
2. revalidates current authorization/scope, approval, inspection, quantity, capacity, and scan evidence;
3. moves or updates the approved `lot_location_balances` rows, preserving
   non-negative quantities and commitment constraints;
4. inserts one immutable `inventory_transaction` with `movement_type = 'transfer'`, `from_location_id`, and `to_location_id`;
5. marks the transfer completed and records audit/correlation data.

If any step fails, the transaction rolls back. A lost response is retried by idempotency key and returns the original result; it does not move stock twice.

The final policy must resolve whether source physical stock is considered unavailable during `executing` and how a failed physical movement is reconciled. This cannot be decided by the client.

## 8. Offline and infrastructure integration

The only candidate Tier 1 operation is a physical source/destination scan observation. It is stored and replayed through the shared `03` command envelope, but the server rechecks current transfer state, approval, inspection, authorization, and idempotency.

Request, approval, inspection resolution, final completion, and reversal are online-only. Service-worker/background sync may request replay but cannot perform privileged direct writes. Realtime is an invalidation signal; polling/manual refresh remains available.

## 9. Ledger and reporting integration

The transfer history reads transfer-owned request/inspection state plus the authoritative `inventory_transactions` row. Reporting features such as `16` consume the immutable transaction; they do not create a transfer-specific ledger copy.

## 10. Design verification before approval

- [ ] Confirm the exact transfer scope and whether any routine transfers bypass approval.
- [ ] Reconcile transfer request/item/inspection persistence with approved `01` and migration ownership.
- [ ] Confirm lot/location quantity and failed-physical-movement behavior with core inventory design.
- [ ] Confirm transfer approval policy/consumption with `09` and capabilities/RLS with `02`.
- [ ] Confirm Tier 1 scan-observation payload and rejected-sync behavior with `03`.
- [ ] Confirm evidence Storage, notifications, Realtime, idempotency, and runbooks with `04`.
- [ ] Confirm floor/office routes and feedback with `05`.
- [ ] Run `offline-sync-reviewer`, `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier` before approval.
