# Incoming Receiving — Requirements

Status: Approved
Updated: 2026-08-06

## 1. Purpose and scope

Incoming Receiving governs the inbound lifecycle from an external CIPL/packing-list reference through WRR staging, physical arrival, barcode reconciliation, inbound inspection, receipt confirmation, inventory posting, putaway handoff, and the incoming ledger.

The central safety rule is that staged expected stock is not active inventory. A WRR becomes an authoritative inbound transaction only after the approved physical checks and confirmation command succeed.

This feature does not own party/item enrollment, category management, location enrollment, outbound picking, transfer inspection, pricing finalization, VMI billing, or RBAC policy.

## 2. Actors and workflow surfaces

- **Back-office receiving/operations user** — encodes CIPL data into a staged WRR, attaches the reference document, sets per-line dispositions, reviews discrepancies, and prints the WRR.
- **Warehouse staff** — uses the printed/digital WRR at the `receiving_bay`, scans cartons, records inbound observations, and confirms or escalates the receipt according to capability.
- **Supervisor** — reviews exceptions, non-conformance, and overrides dispositions where authorized, or any approval path explicitly assigned by the approved authorization matrix.
- **Administrator** — manages master data and system configuration through their owning features; administrative access does not automatically authorize receipt confirmation.

The back-office form is an office surface. The physical scan and confirmation flow is a floor surface optimized for portrait handheld scanners, one primary action, high contrast, and immediate scan feedback.

## 3. Lifecycle

The WRR lifecycle SHALL use the approved core status model, currently planned as:

```text
staged_pending_arrival → receiving_in_progress → confirmed
                                      └──────→ cancelled (when permitted)
```

- `staged_pending_arrival`: expected lines exist, but no active lots or inbound ledger transaction exists.
- `receiving_in_progress`: physical arrival/reconciliation is underway; scans and inspection observations are being recorded.
- `confirmed`: the receipt commit transaction has succeeded; active inventory and immutable inbound ledger records exist.
- `cancelled`: the staged document is deliberately stopped under approved rules; it does not represent received stock.

The final enum and transition constraints must be reconciled with `01-core-data-model` before approval.

## 4. Functional requirements

### R1. CIPL/WRR pre-receiving staging

1. An authorized back-office user SHALL be able to create a WRR from an external CIPL/packing-list reference.
2. The WRR SHALL capture the approved header references, including WRR number, CIPL reference/attachment where provided, invoice reference, import/PEZA references where applicable, source party, and `flow_type`.
3. Each expected line SHALL identify an approved `item`, required WRR `lot_number`, expected quantity, UOM, unit CBM/reference packaging data required for reconciliation, and an inbound **disposition** (`store` or `inspect`). The `lot_number` field on `wrr_items` is the single canonical business lot identifier; it is copied verbatim to the resulting `lots` record at confirmation and is not supplemented or replaced by any vendor-supplied reference.
4. A staged WRR SHALL not increment active inventory, create available lots, or write a `receiving` inventory transaction.
5. The system SHALL validate that referenced parties/items are active and authorized for the operation, while unknown items follow the exception path in R4.
6. The system SHALL support editing staged lines before physical receiving begins, subject to audit/version rules.
7. Once physical receiving begins, changes to expected lines SHALL be restricted or explicitly versioned; silent changes to the scan baseline are prohibited.

### R1a. Supplier advance-notice intake

**Added 2026-08-06**, formally adopting the confirmed matching flow from `22-parties-portal` requirements.md R11 / design.md §7c into this spec, per that spec's blocking dependency (c). This clause covers the input into `07`'s pre-receiving process from a party-submitted advance notice; it does not change R1.1's ownership of actual WRR creation.

1. A `wrr_advance_notices` row is owned and written entirely by `22-parties-portal` (a party in the inbound-supplying role — VMI vendor, or Trading `vendor`/`supplier` — submitting a thin pre-arrival label: item, a non-authoritative declared quantity, and an optional supplier lot number). `07` does not define, own, or grant party-user write access to this table; it only consumes rows created there. `wrr_advance_notices` is a `01-core-data-model` schema amendment (2026-08-06), now verified in real Postgres as recorded in the steering revision log.
2. A back-office user with `receiving.view` and `receiving.confirm` SHALL be able to review a `pending_review` `wrr_advance_notices` row against the actual CIPL they have separately received, and SHALL be able to choose either of the following. The controlled function SHALL independently re-check `receiving.confirm`; no implementation may substitute a role-name check or an invented ad-hoc permission:
   - **confirm** it — creating a new staged `wrr_items` line or matching it to an existing one, carrying over the item/party reference, and treating the advance notice's `declared_qty` as a non-authoritative starting value the back-office user MAY adjust against the actual CIPL before saving; or
   - **reject/flag** it as a discrepancy for manual follow-up, without creating or matching a `wrr_items` line.
   Confirming SHALL set `wrr_advance_notices.matched_wrr_item_id`, `status = 'confirmed'`, `confirmed_at`, and `confirmed_by_user_id`. Rejecting SHALL set `status = 'rejected'` and the same attribution fields, without a `matched_wrr_item_id`.
3. A physical barcode scan at the `receiving_bay`, using this spec's existing R3 barcode-reconciliation flow, that resolves a `WAN:<uuid>` payload (per `18-barcode-integration` requirements.md FR-2.3) SHALL match to the linked `wrr_items` line via `wrr_advance_notices.matched_wrr_item_id`, and reconciliation then proceeds exactly as R3 already defines for any other scanned line.
4. If the advance notice was never confirmed by back office before the shipment physically arrives and is scanned, the scan SHALL fall through to this spec's existing R3.3 unknown/unmatched exception path. No new bespoke error state is introduced for this case.
5. This clause never bypasses R1.1: `07` retains sole ownership of actual WRR/`wrr_items` creation. A `wrr_advance_notices` row is advisory pre-staging input into that process, never a substitute for it, and never a party-user write path into `wrr_items`.

