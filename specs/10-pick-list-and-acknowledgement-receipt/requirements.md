# Pick List & Acknowledgement Receipt — Requirements

Status: Draft
Updated: 2026-08-05

## 1. Purpose and scope

This feature defines the content, generation, storage, printing, access, and lifecycle of the two outbound documents:

- **`pick_list`** — an operational, priced document used to execute the committed physical pick.
- **`acknowledgement_receipt`** — a priced document generated in-system and printed for physical signature at handoff.

The documents are generated from authoritative workflow snapshots. This feature does not create reservations, allocate FIFO/FEFO stock, decrement inventory, approve overrides, calculate Trading prices, or calculate the authoritative VMI bill.

There is no `withdrawal_slip`, no `awaiting_pricing` lifecycle, and no required scan-back of the signed acknowledgement receipt.

## 2. Actors and access surfaces

- **Warehouse staff** use the pick list on the floor, potentially as a printed or optimized digital view.
- **Office staff/supervisors** generate, print, reprint, review, and resolve document-generation attention states.
- **Party users** access only documents within their current party/flow scope and approved document capability.
- **Administrators/auditors** review documents and history only through approved capabilities; administrative status does not bypass RLS.

Pick-list execution is a floor concern owned by `08`; document review/printing is an office concern. Generated artifacts must remain usable on supported printers and readable on mobile/desktop previews.

## 3. Document lifecycle

The final status/linkage model must be reconciled with `01` and `08`. The intended document lifecycle is:

```text
eligible event → generation_requested → generated → printed/reprinted
                                      └──────→ generation_failed/attention
```

- A pick list becomes eligible when `08` successfully creates the authoritative commitment/pick-list state.
- An acknowledgement receipt becomes eligible after the authoritative dispatch outcome and approved pricing snapshot are available.
- `generated` means the immutable document snapshot and artifact metadata are durably stored; it does not mean the paper was signed.
- `printed/reprinted` is an operational event and does not mutate business inventory or document pricing.
- Generation failure is observable/retryable and SHALL not reverse a committed inventory movement.

## 4. Functional requirements

### R1. Pick-list generation

1. The system SHALL generate a `pick_list` from the authoritative committed state supplied by `08`.
2. The pick list SHALL have a stable unique number/reference, source workflow reference, status, generated timestamp, and actor/system attribution.
3. Pick-list lines SHALL include the approved item code/description, customer/item cross-reference where authorized, lot number, source location label, quantity, UOM, SPQ/box information, flow type, and any roll/meter display values required for physical execution.
4. The pick list SHALL include approved pricing fields because the project document model requires both documents to be priced; the price source and semantics must come from the owning pricing boundary.
5. Pick-list content SHALL reflect the committed authoritative snapshot and SHALL not recalculate allocation, FIFO/FEFO, reservations, or quantities during rendering.
6. A pick list SHALL not be generated from a draft/uncommitted request or client-only allocation state.

### R2. Acknowledgement-receipt generation

1. The system SHALL generate an `acknowledgement_receipt` after the authoritative Stage 2 dispatch outcome from `08` and the required pricing snapshot are available.
2. The receipt SHALL include a stable unique reference, source pick-list reference, destination/party, dispatched line items, quantities/UOMs, lot/location information where approved, date/time, and required signatory/handoff fields.
3. The receipt SHALL include a price for every line/document according to the approved flow contract.
4. Trading price on the receipt SHALL be final for that document and SHALL be supplied by `13-trading-orders-and-pricing`.
5. VMI price on the receipt SHALL be a per-release reference only and SHALL not be treated as the authoritative VMI bill; `12-vmi-billing` owns period-average billing.
6. Supplies pricing/reference semantics SHALL remain unavailable or follow an explicitly approved rule; this feature SHALL not invent a financial meaning.
7. Receipt content SHALL be an immutable snapshot after generation. Reprints SHALL reproduce the same business content unless an approved superseding document process exists.

### R3. Snapshot and consistency rules

1. Document generation SHALL validate the source workflow reference, status, line quantities, pricing snapshot, and current authorization before creating an artifact.
2. The generated document SHALL record the source version/event ID and content hash or equivalent integrity reference.
3. A later change to an item master, party name, location label, price master, or workflow record SHALL not silently rewrite an already generated document.
4. Regeneration after a technical artifact failure SHALL use the same approved business snapshot and SHALL be idempotent.
5. A business correction SHALL create an approved superseding/replacement document with a reason and linkage; it SHALL not edit the historical artifact in place.
6. Document generation SHALL not modify inventory quantities, reservation state, approval state, or billing period state.

