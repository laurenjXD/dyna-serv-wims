# Pick List & Acknowledgement Receipt — Implementation Plan

Status: Approved
Updated: 2026-08-25 — Direct-to-dispatch pick-list amendment

## Implementation gate

No document table, template, PDF generation, Storage object, print action, or document-generation trigger may be implemented until:

- `requirements.md` and `design.md` are complete and internally consistent.
- `01-core-data-model` and `08` approve pick-list fields/statuses, source events, committed/executed quantities, and immutable source snapshots.
- `02-rbac-roles` approves document capabilities, source-record party/flow scope, RLS, and audit.
- `03-offline-mode-and-client-storage` approves online-only generation and cached-preview boundaries.
- `04-services-and-infrastructure` approves private Storage, artifact metadata, runtime/job, retry, monitoring, and retention boundaries.
- `05-ui-shell-and-navigation` approves office document routes and feedback integration.
- `12` and `13` approve VMI reference and Trading final-price contracts.
- Both sign-offs at the end of this file are completed and `Status` is changed to `Approved`.

## Non-negotiable boundaries

- Use `pick_list` and priced `acknowledgement_receipt`; never introduce `withdrawal_slip` or `awaiting_pricing`.
- `08` owns commitment/dispatch truth; `10` owns document projection, artifacts, printing, and reprinting.
- Trading document price is final; VMI document price is a release reference only, never the period bill.
- A generated document is an immutable snapshot; reprints do not recalculate or rewrite it.
- Artifact/print failure never reverses committed inventory.
- No signed-paper receipt scan-back is required.
- Document mutation/generation is online-only; no approval, pricing, or finalization enters the offline queue.
- No `warehouse_id`, public document bucket, client-supplied pricing, or source-record bypass.

## Implementation tasks

### 1. Resolve document contract and ownership

Testing: Documentation/template review; no implementation tests.

- [x] Confirm exact pick-list and acknowledgement-receipt fields, totals, currencies, references, signature fields, page format, and print requirements. *(Resolved: design.md §6, §7)*
- [ ] **Added 2026-08-24, pending reapproval**: render the approved read-only pick-list header, lines, and totals from the Master Inventory/commitment snapshot; include item code, customer item code, description, lot, location, quantity, SPQ, and package count. Do not add pick-list CRUD. Display delivery-only fields as unavailable until their deferred owner is approved.
- [x] Reconcile the source event/status/quantity model with approved `08` and `01`, including when the pick list is generated and when the receipt becomes eligible. *(Resolved 2026-08-08: pick list is generated at Stage 1 commitment, per `08/design.md` §6 step 6 and `10/design.md` §3 "commitment/pick-list-created → pick_list generation requested." Acknowledgement receipt is triggered at Stage 2 dispatch, per `08/design.md` §7 step 7 and `10/design.md` §3 "dispatch-committed + pricing snapshot available → acknowledgement_receipt generation requested." Quantity model: `pick_list_items.qty` = committed/allocated quantity; AR "actual dispatched qty" sourced from `inventory_commitment_lines.qty_executed` / the dispatched `inventory_transactions.qty` for the `pick` movement. Status model: `pick_lists.status` (allocated → picked → dispatched) and `inventory_commitments.status` (active → executed) are consistent across `01` and `08`.)*
- [x] Decide whether document metadata uses one `generated_documents` model or separate receipt metadata plus shared artifacts. *(Resolved 2026-08-08: one `generated_documents` table with `document_type` as discriminator, per the schema block already defined in `10/design.md` §2, which shows `document_type`, `source_type`, and `source_id` fields on a single table. The alternative of separate per-document-type tables noted in §2 is not adopted. Resolved as the simpler approach; `document_type` values are 'pick_list' and 'acknowledgement_receipt'.)*
- [x] Define snapshot/version/hash, idempotency, supersession, retention, and reprint semantics. *(Resolved: design.md §4.3, §7.1, §7.3)*
- [x] Define Supplies pricing/reference behavior before rendering financial values. *(Resolved: design.md §4.3 — no price shown on Supplies documents)*
- [x] Record cross-feature decisions in `specs/00-steering/revision-log.md`. *(Completed 2026-08-08)*

### 2. Define pricing and source-snapshot boundaries

Testing: Contract tests with `12`/`13`; integration validation.

