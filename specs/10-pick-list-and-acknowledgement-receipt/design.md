# Pick List & Acknowledgement Receipt — Design

Status: Draft

## 1. Design intent

This feature is an immutable document projection layer over authoritative outbound workflow events. It converts committed/dispatch-completed state into two priced operational documents, stores their artifacts privately, and provides controlled preview/print/reprint access.

The document service never becomes the source of inventory, reservation, approval, or billing truth. It consumes versioned source snapshots and returns durable document status to `08`/the UI.

## 2. Foundational dependencies and source tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `brand-design-system.md`, and `revision-log.md`.
- `01-core-data-model` for canonical outbound document rows and item/party/lot/location relationships.
- `02-rbac-roles` for capability/scope/RLS and audit attribution.
- `03-offline-mode-and-client-storage` for online-only generation and bounded cached-preview semantics.
- `04-services-and-infrastructure` for private Storage, Edge/background jobs, retries, monitoring, and environment boundaries.
- `05-ui-shell-and-navigation` for authenticated office UI, page headers, errors, and responsive preview.
- `08-outgoing-withdrawal-and-two-stage-commitment` for commitment/dispatch source events and authoritative quantities.
- `12-vmi-billing` and `13-trading-orders-and-pricing` for price snapshots and billing interpretation.

### Source tables/read models

| Source | Use | Ownership |
|---|---|---|
| `pick_lists` | Pick-list identity/status/source commitment. | `08`/core workflow owns mutation. |
| `pick_list_items` | Item, lot, location, quantity, UOM, SPQ/box, and document price snapshot fields. | `08`/core workflow owns source values. |
| `parties` | Destination/name/address/contact fields allowed by scope. | `06` master data; current authorized read. |
| `items` | Description/cross-reference metadata where snapshot policy permits. | `06` master data; document must snapshot rendered values. |
| `lots`/`locations` | Lot/location context needed for operational pick or approved receipt content. | Core/08 owns inventory/location truth. |
| `inventory_transactions` | Source dispatch event/reference for acknowledgement-receipt eligibility. | `08`/core owns immutable transaction. |

### Document-owned persistence

The final schema names must be reconciled with `01`/`04`. The intended document-owned records are:

```text
generated_documents
  id, document_type, document_number, source_type, source_id,
  source_version/event_id, snapshot_hash, artifact_path,
  mime_type, size, generated_at, status, supersedes_id,
  created_by/system_executor, correlation_id

document_events
  document_id, event_type, actor/system_executor,
  timestamp, safe_printer/operation metadata, correlation_id
```

An alternative is separate `acknowledgement_receipts` metadata plus artifact rows. The invariant is one immutable business snapshot per document version, private artifact linkage, append-only generation/print history, and no mutation of the source inventory records.

## 3. Document eligibility and event contract

`08` emits/records two authoritative eligibility events:

```text
commitment/pick-list-created
  → pick_list generation requested

dispatch-committed + pricing snapshot available
  → acknowledgement_receipt generation requested
```

Events contain opaque source references, source version/event IDs, correlation/idempotency keys, and the minimum data needed to load an authorized snapshot. They do not contain raw document bodies or secrets.

Generation validates the event and reloads authoritative source data. A repeated event with the same idempotency key returns the existing document/version. A changed source version creates a conflict/attention result rather than silently regenerating a different historical document.

## 4. Snapshot and pricing model

### Pick list snapshot

The pick list snapshot includes operational identity and instructions required by the floor: item code/description, barcode where approved, customer item code, canonical `lot_number`, source location, quantity/UOM, SPQ/boxes, flow, references, and price fields required by the settled document model.

### Acknowledgement receipt snapshot

The acknowledgement receipt snapshot includes the dispatched result, destination/party, line quantities/UOMs, approved lot/reference fields, document references, pricing, totals, date/time, and signature/handoff fields.

The snapshot stores rendered values rather than relying on future joins to mutable master data. This prevents a later item-name, party-address, or price-master change from rewriting a historical document.

