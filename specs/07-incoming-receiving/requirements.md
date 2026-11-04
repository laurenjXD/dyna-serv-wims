# Incoming Receiving — Requirements

Status: Approved
Updated: 2026-11-04 (Product Owner decision: carton destination is authoritative; the floor Hold toggle is retired).

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
2. **Receive**: Floor scan flow (`/receiving/[wrr_id]`) for barcode reconciliation, item verification, and carton destination commit. Navigation is strictly hidden during active scan loops.
3. **WRRs**: Archive and lookup of staged, in-progress, and confirmed WRR records, with barcode label reprinting.
4. **Incoming Ledger**: Read-only, paginated audit view of all inbound inventory transactions (`movement_type = 'receiving'`).

## 4. Functional requirements

### R1. CIPL/WRR pre-receiving staging

1. An authorized back-office user SHALL create, edit, and delete a pre-receiving WRR capturing its CIPL/invoice reference, MAWB/MBL, IP reference, source Organization, and **Inventory Model** (`vmi`, `trading`, `supplies`). The actual received date is system-recorded at receipt confirmation, not manually editable.
2. Each expected line SHALL specify the selected item (showing Dyna-Serv and supplier item codes), customer item code, WRR `lot_number` (the shipping lot), optional manufacture date, expected total base-unit quantity, UOM, and optional remarks. The expected total is authoritative; the complete-carton QR count is derived and server-validated as `expected_qty / enrolled items.spq`. No expected-carton field is required or persisted on the WRR. Actual received quantity/UOM is derived from accepted scans/receipt confirmation and is never a free-form inventory adjustment.
3. Staged WRRs SHALL NOT increment active inventory or available lots.

### R1a. CIPL Document Parsing (Excel & PDF)

1. The system SHALL provide an option to import Commercial Invoice and Packing List (CIPL) document files in Excel format (`.xlsx`, `.xls`, `.csv`) and PDF format (`.pdf`) during WRR pre-receiving staging.
2. The document parsing engine SHALL extract header references (Invoice/CIPL Reference, Invoice Date, Organization Code, MAWB/MBL) and tabular expected line items (`item_code` / `customer_item_code`, `lot_number`, manufacture date, expiry date, source package count as import metadata, expected total base-unit quantity, UOM, remarks, and disposition `store` or `inspect`). When a source provides package count and the enrolled SPQ is known, the importer MAY derive total units as `package_count × SPQ`; when SPQ is unavailable, the expected total remains unresolved for back-office review. It SHALL never silently treat cartons as total units.
3. Parsed lines SHALL be validated against active `items` master data. Unrecognized item codes SHALL be highlighted with recoverable recovery options (navigate to enrollment or manually select registered item code).
4. The system SHALL render a pre-import verification table displaying extracted values, validation statuses, and error warnings before populating the staged WRR lines form.
5. Populating expected lines from a parsed document SHALL pre-fill draft fields only and SHALL NOT skip back-office review or bypass receipt confirmation invariants.

### R1b. Inventory Model-specific source Organization (approved 2026-10-22)

1. The WRR/CIPL form SHALL identify the source **Organization first** and SHALL inherit the Inventory Model from that Organization's single active receiving relationship. The operator SHALL NOT be offered a free-choice Inventory Model control.
2. The valid source relationships are **VMI Customer** for VMI, **Supplier** for Trading, and **Internal Supplies** for Supplies. The Organization field SHALL contain only active, authorized Organizations; an Organization with no valid relationship or multiple active receiving models SHALL be blocked with a master-data recovery state.
3. The server SHALL derive and re-check the inherited model transactionally and SHALL reject any direct action payload whose submitted model differs from the selected Organization's resolved model.
4. Changing source Organization SHALL clear incompatible dependent values and expected lines after an explicit discard confirmation; the displayed Inventory Model SHALL update from the newly selected Organization.
5. The server SHALL repeat active status, role/relationship, actor scope, item/Inventory Model, and stale-version validation before persisting a WRR. Legacy `vendor_party_id` remains a compatibility storage field only; it must not dictate user-facing terminology.
6. Expected-line item recommendations SHALL contain only active materials assigned to the selected source Organization. An unassigned or differently assigned material SHALL be excluded from the picker and rejected if submitted by a tampered client; the recovery action is to assign it in Material Enrollment.

