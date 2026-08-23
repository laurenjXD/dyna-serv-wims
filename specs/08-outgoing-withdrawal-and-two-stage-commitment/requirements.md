# Outgoing Withdrawal & Two-Stage Commitment — Requirements

Status: Approved
Updated: 2026-08-23 (Pallet-selection approval and clean queue amendment)

## 1. Purpose and scope

This feature governs outbound withdrawal from the **Stock View** (Master Inventory) surface through FIFO/FEFO allocation, pick-list generation, commitment, physical picking/dispatch scan, inventory decrement, and handoff to priced **Delivery Receipt / Acknowledgement Receipt** documents.

The core safety rule is two-stage commitment:
- **Stage 1 — commitment:** reserve eligible stock and create the operational `pick_list`; inventory remains physically on hand and is not decremented.
- **Stage 2 — physical dispatch confirmation:** verify physical scan at `/pick-lists/[id]/dispatch`, decrement inventory, release reservation, write immutable pick transaction, and produce priced Delivery Receipt / Acknowledgement Receipt.

### Terminology & Sub-tab Alignment
Across all user-facing outgoing screens, forms, headers, and document references:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.
- **Stock View** replaces Master Inventory.
- **Delivery Receipt / Acknowledgement Receipt** replaces Acknowledgement Receipt in UI labels.
- Outgoing Page Sub-tabs: **Outgoing Ledger**, **Logistics**.

*(Note: `parties`, `flow_type`, and `acknowledgement_receipt` remain canonical database identifiers.)*

## 2. Actors and workflow surfaces

- **Inventory operator** — selects item, destination Organization, Inventory Model, quantity, and allocation action directly from **Stock View** (`/inventory`).
- **Warehouse staff** — executes committed pick/dispatch flows at `/pick-lists/[id]/pick` and `/pick-lists/[id]/dispatch` using portrait handheld screens.
- **Supervisor** — approves FIFO overrides through `09-approval-queue`.
- **Organization user** — views authorized pick lists/documents in **Organization Portal** (`/portal/documents`).

## 3. Sub-Tab Architecture

The Outgoing page (`/outgoing`) features 2 primary sub-tabs:
1. **Outgoing Ledger**: Read-only, paginated audit view of all outbound inventory transactions (`movement_type = 'pick'`).
2. **Logistics**: Active pick list execution queue and dispatch tracking.

## 4. Functional requirements

### R1. Pick-list generation from Stock View

1. An authorized user SHALL initiate pick-list generation directly from **Stock View** (`/inventory`) specifying destination Organization, **Inventory Model** (`vmi`, `trading`, `supplies`), and item quantities.
2. The command SHALL validate active item references, Organization/Inventory Model scope, UOM, and SPQ rules.
3. The command SHALL refuse allocation if `item_code_is_provisional` is true for any requested line, displaying a 3-component error (**What happened**, **Why it failed**, **Next Action / Solution**).

### R2. FIFO/FEFO allocation & Stage 1 commitment

1. Allocation considers only lots with `status = 'available'`.
2. FEFO applies to perishable items, FIFO to non-perishable items.
3. If allocation bypasses FIFO/FEFO, the system SHALL block generation and route an override request to `09-approval-queue`.
4. Stage 1 commitment atomically reserves stock and increments `qty_committed` without decrementing `qty_remaining`.
5. The creation UI SHALL show the recommended FIFO/FEFO source by default and offer an explicit **Choose another pallet** path. An alternate selection requires a reason, identifies one exact lot/location/quantity/version, and remains unreserved until another authorized actor approves it.
6. An approved override SHALL be consumable once only. Pick-list generation SHALL reject an expired, changed, mismatched, self-approved, or already-consumed decision.

### R3. Stage 2 physical pick & dispatch confirmation

1. Picking executes at `/pick-lists/[id]/pick`; physical dispatch executes at `/pick-lists/[id]/dispatch`.
2. Scans verify expected item, lot, location, and barcode. Wrong scans produce 3-component error feedback.
3. Final dispatch confirmation atomically decrements `qty_remaining`, releases `qty_committed`, writes an immutable `pick` transaction, and makes the priced **Delivery Receipt / Acknowledgement Receipt** available for print/download.
4. The physical pallet is scanned once in the execution path. Dispatch SHALL reuse that accepted evidence and SHALL NOT ask the operator to scan the same pallet again.

### R4. Visual design & touch target enforcement

1. Floor screens (`/pick-lists/[id]/pick`, `/pick-lists/[id]/dispatch`) enforce 64px full-width primary CTAs in the bottom third thumb zone, 56px default controls, 16px minimum font size, and zero glassmorphism.
2. Shell navigation is strictly hidden during active scan loops.
3. Surfaces use the cool blue-gray application canvas (`#F3F6FC`) and Level 1 Solid White (`#FFFFFF`) cards with `#2563EB` Vibrant Blue primary accents. Bold titles use DM Sans.

## 5. Acceptance criteria

- [ ] Pick list generation initiates directly from Stock View (`/inventory`).
- [ ] User-facing UI labels use Organization, Inventory Model, Stock View, Delivery Receipt / Acknowledgement Receipt, Outgoing Ledger, and Logistics.
- [ ] Stage 1 commitment increments `qty_committed`; Stage 2 dispatch decrements `qty_remaining` and generates Delivery Receipt / Acknowledgement Receipt.
- [ ] 3-component error feedback is displayed on all validation/scan errors.
- [ ] Visual design system rules (#2563EB, #0F172A, #64748B, #F3F6FC, #FFFFFF, DM Sans + Glacial typography, 64px floor CTAs) are fully satisfied.
- [ ] Alternate-pallet requests cannot reserve stock until approved and can only generate the exact approved one-time allocation.
- [ ] The operator scans the committed pallet once; dispatch does not repeat the same verification scan.
