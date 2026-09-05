# Pick List & Delivery Receipt / Acknowledgement Receipt — Requirements

Status: Approved
Updated: 2026-08-25 — allocated-to-picked queue amendment

## 1. Purpose and scope

This feature defines the content, generation, storage, printing, access, and lifecycle of the two outbound documents:

- **`pick_list`** — an operational, priced document used to execute the committed physical pick.
- **`acknowledgement_receipt` (Delivery Receipt / Acknowledgement Receipt)** — a priced document generated in-system and printed for physical signature at handoff.

Documents are generated synchronously inline from authoritative workflow snapshots; nightly background cleanup purges orphan transient artifacts. Document records (`generated_documents`) are retained **permanently via tiered retention** (3 years hot in Supabase, then archived off-platform with hash verification before removing the hot copy).

### Multi-item pick-list source rule

One generated pick list represents one committed outbound request for one Organization and Inventory Model, and may contain multiple item-code lines and multiple lot/location source lines. The pre-generation draft belongs to `08`'s Master Inventory Pick Lists tab and is not a document or inventory record. The PDF is generated only from the committed multi-line `pick_list` snapshot; it never authorizes or substitutes for the reservation command.

Generation confirms the committed document in the **To Pick** queue with **View / PDF** and **Mark as Picked**. The document is the non-scan physical picking instruction. Only the explicit Picked confirmation moves it to **To Dispatch** and exposes **Dispatch** before the WRR-style shared-QR count gate.

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

## 3. Document Archive & Sub-tabs (`/documents`)

The Documents page (`/documents`) provides an integrated, office-grade central document archive for internal office staff, supervisors, and administrators.

### 3.1 Sub-tab structure
The Documents surface is divided into five authoritative sub-tabs:

1. **WRRs (Warehouse Receiving Reports)**:
   - Archive of inbound receiving documents (`wrr_documents`).
   - Sourced from inbound receiving workflows (`07-incoming-receiving`).
   - Fields: WRR Document Number (`WRR-YYYY-NNNNNN`), Arrival/Receiving Date, Supplier/Client Organization, Inventory Model, Item Count, Total Quantity, Received By Staff, Status (`draft`, `pending_inspection`, `completed`, `cancelled`).
   - Actions: Open Record Summary, Preview Printable WRR PDF, Download PDF Artifact, Direct Link to `/receiving/[wrr_id]`.

2. **Pick Lists**:
   - Archive of outbound picking instructions (`generated_documents` WHERE `document_type = 'pick_list'`).
   - Sourced from committed outbound allocations (`08-outgoing-withdrawal-and-two-stage-commitment`).
   - Fields: Pick List Number (`PL-YYYY-NNNNNN`), Generation Date/Time, Customer Organization, Inventory Model, Line Item Count, Total Package/Box Count, Authorized By Staff, Status (`allocated`, `picked`, `dispatched`, `cancelled`).
   - Actions: Open Snapshot Detail, View/Print Read-Only PDF, Trigger Reprint with Watermark, Download PDF Artifact.

3. **Delivery Receipts / Acknowledgement Receipts (DR / AR)**:
   - Archive of outbound proof-of-dispatch and physical handoff documents (`generated_documents` WHERE `document_type = 'acknowledgement_receipt'`).
   - Sourced from completed Stage 2 dispatches (`08`) with pricing snapshot from `12` (VMI reference) or `13` (Trading final).
   - Fields: AR Number (`AR-YYYY-NNNNNN`), Dispatch Date/Time, Customer Organization, Inventory Model, Currency, Total Amount (Trading final; VMI reference with disclaimer; Supplies omitted), Dispatched By Staff, Status (`pending`, `generating`, `ready`, `failed`, `voided`).
   - Actions: Open Snapshot Detail, View/Print PDF, Reprint with Watermark, Download PDF Artifact, View Supersession History.

4. **Statements of Account (SOAs)**:
   - Archive of monthly commercial billing statement bundles (`vmi_billing_periods` + `generated_documents`).
   - Sourced from period-close billing calculations (`12-vmi-billing`).
   - Gated by `reporting.financial_read` capability.
   - Fields: Period Identifier (`SOA-YYYY-MM-NN`), Period Date Range (Month/Year), Organization, Total Storage Volume (CBM), Total Incurred Charges (PHP / USD), Issued Date, Closed By Staff, Status (`draft`, `issued`, `settled`, `superseded`).
   - Actions: View Billing Period Breakdown, Download 4-Document PDF Bundle (Statement of Account, CBM Calculation Sheet, Itemized Movement / Storage Ledger, Letter of Authority), View Charge Adjustments.

5. **Logistics & PEZA Documents**:
   - Archive of regulatory compliance, customs, and logistics clearance documents.
   - Cross-referenced against dispatches, transfers, and bonded inventory movements.
   - Fields: Document/Permit Number (e.g. PEZA Form 8105/8106, Boat Note, Gate Pass, Carrier Waybill), Issuance Date, Organization, Movement Type, Expiry / Clearance Date, Status (`active`, `cleared`, `expired`, `cancelled`).
   - Actions: View Permit Details, Link to Associated WRR or Pick List, Download Attached/Generated PDF.