### R2. Supplier advance-notice intake

1. Consumes `wrr_advance_notices` submitted via the **Organization Portal**.
2. Back-office users SHALL review `pending_review` notices against CIPL and choose to **confirm** (creating/matching a staged WRR line with adjustable declared quantity) or **reject/flag**.
3. Physical barcode scanning of `WAN:<uuid>` payloads matches to the confirmed `wrr_items` line.

### R2. WRR printing and arrival

1. The system SHALL generate a printable WRR containing a stable WRR reference, expected lines, quantities/UOMs, party and regulatory references, and the fields required by the approved paper workflow.
2. Printing SHALL not imply receipt or create inventory.
3. Staff SHALL be able to open a staged WRR and start receiving at a `receiving_bay` context.
4. Starting receiving SHALL transition the WRR to `receiving_in_progress` through an authorized server command and SHALL be safe to retry.
5. The floor flow SHALL clearly show the WRR being received, expected lines, scanned quantities, remaining quantities, and exceptions.

### R2a. Batch carton placement — authoritative destination model (Product Owner decision, adopted 2026-11-04; supersedes the 2026-08-24 line-level Store/Hold wording)

**History**: a 2026-08-20 Product Owner decision temporarily narrowed `07`'s commit grain from whole-line to individual physical unit (former R3.8-R3.13, implemented and real-Postgres-verified 2026-08-21). A separate branch (`fix-it-felix`) subsequently proposed reverting to a whole-line, batch-placement model instead; the two were merged together on 2026-08-24 as a genuine unresolved contradiction (§5a Item 3). The Product Owner has since resolved that contradiction: **this batch model is authoritative; the per-unit model is retired.** The per-unit implementation (`commitStoreUnit`, `commitInspectLine`, and the per-unit idempotency-key machinery) has been deleted from the codebase; `commitWrrLine` (`lib/actions/receiving.ts`) is now the one authoritative commit function for both dispositions.

1. Barcode reconciliation is unchanged from R3.1-R3.7: each carton/pallet scan is matched against the expected item/line and barcode mapping, with the same 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**) on wrong item, unknown barcode, duplicate carton, over-quantity, or Inventory Model mismatch.
2. Once a line has at least one accepted scan matching its expected item, staff MAY place the line's entire derived carton count (`expected_qty / enrolled items.spq`) in one step, without individually re-scanning every remaining carton. The system displays eligible active storage and inspection locations; storage candidates include the approved CBM/capacity information.
3. Staff assign every declared carton by index to an active `storage` location, an active `inspection` location, or `Missing`. The assigned total may be lower than the derived count only when the remaining indexed slots are explicitly Missing; invalid, inactive, wrong-type, or over-capacity locations are rejected before anything is posted.
4. A single explicit server command ("Confirm carton placement") commits the whole line at once. It creates available and/or quarantined lot segments, one `lot_location_balances` row per assigned location, one durable `inventory_units` row per non-Missing carton, and one `inventory_transactions` row per assigned location, all in one transaction.
5. Staff SHALL explicitly attest that the submitted carton placement is accurate. The attestation covers both physically present cartons and cartons marked Missing.
6. The existing individual-label scan path (R3.1-R3.7) remains available and required for barcode reconciliation before a line becomes eligible for carton placement; placement does not bypass the line-identifying scan. Each printed QR remains a unique, stable identifier across reprints, and the indexed box-to-unit mapping is derived deterministically from the WRR line and box index.
7. The location type selected for each carton determines its inventory status: storage is available, inspection is quarantined and opens an inbound inspection case, and Missing creates no inventory.
8. Each line's carton-placement commit is an explicit, idempotent, per-line server command; a retried or duplicate commit request returns the original authoritative result rather than posting inventory a second time.

### R3. Barcode reconciliation