### R4. Printing and physical handoff

1. Authorized users SHALL be able to preview and print the pick list and acknowledgement receipt using the approved generated artifact.
2. The acknowledgement receipt SHALL be printed for physical signature at handoff.
3. The system SHALL record print/reprint attempts, actor, timestamp, document version/reference, and safe printer/operation metadata where required.
4. Scanning or uploading the signed paper receipt back into the system SHALL not be required for v1 completion.
5. Printed documents SHALL use opaque/full-opacity surfaces and the approved brand typography/layout rules.
6. The content SHALL remain readable in the physical workflow, including item codes, lot numbers, quantities, UOMs, prices, references, and signature fields.

### R5. Storage and artifact access

1. Generated files SHALL be stored in the approved private `generated-documents` Storage bucket or equivalent.
2. Access SHALL require authorization to the source pick list/receipt and current party/flow scope; possession of a URL SHALL not grant access.
3. Download/preview URLs SHALL be short-lived or session-authorized and SHALL not expose public object paths as authority.
4. Artifact metadata SHALL include document type, source reference, object path, MIME type, size/hash, generation time, version, and retention state as approved by `04`.
5. Storage failure SHALL produce an observable attention/retry state while preserving the source business outcome.

### R6. Reprint, failure, and retention

1. Authorized users SHALL be able to reprint a generated document without changing its content or price.
2. Failed generation SHALL be retryable with bounded idempotent attempts and safe user feedback.
3. A successful inventory/dispatch transaction SHALL not be rolled back because PDF creation, Storage, email, or printer delivery fails.
4. Superseded/replaced artifacts SHALL follow the approved retention/legal policy and remain auditable.
5. A document SHALL not be silently deleted if it is referenced by a workflow, ledger, audit record, or party-facing history.

### R7. Authorization, privacy, and audit

1. Generation, preview, download, print, reprint, supersede, and history reads SHALL use current capabilities and party/flow scope from `02-rbac-roles`.
2. Client-supplied party, document type, price, amount, source reference, or role SHALL not establish authorization or document truth.
3. Party users SHALL not infer other parties' documents through IDs, counts, filenames, filters, errors, notifications, or URL guessing.
4. Generation and print history SHALL record actor/system executor, timestamp, source event/reference, document type/version, and correlation ID.
5. Monitoring payloads SHALL redact document contents, tokens, credentials, unnecessary PII, and pricing details unless explicitly approved/minimized.

### R8. Offline and downstream behavior

1. Document generation, pricing snapshot acquisition, supersession, printing authorization, and final acknowledgement-receipt creation SHALL be online-only in v1.
2. A cached or locally rendered preview SHALL not be represented as a generated authoritative document.
3. Documents MAY be viewed from a bounded local cache only when the owning workflow and offline policy permit it; cached access must remain clearly stale and scope-bound.
4. `08` owns the event that makes each document eligible; `10` owns generation and artifact state.

## 5. Acceptance criteria

- [ ] A committed outbound operation produces one stable, priced pick-list snapshot with approved lines and physical instructions.
- [ ] A successful dispatch produces one stable, priced acknowledgement-receipt snapshot for printed signature.
- [ ] Trading price is final on the document; VMI document price remains reference-only and is not used as the VMI bill.
- [ ] Reprints preserve the original business content and price.
- [ ] Generation/Storage/printer failures do not reverse inventory or silently lose the document request.
- [ ] Private artifact access respects source-record party/flow scope and RLS.
- [ ] No signed-paper rescan, `withdrawal_slip`, `awaiting_pricing`, or offline finalization is introduced.
- [ ] Unit, integration, E2E, manual, and real-Postgres checks in `tasks.md` pass before approval.

## 6. Dependencies and exclusions

- Depends on `01-core-data-model` for `pick_lists`, `pick_list_items`, `parties`, `items`, `locations`, `lots`, and document-related references; final receipt/artifact persistence must be reconciled before approval.
- Depends on `02-rbac-roles` for document capabilities, party/flow scope, RLS, and audit.
- Depends on `03-offline-mode-and-client-storage` for online-only document mutation and cached-preview boundaries.
- Depends on `04-services-and-infrastructure` for private Storage, jobs/retries, monitoring, environment, and printer/document runtime assumptions.
- Depends on `05-ui-shell-and-navigation` for authenticated office routes, responsive preview/review, and safe error/status states.
- Depends on `08` for authoritative commitment/dispatch events and source snapshots.
- Depends on `12` for VMI pricing-reference/billing semantics and `13` for final Trading document pricing.
- `19` owns dispatch scheduling/delivery status beyond document generation and handoff.