### 3.2 Global Controls & Filter Surface
All sub-tabs share a unified office filtering and search interface:
1. **Search Bar**: Debounced text search matching document numbers, external reference numbers (CIPL, Carrier BL, Client DR), organization names, item codes, and lot numbers.
2. **Organization Selector**: Dropdown filter listing enrolled organizations.
3. **Date Range Filter**: Standard "From" and "To" calendar pickers with quick presets (Today, Last 7 Days, Last 30 Days, This Month, All Time).
4. **Status Filter**: Multi-select or pill toggle filter matching the active tab's document statuses.
5. **Pagination**: Server-driven 25/50/100 items per page with URL search params persistence.

### 3.3 Modal PDF Viewer & Metadata Inspector
1. **Embedded PDF Preview**: Accessible dialog/modal displaying the rendered PDF without requiring local download.
2. **Snapshot Metadata Panel**: Collapsible inspector displaying:
   - SHA-256 Snapshot Hash
   - Template Version and Generation Engine
   - Generation Timestamp (Asia/Manila time)
   - Generating Actor (or System Executor)
   - Correlation ID for distributed tracing
3. **Reprint Workflow**:
   - Office Staff / Supervisor click "Reprint".
   - System prompts for confirmation.
   - Generates an append-only `document_events` entry (`event_type = 'reprinted'`, actor, timestamp).
   - Serves artifact with mandatory diagonal watermark: `REPRINT — [ISO Timestamp Asia/Manila]` at 20% opacity.

## 4. Functional requirements

### R1. Pick-list & Delivery Receipt / Acknowledgement Receipt generation

1. Pick lists and Delivery Receipts / Acknowledgement Receipts are generated from committed snapshots in `08`.
2. Synchronous inline PDF generation returns preview links immediately; orphan cleanup runs nightly.
3. Documents include Organization, Inventory Model, line items, quantities, UOMs, prices, and signature blocks. A pick list is read-only: its item, customer-item, lot, location, quantity, SPQ, and package values are selected from Master Inventory by the approved allocation/commitment flow and frozen in the pick-list snapshot; users do not CRUD those values on the pick-list document.
4. Trading document prices are final (`13-trading-orders-and-pricing`). VMI prices are per-release reference values (`12-vmi-billing`).

### R2. Documents Archive Page (`/documents`)

1. The office shell SHALL provide `/documents` under the **Reports** navigation group with `surface: "office"` and `capability: "documents.read"`.
2. The page SHALL render five discrete tabs: WRRs, Pick Lists, Delivery Receipts / Acknowledgement Receipts, Statements of Account, and PEZA Documents.
3. Access to the Statements of Account tab SHALL additionally require the `reporting.financial_read` capability. If a user holds `documents.read` but lacks `reporting.financial_read`, the SOA tab is rendered in a disabled/restricted state with a clear explanation or omitted.
4. All tab views SHALL support unified search, date-range filtering, organization filtering, and status filtering.
5. Document status pills SHALL strictly use brand tokens:
   - Ready / Completed / Dispatched / Signed: `status-available` (`#10B981` / green)
   - Pending / Generating / Allocated / Draft: `status-pending` (`#F59E0B` / amber)
   - Failed / Cancelled / Voided / Expired: `status-held` (`#EF4444` / red)
   - Neutral / Archived: `status-neutral` (`#6B7280` / grey)

### R3. Permanent tiered retention policy

1. `generated_documents` entries and PDF files follow permanent retention.
2. 3 years hot storage in Supabase Storage (`documents` bucket); after 3 years, artifacts are archived off-platform with SHA-256 hash verification before deleting from Supabase.

### R4. Visual design & 3-component error feedback

1. Document previews and print templates follow exact design tokens (`#2563EB` primary, `#0F172A` text primary, `#64748B` text secondary, `#FFF7ED` background, `#FFFFFF` surface).
2. All document errors (retrieval, generation, download, storage timeout) display 3 components:
   - **What happened** (Plain-language description)
   - **Why it failed** (Underlying cause / technical code)
   - **Next Action / Solution** (Actionable resolution step for the user)

## 5. Acceptance criteria

- [ ] Documents generate synchronously inline with nightly orphan cleanup.
- [ ] User-facing UI labels use Organization, Inventory Model, Organization Portal, and Delivery Receipt / Acknowledgement Receipt exclusively.
- [ ] Central Documents page (`/documents`) mounts all 5 sub-tabs (WRRs, Pick Lists, Delivery Receipts / Acknowledgement Receipts, Statements of Account, PEZA Documents) with real database queries.
- [ ] Global search, organization filter, date-range picker, and status filters work across all sub-tabs.
- [ ] PDF preview modal allows viewing, downloading, and printing generated artifacts.
- [ ] Reprint action logs an append-only `document_events` record and displays the required watermark.
- [ ] Statements of Account tab enforces `reporting.financial_read` permission guard.
- [ ] Permanent tiered retention policy (3 years hot in Supabase, then archived off-platform) is enforced for all generated document artifacts.
- [ ] 3-component error feedback is present on all document generation/download errors.
- [ ] Pick-list detail and print views display Master Inventory-backed item/lot/location/package values without an editable line-data surface.