1. Each carton scan SHALL be matched against the WRR's expected item/line and the approved barcode/item identity mapping.
2. The system SHALL track scanned cartons versus expected cartons per WRR line and SHALL display the expected total base-unit quantity separately. It SHALL prevent silent over-receipt.
3. A scan for the wrong item, unknown barcode, wrong WRR, duplicate carton, quantity beyond the expected amount, or (**added 2026-08-10**) a scanned item whose own `flow_type` does not match the WRR's `flow_type` SHALL produce immediate non-success feedback and a recoverable exception state, through the same rejection path.
4. Manual entry MAY be available as a controlled recovery path when scanning fails, but it SHALL use the same server validation and audit path.
5. A receipt SHALL not be confirmable while required lines, unresolved exceptions, or required inspection decisions remain outstanding, unless an explicitly approved discrepancy workflow allows it.
6. Scan capture MAY be Tier 1 offline work only after its exact command and owning workflow are approved by `03-offline-mode-and-client-storage`.
7. Scan capture SHALL not by itself create lots, increment active inventory, or finalize the inbound ledger.
8. **Amended 2026-11-04:** WHEN at least one physical carton on a line has been scanned and matches its expected WRR line, THE SYSTEM SHALL display every active Storage location with available remaining CBM capacity plus active Inspection locations, SO THAT staff can assign each declared carton to Storage, Inspection, or Missing before confirmation.
9. **Amended 2026-11-04:** WHEN staff assigns carton destinations, THE SYSTEM SHALL require one indexed destination per declared carton: an active Storage location, an active Inspection location, or Missing. Missing is recorded as an OS&D shortage and is not an inventory location.
10. **Amended 2026-11-04:** WHEN staff taps "Confirm carton placement", THE SYSTEM SHALL commit the whole line immediately as one atomic step, creating available and/or quarantined lot segments, balances and inventory units for non-Missing cartons, an inspection case for Inspection cartons, and an OS&D discrepancy for Missing cartons, with visible per-line confirmation.
11. **Amended 2026-11-04:** WHEN one line contains Storage and Inspection cartons, THE SYSTEM SHALL create separate available/quarantined lot segments sharing the same business `lot_number`, with destination-specific balances, transactions, and carton statuses.
12. **Superseded 2026-08-24 — the per-unit commit mechanism this item depended on no longer exists.** The 2026-08-20 proposal for a per-unit "Hold" action on an otherwise `store`-disposition line (quarantining one individually scanned unit while the rest of the same line proceeded to Store) was never implementable under `01-core-data-model`'s one-lot-per-line status model (§5a Item 2, still unresolved on its own terms) and is now additionally moot: the per-unit commit loop it would have attached to (former R3.10) has been retired in favor of R2a's whole-line batch commit, which has no per-unit commit event at all to hook a per-unit override into. If the underlying operational need — excluding part of a line's physical quantity from an otherwise-conforming Store commit — still matters, it is a new requirement against the batch model, not a restatement of this one; see §5a's new Item 4, which is explicitly not resolved here.

### R4. Unknown or unregistered item handling

1. If a physical barcode does not resolve to an active `item`, the system SHALL pause that line and explain the exception.
2. The floor flow SHALL offer only the approved recovery path: navigate to the online `06-party-and-item-enrollment` workflow for an authorized enrollment, or record an exception for back-office resolution.
3. New item enrollment SHALL not be silently performed as an unaudited receiving-side mutation and SHALL not be available through the offline queue.
4. After enrollment, the receiving user SHALL revalidate the item and barcode against the WRR before continuing; the system SHALL not assume the previously rejected scan is valid.
5. If the item cannot be resolved, the receipt remains incomplete or enters the approved discrepancy/non-conformance path.

### R5. Inbound receiving disposition

1. Each WRR line SHALL carry a legacy-compatible **disposition** value — either `store` or `inspect` — for pre-receiving defaults and compatibility. The carton destination selected during placement determines the committed lot status and posting location.

2. **Storage destination**: the carton is posted to an available lot segment and is eligible for FIFO/FEFO allocation.

3. **Inspection destination**: the carton is posted to a quarantined lot segment at the selected `inspection` location, is excluded from FIFO/FEFO allocation, and opens an inbound inspection case.

4. The `inspection` location is a specific `locations` record with `location_type = 'inspection'`; it holds its own `lot_location_balances` rows for all quarantined inbound stock. It is not a virtual marker — it is a real enrolled location record.

