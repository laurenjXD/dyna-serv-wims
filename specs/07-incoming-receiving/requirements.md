# Incoming Receiving — Requirements

Status: Approved
Updated: 2026-08-23 — automatic WRR queue filtering and simplified page actions

## 1. Purpose and scope

Incoming Receiving governs the inbound lifecycle from an external CIPL/packing-list reference through WRR staging, physical arrival, barcode reconciliation, inbound inspection, receipt confirmation, inventory posting, putaway handoff, and the incoming ledger.

The central safety rule is that staged expected stock is not active inventory. A WRR becomes an authoritative inbound transaction only after the approved physical checks and confirmation command succeed.

### Terminology Alignment
Across all user-facing receiving screens, tabs, forms, and headers:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.
- **Inspection** replaces Daily Inspection.
- Receiving Sub-tabs: **Work Queue**, **Receive** (scan flow), **WRRs** (staged & barcode reprint), **Incoming Ledger**.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Actors and workflow surfaces

- **Back-office receiving/operations user** — encodes CIPL data into a staged WRR, attaches reference documents, sets per-line dispositions, reviews discrepancies, and prints WRRs.
- **Warehouse staff** — uses the WRR at the `receiving_bay`, scans cartons, records inbound observations, and confirms or escalates receipt.
- **Supervisor** — reviews exceptions, non-conformance, and overrides dispositions where authorized.
- **Administrator** — manages master data and system configuration.

The back-office form is an office surface. The physical scan and confirmation flow is a floor surface optimized for portrait handheld scanners (375–430px base width, 64px full-width bottom CTA, 16px minimum text size).

## 3. Sub-Tab Architecture

The Receiving page (`/receiving`) features 4 primary sub-tabs:
1. **Work Queue**: Summary list of staged pending arrivals and in-progress WRRs requiring action.
2. **Receive**: Floor scan flow (`/receiving/[wrr_id]`) for barcode reconciliation, item verification, and store/hold location commit. Navigation is strictly hidden during active scan loops.
3. **WRRs**: Archive and lookup of staged, in-progress, and confirmed WRR records, with barcode label reprinting.
4. **Incoming Ledger**: Read-only, paginated audit view of all inbound inventory transactions (`movement_type = 'receiving'`).

## 4. Functional requirements

### R1. CIPL/WRR pre-receiving staging

1. An authorized back-office user SHALL create a WRR capturing WRR number, CIPL/invoice reference, source Organization, and **Inventory Model** (`vmi`, `trading`, `supplies`).
2. Each expected line SHALL specify item, WRR `lot_number`, expected quantity, UOM, and inbound **disposition** (`store` or `inspect`).
3. Staged WRRs SHALL NOT increment active inventory or available lots.

### R2. Supplier advance-notice intake

1. Consumes `wrr_advance_notices` submitted via the **Organization Portal**.
2. Back-office users SHALL review `pending_review` notices against CIPL and choose to **confirm** (creating/matching a staged WRR line with adjustable declared quantity) or **reject/flag**.
3. Physical barcode scanning of `WAN:<uuid>` payloads matches to the confirmed `wrr_items` line.

### R3. Barcode reconciliation & per-line commit

1. Each carton scan matches against the expected item/line and barcode mapping.
2. Immediate non-success 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**) is displayed on wrong item, unknown barcode, duplicate carton, or Inventory Model mismatch.
3. For `store`-disposition lines, staff MAY use **batch putaway** after one accepted line barcode: the system displays one numbered allocation slot per declared physical carton/pallet. Staff assigns every slot to an active `storage` location before line commit; the numbered slot maps to the stable printed box identity for that WRR line.
4. Each candidate storage location SHALL display current CBM used/capacity, remaining CBM, projected remaining CBM for the proposed allocation, and the item/lot quantities already stored there. A location that cannot fit its proposed allocation SHALL be blocked with a clear capacity error.
5. Batch putaway SHALL require staff to explicitly attest that all declared physical cartons/pallets for the line are present. The total allocated quantity SHALL equal the line's expected quantity. A single accepted barcode opens allocation; the attestation confirms presence while each stable numbered identity retains its assigned location for later exact picking.
6. The existing individual-label scan path remains available for operations that require every label to be scanned at receipt. Each printed QR remains a unique, stable identifier across reprints; batch putaway does not regenerate QR identity.
7. For `inspect`-disposition lines, staff selects an active non-storage `inspection` location and explicitly uses **Hold All** after the same presence attestation. Storage-location capacity allocation is not used for this path.
8. Each line's **Store All** or **Hold All** commit is an explicit, per-line server command.

### R4. Authorization, design system & error feedback

1. All protected actions use capability grants (`receiving.view`, `receiving.confirm`).
2. Floor screens enforce 64px primary CTAs, 16px minimum font size, zero glassmorphism, Solid White (`#FFFFFF`) card surfaces on a cool blue-gray (`#F3F6FC`) canvas.
3. All error states display 3-component error feedback (What, Why, Next Action).
4. The WRR Work Queue status dropdown SHALL apply immediately when its value changes while preserving the selected value in the URL; it SHALL NOT require a separate visible Apply button.
5. Receiving page headers SHALL omit redundant generic Filter actions when contextual filter controls already exist within the active tab.

## 5. Acceptance criteria

- [ ] Receiving sub-tabs (Work Queue, Receive, WRRs, Incoming Ledger) render cleanly.
- [ ] User-facing UI labels use Organization, Inventory Model, Organization Portal, and Inspection exclusively.
- [ ] Batch Store All/Hold All validates declared quantity, presence attestation, active locations, and per-location CBM before posting.
- [ ] Per-line store/hold commits update distributed lot balances and incoming ledger atomically.
- [ ] 3-component error feedback is displayed on all scan and receiving errors.
- [ ] Visual design system tokens (#2563EB, #0F172A, #64748B, #F3F6FC, #FFFFFF) and DM Sans heading + Glacial Indifference body typography are fully applied.
- [ ] WRR status changes refresh the server-filtered queue immediately without a separate Apply action.