### R2. WRR printing and arrival

1. The system SHALL generate a printable WRR containing a stable WRR reference, expected lines, quantities/UOMs, party and regulatory references, and the fields required by the approved paper workflow.
2. Printing SHALL not imply receipt or create inventory.
3. Staff SHALL be able to open a staged WRR and start receiving at a `receiving_bay` context.
4. Starting receiving SHALL transition the WRR to `receiving_in_progress` through an authorized server command and SHALL be safe to retry.
5. The floor flow SHALL clearly show the WRR being received, expected lines, scanned quantities, remaining quantities, and exceptions.

### R3. Barcode reconciliation

1. Each carton scan SHALL be matched against the WRR's expected item/line and the approved barcode/item identity mapping.
2. The system SHALL track scanned versus expected quantity per WRR line and SHALL prevent silent over-receipt.
3. A scan for the wrong item, unknown barcode, wrong WRR, duplicate carton, or quantity beyond the expected amount SHALL produce immediate non-success feedback and a recoverable exception state.
4. Manual entry MAY be available as a controlled recovery path when scanning fails, but it SHALL use the same server validation and audit path.
5. A receipt SHALL not be confirmable while required lines, unresolved exceptions, or required inspection decisions remain outstanding, unless an explicitly approved discrepancy workflow allows it.
6. Scan capture MAY be Tier 1 offline work only after its exact command and owning workflow are approved by `03-offline-mode-and-client-storage`.
7. Scan capture SHALL not by itself create lots, increment active inventory, or finalize the inbound ledger.

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

1. Confirmation SHALL be an explicit, authorized server command with one primary floor action.
2. The commit SHALL atomically validate the WRR status, scan totals, conformance decisions, active item/party references, flow partition, required lot metadata, per-line disposition values, and any required capacity/putaway prerequisites.
3. On success, the commit SHALL transition the WRR to `confirmed`, create the approved physical lots/lot state, and insert immutable `inventory_transaction` records with `movement_type = 'receiving'`. The resulting lot status and posting location depend on the per-line disposition:
   - `store` disposition: lot created with `status = 'available'`; `lot_location_balances` posted at putaway location with full quantity as available.
   - `inspect` disposition: lot created with `status = 'quarantined'`; `lot_location_balances` posted at `inspection` location; an inspection case event is emitted for `11`.
   Both dispositions insert `inventory_transactions` with `movement_type = 'receiving'`. The `lot_location_balances` rows created by the commit are the authoritative source for `lot_inventory_totals`.
4. Regulatory and source references approved for inheritance SHALL carry from the WRR to the resulting lot/transaction records without changing their historical meaning.
5. The commit SHALL be idempotent: retries or lost responses SHALL not create duplicate lots or duplicate ledger transactions.
6. A failed commit SHALL leave no partial receipt outcome and SHALL return a safe recoverable error.
7. Non-conformant quantities SHALL not be posted as available inventory unless the approved resolution explicitly permits a different status/path.
8. The receipt commit SHALL not finalize Trading document prices or VMI period billing; those semantics belong to `13` and `12`.

### R8. Putaway handoff

1. After a conformant receipt is committed, the system SHALL provide the approved putaway recommendation or handoff to the location/putaway workflow.
2. Recommendations SHALL use approved `locations`, item `volume_cbm`, active capacity, flow/lot constraints, and any FIFO/FEFO rules defined by the owning inventory design.
3. A recommendation SHALL not be represented as completed putaway until the physical/location workflow confirms it.
4. Completed putaway SHALL be recorded through the owning inventory transaction boundary with `movement_type = 'putaway'` where applicable.
5. Receiving SHALL not introduce a second location/capacity model or a `warehouse_id`.

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
- [ ] Floor scans match expected WRR lines, visibly track remaining quantities, and reject wrong/duplicate/over-quantity/unknown scans safely.
- [ ] Unknown item handling routes to online authorized enrollment or an explicit exception; it never silently creates an item offline.
- [ ] Inbound conformance/non-conformance decisions prevent unsafe posting and retain required evidence/reasons.
- [ ] Receipt confirmation atomically creates the approved active inventory/lot and immutable receiving ledger outcome exactly once.
- [ ] `store` disposition creates a lot with `status = 'available'` at the putaway location; `inspect` disposition creates a lot with `status = 'quarantined'` at the `inspection` location with zero allocation eligibility.
- [ ] Quarantined lots are excluded from FIFO/FEFO pick-list allocation until `11` resolves them to `available`.
- [ ] Putaway is a handoff/recommendation until physically confirmed, and incoming ledger views authoritative transactions only.
- [ ] Party/flow scope, RLS, stale state, revoked access, and direct-identifier manipulation are tested.
- [ ] Offline scan behavior is simulated and enrollment/confirmation remain blocked offline.
- [ ] A back-office user can confirm a `pending_review` `wrr_advance_notices` row into a staged `wrr_items` line (adjusting the non-authoritative declared quantity as needed) or reject it; a physical scan of its `WAN:<uuid>` barcode at receiving matches the confirmed line via `matched_wrr_item_id`, and an unconfirmed advance notice's scan falls through to the existing R3.3 unknown/unmatched exception path.
- [ ] Visual receiving inspection records exact conformant/`on_hold`/`reject` quantities; `on_hold` has mandatory remarks/reason, and `reject` routes to a designated rejects `location` and RTV workflow.

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