5. The legacy disposition is set per WRR line. The back-office user MAY set or override it before physical receiving begins, but it does not override the carton destinations submitted at placement.

6. Mandatory inspection SHALL be enforced automatically when: (a) the item master record carries an inspection-required flag, (b) the flow or party configuration requires inspection, or (c) a supervisor explicitly flags the line during receiving; in those cases every non-Missing carton must be assigned to an active inspection location.

7. Inspection resolution — pass, fail, return, or hold — for quarantined lots is owned by the shared inspection capability. `11-transfer-and-inspection` is the shared inspection handler for disposition evidence, resolution decision, and outcome recording; `07` initiates the inspection case event at commit time but does not own the resolution logic.

8. A receipt with lines of mixed destinations MAY be confirmed as a single commit provided all mandatory scan prerequisites are met for each line individually.

### R5a. Visual receiving inspection and immediate dispositions

1. During physical Receiving, staff SHALL visually inspect every scanned line for visible damage, wrong item/code, quantity or packaging mismatch, labeling mismatch, and other observable non-conformance; barcode success alone is not visual inspection.
2. A conformant quantity continues through `store` or `inspect`. A non-conformant quantity SHALL receive exactly one immediate disposition: `on_hold` or `reject`.
3. `on_hold` SHALL remain non-available pending final disposition and SHALL require a controlled reason and mandatory remarks before save.
4. `reject` SHALL route the exact quantity to a designated rejects `location`, then create an auditable Return to Vendor (RTV) workflow linked to the WRR line, `lot_number`, quantity, reason, remarks, actor, and timestamps. Rejected quantity SHALL not become available.
5. Visual results and dispositions SHALL be quantity-splittable and retained in the receiving inspection record. RLS must inherit the WRR party/flow scope; UI hiding is not the security boundary.

### R6. Inbound inspection and conformance

1. The system SHALL support inspection of inbound goods at the `inspection` location/context before active inventory is posted where the approved flow requires it.
2. A conformance result SHALL identify the WRR, line/item, party, actor, timestamp, and result.
3. A non-conformance result SHALL require an approved reason, remarks where required, and evidence attachment where required by the final design.
4. Non-conformance reasons SHALL use the approved enum/reference, including TDC defect, quantity mismatch, damaged carton, wrong item code, missing paperwork, and other where retained by core design.
5. Goods marked non-conformant SHALL not become available inventory until an approved resolution changes their state; the resolution may be quarantine, return-to-party, correction, or another explicitly defined action.
6. A conformance result SHALL permit the matching receipt line to proceed to confirmation and putaway recommendation.
7. Inbound inspection records SHALL remain distinct from transfer/other inspection workflows owned by `11-transfer-and-inspection`.

### R7. Receipt confirmation and inventory commit

1. **Amended 2026-11-04:** a line's carton-placement commit SHALL be a single explicit, authorized server command with one primary floor action, executed once per line.
2. **Amended 2026-11-04:** each line's commit SHALL atomically validate scan/conformance state, active item/party references, flow partition, required lot metadata, the exact derived carton count, every assigned location's active/type state, storage capacity where applicable, the indexed placement total, and the placement attestation before posting the whole line.
3. On a successful commit, storage cartons create available lot stock, inspection cartons create quarantined lot stock and an inspection case, and Missing cartons create no inventory. A mixed line creates separate available/quarantined lot segments sharing the business `lot_number`; each assigned location receives its own balance and receiving transaction, and each non-Missing carton receives one inventory-unit row. The `lot_location_balances` rows created by each commit are the authoritative source for `lot_inventory_totals`. The WRR transitions to `confirmed` only once every line has reached a terminal committed (or cancelled/discarded, per the existing cancellation path) state.
4. Regulatory and source references approved for inheritance SHALL carry from the WRR to the resulting lot/transaction records without changing their historical meaning.
5. **Amended 2026-11-04:** each carton-placement commit SHALL be idempotent, scoped to that line: retries or lost responses SHALL not create duplicate lots, duplicate `lot_location_balances` rows, duplicate `inventory_units` rows, or duplicate ledger transactions for that line. The conditional `wrr_items.committed_at` `NULL → non-NULL` claim remains the idempotency gate.
6. **Amended 2026-11-04:** a failed carton-placement commit SHALL leave no partial outcome for that line and SHALL return a safe recoverable error; it SHALL NOT roll back or otherwise affect any other line's already-committed state.
7. Non-conformant quantities SHALL not be posted as available inventory unless the approved resolution explicitly permits a different status/path.
8. The receipt commit SHALL not finalize Trading document prices or VMI period billing; those semantics belong to `13` and `12`.