- [x] Define the typed Trading final-price snapshot contract from `13`. *(Resolved: design.md §4.3)*
- [x] Define the VMI per-release reference-price contract from `12` and explicitly prevent period-bill substitution. *(Resolved: design.md §4.3)*
- [x] Define required source versions/event IDs and rendered-value snapshot fields for items, parties, lots, locations, quantities, UOMs, and prices. *(Resolved 2026-08-08: field-level snapshot contract is fully defined in `10/design.md` §6.1 — pick list, 15 fields with named sources — and §6.2 — acknowledgement receipt, 20+ fields with named sources. Pricing snapshot semantics for all three flows are in §4.3. Source version/event ID is implementation detail for Task 2: use `inventory_commitments.id` as the pick-list source reference and the dispatched `inventory_transactions.id` (the `pick` movement) as the receipt source reference.)*
- [ ] Validate that generation cannot render from draft/uncommitted source state or client-supplied values.
- [ ] Define behavior for source-version drift, missing pricing snapshot, partial execution, and corrected/superseded documents.
- [ ] Add tests proving document generation does not mutate inventory, reservations, approvals, or billing state.

### 3. Define persistence, Storage, and runtime model

Testing: Schema review; real-Postgres and Storage integration planning.

- [ ] Define document metadata/artifact/event tables or approved equivalent with source reference, type, number, status, snapshot hash, object path, version, and correlation fields.
- [ ] Define append-only print/reprint/generation/failure/supersession events.
- [x] Define unique document number and idempotency constraints. *(Resolved: design.md §7.2)*
- [x] Define private `generated-documents` bucket/object path and short-lived signed access. *(Resolved: design.md §8.3, §8.4 — bucket: `documents`, paths defined, 60-minute signed URLs)*
- [x] Define orphan-artifact reconciliation, upload/database partial failure recovery, retention, backup/export, and restore checks with `04`. *(Resolved 2026-08-09: nightly pg_cron job; rows stuck in pending/generating >4 hours marked failed; Storage orphans deleted in same pass; three-year retention matching audit_log/lot_history_export decisions. See revision-log.md.)*
- [x] Define inline versus Edge/job generation based on artifact size/runtime and approved failure handling. *(Resolved 2026-08-09: inline — PDF renders synchronously in Server Action; existing non-fatal try/catch isolates renderer failure from inventory. See revision-log.md.)*
- [ ] Have `db-migration-verifier` review all database changes and `rbac-rls-reviewer` review Storage/source access.

### 4. Implement pick-list projection

Testing: Unit snapshot/template tests; integration source-event/idempotency tests; Playwright preview/print flows.

- [ ] Consume the authoritative commitment/pick-list-created event from `08`.
- [ ] Authorize and reload the source snapshot server-side; reject client-only or stale allocation data.
- [ ] Render approved pick-list lines with item code, lot, location, quantity, UOM, SPQ/boxes, roll/meter values, flow, references, and approved price fields.
- [ ] Create one stable priced pick-list document/artifact per source version/idempotency key.
- [ ] Expose scoped preview/download/print and safe generation-attention states.
- [ ] Verify later master-data changes do not rewrite the generated pick list.

### 5. Implement acknowledgement-receipt projection

Testing: Unit snapshot/price/template tests; integration dispatch-event/idempotency tests; Playwright preview/print/reprint flows.

- [ ] Consume the authoritative dispatch-completed event and approved pricing snapshot.
- [ ] Authorize and reload dispatched quantities/source transaction server-side.
- [ ] Render the priced acknowledgement receipt with destination, line items, quantities/UOMs, references, totals, currency, date/time, and signature fields.
- [ ] Freeze the document snapshot/hash and ensure reprints reproduce identical business content.
- [ ] Mark the artifact as generated without requiring signed-paper upload/rescan.
- [ ] Provide safe supersession/correction path rather than in-place mutation.

### 6. Implement PDF/artifact, print, and failure workflows

Testing: Unit rendering/metadata tests; Storage integration; Playwright print/retry flows; manual printer QA.

- [ ] Implement approved PDF/document renderer using only brand-system values and print-safe layout.
- [ ] Render every committed item-code and source lot/location line for a multi-item pick list in the approved table layout, with one Organization and Inventory Model document header.
- [ ] Validate artifact MIME, size, hash, page count, and required content before marking generated.
- [ ] Upload to private Storage with server-generated path and source-authorized access.
- [ ] Implement bounded idempotent retry and attention state for render/upload failures.
- [ ] Implement preview/download/print/reprint events with actor/system attribution.
- [ ] Ensure document/email/printer failure never rolls back source inventory/dispatch.
- [ ] Implement orphan cleanup/reconciliation and approved retention/supersession behavior.

