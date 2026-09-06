# Outgoing Withdrawal & Two-Stage Commitment — Requirements

Status: Approved
Updated: 2026-08-25 (allocated-to-picked queue amendment)

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

1. An authorized user SHALL initiate pick-list generation from the **Pick Lists** tab of Master Inventory (`/inventory?tab=pick-lists`). One draft selects exactly one destination Organization and one **Inventory Model** (`vmi`, `trading`, `supplies`).
2. A draft SHALL allow multiple item-code lines. Each line records item code, selected lot/location, quantity in boxes, UOM/SPQ, customer item code, and description. The same item may occupy multiple lines only when a distinct source lot/location is required.
3. The user SHALL review the draft in a table-like queue before generation. Removing or editing a draft line changes only the draft; it does not reserve stock.
4. **Generate Pick List** SHALL validate and commit every draft line atomically into one `pick_list`. It SHALL either reserve all lines and create one document number, or reserve none.
5. On a successful commitment, the system SHALL create the operational pick-list PDF from the committed snapshot and expose it for preview/download/print. A PDF failure must surface document attention without reversing the committed pick list.
6. The command SHALL validate active item references, Organization/Inventory Model scope, UOM, and SPQ rules.
7. The command SHALL refuse allocation if `item_code_is_provisional` is true for any requested line, displaying a 3-component error (**What happened**, **Why it failed**, **Next Action / Solution**).
8. **DRA Document Parsing (Excel & PDF)**: The system SHALL offer an optional Delivery Release Advice (DRA) import in Excel (`.xlsx`, `.xls`, `.csv`) and PDF (`.pdf`) formats prior to pick list generation. The parsing engine SHALL extract requested item codes (`item_code` / `customer_item_code`) and requested box/unit quantities, match them against available inventory balances (`qty_remaining - qty_committed`), auto-suggest FIFO/FEFO lot/location allocations, and present a pre-commitment preview queue highlighting any stock shortages or provisional items for review.

### R2. FIFO/FEFO allocation & Stage 1 commitment

1. Allocation considers only lots with `status = 'available'`.
2. FEFO applies to perishable items, FIFO to non-perishable items.
3. If allocation bypasses FIFO/FEFO, the system SHALL block generation and route an override request to `09-approval-queue`.
4. Stage 1 commitment atomically reserves stock and increments `qty_committed` without decrementing `qty_remaining`.
5. The creation UI SHALL show the recommended FIFO/FEFO source by default and offer an explicit **Choose another pallet** path. An alternate selection requires a reason, identifies one exact lot/location/quantity/version, and remains unreserved until another authorized actor approves it.
6. An approved override SHALL be consumable once only. Pick-list generation SHALL reject an expired, changed, mismatched, self-approved, or already-consumed decision.

### R3. Physical picking and Stage 2 dispatch confirmation

1. Pick-list generation produces the operational PDF instructions and creates an `allocated` `pick_list`, not a dispatch-ready one. It returns to the Pick Lists tab with a confirmation and exposes **View / PDF** and **Mark as Picked** beside the list.
2. After the warehouse team physically picks the PDF’s committed lines, an authorized user SHALL use **Mark as Picked**. The system transitions only that list from `allocated` to `picked`; it does not scan, decrement inventory, or alter the reservation. Only then does the list appear in the **To Dispatch** queue and expose **Dispatch**.
3. Dispatch is the sole scan gate. It SHALL follow WRR-style reconciliation: each scan accepts the shared registered item QR/code or the committed lot QR, automatically matches it to the corresponding incomplete committed item/lot/location line, and increments that line’s dispatched-box count by one. The same shared QR may be scanned repeatedly until the required box count is reached.
4. Final dispatch confirmation is enabled only after every committed box has been accepted at dispatch. It atomically decrements `qty_remaining`, releases `qty_committed`, writes an immutable `pick` transaction, and makes the priced **Delivery Receipt / Acknowledgement Receipt** available for print/download.
5. A shared QR scan is counted as one box at dispatch. The system SHALL retain the aggregate accepted count for the final command, reject wrong item/lot/location QR values and over-quantity scans, and SHALL NOT require a second verification scan.
6. When one lot/pallet is stored across multiple locations, Dispatch presents a separate line and box count for each committed location. The lot QR identifies its matching location line; when the shared item QR matches more than one line, the server counts the first incomplete matching line. The server allocates the counted box against that line’s authoritative lot/location balance.

