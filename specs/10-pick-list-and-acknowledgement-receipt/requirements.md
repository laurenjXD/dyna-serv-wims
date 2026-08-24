# Pick List & Delivery Receipt / Acknowledgement Receipt — Requirements

Status: Approved
Updated: 2026-08-25 — Multi-item pick-list draft and generation amendment

## 1. Purpose and scope

This feature defines the content, generation, storage, printing, access, and lifecycle of the two outbound documents:

- **`pick_list`** — an operational, priced document used to execute the committed physical pick.
- **`acknowledgement_receipt` (Delivery Receipt / Acknowledgement Receipt)** — a priced document generated in-system and printed for physical signature at handoff.

Documents are generated synchronously inline from authoritative workflow snapshots; nightly background cleanup purges orphan transient artifacts. Document records (`generated_documents`) are retained **permanently via tiered retention** (3 years hot in Supabase, then archived off-platform with hash verification before removing the hot copy).

### Multi-item pick-list source rule

One generated pick list represents one committed outbound request for one Organization and Inventory Model, and may contain multiple item-code lines and multiple lot/location source lines. The pre-generation draft belongs to `08`'s Master Inventory Pick Lists tab and is not a document or inventory record. The PDF is generated only from the committed multi-line `pick_list` snapshot; it never authorizes or substitutes for the reservation command.

### Terminology Alignment
Across all user-facing document screens, forms, headers, previews, and PDFs:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.
- **Delivery Receipt / Acknowledgement Receipt** replaces Acknowledgement Receipt in user-facing labels.

*(Note: `parties`, `flow_type`, and `acknowledgement_receipt` remain canonical database identifiers.)*

## 2. Actors and access surfaces

- **Warehouse staff** — use pick lists on floor handheld devices (`/pick-lists/[id]/pick`).
- **Office staff/supervisors** — generate, print, reprint, review, and manage documents at `/documents`.
- **Organization users** — view authorized documents at `/portal/documents`.

## 3. Document Archive & Sub-tabs

The Documents page (`/documents`) provides an integrated document archive for:
1. **WRRs** (Warehouse Receiving Reports)
2. **Pick Lists**
3. **Delivery Receipts / Acknowledgement Receipts**
4. **Statements of Account** (SOAs)
5. **PEZA Documents**

## 4. Functional requirements

### R1. Pick-list & Delivery Receipt / Acknowledgement Receipt generation

1. Pick lists and Delivery Receipts / Acknowledgement Receipts are generated from committed snapshots in `08`.
2. Synchronous inline PDF generation returns preview links immediately; orphan cleanup runs nightly.
3. Documents include Organization, Inventory Model, line items, quantities, UOMs, prices, and signature blocks. A pick list is read-only: its item, customer-item, lot, location, quantity, SPQ, and package values are selected from Master Inventory by the approved allocation/commitment flow and frozen in the pick-list snapshot; users do not CRUD those values on the pick-list document.
4. Trading document prices are final (`13-trading-orders-and-pricing`). VMI prices are per-release reference values (`12-vmi-billing`).

### R2. Permanent tiered retention policy

1. `generated_documents` entries and PDF files follow permanent retention.
2. 3 years hot storage in Supabase Storage (`generated-documents` bucket); after 3 years, artifacts are archived off-platform with SHA-256 hash verification before deleting from Supabase.

### R3. Visual design & 3-component error feedback

1. Document previews and print templates follow exact design tokens (`#2563EB` primary, `#0F172A` text primary, `#64748B` text secondary, `#FFF7ED` background, `#FFFFFF` surface).
2. All document errors display 3 components: **What happened**, **Why it failed**, and **Next Action / Solution**.

## 5. Acceptance criteria

- [ ] Documents generate synchronously inline with nightly orphan cleanup.
- [ ] User-facing UI labels use Organization, Inventory Model, Organization Portal, and Delivery Receipt / Acknowledgement Receipt exclusively.
- [ ] Permanent tiered retention policy (3 years hot in Supabase, then archived off-platform) is enforced for all generated document artifacts.
- [ ] 3-component error feedback is present on all document generation/download errors.
- [ ] Pick-list detail and print views display Master Inventory-backed item/lot/location/package values without an editable line-data surface.