Pricing boundaries:

- `13` provides the final Trading price snapshot for the document.
- `12` provides any VMI per-release reference value permitted on the document; it is not the authoritative period bill.
- Supplies pricing/reference behavior requires an approved owner decision before non-zero financial rendering.
- `10` validates presence/shape and freezes the supplied snapshot; it does not calculate, override, or infer price.

## 5. Generation pipeline

```text
authoritative source event
  → authorize source + load snapshot
  → validate document policy + pricing presence
  → create generation record/idempotency lock
  → render approved template
  → validate PDF/artifact metadata/hash
  → upload private artifact
  → commit generated status + metadata
  → expose scoped preview/print URL
```

Artifact upload and metadata persistence require a reconciliation path if one succeeds without the other. Retries are bounded and idempotent. The pipeline may run inline or through the approved Edge/job boundary depending on final size/runtime measurements.

Document generation failure never rolls back a committed inventory transaction. A failed record remains visible to authorized office users with retry/attention state.

## 6. Template and print design

The final printed fields require product-owner confirmation. The template contract must define:

- document number/type and source references;
- date/time and operational status;
- party/destination and authorized address/contact fields;
- item code first/prominent, descriptions, cross-references, lot/location, quantity/UOM, SPQ/box/roll-meter representation;
- flow type where operationally/legal appropriate;
- price, line totals, document total, currency, and reference disclaimer where VMI requires it;
- signature/name/date fields for acknowledgement handoff;
- page numbering, print-safe margins, and reprint/version indicator.

Printed documents use the approved brand system: Fira Sans headings/data display, Outfit body, Epilogue functional labels, Roboto Mono for IDs/codes/numeric columns, solid white document surfaces, and no undocumented tokens. Generated PDFs are tested independently from the interactive UI.

## 7. Storage and access

Generated artifacts use the private `generated-documents` bucket/equivalent from `04`. Object paths are server-generated and non-authoritative; authorization always checks the source document and current party/flow scope.

Preview/download uses short-lived signed access or an authorized server response. The browser never receives service credentials. Artifact hashes and metadata support integrity/recovery verification. Retention, supersession, and deletion follow the approved legal/audit policy.

## 8. UI integration

Provisional routes:

```text
app/(authenticated)/
  documents/
    pick-lists/[pickListId]/page.tsx
    acknowledgement-receipts/[receiptId]/page.tsx
```

`08` links to document status from the pick/dispatch workflow. `10` provides preview, download, print, reprint, generation-attention, and history controls. The office surface remains usable on mobile; print actions have accessible labels and status feedback. Floor workflows receive compact document references/print actions but do not render dense document-management UI during active scanning.

## 9. Audit, failure, and re-generation rules

- Generation, artifact upload, preview/download authorization, print, reprint, supersession, and failure are recorded as append-only events where required.
- A technical failure may retry the same snapshot/idempotency key.
- A business correction requires a new superseding document with reason/linkage; historical artifacts remain auditable.
- Email/notification delivery is separate from artifact generation and cannot determine inventory success.
- Realtime may signal document readiness/attention; UI refetches authoritative status and falls back to polling/manual refresh.

## 10. Design verification before approval

- [ ] Reconcile final pick-list fields/statuses and source snapshot event with `01`/`08`.
- [ ] Define receipt metadata/artifact schema and ownership with `04`.
- [ ] Confirm Trading price snapshot and VMI reference-value contracts with `13`/`12`.
- [ ] Confirm template fields, totals, currencies, signature area, page format, and reprint marker with product owner.
- [ ] Confirm source-record/document RLS and signed-access behavior with `02`/`04`.
- [ ] Confirm online-only generation and cached-preview semantics with `03`.
- [ ] Confirm route/status/error integration with `05`.
- [ ] Run `design-system-auditor`, `rbac-rls-reviewer`, and `db-migration-verifier` before approval.
