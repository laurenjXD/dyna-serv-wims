# Outgoing Withdrawal & Two-Stage Commitment — Design

Status: Draft
Updated: 2026-08-05

## 1. Design intent

Outbound withdrawal is an authoritative pick-list-generation-and-execution workflow, not a single “click to subtract stock” action. It starts from the Master Inventory surface and keeps the final inventory decrement at a server transaction boundary. There is no separate withdrawal-request entity.

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
  inventory/
    page.tsx                    # item selection and pick-list generation
  pick-lists/
    [pickListId]/page.tsx       # committed pick-list detail
    [pickListId]/pick/page.tsx  # floor pick execution
    [pickListId]/dispatch/page.tsx # floor dispatch/inspection disposition
  outgoing-ledger/page.tsx      # office/review read-only ledger
```

The final route naming must align with `05` and `10`. The earlier desktop three-panel pattern (`search | cart | summary`) may remain an office request-builder enhancement, but it is not the floor baseline. Floor pick/dispatch uses a single-column, one-task-per-screen pattern at 375–430px with no persistent sidebar during active scanning.

## 4. State and ownership model

```text
Pick-list generation input from Master Inventory
    │ authoritative allocation
    ▼
Available lots + current FEFO/FIFO plan
    │ standard FIFO/FEFO (no approval needed)
    │ or FIFO override → 09-approval-queue → approved
    ▼
Committed reservation + pick_list(allocated)
    │ qty_committed incremented on lot_location_balances
    │ qty_remaining unchanged
    │ physical pick/dispatch scans
    ▼
picked / dispatch_ready
    │
    ├── dispatch disposition
    │       ▼
    │  Authoritative dispatch commit
    │       ├── qty_remaining decremented on lot_location_balances
    │       ├── qty_committed released (decremented) on lot_location_balances
    │       ├── inventory_commitment_lines → executed
    │       ├── inventory_transaction(movement_type='pick') inserted
    │       ├── pick_list → dispatched
    │       └── acknowledgement_receipt generation request → 10
    │
    └── further_inspection disposition
            ▼
        inspection_pending
        inventory_commitments.status = 'inspection_pending'
        lot_location_balances.qty_committed preserved (NOT released)
        inventory_commitment_lines remain active
            │
            ├── inspection_pass
            │       ▼
            │  picked / dispatch_ready → dispatch disposition (see above)
            │
            └── inspection_fail
                    ├── (a) replace with compliant stock
                    │         original commitment lines released
                    │         new pick cycle from available inventory
                    └── (b) cancel commitment
                              qty_committed decremented on lot_location_balances
                              inventory_commitment_lines → cancelled
                              inventory_commitments → cancelled
                              pick_list → cancelled
                              NO inventory_transaction(pick) inserted