### R4. Visual design & touch target enforcement

1. Floor screens (`/pick-lists/[id]/pick`, `/pick-lists/[id]/dispatch`) enforce 64px full-width primary CTAs in the bottom third thumb zone, 56px default controls, 16px minimum font size, and zero glassmorphism.
2. Shell navigation is strictly hidden during active scan loops.
3. Surfaces use the cool blue-gray application canvas (`#F3F6FC`) and Level 1 Solid White (`#FFFFFF`) cards with `#2563EB` Vibrant Blue primary accents. Bold titles use DM Sans.
4. The Outgoing page header SHALL omit a generic Filter button when the active view exposes no corresponding filter panel; only contextual, functioning controls SHALL be displayed.
5. The active work surface SHALL present allocated documents in a distinct **To Pick** queue and picked documents in a distinct **To Dispatch** queue. Each queue SHALL retain its own count, empty state, status treatment, and phase-correct action.

### R5. Outgoing Ledger & Delivery Conformance KPI

1. The Outgoing Ledger (`/outgoing?tab=ledger`) SHALL present an interactive KPI card computing overall Delivery Conformance Rate:
   $$\text{Conformance Rate (\%)} = \left(\frac{\text{Conforming Dispatches (Signed POD Uploaded)}}{\text{Total Dispatched Shipments}}\right) \times 100$$
2. The KPI card SHALL feature an interactive dropdown filter allowing operators to toggle the transaction view between:
   - **All Dispatches**: displays all completed outgoing transactions.
   - **Conforming — Signed DR Attached**: filters transactions to only dispatches with confirmed uploaded/approved PODs.
   - **Pending POD / Missing DR**: isolates dispatches lacking physical proof-of-delivery documents for priority follow-up.
3. The KPI card SHALL provide a direct navigation link to the Delivery Conformance Trend Line Graph on the Reports page (`/reports#conformance`).

## 5. Acceptance criteria

- [ ] Pick list generation initiates directly from Stock View (`/inventory`).
- [ ] A Pick Lists-tab draft supports one Organization and multiple item-code/source-location lines, then commits them as one atomic pick list.
- [ ] A successful committed multi-item pick list exposes its generated PDF without using the PDF as the source of inventory truth.
- [ ] User-facing UI labels use Organization, Inventory Model, Stock View, Delivery Receipt / Acknowledgement Receipt, Outgoing Ledger, and Logistics.
- [ ] Stage 1 commitment increments `qty_committed`; Stage 2 dispatch decrements `qty_remaining` and generates Delivery Receipt / Acknowledgement Receipt.
- [ ] 3-component error feedback is displayed on all validation/scan errors.
- [ ] Visual design system rules (#2563EB, #0F172A, #64748B, #F3F6FC, #FFFFFF, DM Sans + Glacial typography, 64px floor CTAs) are fully satisfied.
- [ ] Alternate-pallet requests cannot reserve stock until approved and can only generate the exact approved one-time allocation.
- [ ] Dispatch accepts repeated scans of a matching shared item/lot QR, increments the correct line, and rejects wrong or over-quantity scans without requiring unique box QR labels.
- [ ] The operator scans every committed physical box once at dispatch; the final dispatch command reuses that accepted evidence without a duplicate verification scan.
- [ ] The Outgoing header contains no non-functional or redundant generic Filter action.
- [ ] Allocated and picked documents are visually separated into To Pick and To Dispatch queues and cannot expose the wrong phase action.
- [ ] Generation creates an allocated list in To Pick; only the explicit non-scan Mark as Picked action moves it to To Dispatch and enables Dispatch.
- [ ] Outgoing Ledger displays Delivery Conformance KPI card, live status filter dropdown, and direct link to dashboard conformance line graph.
