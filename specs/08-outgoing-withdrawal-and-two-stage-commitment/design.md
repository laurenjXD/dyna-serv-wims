# Outgoing Withdrawal & Two-Stage Commitment — Design

Status: Approved
Updated: 2026-08-25 (Direct-to-dispatch pick-list amendment)

## 1. Design intent

Outbound withdrawal is an authoritative pick-list-generation-and-execution workflow, not a single “click to subtract stock” action. It starts from the Master Inventory surface and keeps the final inventory decrement at a server transaction boundary. There is no separate withdrawal-request entity.

The design follows the settled document model: an operational `pick_list` is generated at commitment/pick confirmation, and a priced `acknowledgement_receipt` is generated for handoff. Neither is replaced by a `withdrawal_slip`, and the signed paper receipt is not scanned back as a required state transition.

## 2. Foundational dependencies and core tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `ui-ux-design-plan.md`, and `revision-log.md`.
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
| `inventory_transactions` | Insert immutable `pick` movement at final dispatch, with `pick_list_id` set to the dispatched pick list (added 2026-08-07, mirroring `wrr_id`); read outgoing ledger. | No updates/deletes. |

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
    page.tsx                    # office withdrawal hub — Pick Lists tab
                                 #   (committed pick lists) + Ledger tab
                                 #   (read-only outgoing ledger). Item
                                 #   selection / FIFO allocation / pick-list
                                 #   GENERATION UI IS NOT YET BUILT HERE —
                                 #   explicitly open, not silently
                                 #   implemented; see the note below.
  pick-lists/
    [pickListId]/page.tsx       # committed pick-list detail
    [pickListId]/pick/page.tsx  # floor pick execution
    [pickListId]/dispatch/page.tsx # floor direct dispatch confirmation
```

**2026-08-09 restructuring — what actually exists today.** `inventory/page.tsx` now exists and matches this route block's originally-approved path (superseding the 2026-08-08 registry note that had temporarily renamed it to `/pick-lists`). It currently holds exactly two tabs, moved verbatim from what had briefly existed as standalone sibling routes: **Pick Lists** (the list of committed pick lists, formerly `pick-lists/page.tsx`) and **Ledger** (the read-only Outgoing Ledger, formerly `outgoing-ledger/page.tsx`). The item-selection/FIFO-allocation/pick-list-generation UI this section's original text describes ("item selection and pick-list generation") is **not yet built** — this is an open gap, tracked here rather than silently treated as done. The former standalone `outgoing-ledger/page.tsx` route no longer exists as a separate sibling; it is the Ledger tab on `inventory/page.tsx`. The floor pick/dispatch execution routes under `pick-lists/[pickListId]/...` are unchanged and were not moved.

The final route naming must align with `05` and `10`. The earlier desktop three-panel pattern (`search | cart | summary`) may remain an office request-builder enhancement, but it is not the floor baseline. Floor pick/dispatch uses a single-column, one-task-per-screen pattern at 375–430px with no persistent sidebar during active scanning.

### 3.1 Multi-item Pick Lists-tab draft

The **Pick Lists** tab is the office creation surface. It starts with an empty, client-local draft and does not create a database record or reservation while the user is adding, changing, or removing lines.

```text
Pick Lists tab
  → choose one Organization + Inventory Model
  → add multiple item-code rows
  → select the source lot/location and boxes for each row
  → review the table-like draft queue
  → Generate Pick List (one server command)
  → atomic reservations + one pick_list + one committed line set
  → request pick-list PDF from the immutable committed snapshot
  → dispatch-ready queue + View / PDF
