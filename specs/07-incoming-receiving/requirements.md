# Incoming Receiving — Requirements

Status: Approved
Updated: 2026-08-24 (Product Owner decision: batch putaway model adopted, per-unit model retired) — resolves the `fix-it-felix` merge contradiction flagged the same day (§5a Item 3, now closed). R2a's batch putaway allocation is now the sole authoritative `store`/`inspect`-line commit model, implemented in `commitWrrLine` (`lib/actions/receiving.ts`). The 2026-08-20/21 per-unit scan-suggest-commit-per-unit model (the prior R3.8-R3.13 wording, `commitStoreUnit`/`commitInspectLine`, and the per-unit idempotency-key machinery) is retired, removed from this document, and deleted from the codebase. See `specs/00-steering/revision-log.md`'s 2026-08-24 entry for the full account. This also retains the 2026-08-23 automatic WRR queue filtering/simplified page actions (R2b), which are unaffected by this change.

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

### R2. WRR printing and arrival

1. The system SHALL generate a printable WRR containing a stable WRR reference, expected lines, quantities/UOMs, party and regulatory references, and the fields required by the approved paper workflow.
2. Printing SHALL not imply receipt or create inventory.
3. Staff SHALL be able to open a staged WRR and start receiving at a `receiving_bay` context.
4. Starting receiving SHALL transition the WRR to `receiving_in_progress` through an authorized server command and SHALL be safe to retry.
5. The floor flow SHALL clearly show the WRR being received, expected lines, scanned quantities, remaining quantities, and exceptions.

### R2a. Batch putaway allocation — authoritative `store`/`inspect`-line commit model (Product Owner decision, adopted 2026-08-24, retires the 2026-08-20/21 per-unit model)

**History**: a 2026-08-20 Product Owner decision temporarily narrowed `07`'s commit grain from whole-line to individual physical unit (former R3.8-R3.13, implemented and real-Postgres-verified 2026-08-21). A separate branch (`fix-it-felix`) subsequently proposed reverting to a whole-line, batch-placement model instead; the two were merged together on 2026-08-24 as a genuine unresolved contradiction (§5a Item 3). The Product Owner has since resolved that contradiction: **this batch model is authoritative; the per-unit model is retired.** The per-unit implementation (`commitStoreUnit`, `commitInspectLine`, and the per-unit idempotency-key machinery) has been deleted from the codebase; `commitWrrLine` (`lib/actions/receiving.ts`) is now the one authoritative commit function for both dispositions.

1. Barcode reconciliation is unchanged from R3.1-R3.7: each carton/pallet scan is matched against the expected item/line and barcode mapping, with the same 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**) on wrong item, unknown barcode, duplicate carton, over-quantity, or Inventory Model mismatch.
2. Once a `store`-disposition line has at least one accepted scan matching its expected item, staff MAY place the line's entire declared (`expected_qty`) quantity in one step, without individually re-scanning every remaining carton. The system displays every active `storage` location with available remaining capacity for at least one more unit of the line's item, together with each candidate's current used/maximum CBM, projected remaining CBM after the proposed assignment, and the item/lot quantities already stored there.
3. Staff assign the line's full declared quantity to storage locations either as a single-location quick action ("Put all N boxes in [location]") or as an explicit split across more than one active `storage` location (a positive quantity per location, or an equivalent one-location-per-box assignment that the system groups into per-location quantities). The assigned total SHALL equal the line's `expected_qty` exactly; a mismatched, missing, or over-capacity assignment is rejected with a clear error before anything is posted.
4. A single explicit server command ("Store") commits the whole line at once: it creates one lot with `status = 'available'`, one `lot_location_balances` row per assigned location, one durable `inventory_units` row per physical box (a stable, reprint-safe derived identity — design.md §9), and one `inventory_transactions` row per assigned location, all in one transaction.
5. Staff SHALL explicitly attest that all of the line's declared physical cartons/pallets are present before the Store commit is accepted whenever more than one physical box's location is being asserted in the same commit (i.e. whenever the commit is a batch/multi-slot assignment rather than a true single `location_id` value supplied for the whole line). The current floor UI always presents the batch/multi-slot assignment surface for `store` lines — including when every box ends up assigned to the same single location — so in practice every `store`-line commit through that UI requires this attestation.
6. The existing individual-label scan path (R3.1-R3.7) remains available and required for barcode reconciliation before a line becomes eligible for its Store/Hold commit; batch placement does not replace or bypass per-carton scan matching. Each printed QR remains a unique, stable identifier across reprints; batch placement does not regenerate QR identity, and the numbered-slot-to-box mapping used for `inventory_units` is derived deterministically from the WRR line and box index (design.md §9), not asserted freehand.
7. For `inspect`-disposition lines, R3.9's existing location-first sequence is unchanged: staff select/confirm a single active `inspection` location before scanning, then commit the whole line with "Hold." Storage-location capacity allocation and multi-location splitting do not apply to `inspect` lines; no presence attestation is required for this path, since it was never removed from the location-first sequence.
8. Each line's "Store" or "Hold" commit is an explicit, idempotent, per-line server command; a retried or duplicate commit request returns the original authoritative result rather than posting inventory a second time.

