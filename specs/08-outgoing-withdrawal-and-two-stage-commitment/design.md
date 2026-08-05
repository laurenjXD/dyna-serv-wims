# Outgoing Withdrawal & Two-Stage Commitment — Design

Status: Draft

## 1. Design intent

Outbound withdrawal is an authoritative reservation-and-execution workflow, not a single “click to subtract stock” action. It separates office request/allocation from floor physical execution and keeps the final inventory decrement at a server transaction boundary.

The design follows the settled document model: an operational `pick_list` is generated at commitment/pick confirmation, and a priced `acknowledgement_receipt` is generated for handoff. Neither is replaced by a `withdrawal_slip`, and the signed paper receipt is not scanned back as a required state transition.

## 2. Foundational dependencies and core tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `brand-design-system.md`, and `revision-log.md`.
- `01-core-data-model` for parties/items/locations/lots, FIFO/FEFO eligibility, pick-list records, and immutable transactions.
- `02-rbac-roles` for capabilities, party/flow scope, RLS, and approval authorization.
- `03-offline-mode-and-client-storage` for the limited physical-observation queue and replay reauthorization.
- `04-services-and-infrastructure` for server transactions/idempotency, Auth, Storage, jobs, monitoring, and document failure handling.
- `05-ui-shell-and-navigation` for office/floor routes and shell contracts.
- `09-approval-queue` for FIFO override decisions.
- `10-pick-list-and-acknowledgement-receipt` for document generation/printing.
- `12-vmi-billing` and `13-trading-orders-and-pricing` for price/reference semantics.

### Core tables touched

| Table | Use | Boundary |
|---|---|---|
| `parties` | Resolve destination/customer/requesting party. | Master data owned by `06`; scope enforced by RBAC/RLS. |
| `items` | Resolve item, barcode, UOM, SPQ, roll/meter, and packaging data. | Master data owned by `06`. |
| `locations` | Resolve source/pick/dispatch locations. | Location master owned by its owning feature/core design. |
| `lots` | Read lot identity/status/order. | Core inventory boundary owns lifecycle invariants. |
| `lot_location_balances` | Allocate and update the exact lot/location quantity and commitment row. | Core inventory boundary owns quantity/concurrency invariants. |
| `inventory_commitments` / `inventory_commitment_lines` | Store durable Stage 1 reservation ownership and Stage 2 execution/release state. | Core inventory boundary owns lifecycle and idempotency invariants. |
| `pick_lists` | Store committed operational outbound document/status. | Final schema/status and commitment linkage must be reconciled with `01`. |
| `pick_list_items` | Store item/lot/location/quantity/SPQ/box/price snapshot for the pick list. | Must distinguish requested, committed, and executed quantities if required. |
| `inventory_transactions` | Insert immutable `pick` movement at final dispatch; read outgoing ledger. | No updates/deletes. |

The core contract is now resolved: distributed quantity lives in
`lot_location_balances`; `qty_available` is derived through
`lot_inventory_totals`; and durable reservation ownership lives in
`inventory_commitments` / `inventory_commitment_lines`. This feature must not
add fields to `lots` or create a second reservation ledger.

## 3. Route and shell integration

The target route shape is provisional:

```text
app/(authenticated)/
  withdrawal/
    page.tsx                    # request/list/review surface
    new/page.tsx                # office request builder
    [requestId]/page.tsx        # request/allocation detail
    [requestId]/commit/page.tsx # online Stage 1 commitment
    [pickListId]/pick/page.tsx  # floor pick execution
    [pickListId]/dispatch/page.tsx # floor final dispatch confirmation
  outgoing-ledger/page.tsx      # office/review read-only ledger
```

The final route naming must align with `05` and `10`. The earlier desktop three-panel pattern (`search | cart | summary`) may remain an office request-builder enhancement, but it is not the floor baseline. Floor pick/dispatch uses a single-column, one-task-per-screen pattern at 375–430px with no persistent sidebar during active scanning.

## 4. State and ownership model

```text
Draft request
    │ authoritative allocation
    ▼
Available lots + current FEFO/FIFO plan
    │ optional FIFO override approval
    ▼
Committed reservation + pick_list(allocated)
    │ physical pick/dispatch scans
    ▼
Authoritative dispatch commit
    ├── lot/on-hand decrement
    ├── reservation release
    ├── inventory_transaction(pick)
    ├── pick_list → dispatched
    └── acknowledgement_receipt generation request
```

Ownership boundaries:

- `08` owns request/commit/physical execution state and domain commands.
- `09` owns the approval decision for FIFO override.
- `10` owns document templates, generated artifacts, printing, and document-specific presentation.
- `13` supplies Trading document pricing; `12` owns the authoritative VMI period bill.
- `19` owns later dispatch scheduling and delivery tracking.

## 5. Allocation and FIFO/FEFO design

The allocation command queries current authoritative state and applies:

1. `lots.status = 'available'` as the sole eligibility gate from the core model;
2. FEFO by expiry for perishable items and FIFO by approved received/created ordering for non-perishable items;
3. flow-specific SPQ/UOM rules;
4. existing reservations/commitments;
5. location quantities across dispersed locations.

The output is a deterministic allocation plan containing item, lot, location, requested/allocated quantity, SPQ/box conversion, and ordering explanation. Client-supplied lot selection is treated as a request and is revalidated server-side.

If the requested plan is out of sequence, the server creates an explicit FIFO override request for `09`. Commitment cannot proceed on a pending, rejected, expired, or mismatched approval. The final commit rechecks the plan because available stock and approvals can change between screens.

## 6. Stage 1 commitment transaction

The online commit command receives a request ID, expected version, allocation plan, optional override reference, pricing-reference context as allowed by the owning pricing spec, and an idempotency key.

Within one authoritative transaction it:

1. authenticates and authorizes the current actor and destination/flow scope;
2. locks or safely version-checks request, `lot_location_balances`, and reservation state;
3. revalidates status, availability, SPQ/UOM, FEFO/FIFO, and approval;
4. writes `inventory_commitments` / `inventory_commitment_lines` and increments
   the selected balance rows' `qty_committed` values;
5. creates the `pick_list` and `pick_list_items` snapshot;
6. records commitment/audit data and returns the authoritative pick-list reference.

It does not decrement on-hand inventory or insert the final `pick` transaction. A duplicate idempotency key returns the existing committed result. A stale request/plan returns a conflict requiring fresh allocation.

## 7. Stage 2 physical execution and dispatch transaction

The floor flow reads the committed pick list and presents one expected scan task at a time. Each accepted scan is associated with the committed item/lot/location and quantity. Local scan observations may be stored as Tier 1 only after `03` approval; they are not final inventory outcomes.

The final dispatch command receives the pick-list ID, expected version, accepted scan/quantity evidence, and idempotency key. It rechecks:

- current actor/capability/scope;
- pick-list status and commitment ownership;
- item/barcode/lot/location identity;
- quantities and any approved partial/exception rule;
- current lot status, selected lot/location balance, and reservation state;
- required pricing/document snapshot availability.

On success, one transaction decrements the selected
`lot_location_balances.qty_remaining`, decrements its `qty_committed`, marks
the commitment line executed/released, inserts immutable
`inventory_transactions` with `movement_type = 'pick'`, transitions the pick
list, and emits the document-generation event/command for `10`. Email or PDF
generation failure cannot roll back the committed stock movement; the document
remains in an observable retry/attention state.

## 8. Pricing and document boundary

`08` consumes a typed pricing result/snapshot; it does not calculate a final Trading price or VMI billing amount.

- Trading price on the acknowledgement receipt is final for that document, supplied by `13`.
- VMI price on the document is a per-release reference only. The authoritative VMI bill is the period-average calculation owned by `12`.
- Supplies pricing/reference behavior must be explicitly defined by its owning requirements before any non-zero document semantics are implemented.
- `10` owns the pick-list and acknowledgement-receipt layouts, artifact storage, print behavior, and safe re-generation. `08` owns the event that makes the document eligible.

## 9. Outgoing ledger design

The Outgoing Ledger is a read-only, scope-filtered query over `inventory_transactions`, primarily `movement_type = 'pick'`. Transfer rows are included only under the final transfer/ledger contract. It joins approved pick-list, item, lot, location, party, user, and acknowledgement-receipt references without becoming a mutable reporting table.

Item code is the prominent first field in office review. Floor screens do not use the ledger's dense table; they use task cards and scan feedback.

## 10. Offline, security, and infrastructure boundary

- Request creation, allocation, FIFO override, commitment, release, pricing, and final dispatch are Tier 2/online-only.
- Physical scan observations may be queued as Tier 1 if the owning policy is approved; replay invokes the current Auth/capability/scope/domain/RLS checks and idempotency.
- Cached availability, lot order, reservation, approval, and pricing never authorize a final outcome.
- The service worker, if enabled, only wakes/request sync; it does not perform privileged domain writes itself.
- Party-scoped documents use private Storage and authorized signed/session access.
- Realtime events invalidate/refetch current pick-list/attention state; they do not grant approval or establish availability.

## 11. Design verification before approval

- [x] Reconcile pick-list status, reservation/commitment representation, executed quantities, and any acknowledgement-receipt linkage with the resolved `01` balance/commitment contract and `10` design.
- [ ] Confirm exact FIFO/FEFO and SPQ/UOM validation with core inventory rules.
- [ ] Confirm override request/approval contract with `09` and RBAC capability catalog.
- [ ] Confirm Tier 1 physical-observation command and rejection UX with `03`.
- [ ] Confirm pricing snapshots/reference semantics with `12` and `13`.
- [ ] Confirm document event/storage/print failure behavior with `10` and `04`.
- [ ] Confirm route/floor interaction patterns with `05`.
- [ ] Have `offline-sync-reviewer`, `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier` review before approval.
