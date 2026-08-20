# Incoming Receiving — Requirements

Status: Approved
Updated: 2026-08-20 (per-unit store/hold commit amendment)

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

### R3. Barcode reconciliation

1. Each carton scan SHALL be matched against the WRR's expected item/line and the approved barcode/item identity mapping.
2. The system SHALL track scanned versus expected quantity per WRR line and SHALL prevent silent over-receipt.
3. A scan for the wrong item, unknown barcode, wrong WRR, duplicate carton, quantity beyond the expected amount, or (**added 2026-08-10**) a scanned item whose own `flow_type` does not match the WRR's `flow_type` SHALL produce immediate non-success feedback and a recoverable exception state, through the same rejection path.
4. Manual entry MAY be available as a controlled recovery path when scanning fails, but it SHALL use the same server validation and audit path.
5. A receipt SHALL not be confirmable while required lines, unresolved exceptions, or required inspection decisions remain outstanding, unless an explicitly approved discrepancy workflow allows it.
6. Scan capture MAY be Tier 1 offline work only after its exact command and owning workflow are approved by `03-offline-mode-and-client-storage`.
7. Scan capture SHALL not by itself create lots, increment active inventory, or finalize the inbound ledger.
8. **Amended 2026-08-20, supersedes the 2026-08-10 per-line-batch wording:** WHEN an individual physical unit on a `store`-disposition line is scanned and matches its expected WRR line, THE SYSTEM SHALL compute and display **every** active `storage` location with available remaining CBM capacity for that one unit — not narrowed to a single recommendation — using the existing approved location/capacity suggestion interface (design.md §6.2a/§10), SO THAT staff choose from the full set of currently eligible locations for each individual unit rather than accepting one location pre-computed for the whole line. Staff SHALL accept one listed candidate or override with another active `storage` location before that single unit commits.
9. **Added 2026-08-10:** WHEN staff is receiving an `inspect`-disposition line, THE SYSTEM SHALL require staff to select/confirm the active `inspection` location before scanning the item, SO THAT the fixed, small set of hold/quarantine locations is confirmed without requiring the CBM/capacity computation that only applies to storage putaway.
10. **Added 2026-08-20:** WHEN staff taps "Store" for an individual scanned unit on a `store`-disposition line, THE SYSTEM SHALL commit that single unit immediately as its own atomic step — creating the line's lot on its first committed unit and reusing it thereafter, and creating or incrementing the matching `lot_location_balances`/`inventory_transactions` records for that unit's chosen location — with a visible per-unit "committed" confirmation, SO THAT staff get immediate feedback per unit and no already-committed unit is affected if a later unit's commit fails. A line's units MAY be committed one at a time; the line is not required to be fully scanned before its first unit commits.
11. **Added 2026-08-20:** WHEN successive units of the same `store`-disposition line are committed to different locations because an earlier-selected location's available capacity has been exhausted mid-line, THE SYSTEM SHALL create an additional `lot_location_balances` row for the same lot at each additional location used, SO THAT one WRR line/one logical lot can have its physical stock split across more than one location without being represented as more than one lot. No `01-core-data-model` schema change is required for this: `lot_location_balances` already supports multiple rows per lot.
12. **Added 2026-08-20, UNRESOLVED — see §5a Open Questions, Item 2:** alongside the per-unit "Store" action (R3.10), each individual scanned unit on a `store`-disposition line SHOULD have its own "Hold" action allowing that one unit to be quarantined while the rest of the line's units proceed to Store. This requirement is **not implementable as stated** under the current `01-core-data-model` schema (R5.1/R5.2's disposition model assigns exactly one status to one `lots` row per WRR line) and SHALL NOT be built until `01-core-data-model`'s own amendment/approval process resolves the representation. Recorded here so it is not lost — not an instruction to implement it now.

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