### R3. Barcode reconciliation

1. Each carton scan SHALL be matched against the WRR's expected item/line and the approved barcode/item identity mapping.
2. The system SHALL track scanned versus expected quantity per WRR line and SHALL prevent silent over-receipt.
3. A scan for the wrong item, unknown barcode, wrong WRR, duplicate carton, quantity beyond the expected amount, or (**added 2026-08-10**) a scanned item whose own `flow_type` does not match the WRR's `flow_type` SHALL produce immediate non-success feedback and a recoverable exception state, through the same rejection path.
4. Manual entry MAY be available as a controlled recovery path when scanning fails, but it SHALL use the same server validation and audit path.
5. A receipt SHALL not be confirmable while required lines, unresolved exceptions, or required inspection decisions remain outstanding, unless an explicitly approved discrepancy workflow allows it.
6. Scan capture MAY be Tier 1 offline work only after its exact command and owning workflow are approved by `03-offline-mode-and-client-storage`.
7. Scan capture SHALL not by itself create lots, increment active inventory, or finalize the inbound ledger.
8. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording:** WHEN at least one physical unit on a `store`-disposition line has been scanned and matches its expected WRR line, THE SYSTEM SHALL compute and display **every** active `storage` location with available remaining CBM capacity for at least one more unit of that line's item — not narrowed to a single recommendation — using the existing approved location/capacity suggestion interface (design.md §6.2a/§10), SO THAT staff can distribute the line's full declared quantity across one or more currently eligible locations before a single "Store" commit. Staff MAY assign the entire line to one listed candidate as a single-location quick action, or split the assignment across more than one active `storage` location (R2a items 2-3).
9. **Added 2026-08-10, unaffected by the 2026-08-24 batch amendment:** WHEN staff is receiving an `inspect`-disposition line, THE SYSTEM SHALL require staff to select/confirm the active `inspection` location before scanning the item, SO THAT the fixed, small set of hold/quarantine locations is confirmed without requiring the CBM/capacity computation that only applies to storage putaway.
10. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording:** WHEN staff taps "Store" for a `store`-disposition line whose full declared quantity has been placed (R2a), THE SYSTEM SHALL commit the whole line immediately as one atomic step — creating the line's lot and creating the matching `lot_location_balances`/`inventory_transactions` records for every assigned location — with a visible per-line "committed" confirmation, SO THAT staff get clear feedback once the whole line's physical placement is confirmed. There is no per-unit commit step; a line commits only once as a whole.
11. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording:** WHEN a `store`-disposition line's declared quantity is assigned across more than one location in a single batch placement (R2a items 2-3), THE SYSTEM SHALL create one `lot_location_balances` row per assigned location for the same lot, in the same commit, SO THAT one WRR line/one logical lot can have its physical stock split across more than one location without being represented as more than one lot. No `01-core-data-model` schema change is required for this: `lot_location_balances` already supports multiple rows per lot.
12. **Superseded 2026-08-24 — the per-unit commit mechanism this item depended on no longer exists.** The 2026-08-20 proposal for a per-unit "Hold" action on an otherwise `store`-disposition line (quarantining one individually scanned unit while the rest of the same line proceeded to Store) was never implementable under `01-core-data-model`'s one-lot-per-line status model (§5a Item 2, still unresolved on its own terms) and is now additionally moot: the per-unit commit loop it would have attached to (former R3.10) has been retired in favor of R2a's whole-line batch commit, which has no per-unit commit event at all to hook a per-unit override into. If the underlying operational need — excluding part of a line's physical quantity from an otherwise-conforming Store commit — still matters, it is a new requirement against the batch model, not a restatement of this one; see §5a's new Item 4, which is explicitly not resolved here.

