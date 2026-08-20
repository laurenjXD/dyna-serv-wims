# Transfer & Inspection — Requirements

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Purpose and scope

This feature governs controlled internal movement of inventory between physical `locations` within the warehouse, together with inspection and exception handling specific to transfers and aging inventory.

"Transfer" means location-to-location movement inside the single warehouse. "Inspection" covers both inbound inspection cases (shared data model initialized by `07`) and Daily Inspection of aging inventory.

### Terminology Alignment
Across all user-facing transfer and inspection screens, forms, and headers:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.
- **Stock View** replaces Master Inventory.
- **Inspection** replaces Daily Inspection in UI labels.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Actors and workflow surfaces

- **Requestor/operations user** — creates internal transfer requests with source, destination, items/lots, and quantities.
- **Supervisor/reviewer** — approves transfer requests and resolves inspection candidate queues.
- **Warehouse staff** — executes physical movements and scan confirmations on handheld devices (`/transfers`, `/inspection`).
- **Inspector** — records transfer and aging inspection decisions.

## 3. Functional requirements

### R1. Internal location transfer

1. Authorized users SHALL request movement from one active source location to a distinct active destination location (`/transfers`).
2. Requests specify item, lot, Inventory Model (`vmi`, `trading`, `supplies`), quantity, source, and destination.
3. Server validates source balances, lot status (`available`), and location CBM capacity.

### R2. Inspection & Daily Inspection of aging inventory

1. Single shared inspection record structure (`inspection_cases`, `inspection_evidence`, `inspection_dispositions`).
2. Daily Inspection is initiated directly from the **Stock View** (`/inventory`) dashboard by selecting aging candidate lots.
3. The inspection queue (`/inspection`) displays candidate lots, quarantine reasons, and resolution controls.
4. Split disposition is supported: e.g., for 10 inspected items, 3 may be `reject` (routed to rejects location) and 7 `return_to_stock` (returned to suggested storage location). Total must equal inspected quantity.

### R3. Visual design system & 3-component error feedback

1. Floor scan flows (`/inspection/[inspection_id]`) enforce 64px full-width primary CTAs, 16px minimum text size, and solid surfaces (`#FFF7ED` background, `#FFFFFF` cards).
2. Navigation is strictly hidden during active scan loops.
3. All error states display 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**).

## 4. Acceptance criteria

- [ ] Internal location transfers validate source/destination locations and CBM capacity.
- [ ] User-facing UI labels use Organization, Inventory Model, Stock View, Organization Portal, and Inspection exclusively.
- [ ] Daily Inspection initiates directly from Stock View (`/inventory`).
- [ ] Split dispositions (reject / return_to_stock) enforce total balance equality.
- [ ] 3-component error feedback is present on all scan and validation errors.
