# Incoming Receiving — Requirements

Status: Draft

## 1. Purpose and scope

Incoming Receiving governs the inbound lifecycle from an external CIPL/packing-list reference through WRR staging, physical arrival, barcode reconciliation, inbound inspection, receipt confirmation, inventory posting, putaway handoff, and the incoming ledger.

The central safety rule is that staged expected stock is not active inventory. A WRR becomes an authoritative inbound transaction only after the approved physical checks and confirmation command succeed.

This feature does not own party/item enrollment, category management, location enrollment, outbound picking, transfer inspection, pricing finalization, VMI billing, or RBAC policy.

## 2. Actors and workflow surfaces

- **Back-office receiving/operations user** — encodes CIPL data into a staged WRR, attaches the reference document, reviews discrepancies, and prints the WRR.
- **Warehouse staff** — uses the printed/digital WRR at the `receiving_bay`, scans cartons, records inbound observations, and confirms or escalates the receipt according to capability.
- **Supervisor** — reviews exceptions, non-conformance, or any approval path explicitly assigned by the approved authorization matrix.
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
3. Each expected line SHALL identify an approved `item`, required WRR `lot_number`, expected quantity, UOM, and unit CBM/reference packaging data required for reconciliation.
4. A staged WRR SHALL not increment active inventory, create available lots, or write a `receiving` inventory transaction.
5. The system SHALL validate that referenced parties/items are active and authorized for the operation, while unknown items follow the exception path in R4.
6. The system SHALL support editing staged lines before physical receiving begins, subject to audit/version rules.
7. Once physical receiving begins, changes to expected lines SHALL be restricted or explicitly versioned; silent changes to the scan baseline are prohibited.

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

### R5. Inbound inspection and conformance

1. The system SHALL support inspection of inbound goods at the `inspection` location/context before active inventory is posted where the approved flow requires it.
2. A conformance result SHALL identify the WRR, line/item, party, actor, timestamp, and result.
3. A non-conformance result SHALL require an approved reason, remarks where required, and evidence attachment where required by the final design.
4. Non-conformance reasons SHALL use the approved enum/reference, including TDC defect, quantity mismatch, damaged carton, wrong item code, missing paperwork, and other where retained by core design.
5. Goods marked non-conformant SHALL not become available inventory until an approved resolution changes their state; the resolution may be quarantine, return-to-party, correction, or another explicitly defined action.
6. A conformance result SHALL permit the matching receipt line to proceed to confirmation and putaway recommendation.
7. Inbound inspection records SHALL remain distinct from transfer/other inspection workflows owned by `11-transfer-and-inspection`.

### R6. Receipt confirmation and inventory commit

1. Confirmation SHALL be an explicit, authorized server command with one primary floor action.
2. The commit SHALL atomically validate the WRR status, scan totals, conformance decisions, active item/party references, flow partition, required lot metadata, and any required capacity/putaway prerequisites.
3. On success, the commit SHALL transition the WRR to `confirmed`, create the approved physical lots/lot state, and insert immutable `inventory_transaction` records with `movement_type = 'receiving'`.
4. Regulatory and source references approved for inheritance SHALL carry from the WRR to the resulting lot/transaction records without changing their historical meaning.
5. The commit SHALL be idempotent: retries or lost responses SHALL not create duplicate lots or duplicate ledger transactions.
6. A failed commit SHALL leave no partial receipt outcome and SHALL return a safe recoverable error.
7. Non-conformant quantities SHALL not be posted as available inventory unless the approved resolution explicitly permits a different status/path.
8. The receipt commit SHALL not finalize Trading document prices or VMI period billing; those semantics belong to `13` and `12`.

### R7. Putaway handoff

1. After a conformant receipt is committed, the system SHALL provide the approved putaway recommendation or handoff to the location/putaway workflow.
2. Recommendations SHALL use approved `locations`, item `volume_cbm`, active capacity, flow/lot constraints, and any FIFO/FEFO rules defined by the owning inventory design.
3. A recommendation SHALL not be represented as completed putaway until the physical/location workflow confirms it.
4. Completed putaway SHALL be recorded through the owning inventory transaction boundary with `movement_type = 'putaway'` where applicable.
5. Receiving SHALL not introduce a second location/capacity model or a `warehouse_id`.

### R8. Incoming ledger and review

1. The Incoming Ledger SHALL be a filtered view of the authoritative `inventory_transactions` ledger, not a duplicate receipt ledger.
2. It SHALL support receiving and putaway movements and show date/time, item code, description, canonical `lot_number` where authorized, quantity/UOM, WRR reference, source party, flow type, and performing user.
3. It SHALL support date range, party, flow, item/code, and WRR/CIPL reference filters according to the caller's capability/scope.
4. A row/detail view MAY show locations, conformance, discrepancies, and related WRR references only when the caller is authorized to see them.
5. The ledger SHALL be read-only; corrections create approved new records/transactions and do not edit or delete immutable history.

### R9. Authorization, audit, and privacy

1. All staging, scanning, inspection, confirmation, cancellation, attachment, and ledger reads SHALL use the shared capability/scope contract from `02-rbac-roles`.
2. Party/flow scope SHALL be checked against the current WRR and related records; client-supplied party or flow values SHALL not establish authorization.
3. The UI MAY hide unavailable actions, but server and RLS enforcement remain authoritative.
4. Receipt lifecycle changes, exception decisions, confirmations, and non-conformance resolutions SHALL be attributable to an actor, timestamp, and correlation ID through the approved audit path.
5. CIPL/evidence files SHALL use private Storage and authorized access from `04-services-and-infrastructure`.
6. Errors and monitoring data SHALL not expose tokens, SQL, protected records outside scope, or unnecessary personal data.

### R10. Offline and resilience behavior

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
- [ ] Putaway is a handoff/recommendation until physically confirmed, and incoming ledger views authoritative transactions only.
- [ ] Party/flow scope, RLS, stale state, revoked access, and direct-identifier manipulation are tested.
- [ ] Offline scan behavior is simulated and enrollment/confirmation remain blocked offline.

## 6. Dependencies and exclusions

- Depends on approved `01-core-data-model` tables and transitions: `parties`, `items`, `locations`, `lots`, `wrr_documents`, `wrr_items`, `wrr_inspection_logs` where retained, and `inventory_transactions`.
- Depends on `02-rbac-roles` for capabilities, party/flow scope, RLS, and audit attribution.
- Depends on `03-offline-mode-and-client-storage` for the Tier 1 scan allowlist and replay contract.
- Depends on `04-services-and-infrastructure` for Auth, private Storage, email/monitoring, server transactions, and idempotency.
- Depends on `05-ui-shell-and-navigation` for protected routes, floor/office surfaces, page headers, and status feedback.
- Uses `06-party-and-item-enrollment` for unknown item recovery; does not copy its enrollment logic.
- `11-transfer-and-inspection` owns transfer-specific inspection, not inbound WRR conformance.
- `08`, `09`, `10`, `12`, and `13` own outbound commitment, approvals, documents, VMI billing, and Trading pricing respectively.
