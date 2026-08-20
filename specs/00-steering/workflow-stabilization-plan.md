# Workflow Stabilization Plan

Status: In progress  
Updated: 2026-08-20

## Purpose

Stop fixing isolated screens and restore one coherent, testable operating flow from enrollment through receiving, inventory, picking, dispatch, and reporting.

No workflow is considered complete because a page renders. It is complete only when its server command succeeds, its resulting state appears in the next operational queue, and its stock/document effects are verified.

## Target operating flow

```text
Organization + Item Enrollment
  → WRR staging
  → Receiving scan and per-line receipt commit
  → Available lot/location inventory
  → Pick-list generation and reservation
  → Active Picks
  → Pick scan
  → Dispatch
  → Outgoing Ledger + documents
```

### Ownership rules to keep clear

| Concept | Authoritative record | Must not be confused with |
|---|---|---|
| Item's default organization | `items.default_supplier_party_id` | Actual ownership of a received lot |
| Received lot owner | `lots.owner_party_id` | A user-selected pick-list destination |
| Pick-list customer organization | `pick_lists.customer_party_id` | The item supplier/default organization |
| Available quantity | `qty_remaining - qty_committed` | Quantity physically dispatched |
| Reservation | `inventory_commitments` + `qty_committed` | Inventory deduction |
| Inventory deduction | Dispatch transaction | Pick-list creation |

### Operating decision — enrolled organization in outbound flow

Per the Product Owner direction on 2026-08-20, the **Organization** selected
at item enrollment is the default destination organization for a pick list
generated from that item. The Master Inventory request builder therefore does
not present a second organization selector. The server derives the destination
from `items.default_supplier_party_id` and rejects a client-supplied party that
differs from that enrolled value.

This is a v1 operating default, not a change to historical lot ownership:
`lots.owner_party_id` remains the received-lot owner. Before an organization
is used as an outbound destination in production, it must be an active
organization that the business has classified for that customer/destination
use. If supplier/owner and destination need to differ for an item, the
approved data model must gain a separate default customer/destination field;
do not overload this default silently.

## Immediate stabilization rules

1. Do not add another UI control until its server action, database mutation, and destination queue have a passing test.
2. Do not catch a Next.js `redirect()` in a broad `try/catch`; redirects are control flow, not failures.
3. Every server action must return or render a user-facing three-part error: what happened, why, and next action. Raw Vercel error pages are defects.
4. A pick list is never created unless every reservation line has been atomically written and `qty_committed` has been incremented safely.
5. A created pick list is visible in Active Picks before a user enters the scanner flow.

## Workstreams and implementation order

### 1. Enrollment integrity — first

Goal: organizations and items save reliably and provide valid data to later workflows.

- Keep the enrollment form label as **Organization** while retaining `default_supplier_party_id` as the existing canonical field.
- Decide and document whether it is a default supplier/owner reference, a pick-list customer default, or both. Do not use one field for different business meanings without an approved decision.
- Validate the selected organization exists and is active on the server, not only in HTML.
- Convert item creation/update database exceptions into field/form feedback; log the root cause with a correlation ID.
- Add integration tests: successful item create with organization, inactive/missing organization rejection, duplicate code, duplicate barcode, and edit behavior.

**Exit criteria:** creating and editing an item never produces a blank server-error page; the saved item shows its organization after reload.

### 2. Receiving and QR contract — second

Goal: staff know exactly which label to scan and valid labels reconcile to the intended WRR line.

- Separate labels by purpose in the UI and print layout:
  - WRR document QR: opens/identifies a WRR only.
  - WRR unit QR: counts one physical receiving unit.
  - Lot QR: identifies an already-created inventory lot; it does not receive a new unit.
- Display the decoded label type on rejection; never call a valid WRR document QR an "unknown item."
- Ensure the receiving action joins the enrolled item barcode and accepts the approved `wrr_item_unit` JSON payload.
- Add browser tests using actual generated QR payload strings, including duplicate unit-label rejection.

**Exit criteria:** scan 10 different WRR unit labels → 10/10 scanned; scan the WRR document QR → clear guidance without any quantity change.

### 3. Pick-list generation and reservation — third

Goal: make the Master Inventory action a safe Stage 1 commitment, not a navigation shortcut.

- Replace the current ad-hoc item form with a request builder that shows selected item, requested quantity, inventory model, derived organization context, and FIFO/FEFO allocation preview.
- Use the recorded 2026-08-20 Product Owner decision above for the v1 default
  destination. If the selected organization is not a valid customer/destination
  organization, block generation with a recoverable message rather than
  substituting another organization.
- Requery balances inside the RLS transaction; client-provided lot/location data is only a request.
- Allocate FIFO/FEFO server-side and atomically:
  1. lock/version-check eligible `lot_location_balances` rows;
  2. verify available quantity;
  3. increment `qty_committed`;
  4. insert one `pick_list`, `pick_list_items`, commitment header, and commitment lines;
  5. write correct item, lot, location, SPQ, and price snapshots.
- On success, revalidate Master Inventory and Active Picks, then route to Active Picks.
- On failure, stay in the request builder and show a recoverable error with no partial writes.

**Exit criteria:** an authorized user creates a pick list; stock availability falls by the reserved amount, on-hand quantity does not change, and the list appears exactly once in Active Picks.

### 4. Pick and dispatch lifecycle — fourth

Goal: turn an active pick list into one immutable outgoing movement.

- Active Picks must list each allocated pick list with clear **Start Picking** action.
- Pick scanner validates item, lot, location, and exact committed quantity.
- Dispatch is enabled only after every committed line has validated scan evidence.
- Dispatch atomically decrements `qty_remaining`, releases `qty_committed`, updates commitment/pick-list status, writes one `inventory_transactions` pick row, and triggers documents.
- Outgoing Ledger queries dispatched transactions only; it must not show merely allocated work as dispatched.

**Exit criteria:** one completed pick list produces one outgoing ledger entry and the expected inventory decrease; a repeated dispatch request does not deduct twice.

### 5. End-to-end verification and release gate — last

Run this with a clean, disposable test organization/item/WRR:

1. Enroll organization and item.
2. Stage and receive a WRR using generated unit labels.
3. Confirm available stock and organization/lot context.
4. Generate a pick list for a valid customer organization.
5. Confirm reservation and Active Picks visibility.
6. Scan, dispatch, and verify inventory/ledger/document outcomes.
7. Repeat negative cases: duplicate scan, insufficient stock, inactive organization, expired pick list, and refresh/retry.

Release only after the suite contains unit tests, database/RLS integration tests, and one Playwright happy-path test for this sequence.

## Current issues to resolve before more feature work

- Item enrollment has produced an uncaught server-side error in production; capture its root cause from Vercel logs and add a regression test before changing more enrollment fields.
- The distinction among item default organization, lot owner organization, and pick-list customer organization is not yet settled in the implementation. This must be decided before automatically deriving a pick-list customer.
- Pick-list generation needs a verified server-side allocation transaction and end-to-end test; navigation alone is not evidence of creation.
- The current UI must expose actual command failures rather than refresh/redirect silently.

## Delivery cadence

Complete one workstream at a time: implement → unit test → database/RLS test → browser flow test → user acceptance check. Do not begin the next workstream while the current one has an unclassified production error.