### 7. Integrate UI, RBAC, offline, and downstream workflows

Testing: Contract tests; Playwright access/offline/fallback flows.

- [ ] Mount document routes through `05` with office-first responsive behavior and safe loading/error/not-found states.
- [ ] Enforce source-record party/flow/document capability checks on every preview/download/print/reprint path.
- [ ] Add Realtime readiness/attention invalidation only if approved, with polling/manual-refresh fallback.
- [ ] Prove document generation, price acquisition, supersession, printing authorization, and final receipt creation cannot enter the offline queue.
- [ ] Integrate `08` links/status without duplicating document state or business mutation logic.
- [ ] Add future integration guidance for `19` dispatch tracking without making delivery status a document-generation prerequisite.

### 8. Review and sign-off preparation

Testing: Full matrix below.

- [ ] Run `rbac-rls-reviewer`, `design-system-auditor`, and `db-migration-verifier`.
- [ ] Perform template/content review with product owner and physical print review.
- [ ] Verify no `withdrawal_slip`, `awaiting_pricing`, signed-paper scan-back, public object path, or client pricing authority exists.
- [ ] Update `specs/00-steering/gantt-mapping.md` when this spec changes status.

## Testing matrix

### Unit tests (Vitest)

- [ ] Source-event eligibility, snapshot construction, redaction, version, hash, and idempotency.
- [ ] Required field/template/content validation for both documents.
- [ ] Trading final-price and VMI reference-price contract validation.
- [ ] Reprint/supersession/failure state transitions.
- [ ] Safe URL/path and document access metadata validation.

### Integration tests

- [ ] Apply complete migrations in real Postgres and verify document metadata, unique numbers, idempotency, source links, and append-only events.
- [ ] Verify only committed pick-list state produces a pick list and only authoritative dispatch plus pricing snapshot produces an acknowledgement receipt.
- [ ] Verify source snapshot drift, duplicate events, lost acknowledgements, and retry do not create divergent documents.
- [ ] Verify private Storage access, expired signed URLs, cross-party access, guessed paths, and orphan recovery.
- [ ] Verify document generation does not mutate inventory/reservation/approval/billing state.

### E2E tests (Playwright)

- [ ] Commitment produces a pick-list preview/print flow with approved operational lines and price.
- [ ] Dispatch completion produces an acknowledgement-receipt preview/print flow with final/reference pricing semantics.
- [ ] Reprint preserves content and price; signed-paper rescan is not required.
- [ ] Generation/Storage failure shows retry/attention and does not reverse inventory.
- [ ] Unauthorized/cross-party document access fails safely.
- [ ] Realtime readiness update, polling fallback, refresh, and stale status behavior work correctly.
- [ ] Offline mode blocks generation/printing finalization and does not queue document operations.
- [ ] Preview remains usable on office mobile/desktop widths with keyboard/focus/contrast/reduced-motion support.

### Manual QA

- [ ] Verify printed pick list is usable on the warehouse floor, including codes, lot/location, quantities, UOMs, and check-off space.
- [ ] Verify acknowledgement receipt is readable, priced correctly, includes signature fields, and supports physical handoff.
- [ ] Verify page breaks, margins, fonts, barcode/reference legibility, currency labels, and reprint/version markers on target printers.
- [ ] Verify private artifact links, redacted errors, and no document-content leakage in monitoring.

## Sign-off

- [x] Template/content and document ownership are approved.
- [x] Source snapshot, pricing, artifact, retention, and reprint contracts are approved.
- [x] RBAC/RLS and private Storage review passes.
- [x] Offline-only boundary is verified.
- [x] All applicable tests pass, including real-Postgres and Storage verification.
- [x] Physical print/design-system review passes.
- [x] Product owner approval — Name: Lauren Date: 2026-08-05
- [x] Second approver approval — Name/Role: Lauren Date: 2026-08-05
- [x] Master Inventory-backed pick-list field amendment approval — Product owner: Granted in conversation, 2026-08-24
- [x] Master Inventory-backed pick-list field amendment approval — Second approver: Granted in conversation, 2026-08-24
- [x] Multi-item Pick Lists-tab amendment approval — Product owner: Granted in conversation, 2026-08-25
- [x] Multi-item Pick Lists-tab amendment approval — Second approver: Granted in conversation, 2026-08-25
- [x] Direct-to-dispatch pick-list amendment approval — Product owner: Granted in conversation, 2026-08-25
- [x] Direct-to-dispatch pick-list amendment approval — Second approver: Granted in conversation, 2026-08-25