1. **Amended 2026-08-20, further narrows the 2026-08-10 wording:** for `store`-disposition lines, each individual scanned unit's commit ("Store") SHALL be an explicit, authorized server command with one primary floor action, executed per unit rather than gated on the rest of that line's units — or any other line in the WRR — being ready first. For `inspect`-disposition lines, the whole line's commit ("Hold") remains a single per-line command, unchanged from 2026-08-10 (R3.9).
2. **Amended 2026-08-20:** for `store`-disposition units, each per-unit commit SHALL atomically validate that specific unit's scan/conformance state, the line's active item/party references, flow partition, required lot metadata, and the accepted/overridden location's active `storage` state and current remaining capacity, before posting that unit alone. For `inspect`-disposition lines, each per-line commit SHALL atomically validate the same set of prerequisites for the whole line, unchanged from 2026-08-10.
3. On a successful commit, the system SHALL create/update the approved physical lot/lot state and insert an immutable `inventory_transaction` record with `movement_type = 'receiving'`. The resulting lot status and posting location depend on the line's disposition:
   - `store` disposition (**amended 2026-08-20 for per-unit commit**): on the line's first unit to commit, a lot is created with `status = 'available'`; every subsequent committed unit on the same line reuses that same lot (no second lot row is created for the line — see R3.12/§5a Item 2 for the one exception this doesn't cover). For each committed unit, `lot_location_balances` at that unit's accepted/overridden location (R3.8) is either created (first unit to use that location) or incremented by one unit's quantity (a prior unit on the same line already used that location) — R3.11.
   - `inspect` disposition: unchanged from 2026-08-10 — lot created with `status = 'quarantined'` for the whole line at once; `lot_location_balances` posted at the `inspection` location confirmed before scanning (R3.9); an inspection case event is emitted for `11`.
   Both dispositions insert one `inventory_transactions` row with `movement_type = 'receiving'` per commit event (per unit for `store`, per line for `inspect`). The `lot_location_balances` rows created by each commit are the authoritative source for `lot_inventory_totals`. **Amended 2026-08-10, re-scoped 2026-08-20**: the WRR itself transitions to `confirmed` only once every one of its lines' every expected unit has reached a terminal committed (or cancelled/discarded, per the existing cancellation path) state — see design.md §9's open item on how `01-core-data-model`'s `wrr_status` enum represents the in-between state, which this re-scoping does not reopen (still resolved as "no new enum value needed," design.md §9).
4. Regulatory and source references approved for inheritance SHALL carry from the WRR to the resulting lot/transaction records without changing their historical meaning.
5. **Amended 2026-08-20:** each `store`-disposition unit's commit SHALL be idempotent, scoped to that individual unit-commit event (not to the line): retries or lost responses SHALL not create duplicate lots, duplicate `lot_location_balances` increments, or duplicate ledger transactions for that unit. Each `inspect`-disposition line's commit remains idempotent and scoped to the whole line, unchanged from 2026-08-10.
6. **Amended 2026-08-20:** a failed `store`-disposition unit commit SHALL leave no partial outcome for that unit and SHALL return a safe recoverable error; it SHALL NOT roll back or otherwise affect any other unit's — on the same line or any other line's — already-committed state. A failed `inspect`-disposition line commit behaves as before (2026-08-10): no partial outcome for that line, no effect on any other line.
7. Non-conformant quantities SHALL not be posted as available inventory unless the approved resolution explicitly permits a different status/path.
8. The receipt commit SHALL not finalize Trading document prices or VMI period billing; those semantics belong to `13` and `12`.

### R8. Putaway handoff

