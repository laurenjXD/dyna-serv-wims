# Packing — Requirements

Status: Draft

## 1. Purpose and scope

This feature governs the controlled packing step between committed physical picking and outbound dispatch readiness. It verifies that picked goods are grouped, scanned, packed, labeled, and handed off to the dispatch workflow without changing authoritative inventory prematurely.

`18` owns packing sessions, package/container details, packing verification, packing exceptions, and the packing-ready handoff contract. It does not own FIFO/FEFO allocation, Stage 1 commitment, inventory decrement, final dispatch confirmation, delivery tracking, pricing resolution, or document artifact generation.

The v1 scope includes:

- creating a packing session from an authoritative picked/eligible source;
- scan-first verification of pick list, item, lot, quantity, and package/container assignment;
- package count, UOM, dimensions/weight where approved, labels, and packing exceptions;
- sealed/ready-for-dispatch confirmation and downstream handoff;
- supervisor/authorized exception review where required;
- read-only packing history, status, and operational metrics;
- clear support for VMI, Trading, and Supplies partitioning without mixing stock or financial meaning.

## 2. Alignment principles and ownership boundaries

- `08-outgoing-withdrawal-and-two-stage-commitment` owns outbound request, FIFO/FEFO allocation, commitment/reservation, physical pick/dispatch state, inventory decrement, and immutable `inventory_transactions` with `movement_type = 'pick'`.
- `10-pick-list-and-acknowledgement-receipt` owns the priced `pick_list`/`acknowledgement_receipt` content, generated artifacts, printing, reprinting, and private document Storage. `18` supplies approved packing facts; it does not generate or rewrite those documents.
- `19-dispatch-scheduling-and-delivery-tracking` owns dispatch scheduling, carrier/vehicle assignment, delivery status, and post-handoff tracking. `18` only makes a packed shipment eligible for its contract.
- `01-core-data-model` owns `parties`, `items`, `locations`, `lots`, `pick_lists`, `pick_list_items`, and immutable ledger rules. Any packing persistence must be reconciled with `01` or an approved feature-owned table before implementation.
- `02-rbac-roles` owns capabilities, party/flow scope, RLS, and audit authority. A scanner or client-supplied status cannot establish permission.
- `03-offline-mode-and-client-storage` owns the offline boundary. Physical observations may be candidates for Tier 1 only if explicitly approved; packing confirmation, sealing, exception resolution, and dispatch eligibility remain online authoritative operations.
- `04-services-and-infrastructure` owns Auth, transaction/idempotency, jobs, private Storage, labels, monitoring, and retries.
- `05-ui-shell-and-navigation` and the approved brand system govern routes and floor-first interaction patterns.
- `12-vmi-billing` owns period-average VMI billing; `13-trading-orders-and-pricing` owns final Trading prices. Packing must not calculate or change either.
- One physical warehouse is assumed; no `warehouse_id` is introduced.

## 3. Actors and surfaces

- **Warehouse packer:** uses a portrait handheld flow to scan a committed pick and items, assign packages, resolve safe exceptions, and seal a package.
- **Supervisor:** reviews packing exceptions and authorizes only explicitly approved corrections or overrides.
- **Office/dispatch operator:** reviews packed contents, package details, and dispatch readiness before scheduling/handoff.
- **Party user:** may see only authorized packed/order/document summaries where the downstream contract permits; party visibility does not grant packing authority.
- **Administrator/auditor:** reviews history and operational audit under approved capabilities.

Packing is a floor-first workflow. Office review may use tables and wider layouts, but active packing is one task per screen, scan > tap > type, portrait, high contrast, solid surfaces, and one obvious primary action.

## 4. Functional requirements

### R1. Packing-session eligibility and lifecycle