### R8. Putaway handoff

1. **Amended 2026-11-04:** the system SHALL provide the approved Storage recommendation once the line has at least one accepted scan, before the line's single carton-placement commit.
2. Recommendations SHALL use approved `locations`, item `volume_cbm`, active capacity, flow/lot constraints, and any FIFO/FEFO rules defined by the owning inventory design. The selector SHALL also expose active Inspection locations and Missing as the shortage outcome.
3. A recommendation SHALL not be represented as completed putaway until that line's carton-placement commit (R7) confirms it.
4. Completed putaway SHALL be recorded through the owning inventory transaction boundary with `movement_type = 'putaway'` where applicable.
5. Receiving SHALL not introduce a second location/capacity model or a `warehouse_id`.
6. **Amended 2026-11-04**: a line's declared quantity MAY be distributed across more than one Storage or Inspection location in one carton-placement commit; the WRR line's `putaway_location_id` field is set only for a whole-line single-Storage commit and is left unset otherwise — `lot_location_balances` and `inventory_units` are the authoritative destination records.

### R9. Incoming ledger and review

1. The Incoming Ledger SHALL be a filtered view of the authoritative `inventory_transactions` ledger, not a duplicate receipt ledger.
2. It SHALL support receiving and putaway movements and show date/time, item code, description, canonical `lot_number` where authorized, quantity/UOM, WRR reference, source party, flow type, and performing user.
3. It SHALL support date range, party, flow, item/code, and WRR/CIPL reference filters according to the caller's capability/scope.
4. A row/detail view MAY show locations, conformance, discrepancies, and related WRR references only when the caller is authorized to see them.
5. The ledger SHALL be read-only; corrections create approved new records/transactions and do not edit or delete immutable history.

### R10. Authorization, audit, and privacy

1. All staging, scanning, inspection, confirmation, cancellation, attachment, and ledger reads SHALL use the shared capability/scope contract from `02-rbac-roles`.
2. Party/flow scope SHALL be checked against the current WRR and related records; client-supplied party or flow values SHALL not establish authorization.
3. The UI MAY hide unavailable actions, but server and RLS enforcement remain authoritative.
4. RLS policies for `wrr_inspection_logs`, RTV references, and related receiving rows SHALL inherit the WRR's party/flow scope and deny unauthorized reads/writes at the database layer; client filtering is not sufficient.
5. Receipt lifecycle changes, exception decisions, confirmations, and non-conformance resolutions SHALL be attributable to an actor, timestamp, and correlation ID through the approved audit path.
6. CIPL/evidence files SHALL use private Storage and authorized access from `04-services-and-infrastructure`.
7. Errors and monitoring data SHALL not expose tokens, SQL, protected records outside scope, or unnecessary personal data.

### R11. Offline and resilience behavior

1. Pre-receiving WRR creation/editing, CIPL uploads, item enrollment, inspection resolution, receipt confirmation, and putaway confirmation SHALL be online-only in v1 unless an owning spec explicitly approves otherwise.
2. Barcode scan capture/reconciliation MAY be Tier 1 offline work only through an approved versioned command envelope.
3. Offline scan replay SHALL re-authenticate, re-authorize, re-check WRR/business state, and remain idempotent; it SHALL not directly commit inventory from the client.
4. Connectivity and synchronization status SHALL use the shared `OfflineStatus` contract and SHALL not be confused with receipt confirmation.
5. A network loss SHALL preserve honest local capture state without claiming that the receipt is confirmed.

## 5. Acceptance criteria