1. **Amended 2026-08-10, supersedes the prior post-commit-only timing; re-scoped to per-unit 2026-08-20:** for `store`-disposition lines, the system SHALL provide the approved putaway recommendation at each unit's scan time, before that unit's commit (R3.8) — not only as a recommendation surfaced after a receipt is already committed, and not batched once for the whole line.
2. Recommendations SHALL use approved `locations`, item `volume_cbm`, active capacity, flow/lot constraints, and any FIFO/FEFO rules defined by the owning inventory design. **Amended 2026-08-20**: the recommendation SHALL list every currently eligible candidate location with available remaining capacity for that unit (R3.8), not a single narrowed pick.
3. A recommendation SHALL not be represented as completed putaway until that unit's "Store" commit (R7) confirms it.
4. Completed putaway SHALL be recorded through the owning inventory transaction boundary with `movement_type = 'putaway'` where applicable.
5. Receiving SHALL not introduce a second location/capacity model or a `warehouse_id`.
6. **Added 2026-08-20**: a single `store`-disposition line's committed units MAY be distributed across more than one putaway location (R3.11); the WRR line's `putaway_location_id` field reflects only the most-recently-used location once a split occurs (design.md §5.1) and is not itself the authoritative multi-location record — `lot_location_balances` is.

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
- [ ] **Amended 2026-08-10, further amended 2026-08-20:** each `store`-disposition unit's "Store" commit atomically creates/updates that unit's lot (created once per line, reused thereafter) and posts its `lot_location_balances`/immutable receiving ledger outcome exactly once; each `inspect`-disposition line's "Hold" commit does the same at line grain, unchanged from 2026-08-10; the WRR reaches `confirmed` only once every line's every expected unit has reached a terminal committed state.
- [ ] `store` disposition creates a lot with `status = 'available'`, its stock posted at the location(s) accepted/overridden per unit at scan time (R3.8, R3.10) — possibly more than one location per line (R3.11); `inspect` disposition creates a lot with `status = 'quarantined'` at the `inspection` location confirmed before scanning, with zero allocation eligibility.
- [ ] Quarantined lots are excluded from FIFO/FEFO pick-list allocation until `11` resolves them to `available`.
- [ ] **Amended 2026-08-10, re-scoped 2026-08-20:** for `store` lines, the putaway location suggestion is shown at each unit's scan time (before that unit's commit), listing every eligible candidate location (not one recommendation), accepted or overridden by staff, and not represented as completed putaway until that unit's "Store" commit confirms it; incoming ledger views authoritative transactions only.
- [ ] **Added 2026-08-20:** units of the same `store`-disposition line can commit to more than one location once an earlier location's available capacity is exhausted mid-line; each additional location used creates its own `lot_location_balances` row against the same lot, with no `01-core-data-model` schema change required.
- [ ] **Added 2026-08-20:** the per-unit "Hold" override on an otherwise `store`-disposition line (R3.12) is documented as an explicit open item (§5a Item 2) pending `01-core-data-model` sign-off and is NOT implemented or tested until that item is resolved.
- [ ] Party/flow scope, RLS, stale state, revoked access, and direct-identifier manipulation are tested.
- [ ] Offline scan behavior is simulated and enrollment/confirmation remain blocked offline.
- [ ] A back-office user can confirm a `pending_review` `wrr_advance_notices` row into a staged `wrr_items` line (adjusting the non-authoritative declared quantity as needed) or reject it; a physical scan of its `WAN:<uuid>` barcode at receiving matches the confirmed line via `matched_wrr_item_id`, and an unconfirmed advance notice's scan falls through to the existing R3.3 unknown/unmatched exception path.
- [ ] Visual receiving inspection records exact conformant/`on_hold`/`reject` quantities; `on_hold` has mandatory remarks/reason, and `reject` routes to a designated rejects `location` and RTV workflow.
- [ ] **Added 2026-08-10:** a scanned item whose `flow_type` does not match the WRR's `flow_type` is rejected through the same exception path as any other wrong-item scan.

## 5a. Open Questions (originally added 2026-08-10; Item 1 resolved 2026-08-10; Item 2 added 2026-08-20)