1. A packing session SHALL be created only from an authoritative committed/picked source identified by `08` and current `pick_list` state; draft or client-only allocations are ineligible.
2. The source reference, source version/event, actor, `flow_type`, destination/party scope, and correlation/idempotency key SHALL be recorded.
3. The lifecycle SHALL distinguish at least `open`, `verifying`, `exception`, `packed`, `sealed`/`ready_for_dispatch`, `cancelled`, and `failed` or their approved equivalents.
4. A packing session SHALL not be treated as dispatched, delivered, inventory-decremented, or acknowledgement-receipt-signed merely because packing is complete.
5. Repeated open/confirm requests SHALL be idempotent and SHALL not create duplicate packing sessions for the same authoritative source/version unless an approved repack/reopen path exists.
6. Reopen, cancel, or repack operations SHALL be explicit, authorized, attributable, and safe against a concurrent dispatch.

### R2. Scan and quantity verification

1. The floor flow SHALL present one current packing task at a time with pick-list reference, item code/barcode, description, lot, expected quantity/UOM, flow type, and destination-safe context.
2. The system SHALL verify the expected pick list, item/barcode, lot, source/pick context where required, and quantity before accepting a packed line.
3. It SHALL reject or route to an approved exception for wrong item, wrong lot, wrong pick list, duplicate scan, over-quantity, under-quantity, invalid UOM, stale source state, or unauthorized package assignment.
4. VMI and Trading quantity/UOM/SPQ rules SHALL remain those of `01`/`08`; Supplies piece-level behavior remains governed by the approved flow contract.
5. Client-side scan counts are observations only until an authorized server command accepts them; the client SHALL not mark a line packed by changing local status.
6. Manual entry MAY be a controlled recovery path, but it SHALL use the same server validation, audit, and idempotency boundary as scanning.

### R3. Package and container records

1. An authorized packer SHALL be able to assign verified lines to one or more package/container records using stable package references.
2. A package record SHALL support the approved fields for package type, sequence/label, packed lines and quantities, dimensions, gross/net weight, seal/reference, and status; final fields must be reconciled before approval.
3. Package totals SHALL be derived from accepted packing lines and SHALL not silently change the committed quantity, price, lot, or inventory balance.
4. Package/container identity SHALL not be confused with `locations`, `lots`, `pick_list`, or `acknowledgement_receipt`.
5. If packaging materials are inventory-controlled, their consumption SHALL use a separately approved inventory workflow; `18` SHALL not decrement them implicitly.
6. The system SHALL prevent the same verified quantity from being assigned to multiple packages and SHALL prevent package closure with missing required lines or invalid measurements.

### R4. Packing confirmation and downstream handoff

1. Packing completion SHALL validate all required lines, quantities, package assignments, exception resolutions, labels, and required measurements before sealing/ready-for-dispatch.
2. The authoritative packing confirmation SHALL be an online server command with current authorization, source-version check, and idempotency.
3. A successful packing confirmation SHALL emit a versioned handoff event/contract to `19` and the relevant `08`/`10` consumers.
4. Packing confirmation SHALL not insert a `pick` inventory transaction, decrement lots, release reservations, finalize pricing, or generate an acknowledgement receipt by itself.
5. Final dispatch remains owned by `08`; only that authoritative dispatch outcome may release the reservation, decrement inventory, and insert the immutable `inventory_transaction`.
6. A later dispatch or document failure SHALL not rewrite a completed packing history; it SHALL create an observable attention/recovery state.

### R5. Exceptions and correction boundaries

1. Shortage, damage, wrong item/lot, missing quantity, damaged package, label failure, measurement mismatch, and source-stale conditions SHALL have explicit statuses/reasons.
2. A packing exception SHALL not be resolved by silently editing the pick list, lot quantity, price, approval, or inventory balance.
3. Corrections requiring a business decision SHALL route to the owning feature or approved supervisor/approval boundary with exact source/version/context.
4. A packed or sealed record SHALL be immutable as a historical event. Repack/reopen or correction SHALL create a new version/linked action with reason and actor.
5. Physical damage or shortage discovered during packing SHALL follow the approved `08` exception/reconciliation path; `18` does not invent compensating inventory movements.
6. Packing cancellation SHALL be blocked once final dispatch has committed unless an approved reversal/recovery workflow authorizes it.