- [ ] A staged WRR with CIPL reference and expected lines can be created, reviewed, and printed without affecting active inventory.
- [ ] Floor scans match expected WRR lines, visibly track remaining quantities, and reject wrong/duplicate/over-quantity/unknown/flow-type-mismatch scans safely.
- [ ] Unknown item handling routes to online authorized enrollment or an explicit exception; it never silently creates an item offline.
- [ ] Inbound conformance/non-conformance decisions prevent unsafe posting and retain required evidence/reasons.
- [ ] **Amended 2026-11-04:** each line's single carton-placement commit atomically posts every Storage/Inspection assignment, records Missing cartons as OS&D only, and reaches a terminal committed state exactly once.
- [ ] Carton placement is authoritative: storage assignments create available lot stock, inspection assignments create quarantined lot stock and an inspection case, and Missing assignments create no inventory. A mixed line is represented by separate available/quarantined lot segments sharing the WRR business `lot_number`; quarantined segments remain excluded from FIFO/FEFO allocation.
- [ ] Quarantined lots are excluded from FIFO/FEFO pick-list allocation until `11` resolves them to `available`.
- [ ] **Amended 2026-11-04:** after one accepted scan, the placement selector shows eligible Storage and Inspection destinations and lets staff assign every carton to Storage, Inspection, or Missing before the line's single placement commit; incoming ledger views authoritative transactions only.
- [ ] **Amended 2026-11-04:** a line may split cartons across Storage, Inspection, and Missing in one batch commit; Storage and Inspection destinations create separate lot segments when needed, and every submitted carton slot is validated atomically.
- [ ] Party/flow scope, RLS, stale state, revoked access, and direct-identifier manipulation are tested.
- [ ] Offline scan behavior is simulated and enrollment/confirmation remain blocked offline.
- [ ] A back-office user can confirm a `pending_review` `wrr_advance_notices` row into a staged `wrr_items` line (adjusting the non-authoritative declared quantity as needed) or reject it; a physical scan of its `WAN:<uuid>` barcode at receiving matches the confirmed line via `matched_wrr_item_id`, and an unconfirmed advance notice's scan falls through to the existing R3.3 unknown/unmatched exception path.
- [ ] Visual receiving inspection records exact conformant/`on_hold`/`reject` quantities; `on_hold` has mandatory remarks/reason, and `reject` routes to a designated rejects `location` and RTV workflow.
- [ ] **Added 2026-08-10:** a scanned item whose `flow_type` does not match the WRR's `flow_type` is rejected through the same exception path as any other wrong-item scan.
- [ ] **Added 2026-08-23:** Receiving sub-tabs (Work Queue, Receive, WRRs, Incoming Ledger) render cleanly, and user-facing UI labels use Organization, Inventory Model, Organization Portal, and Inspection exclusively.
- [ ] **Added 2026-08-23:** Visual design system tokens (`#2563EB`, `#0F172A`, `#64748B`, `#F3F6FC`, `#FFFFFF`) and DM Sans heading + Glacial Indifference body typography are fully applied on all receiving screens, and the Work Queue's status dropdown (R2b.4) refreshes the server-filtered queue immediately without a separate Apply action.
- [ ] **Amended 2026-11-04:** carton placement validation and atomic posting reject invalid/missing non-Missing destinations or a missing indexed placement/attestation without posting inventory; a successful commit posts one balance and transaction per assigned location, one inventory-unit row per non-Missing carton, and no inventory rows for Missing cartons.

## 5a. Open Questions (originally added 2026-08-10; Item 1 resolved 2026-08-10; Item 2 added 2026-08-20; Item 3 added 2026-08-24, resolved 2026-08-24; Item 4 added 2026-08-24)