- **Item 1** — ~~`01-core-data-model`'s `wrr_status` enum has no value cleanly representing "in progress, some lines already committed, not yet fully committed."~~ **Resolved**: no new enum value. `receiving_in_progress` covers the entire in-flight window regardless of how many lines have committed; per-line completion is already tracked on `wrr_items` (§R3.2 discrepancy state), not the parent WRR status. `wrr_documents.status` moves to `confirmed` only once every line reaches a terminal committed state. This also corrects the 2026-08-09 cancellation-resolution entry, which described a cancelled-with-partial-completion WRR as closing with "`partial` status" — that value does not exist in the schema and will not be added; such a WRR closes as `cancelled`, with its already-committed lines' `lots`/`lot_location_balances`/`inventory_transactions` rows standing unaffected. See `revision-log.md`'s 2026-08-10 entry. **Still holds after the 2026-08-20 per-unit re-scoping** — see R7.3's note; no further `wrr_status` change is proposed.
- **Item 2 (added 2026-08-20, NOT resolved)** — R3.12/R5's per-unit "Hold" override on an otherwise `store`-disposition WRR line has no way to be represented under the current `01-core-data-model` schema: R5.1's disposition model assigns exactly one `status` to one `lots` row per WRR line, with no existing seam for "some units of this line are available, other units of the same line are quarantined." Realistic candidate resolutions, described neutrally and **not chosen here**: (a) split into two `lots` rows sharing one business `lot_number`, differentiated by disposition/status — `lots.lot_number` carries no uniqueness constraint today, but that absence is not the same as `01` having reviewed and endorsed two-lots-per-line as an intended pattern, since every other part of this spec's and design.md's narrative currently assumes one lot per line; or (b) move quarantine/status tracking to a finer grain than the lot row, which would touch the FIFO/FEFO eligibility gate (`01-core-data-model` design.md §3, workflow 3, and `00-steering/tech.md`'s "no per-feature exclusion logic" principle) and is a larger, cross-cutting change than (a). This is `01-core-data-model`'s own amendment/approval process to resolve, not decided unilaterally here — see design.md §6.4 for the full description. **Blocks only R3.12/R5's per-unit Hold override**; R3.8-R3.11 (per-unit commit loop, multi-candidate location list, multi-location split) do not depend on this resolution and may proceed independently.

## 6. Dependencies and exclusions

- Depends on approved `01-core-data-model` tables and transitions: `parties`, `items`, `locations`, `lots`, `lot_location_balances`, `wrr_documents`, `wrr_items`, `wrr_inspection_logs`, and `inventory_transactions`. The `disposition` field on `wrr_items` is a new field required by this spec and will be added to `01` via a schema amendment before implementation. **Added 2026-08-06**: also depends on `01`'s new `wrr_advance_notices` table (schema amendment, not yet through `db-migration-verifier`, see `01` design.md §6) for R1a; this table is written by `22-parties-portal`, consumed and confirmed/rejected by `07`.
- **Added 2026-08-06**: depends on `22-parties-portal` requirements.md R11 / design.md §7c as the originating requirement for R1a (supplier advance-notice intake) — `22` owns the party-facing submission surface; `07` owns confirmation/rejection and the physical-scan match.
- Depends on `02-rbac-roles` for capabilities, party/flow scope, RLS, and audit attribution.
- Depends on `03-offline-mode-and-client-storage` for the Tier 1 scan allowlist and replay contract.
- Depends on `04-services-and-infrastructure` for Auth, private Storage, email/monitoring, server transactions, and idempotency.
- Depends on `05-ui-shell-and-navigation` for protected routes, floor/office surfaces, page headers, and status feedback.
- Uses `06-party-and-item-enrollment` for unknown item recovery; does not copy its enrollment logic.
- `11-transfer-and-inspection` owns the shared inspection handler for quarantined-lot resolution, disposition evidence, and transfer of passed lots from the `inspection` location to the putaway location. Inbound WRR physical conformance recording (`wrr_inspection_logs`) is separate from transfer inspection, but quarantined-lot state transitions after commitment are delegated to `11`.
- `08`, `09`, `10`, `12`, and `13` own outbound commitment, approvals, documents, VMI billing, and Trading pricing respectively.
- **Added 2026-08-20**: R3.12/§5a Item 2 (the per-unit "Hold" override on an otherwise `store`-disposition line) depends on a not-yet-drafted `01-core-data-model` amendment resolving the lot/status representation, and is blocked until that amendment is drafted and approved. R3.8-R3.11 (per-unit commit loop, multi-candidate location list, multi-location split) add no new `01` dependency beyond what already exists — they rely only on `lot_location_balances`'s existing support for multiple rows per lot.