### R6. Labels, documents, and presentation

1. Packing MAY produce an internal package/label payload only if its format, storage, and ownership are approved; it SHALL not create a competing priced outbound document.
2. Any `pick_list` or `acknowledgement_receipt` preview/print SHALL use the immutable source/document snapshot from `10`.
3. Trading price on a document remains final for that document; VMI document price remains a per-release reference and never the authoritative VMI bill.
4. Labels and package views SHALL show only authorized item, lot, quantity, destination, and flow information; internal cost/margin and restricted VMI data SHALL not leak.
5. Label/document generation failure SHALL be retryable and SHALL not reverse inventory or claim dispatch completion.

### R7. Authorization, privacy, and audit

1. Session creation, scan acceptance, package mutation, measurement update, exception resolution, seal, reopen, cancel, preview, label generation, and history reads SHALL use current capabilities, party/flow scope, and RLS.
2. Client-supplied party, flow, lot, quantity, source status, approval, role, or destination SHALL not establish authority or truth.
3. Every accepted scan/observation, rejection, package assignment, exception, correction, seal, handoff, and failure SHALL be attributable with actor/system executor, timestamp, source version, reason/status, and correlation ID.
4. Party users SHALL not infer unrelated packing sessions or package contents through identifiers, counts, filters, errors, realtime events, labels, or URLs.

### R8. Offline and realtime behavior

1. Packing-session creation, source validation, package mutation, exception resolution, sealing, reopen/cancel, label authorization, and dispatch-ready confirmation SHALL be online-only in v1.
2. Physical scan observations MAY be queued only if explicitly admitted by `03` as a Tier 1 command; replay SHALL re-authenticate, re-authorize, recheck source/version and quantities, and be idempotent.
3. Offline observations SHALL never finalize packing, authorize dispatch, decrement inventory, release reservations, change price, or generate an authoritative receipt.
4. The UI SHALL distinguish locally captured scans, server-accepted packing lines, sealed status, and dispatched status.
5. Realtime MAY signal changes, but durable packing state requires authoritative refetch after reconnect, visibility change, manual refresh, or missed events.

## 5. Acceptance criteria

- [ ] A packing session can be opened only from an authoritative committed/picked source and is scoped to the correct party/flow.
- [ ] Scan verification rejects wrong source, item, lot, quantity, duplicate, UOM, and stale-state conditions safely.
- [ ] Package assignments cannot duplicate or lose accepted quantities and cannot close with unresolved required exceptions.
- [ ] Packing confirmation makes a versioned handoff to dispatch without decrementing inventory or creating a second ledger.
- [ ] Final dispatch remains owned by `08`; document generation remains owned by `10`; delivery tracking remains owned by `19`.
- [ ] Trading and VMI price semantics remain unchanged, and no competing priced document is introduced.
- [ ] Repack/correction history is explicit and auditable; immutable inventory history is untouched.
- [ ] Offline observations cannot finalize packing or dispatch, and stale/offline state is visible.
- [ ] RLS, party/flow isolation, idempotency, concurrency, accessibility, floor usability, and failure tests pass.

## 6. Decisions required before approval

- Final packing-session/package schema and ownership location relative to `01` and `18`.
- Exact source eligibility state from `08`/`pick_list` and the authoritative handoff event to `19`.
- Package types, dimensions/weight units, label format, seal fields, and whether package data is needed on the acknowledgement receipt.
- Partial packing, shortage, damage, reopen, repack, and post-seal correction policy.
- Whether scan observations are admitted to the `03` Tier 1 queue and the exact replay contract.
- Approved packing capabilities, supervisor/approval boundaries, audit retention, and party-safe visibility.
- Packaging-material consumption policy, if packaging materials are themselves inventory.