```

Each row displays item code, customer item code, item description, lot number, selected location, boxes, UOM/SPQ, and source availability. The UI may show the FIFO/FEFO recommendation, but every selection is revalidated by the server. The draft can contain many item codes, but only one Organization and Inventory Model; a mixed-organization or mixed-model request is rejected before any reservation is made.

The existing direct single-item Stock View control is replaced by a navigation affordance to this draft. It must not create a one-line list through a separate implementation path.

The `/outgoing` page header exposes only actions that have an immediate operational result. A generic Filter button is omitted unless a corresponding filter panel is implemented in the active view; contextual controls belong beside the queue or ledger they affect.

The active work view separates lifecycle phases rather than interleaving them in one list. `status = 'allocated'` renders under **To Pick** with the Start Pick action; `status = 'picked'` renders under **To Dispatch** with the Dispatch action. Each section has an independent count and empty state. Blue/amber cues identify pending picking, while emerald readiness cues distinguish work that can leave the warehouse.

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
    │ pick-list PDF provides physical staging instructions
    ▼
picked / dispatch_ready
    │
    └── exact-box dispatch scans → authoritative dispatch commit
    │       ├── qty_remaining decremented on lot_location_balances
    │       ├── qty_committed released (decremented) on lot_location_balances
    │       ├── inventory_commitment_lines → executed
    │       ├── inventory_transaction(movement_type='pick') inserted
    │       ├── pick_list → dispatched
    │       └── acknowledgement_receipt generation request → 10
    │
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
4. validates `item_code_is_provisional` for every requested line and aborts the entire generation with a recoverable, item-naming error if any line's flag is true;
5. writes one `inventory_commitments` header record and one `inventory_commitment_line` per selected lot/location row, then atomically increments `lot_location_balances.qty_committed` by the committed quantity for each affected row;
6. creates the `pick_list` and `pick_list_items` snapshot atomically with the commitment records;
7. records commitment/audit data and returns the authoritative pick-list reference.

**Provisional item-code gate.** Step 4 checks `item_code_is_provisional` as defined by `01-core-data-model/design.md`'s `master_inventory_tracking` read model (`displayed_item_code`/`item_code_is_provisional`, added 2026-08-07): for Trading/Supplies lines this is true whenever `items.dsgc_item_number IS NULL`, i.e. no Purchase Order has yet been raised for that item; for VMI lines it is true whenever `items.supplier_item_code IS NULL`, which should not normally arise since that field is populated at receiving. This check must run before step 5, because `pick_list_items.item_code` (see `01-core-data-model/design.md`'s `pick_list_items` table) is written once as a permanent snapshot and is never recomputed later. Step 5's snapshot is the last point in the generation sequence where a provisional/fallback internal `items.code` could still be corrected before it is baked, unrecoverably, into a priced, customer-facing `pick_list`/`acknowledgement_receipt` document. A blocked line SHALL surface a recoverable "pending PO/DSGC-number assignment" attention state directing the user to complete that item's DSGC-number assignment before retrying generation; it SHALL NOT allow the rest of the requested lines to generate a partial pick list.

**Quantity semantics at Stage 1.** `qty_available = qty_remaining − qty_committed` is derived by the `lot_inventory_totals` view and is never stored as a column. Stage 1 increments `qty_committed` only; `qty_remaining` is not touched. On-hand stock remains physically and systemically on the shelf. The cross-row invariant `qty_committed ≤ qty_remaining` is enforced by the locking/version-check transaction, not by a single-table CHECK constraint alone.

It does not decrement on-hand inventory or insert the final `pick` transaction. A duplicate idempotency key returns the existing committed result. A stale selection/plan returns a conflict requiring fresh allocation.

## 7. Physical pick confirmation and Stage 2 dispatch scan/transaction

The floor pick view reads the committed pick list and presents one expected location task at a time. It is a preparation view only: the operator stages the committed boxes and confirms the pick is complete. It does not expose a barcode/QR input, camera scanner, scan-validation command, or box-selection mutation. That confirmation transitions the pick list from `allocated` to `picked` and places it in the To Dispatch queue; it does not establish physical-unit identity or alter inventory.

The dispatch view presents the same separate location tasks and requires the exact-box scan for each committed `number_of_boxes`. Each accepted scan resolves a durable `inventory_units.unit_id` and is accepted only when that exact box is `available` and its lot/location match the current `pick_list_items` row. Acceptance marks the unit `selected` for that pick-list item; duplicate, wrong-lot, wrong-location, and already-selected boxes fail safely. When a lot is split across locations, its committed allocation already produces separate pick-list items, so the UI shows separate location cards and dispatch decrements each corresponding balance row. Local scan observations may be stored as Tier 1 only after `03` approval; they are not final inventory outcomes.

After every line has exactly `number_of_boxes` accepted dispatch scans, the floor user or supervisor can submit the final dispatch command. The command receives the pick-list ID and server-recorded accepted units; browser-supplied line identifiers do not establish box identity. It reuses the accepted dispatch evidence and does not request a second scan.

**`dispatch` disposition.** The final dispatch command rechecks:

- current actor/capability/scope;
- pick-list status and commitment ownership;
- accepted dispatch-scan, item/barcode/lot/location identity;
- quantities and any approved partial/exception rule;
- current lot status, selected lot/location balance, and reservation state;
- required pricing/document snapshot availability.

On successful dispatch, one atomic transaction:

1. decrements `lot_location_balances.qty_remaining` by the executed quantity for each affected row;
2. decrements `lot_location_balances.qty_committed` by the same quantity (releasing the reservation);
3. transitions each `inventory_commitment_line` to `executed` and sets `qty_executed`;
4. transitions the `inventory_commitments` header to `executed` and stamps `completed_at`;
5. inserts an immutable `inventory_transactions` row with `movement_type = 'pick'` and `pick_list_id` set to the dispatched `pick_lists.id` (the pick list being dispatched is already known at this point in the command);
6. transitions the `pick_list` to `dispatched`;
7. emits the document-generation event/command for `10`.

**`pick_list_id` on the recorded transaction.** `01-core-data-model/design.md`'s `inventory_transactions` table gained a nullable `pick_list_id` column (added 2026-08-07) mirroring the existing `wrr_id` column's role for incoming movements: `wrr_id` links an incoming transaction to its vendor via `wrr_documents.vendor_party_id`, and `pick_list_id` is the symmetric link for an outgoing transaction to its customer via `pick_lists.customer_party_id`. Step 5 above is where this column is populated — the dispatch command already holds the `pick_list` reference it is executing, so no lookup or backfill is required. This closes an asymmetry that existed before 2026-08-07: incoming transactions could already be traced to a vendor party through `wrr_id`, but outgoing transactions had no equivalent document link to the customer.

Email or PDF generation failure cannot roll back the committed stock movement; the document remains in an observable retry/attention state.

There is intentionally no outbound inspection disposition. If stock requires aging or internal inspection, it must be resolved by `11` before it is selected and committed for picking. Once scans are accepted, dispatch is direct.

## 8. Pricing and document boundary

`08` consumes a typed pricing result/snapshot; it does not calculate a final Trading price or VMI billing amount.

- Trading price on the acknowledgement receipt is final for that document, supplied by `13`.
- VMI price on the document is a per-release reference only. The authoritative VMI bill is the period-average calculation owned by `12`.
- Supplies pricing/reference behavior must be explicitly defined by its owning requirements before any non-zero document semantics are implemented.
- `10` owns the pick-list and acknowledgement-receipt layouts, artifact storage, print behavior, and safe re-generation. `08` owns the event that makes the document eligible.

## 9. Outgoing ledger design

The Outgoing Ledger is a read-only, scope-filtered query over `inventory_transactions`, primarily `movement_type = 'pick'`. Transfer rows are included only under the final transfer/ledger contract. It joins approved pick-list, item, lot, location, party, user, and acknowledgement-receipt references without becoming a mutable reporting table.

**Reached via `/inventory`, not a separate route (updated 2026-08-09).** The Outgoing Ledger is the "Ledger" tab on `inventory/page.tsx`, alongside the "Pick Lists" tab (the list of committed pick lists). There is no standalone `/outgoing-ledger` route — see §3's route block.

Item code is the prominent first field in office review. Floor screens do not use the ledger's dense table; they use task cards and scan feedback.

**Column list (added 2026-08-08)**, mirroring `07-incoming-receiving`'s Incoming Ledger column list and `01-core-data-model`'s `location_transaction_ledger`/`party_transaction_ledger` field set/Reference-column convention (design.md §3 item 4), so all of this project's transaction-ledger surfaces read consistently:

| Column | Source |
| --- | --- |
| Date/time | `inventory_transactions.created_at` (dispatch event timestamp) |
| Transaction # | `inventory_transactions.transaction_number` |
| Item code | `items.code` via `inventory_transactions.item_id` — prominent first field per the paragraph above |
| Item name | `items.name` |
| Lot number | `lots.lot_number` via `inventory_transactions.lot_id` |
| Qty | `inventory_transactions.qty` |
| From location | `locations.label` via `inventory_transactions.from_location_id` |
| Pick list # | `pick_lists.pick_list_number` via `inventory_transactions.pick_list_id` |
| Customer party | `parties.name`/`code` via `pick_lists.customer_party_id` |
| Acknowledgement receipt # | `acknowledgement_receipts.document_number`, resolved via the same `pick_list_id` (per `10`) |
| Performed by | `performed_by_user_id` resolved to display name |
| Reference | `inventory_transactions.ar_reference_no` |

`to_location_id` is not shown — outgoing/dispatch movements leave the warehouse (no destination location within the facility), so this column is intentionally omitted rather than displayed empty. Flow type (`inventory_transactions.flow_type`) is available for filtering (VMI/Trading/Supplies) but not a default visible column, same as the Incoming Ledger. Once the transfer/ledger contract referenced above is finalized, transfer rows (`movement_type = 'transfer'`) will need their own `from`/`to` location pair shown instead of the pick-list columns — flagged here, not yet resolved.

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