```

Ownership boundaries:

- `08` owns pick-list generation/commit/physical execution state and domain commands.
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

If the selected plan is out of sequence, the server creates an explicit FIFO override approval request for `09`. Standard FIFO/FEFO plans proceed directly to pick-list generation. A pending, rejected, expired, or mismatched override approval blocks generation. The final command rechecks the plan because available stock and approvals can change between screens.

## 6. Stage 1 commitment transaction

The online pick-list generation command receives the selected destination/flow/item quantities, expected inventory version, allocation plan, optional FIFO override reference, pricing-reference context as allowed by the owning pricing spec, and an idempotency key.

Within one authoritative transaction it:

1. authenticates and authorizes the current actor and destination/flow scope;
2. locks or safely version-checks the selected item/lot/location state and reservation state;
3. revalidates status, availability, SPQ/UOM, FEFO/FIFO, and approval;
4. writes one `inventory_commitments` header record and one `inventory_commitment_line` per selected lot/location row, then atomically increments `lot_location_balances.qty_committed` by the committed quantity for each affected row;
5. creates the `pick_list` and `pick_list_items` snapshot atomically with the commitment records;
6. records commitment/audit data and returns the authoritative pick-list reference.

**Quantity semantics at Stage 1.** `qty_available = qty_remaining − qty_committed` is derived by the `lot_inventory_totals` view and is never stored as a column. Stage 1 increments `qty_committed` only; `qty_remaining` is not touched. On-hand stock remains physically and systemically on the shelf. The cross-row invariant `qty_committed ≤ qty_remaining` is enforced by the locking/version-check transaction, not by a single-table CHECK constraint alone.

It does not decrement on-hand inventory or insert the final `pick` transaction. A duplicate idempotency key returns the existing committed result. A stale selection/plan returns a conflict requiring fresh allocation.

## 7. Stage 2 physical execution and dispatch transaction

The floor flow reads the committed pick list and presents one expected scan task at a time. Each accepted scan is associated with the committed item/lot/location and quantity. Local scan observations may be stored as Tier 1 only after `03` approval; they are not final inventory outcomes.

After all pick/scan lines on a pick list are accepted, the floor user or supervisor chooses a post-pick disposition before Stage 2 commit. The disposition command receives the pick-list ID, expected version, accepted scan/quantity evidence, chosen disposition (`dispatch` or `further_inspection`), and idempotency key.

**`dispatch` disposition.** The final dispatch command rechecks:

- current actor/capability/scope;
- pick-list status and commitment ownership;
- item/barcode/lot/location identity;
- quantities and any approved partial/exception rule;
- current lot status, selected lot/location balance, and reservation state;
- required pricing/document snapshot availability.

On successful dispatch, one atomic transaction:

1. decrements `lot_location_balances.qty_remaining` by the executed quantity for each affected row;
2. decrements `lot_location_balances.qty_committed` by the same quantity (releasing the reservation);
3. transitions each `inventory_commitment_line` to `executed` and sets `qty_executed`;
4. transitions the `inventory_commitments` header to `executed` and stamps `completed_at`;
5. inserts an immutable `inventory_transactions` row with `movement_type = 'pick'`;
6. transitions the `pick_list` to `dispatched`;
7. emits the document-generation event/command for `10`.

Email or PDF generation failure cannot roll back the committed stock movement; the document remains in an observable retry/attention state.

**`further_inspection` disposition.** When the floor user or supervisor chooses `further_inspection` after all scan lines are accepted, the system:

1. transitions `inventory_commitments.status` to `inspection_pending`;
2. does NOT release `lot_location_balances.qty_committed` — reserved quantities remain held;
3. does NOT insert an `inventory_transactions` row;
4. creates an outbound inspection case linked to the `pick_list_id` and the specific `pick_list_items` under review.

The inspection work is executed through the shared inspection capability defined in `11`. While `inspection_pending`:

- `inventory_commitment_lines` remain `active`;
- `lot_location_balances.qty_committed` is preserved on every affected balance row;
- dispatch is blocked; the pick list cannot be moved to `dispatched` without an inspection resolution.

**Inspection pass.** The pick list returns to `picked / dispatch_ready`. The floor user selects the `dispatch` disposition, and the dispatch commit proceeds as described above.

**Inspection fail.** Two and only two resolution paths exist:

(a) **Replace with compliant stock.** The held stock is moved to a hold or quarantine location (a transfer/hold command outside this feature). The original `inventory_commitment_lines` are released (`qty_committed` decremented on each affected `lot_location_balances` row; lines transition to `released`). A new pick cycle begins against currently available inventory, producing a new commitment and pick list.

(b) **Cancel the commitment.** Each affected `lot_location_balances.qty_committed` is decremented back to zero for those lines, returning reserved stock to `qty_available`. Each `inventory_commitment_line` transitions to `cancelled`. The `inventory_commitments` header transitions to `cancelled` and stamps `released_at`. The `pick_list` transitions to `cancelled`.

In both fail paths, no `inventory_transactions` row with `movement_type = 'pick'` is inserted. `qty_remaining` is never decremented by a failed inspection outcome. A failed inspection never silently completes a dispatch.

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