- **Item 1** — ~~`01-core-data-model`'s `wrr_status` enum has no value cleanly representing "in progress, some lines already committed, not yet fully committed."~~ **Resolved**: no new enum value. `receiving_in_progress` covers the entire in-flight window regardless of how many lines have committed; per-line completion is already tracked on `wrr_items` (§R3.2 discrepancy state), not the parent WRR status. `wrr_documents.status` moves to `confirmed` only once every line reaches a terminal committed state. This also corrects the 2026-08-09 cancellation-resolution entry, which described a cancelled-with-partial-completion WRR as closing with "`partial` status" — that value does not exist in the schema and will not be added; such a WRR closes as `cancelled`, with its already-committed lines' `lots`/`lot_location_balances`/`inventory_transactions` rows standing unaffected. See `revision-log.md`'s 2026-08-10 entry. **Still holds after the 2026-08-24 batch model** — the WRR-completion rule described in R7.3 is unchanged in substance, only re-scoped from unit grain back to line grain; no further `wrr_status` change is proposed.
- **Item 2 (resolved 2026-11-04)** — the carton-level destination model is the approved successor to the retired line-level Hold override. The existing `inventory_units` grain records the carton-specific status/location, while the commit creates separate available and quarantined lot segments when one WRR line is split across destination types. The floor location assignment, not the legacy line disposition, is authoritative.
- **Item 3 (added 2026-08-24, merge reconciliation, RESOLVED 2026-08-24)** — R2a's batch putaway allocation proposal genuinely contradicted the then-authoritative R3.8-R3.13 per-unit scan-suggest-commit loop, rather than merely restating it differently. **Product Owner decision, 2026-08-24: the batch model is authoritative; the per-unit model is retired.** `commitWrrLine` (`lib/actions/receiving.ts`) is now the sole commit function for both dispositions; `commitStoreUnit`, `commitInspectLine`, and the per-unit idempotency-key machinery have been deleted from the codebase. The `wrr_item_putaway_allocations` table (migration `0032_wrr_item_putaway_allocations.sql`) is migrated and live. `08-outgoing-withdrawal-and-two-stage-commitment` requirements.md R3.3's exact-box dispatch-scan guarantee is preserved under the batch model because `inventory_units` rows are still populated from each physical box's actually-scanned/assigned identity at the line's single commit (design.md §9), not from an unverified numbered slot — see design.md §9 for the exact mechanism. See `specs/00-steering/revision-log.md`'s 2026-08-24 entry for the full account.
- **Item 4 (resolved 2026-11-04)** — a batch line may exclude missing cartons and may route present cartons independently to storage or inspection. The allocation total is the number of non-Missing cartons; all assigned cartons must be represented in the submitted placement array, and Missing cartons are excluded from inventory.

## 6. Dependencies and exclusions

- Depends on approved `01-core-data-model` tables and transitions: `parties`, `items`, `locations`, `lots`, `lot_location_balances`, `wrr_documents`, `wrr_items`, `wrr_inspection_logs`, and `inventory_transactions`. The `disposition` field on `wrr_items` is a new field required by this spec and will be added to `01` via a schema amendment before implementation. **Added 2026-08-06**: also depends on `01`'s new `wrr_advance_notices` table (schema amendment, not yet through `db-migration-verifier`, see `01` design.md §6) for R1a; this table is written by `22-parties-portal`, consumed and confirmed/rejected by `07`. **Added 2026-08-24**: also depends on `01`'s `wrr_item_putaway_allocations` and `inventory_units` tables (migrations `0032` and the `inventory_units` migration respectively), both migrated and live, for R2a's batch commit model.
- **Added 2026-08-06**: depends on `22-parties-portal` requirements.md R11 / design.md §7c as the originating requirement for R1a (supplier advance-notice intake) — `22` owns the party-facing submission surface; `07` owns confirmation/rejection and the physical-scan match.
- Depends on `02-rbac-roles` for capabilities, party/flow scope, RLS, and audit attribution.
- Depends on `03-offline-mode-and-client-storage` for the Tier 1 scan allowlist and replay contract.
- Depends on `04-services-and-infrastructure` for Auth, private Storage, email/monitoring, server transactions, and idempotency.
- Depends on `05-ui-shell-and-navigation` for protected routes, floor/office surfaces, page headers, and status feedback.
- Uses `06-party-and-item-enrollment` for unknown item recovery; does not copy its enrollment logic.
- `11-transfer-and-inspection` owns the shared inspection handler for quarantined-lot resolution, disposition evidence, and transfer of passed lots from the `inspection` location to the putaway location. Inbound WRR physical conformance recording (`wrr_inspection_logs`) is separate from transfer inspection, but quarantined-lot state transitions after commitment are delegated to `11`.
- `08`, `09`, `10`, `12`, and `13` own outbound commitment, approvals, documents, VMI billing, and Trading pricing respectively.
- **Retired 2026-08-24** (was: "Added 2026-08-20"): the per-unit "Hold" override dependency on a not-yet-drafted `01-core-data-model` amendment no longer applies — former R3.12 is superseded (§5a Item 2/4). R2a (the batch commit model) adds no new `01` dependency beyond what already exists — `wrr_item_putaway_allocations` and `inventory_units` are both already migrated (see above).