### R4. Unknown or unregistered item handling

1. If a physical barcode does not resolve to an active `item`, the system SHALL pause that line and explain the exception.
2. The floor flow SHALL offer only the approved recovery path: navigate to the online `06-party-and-item-enrollment` workflow for an authorized enrollment, or record an exception for back-office resolution.
3. New item enrollment SHALL not be silently performed as an unaudited receiving-side mutation and SHALL not be available through the offline queue.
4. After enrollment, the receiving user SHALL revalidate the item and barcode against the WRR before continuing; the system SHALL not assume the previously rejected scan is valid.
5. If the item cannot be resolved, the receipt remains incomplete or enters the approved discrepancy/non-conformance path.

### R5. Inbound receiving disposition

1. Each WRR line SHALL carry a **disposition** value — either `store` or `inspect` — that determines the lot status and posting location created by the receipt confirmation commit.

2. **`store` disposition**: the scanned quantity has passed the physical check and requires no further pre-availability inspection.
   - On receipt confirmation, the lot SHALL be created with `status = 'available'`.
   - The full confirmed quantity SHALL be posted to `lot_location_balances` at the designated putaway location with full availability.
   - The lot is immediately eligible for FIFO/FEFO pick-list allocation.

3. **`inspect` disposition**: the scanned quantity requires inspection before becoming available inventory.
   - On receipt confirmation, the lot SHALL be created with `status = 'quarantined'`.
   - The full confirmed quantity SHALL be posted to `lot_location_balances` at the designated `inspection` location. `qty_available` (derived as `qty_remaining - qty_committed`) will be zero because the lot is excluded from allocation by its `quarantined` status, not by a separate field value.
   - The lot SHALL NOT be eligible for FIFO/FEFO pick-list allocation while in `quarantined` status.

4. The `inspection` location is a specific `locations` record with `location_type = 'inspection'`; it holds its own `lot_location_balances` rows for all quarantined inbound stock. It is not a virtual marker — it is a real enrolled location record.

5. The disposition is set per WRR line. The back-office user SHALL be able to set or override the disposition on each line before physical receiving begins. A floor supervisor MAY change the disposition at confirmation time where the authorization matrix permits.

6. Mandatory `inspect` disposition SHALL be enforced automatically when: (a) the item master record carries an inspection-required flag, (b) the flow or party configuration requires inspection, or (c) a supervisor explicitly flags the line during receiving.

7. Inspection resolution — pass, fail, return, or hold — for quarantined lots is owned by the shared inspection capability. `11-transfer-and-inspection` is the shared inspection handler for disposition evidence, resolution decision, and outcome recording; `07` initiates the inspection case event at commit time but does not own the resolution logic.

8. A receipt with lines of mixed dispositions MAY be confirmed as a single commit provided all mandatory scan prerequisites are met for each line individually.

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

1. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording:** for both `store`- and `inspect`-disposition lines, a line's commit ("Store" or "Hold") SHALL be a single explicit, authorized server command with one primary floor action, executed once per line, rather than gated on any other line in the WRR being ready first, and not broken into a per-unit commit sequence.
2. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording:** each line's commit SHALL atomically validate that line's scan/conformance state, the line's active item/party references, flow partition, required lot metadata, the assigned location(s)' active `storage` (or, for `inspect`, `inspection`) state and current remaining capacity, the batch allocation total against `expected_qty` (R2a items 2-3), and the presence attestation where a multi-slot/batch assignment is used (R2a item 5) — before posting the whole line at once.
3. On a successful commit, the system SHALL create the approved lot/lot state and insert one or more immutable `inventory_transaction` records with `movement_type = 'receiving'`. The resulting lot status and posting location(s) depend on the line's disposition:
   - `store` disposition (**amended 2026-08-24, supersedes the 2026-08-20 per-unit wording**): the line's single "Store" commit creates one lot with `status = 'available'`. `lot_location_balances` is created for every location assigned in the line's batch placement (R2a) — one row per location, in the same commit (R3.11).
   - `inspect` disposition (unchanged from 2026-08-10, unaffected by this amendment): the line's single "Hold" commit creates one lot with `status = 'quarantined'` for the whole line at once; `lot_location_balances` posted at the single `inspection` location confirmed before scanning (R3.9); an inspection case event is emitted for `11`.
   Both dispositions insert one `inventory_transactions` row with `movement_type = 'receiving'` per assigned allocation — one row for a single-location commit, one row per location for a split `store` commit, and always exactly one row for `inspect` (which never splits). The `lot_location_balances` rows created by each commit are the authoritative source for `lot_inventory_totals`. **Amended 2026-08-10, re-scoped 2026-08-24**: the WRR itself transitions to `confirmed` only once every one of its lines has reached a terminal committed (or cancelled/discarded, per the existing cancellation path) state — see design.md §9's open item on how `01-core-data-model`'s `wrr_status` enum represents the in-between state, which this re-scoping does not reopen (still resolved as "no new enum value needed," design.md §9).
4. Regulatory and source references approved for inheritance SHALL carry from the WRR to the resulting lot/transaction records without changing their historical meaning.
5. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording:** each line's commit (`store` or `inspect`) SHALL be idempotent, scoped to that line: retries or lost responses SHALL not create duplicate lots, duplicate `lot_location_balances` rows, duplicate `inventory_units` rows, or duplicate ledger transactions for that line. The idempotency gate is the same conditional `wrr_items.committed_at` `NULL → non-NULL` claim used since 2026-08-10; the per-unit-scoped idempotency-key mechanism introduced 2026-08-20 is retired along with the per-unit commit loop it supported.
6. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording:** a failed line commit (`store` or `inspect`) SHALL leave no partial outcome for that line and SHALL return a safe recoverable error; it SHALL NOT roll back or otherwise affect any other line's already-committed state.
7. Non-conformant quantities SHALL not be posted as available inventory unless the approved resolution explicitly permits a different status/path.
8. The receipt commit SHALL not finalize Trading document prices or VMI period billing; those semantics belong to `13` and `12`.

### R8. Putaway handoff

1. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit re-scoping:** for `store`-disposition lines, the system SHALL provide the approved putaway recommendation once the line has at least one accepted scan, before that line's single "Store" commit (R2a) — not only as a recommendation surfaced after a receipt is already committed.
2. Recommendations SHALL use approved `locations`, item `volume_cbm`, active capacity, flow/lot constraints, and any FIFO/FEFO rules defined by the owning inventory design. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording**: the recommendation SHALL list every currently eligible candidate location with available remaining capacity for at least one unit of the line's item (R3.8), not a single narrowed pick, so staff can distribute the line's full declared quantity across one or more of them.
3. A recommendation SHALL not be represented as completed putaway until that line's "Store" commit (R7) confirms it.
4. Completed putaway SHALL be recorded through the owning inventory transaction boundary with `movement_type = 'putaway'` where applicable.
5. Receiving SHALL not introduce a second location/capacity model or a `warehouse_id`.
6. **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording**: a single `store`-disposition line's declared quantity MAY be distributed across more than one putaway location in one batch commit (R2a/R3.11); the WRR line's `putaway_location_id` field is set only for a single-location commit and is left unset when a split occurs (design.md §5.1) — `lot_location_balances` is always the authoritative multi-location record.

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
- [ ] **Amended 2026-08-10, re-amended 2026-08-24 (supersedes the 2026-08-20 per-unit wording):** each line's single "Store" or "Hold" commit atomically creates/updates its lot and posts its `lot_location_balances`/`inventory_units`/immutable receiving ledger outcome exactly once per assigned location; the WRR reaches `confirmed` only once every line has reached a terminal committed state.
- [ ] `store` disposition creates a lot with `status = 'available'`, its stock posted at the location(s) assigned in the line's single batch placement (R2a, R3.8, R3.10) — possibly more than one location per line (R3.11); `inspect` disposition creates a lot with `status = 'quarantined'` at the single `inspection` location confirmed before scanning, with zero allocation eligibility.
- [ ] Quarantined lots are excluded from FIFO/FEFO pick-list allocation until `11` resolves them to `available`.
- [ ] **Amended 2026-08-10, re-amended 2026-08-24 (supersedes the 2026-08-20 per-unit wording):** for `store` lines, the putaway location suggestion is shown once the line has at least one accepted scan (before that line's single "Store" commit), listing every eligible candidate location (not one recommendation), assigned across one or more locations by staff, and not represented as completed putaway until that line's "Store" commit confirms it; incoming ledger views authoritative transactions only.
- [ ] **Amended 2026-08-24, supersedes the 2026-08-20 per-unit wording:** a `store`-disposition line's declared quantity can be split across more than one location in a single batch commit (R2a items 2-3, R3.11); each assigned location creates its own `lot_location_balances` row against the same lot, with no `01-core-data-model` schema change required. A batch (multi-slot) commit requires the presence attestation and rejects an allocation total that differs from the line's `expected_qty`.
- [ ] **Superseded 2026-08-24:** the per-unit "Hold" override on an otherwise `store`-disposition line (former R3.12) is retired along with the per-unit model it depended on; it is NOT an acceptance target. Whether a batch-model equivalent is needed is a new, separate open item (§5a Item 4), not yet resolved and not scheduled.
- [ ] Party/flow scope, RLS, stale state, revoked access, and direct-identifier manipulation are tested.
- [ ] Offline scan behavior is simulated and enrollment/confirmation remain blocked offline.
- [ ] A back-office user can confirm a `pending_review` `wrr_advance_notices` row into a staged `wrr_items` line (adjusting the non-authoritative declared quantity as needed) or reject it; a physical scan of its `WAN:<uuid>` barcode at receiving matches the confirmed line via `matched_wrr_item_id`, and an unconfirmed advance notice's scan falls through to the existing R3.3 unknown/unmatched exception path.
- [ ] Visual receiving inspection records exact conformant/`on_hold`/`reject` quantities; `on_hold` has mandatory remarks/reason, and `reject` routes to a designated rejects `location` and RTV workflow.
- [ ] **Added 2026-08-10:** a scanned item whose `flow_type` does not match the WRR's `flow_type` is rejected through the same exception path as any other wrong-item scan.
- [ ] **Added 2026-08-23:** Receiving sub-tabs (Work Queue, Receive, WRRs, Incoming Ledger) render cleanly, and user-facing UI labels use Organization, Inventory Model, Organization Portal, and Inspection exclusively.
- [ ] **Added 2026-08-23:** Visual design system tokens (`#2563EB`, `#0F172A`, `#64748B`, `#F3F6FC`, `#FFFFFF`) and DM Sans heading + Glacial Indifference body typography are fully applied on all receiving screens, and the Work Queue's status dropdown (R2b.4) refreshes the server-filtered queue immediately without a separate Apply action.
- [ ] **Resolved 2026-08-24 — no longer flagged:** R2a's batch putaway "Store"/"Hold" validation and atomic distributed-balance posting IS the current model and IS an acceptance target: a batch (multi-slot) commit rejects a missing/invalid location, an allocation total that differs from `expected_qty`, or a missing presence attestation, without posting inventory; a successful commit posts one `lot_location_balances` row per assigned location, one `inventory_units` row per physical box, and one `inventory_transactions` row per assigned location, all in one transaction.

## 5a. Open Questions (originally added 2026-08-10; Item 1 resolved 2026-08-10; Item 2 added 2026-08-20; Item 3 added 2026-08-24, resolved 2026-08-24; Item 4 added 2026-08-24)

- **Item 1** — ~~`01-core-data-model`'s `wrr_status` enum has no value cleanly representing "in progress, some lines already committed, not yet fully committed."~~ **Resolved**: no new enum value. `receiving_in_progress` covers the entire in-flight window regardless of how many lines have committed; per-line completion is already tracked on `wrr_items` (§R3.2 discrepancy state), not the parent WRR status. `wrr_documents.status` moves to `confirmed` only once every line reaches a terminal committed state. This also corrects the 2026-08-09 cancellation-resolution entry, which described a cancelled-with-partial-completion WRR as closing with "`partial` status" — that value does not exist in the schema and will not be added; such a WRR closes as `cancelled`, with its already-committed lines' `lots`/`lot_location_balances`/`inventory_transactions` rows standing unaffected. See `revision-log.md`'s 2026-08-10 entry. **Still holds after the 2026-08-24 batch model** — the WRR-completion rule described in R7.3 is unchanged in substance, only re-scoped from unit grain back to line grain; no further `wrr_status` change is proposed.
- **Item 2 (added 2026-08-20, NOT resolved, but now describes a retired mechanism)** — R3.12/R5's proposed per-unit "Hold" override on an otherwise `store`-disposition WRR line had no way to be represented under the current `01-core-data-model` schema: R5.1's disposition model assigns exactly one `status` to one `lots` row per WRR line, with no existing seam for "some units of this line are available, other units of the same line are quarantined." This schema gap itself is unchanged by the 2026-08-24 batch decision — but the requirement that would have used it (former R3.12) is now superseded, since the per-unit commit loop it depended on no longer exists (see former R3.12's note, and new Item 4 below for the batch-model-shaped successor question). Retained here as a historical record of the underlying schema question, in case a future requirement needs it: (a) split into two `lots` rows sharing one business `lot_number`, differentiated by disposition/status, or (b) move quarantine/status tracking to a finer grain than the lot row (a larger, cross-cutting change touching the FIFO/FEFO eligibility gate, `01-core-data-model` design.md §3 workflow 3). Neither is chosen; this remains `01-core-data-model`'s own amendment/approval process to resolve if and when it is actually needed.
- **Item 3 (added 2026-08-24, merge reconciliation, RESOLVED 2026-08-24)** — R2a's batch putaway allocation proposal genuinely contradicted the then-authoritative R3.8-R3.13 per-unit scan-suggest-commit loop, rather than merely restating it differently. **Product Owner decision, 2026-08-24: the batch model is authoritative; the per-unit model is retired.** `commitWrrLine` (`lib/actions/receiving.ts`) is now the sole commit function for both dispositions; `commitStoreUnit`, `commitInspectLine`, and the per-unit idempotency-key machinery have been deleted from the codebase. The `wrr_item_putaway_allocations` table (migration `0032_wrr_item_putaway_allocations.sql`) is migrated and live. `08-outgoing-withdrawal-and-two-stage-commitment` requirements.md R3.3's exact-box dispatch-scan guarantee is preserved under the batch model because `inventory_units` rows are still populated from each physical box's actually-scanned/assigned identity at the line's single commit (design.md §9), not from an unverified numbered slot — see design.md §9 for the exact mechanism. See `specs/00-steering/revision-log.md`'s 2026-08-24 entry for the full account.
- **Item 4 (added 2026-08-24, NOT resolved, not scheduled)** — now that former R3.12's per-unit Hold override is retired (superseded, see above), is a batch-model-shaped equivalent needed — i.e. the ability to exclude part of a `store`-disposition line's physical quantity from an otherwise-conforming "Store" commit (for example, one visibly damaged box discovered while placing an otherwise-good pallet)? R5a's existing quantity-splittable `on_hold`/`reject` visual-inspection path may already cover this if applied *before* the line's single Store/Hold commit, but that would require clarifying whether R2a's "allocation total must equal `expected_qty`" invariant is measured against the WRR line's original `expected_qty` or a post-exclusion quantity — R5a and R2a have not been explicitly reconciled on this point. Not decided here; not currently blocking any scheduled work.

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