### R2b. Work Queue and floor-screen interaction (added 2026-08-23)

1. All protected receiving actions SHALL use capability grants (`receiving.view`, `receiving.confirm`) per `02-rbac-roles`, consistent with R10's authorization contract.
2. Floor screens SHALL enforce 64px primary CTAs, 16px minimum font size, zero glassmorphism, and Solid White (`#FFFFFF`) card surfaces on a cool blue-gray (`#F3F6FC`) canvas, per `ui-ux-design-plan.md`.
3. All error states SHALL display 3-component error feedback (What happened, Why it failed, Next Action / Solution), consistent with R3.3's scan-exception feedback.
4. The Work Queue's status dropdown SHALL apply its filter immediately when its value changes, while preserving the selected value in the URL for refresh/sharing/pagination; it SHALL NOT require a separate visible Apply button.
5. Receiving page headers SHALL omit a generic Filter action when contextual filter controls already exist within the active tab.

### One-QR line confirmation and shortage placement amendment (approved 2026-09-02)

The Work Queue/WRR remains the source of truth for expected lines and quantities. A single valid physical QR scan identifies and confirms the matching WRR line; it does not discover or add expected lines. After that confirmation, the operator may assign each declared box to an eligible storage or inspection location, or mark that box as `Missing`.

Only boxes assigned to storage or inspection are posted to inventory. Boxes marked `Missing` receive no location allocation and are excluded from inventory. The line records the resulting received quantity as the assigned quantity and the shortage as `expected_qty - received_qty`. A shortage on one line does not block other WRR lines. Each line may reach its terminal committed outcome independently; the parent WRR remains `receiving_in_progress` until every line is resolved, then becomes `confirmed` with the OS&D shortage visible on the WRR detail view. No `partial` WRR status is introduced.

### Carton destination authority amendment (approved 2026-11-04)

The floor placement assignment is the authoritative disposition for each declared carton after the line is identified by one valid QR scan. The operator assigns each carton to exactly one of:

- an active `storage` location, which creates available inventory;
- an active `inspection` location, which creates quarantined inventory and an inbound inspection case; or
- `Missing`, which creates no inventory row and records an OS&D shortage.

The separate floor-level `Hold for Inspection` / `Return to Store` toggle is retired. The persisted line-level `wrr_items.disposition` remains for pre-receiving defaults and compatibility, but it no longer overrides a carton's selected destination at receipt commit. A line may contain both storage and inspection cartons. Because `lots.status` is lot-level, the commit creates one available lot segment and/or one quarantined lot segment for the same business `lot_number`, while each `inventory_units` row retains its carton-specific location and status. Missing cartons receive no lot, balance, unit, or transaction row.

## Material expiry policy amendment (2026-11-04)

Status: Approved

The [Material expiry policy amendment](../00-steering/material-expiry-policy-amendment.md) R1–R8 and D1–D5 is incorporated into this feature's requirements/design/tasks. Product Owner explicitly approved implementation on 2026-11-04; System supplies the second specification sign-off under the standing convention after design reconciliation. Canonical storage/state/security choices are in `01`/`02`. Runtime implementation and verification remain separately tracked; approval is not a claim that tests or deployment passed.

Evaluate expiry at receipt commit; block-policy expired cartons go to Inspection, while permissive-policy Storage acceptance requires recorded acknowledgement and reason.

The linked approved amendment governs this feature's expiry behavior. Its specification sign-offs authorize implementation; applicable unit, real-Postgres, security, integration and E2E checks remain mandatory before implementation completion is claimed.
