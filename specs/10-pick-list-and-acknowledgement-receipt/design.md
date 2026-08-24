# Pick List & Acknowledgement Receipt — Design

Status: Approved
Updated: 2026-08-25 — Direct-to-dispatch pick-list amendment

## 1. Design intent

This feature is an immutable document projection layer over authoritative outbound workflow events. It converts committed/dispatch-completed state into two priced operational documents, stores their artifacts privately, and provides controlled preview/print/reprint access.

The document service never becomes the source of inventory, reservation, approval, or billing truth. It consumes versioned source snapshots and returns durable document status to `08`/the UI.

## 2. Foundational dependencies and source tables

Depends on:

- `00-steering/product.md`, `tech.md`, `structure.md`, `testing.md`, `ui-ux-design-plan.md`, and `revision-log.md`.
- `01-core-data-model` for canonical outbound document rows and item/party/lot/location relationships.
- `02-rbac-roles` for capability/scope/RLS and audit attribution.
- `03-offline-mode-and-client-storage` for online-only generation and bounded cached-preview semantics.
- `04-services-and-infrastructure` for private Storage, Edge/background jobs, retries, monitoring, and environment boundaries.
- `05-ui-shell-and-navigation` for authenticated office UI, page headers, errors, and responsive preview.
- `08-outgoing-withdrawal-and-two-stage-commitment` for commitment/dispatch source events and authoritative quantities.
- `12-vmi-billing` and `13-trading-orders-and-pricing` for price snapshots and billing interpretation.

### Source tables/read models

| Source | Use | Ownership |
| --- | --- | --- |
| `pick_lists` | Pick-list identity/status/source commitment. | `08`/core workflow owns mutation. |
| `pick_list_items` | Item, lot, location, quantity, UOM, SPQ/box, and document price snapshot fields. | `08`/core workflow owns source values. |
| `parties` | Destination/name/address/contact fields allowed by scope. | `06` master data; current authorized read. |
| `items` | Description/cross-reference metadata where snapshot policy permits. | `06` master data; document must snapshot rendered values. |
| `lots`/`locations` | Lot/location context needed for operational pick or approved receipt content. | Core/08 owns inventory/location truth. |
| `inventory_transactions` | Source dispatch event/reference for acknowledgement-receipt eligibility. | `08`/core owns immutable transaction. |
| `inventory_commitments` | Commitment number referenced on the pick list. | `08` owns. |

### Document-owned persistence

The final schema names must be reconciled with `01`/`04`. The intended document-owned records are:

```text
generated_documents
  id, document_type, document_number, template_version,
  source_type, source_id, source_version/event_id,
  snapshot_hash, artifact_path, mime_type, size,
  generated_at, status, supersedes_id, supersession_reason,
  currency, created_by/system_executor, correlation_id

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

### 4.1 Pick list snapshot

The pick list snapshot includes operational identity and instructions required by the floor: item code/description, barcode where approved, customer item code, canonical `lot_number`, source location, quantity/UOM, SPQ/boxes, flow, references, and price fields required by the settled document model.

One snapshot may contain multiple item-code lines and, where stock is distributed, multiple source lot/location rows for an item. It carries one destination Organization and Inventory Model from the committed parent `pick_list`. The PDF table renders every committed row in the same order as the authoritative snapshot; it does not render or depend on the editable pre-commit draft.

Once generated, the PDF is the physical staging instruction and the parent pick list is dispatch-ready. The queue links to **View / PDF**, while the operational QR scan occurs only at the direct Dispatch route.

### 4.2 Acknowledgement receipt snapshot

The acknowledgement receipt snapshot includes the dispatched result, destination/party, line quantities/UOMs, approved lot/reference fields, document references, pricing, totals, date/time, and signature/handoff fields.

The snapshot stores rendered values rather than relying on future joins to mutable master data. This prevents a later item-name, party-address, or price-master change from rewriting a historical document.

### 4.3 Pricing snapshot semantics

**Trading:** Unit price on the AR is FINAL at document generation. Sourced from `trading_price_snapshots.unit_price` at the time of pick-list commitment, as supplied by `13`. Never re-fetched after generation. Line totals and document total are final financial values.

**VMI:** Unit price is REFERENCE ONLY. Sourced from `items.selling_price` at generation time, as supplied by `12`. The AR must display the following disclaimer text verbatim:

> "Unit prices are per-release reference values only. Authoritative billing is the period VMI statement."

Period billing is always `12`'s output; the AR total for VMI is informational only and must never be treated as the authoritative bill.

**Supplies:** No price shown on either the PL or the AR. Line total and document total fields are omitted for Supplies flow documents.

**Snapshot hash:** A SHA-256 hash of the serialized line-item data (item_id, lot_id, qty, unit_price, currency) is computed at generation and stored on the `generated_documents` record under `snapshot_hash`. This supports integrity verification and ensures idempotent re-generation produces the same business content.

**Pricing boundaries (unchanged):**

- `13` provides the final Trading price snapshot for the document.
- `12` provides any VMI per-release reference value permitted on the document; it is not the authoritative period bill.
- `10` validates presence/shape and freezes the supplied snapshot; it does not calculate, override, or infer price.

## 5. Generation pipeline

```text
authoritative source event
  → authorize source + load snapshot
  → validate document policy + pricing presence
  → create generation record/idempotency lock (status: pending → generating)
  → render approved template (at current template_version)
  → validate PDF/artifact metadata/hash
  → upload private artifact to documents bucket
  → commit generated status + metadata (status: generating → ready)
  → expose scoped preview/print URL (60-minute signed URL)
```

Artifact upload and metadata persistence require a reconciliation path if one succeeds without the other. Retries are bounded and idempotent (max 3 attempts, 30 seconds between). The pipeline may run inline or through the approved Edge/job boundary depending on final size/runtime measurements.

Document generation failure never rolls back a committed inventory transaction. A failed record remains visible to authorized office users with retry/attention state.

## 6. Document field contracts

### 6.1 Pick List printed fields

The pick-list form/detail/print view is a read-only snapshot. Its operational line values are derived by `08` from available Master Inventory (`items`, `lots`, and `lot_location_balances`/locations) when allocation is committed, then frozen in `pick_list_items`; no document-side CRUD is permitted.

| Field | Source | Format / Notes |
| --- | --- | --- |
| Document number | server-generated | `PL-{YYYY}-{NNNNNN}`, e.g. `PL-2026-000001` |
| Generation date/time | server timestamp at generation | ISO 8601; displayed in Asia/Manila timezone |
| Warehouse name | configuration (single warehouse) | No `warehouse_id` |
| Warehouse address | configuration | |
| Party name | `parties.name` snapshot | Rendered value frozen at generation |
| Party code | `parties.code` snapshot | |
| Delivery to / address | `parties.name`, `address_1`, and `address_2` snapshot | Organization master data; no pick-list entry field |
| Flow type | `pick_lists.flow_type` | Displayed as: VMI / Trading / Supplies |
| *Per line:* item code | `pick_list_items.item_code` | Roboto Mono; first/most-prominent column |
| *Per line:* item name | `pick_list_items.item_description` snapshot | |
| *Per line:* lot number | `pick_list_items.lot_number` | Roboto Mono |
| *Per line:* location code | `pick_list_items.location_label` | Roboto Mono |
| *Per line:* qty to pick | `pick_list_items.qty` | Roboto Mono |
| *Per line:* UOM | `items.uom` snapshot | |
| *Per line:* unit CBM | `items.volume_cbm` snapshot | 4 decimal places |
| *Per line:* SPQ | `pick_list_items.spq` | Master Inventory packaging snapshot |
| *Per line:* number of packages | `pick_list_items.number_of_boxes` | Master Inventory/allocation-derived box count |
| Totals | `pick_list_items` quantities and package counts grouped by UOM | Derived, never typed into the pick list |
| Delivery instructions / remarks | N/A in v1 | This is not inferable from Master Inventory and remains outside the pick-list document until a separately approved delivery-instruction owner exists. |
| Client D.R. No. / DGC D.R. No. / delivery date | N/A in v1 | These are delivery-scheduling references, not Master Inventory data; `19` remains deferred. Do not substitute the pick-list number or invent a value. |
| Commitment reference | `inventory_commitments.commitment_number` | |
| Authorized by | display name of pick-list generator user | |
| Printed by | actor recorded in `document_events` at print time | |
| Status watermark | "REPRINT — [ISO timestamp in Asia/Manila]" | Only on reprints; diagonal overlay, `status-pending` at 20% opacity |

### 6.2 Acknowledgement Receipt printed fields

| Field | Source | Format / Notes |
| --- | --- | --- |
| Document number | server-generated | `AR-{YYYY}-{NNNNNN}`, e.g. `AR-2026-000001` |
| Dispatch date/time | dispatch event timestamp from `08` | Asia/Manila timezone |
| Warehouse name | configuration | |
| Warehouse address | configuration | |
| Party name | `parties.name` snapshot | |
| Party code | `parties.code` snapshot | |
| Delivery address | `parties.address_1` + `parties.address_2` snapshot (concatenated) | Shown if applicable (VMI/Trading with delivery) |
| Flow type | `pick_lists.flow_type` | VMI / Trading / Supplies |
| *Per line:* item code | `pick_list_items.item_code` snapshot | Roboto Mono |
| *Per line:* item name | `pick_list_items.item_description` snapshot | |
| *Per line:* lot number | `pick_list_items.lot_number` | Roboto Mono |
| *Per line:* qty dispatched | actual dispatched qty from Stage 2 execution | |
| *Per line:* UOM | `items.uom` snapshot | |
| *Per line:* unit price | Trading: `trading_price_snapshots.unit_price`; VMI: `items.selling_price` at generation; Supplies: not shown | |
| *Per line:* line total | unit price × qty dispatched | Trading: final; VMI: reference only; Supplies: omitted |
| Currency | ISO 4217 code from pricing snapshot | PHP primary; USD secondary |
| Total amount | sum of line totals per currency | Trading: final; VMI: reference only; Supplies: omitted |
| VMI disclaimer | "Unit prices are per-release reference values only. Authoritative billing is the period VMI statement." | VMI flow only; printed in italic body text below the totals block |
| Dispatched by | warehouse staff display name + designation | Signature block with date line |
| Received by | blank signature line | Party/customer representative; physical paper signed |
| Supervisor sign-off | blank signature line | Additional sign-off block |
| Pick list reference number | `pick_lists.pick_list_number` | Cross-reference on document |
| Status watermark | "REPRINT — [ISO timestamp in Asia/Manila]" | Only on reprints; same treatment as PL |

## 7. Template design, document numbers, and page layout

### 7.1 Template versioning

A `template_version` integer is stored on every `generated_documents` record. Breaking layout changes — field additions or removals, reordered sections, changed signature block structure, changed disclaimer text — increment the version. Non-breaking changes (minor typographic adjustments within the same font family, color token corrections that do not alter layout) do not increment the version. Reprints always use the `template_version` that was current at original generation; the artifact is reproduced from the same template, not re-rendered against the current template.

### 7.2 Document numbers

- Pick list: `PL-{YYYY}-{NNNNNN}`, e.g. `PL-2026-000001`.
- Acknowledgement receipt: `AR-{YYYY}-{NNNNNN}`, e.g. `AR-2026-000001`.
- Numbers are server-generated, sequential within document type and calendar year, and never reused. The sequence resets at year boundary (January 1). Reprints copy the original document number and display the REPRINT watermark; they do not generate a new document number.

### 7.3 Supersession

A cancelled pick list causes its linked AR to be voided (`status = voided`). A voided document cannot be re-activated. Superseding documents (business corrections) are new documents with `supersedes_id` pointing to the voided record and a mandatory `supersession_reason` field. The original artifact remains auditable at its original storage path. Voided documents are visible to authorized office/audit users but cannot be reprinted.

### 7.4 Page layout

- **Paper size:** A4 portrait (210 × 297 mm).
- **Margins:** 20 mm on all four sides.
- **Header (every page):** Dyna-Serv logo (left-aligned) + warehouse name and address (right-aligned). `brand-navy` (`#002060`) header background with white text. Epilogue SemiBold labels.
- **Footer (every page):** "Page n of m" (left) | document number in Roboto Mono (center) | generation timestamp in Asia/Manila time (right). Epilogue SemiBold 9pt.
- **Body typefaces** per `ui-ux-design-plan.md §2`:
  - Fira Sans Bold/SemiBold for section headings and numeric data display.
  - Outfit Regular for body copy and table cell content.
  - Epilogue SemiBold for column headers, field labels, and functional labels.
  - Roboto Mono Regular for item codes, lot numbers, document numbers, and quantity columns.
- **Document surface:** solid white (`surface-white` `#FFFFFF`) — no translucent or blurred surfaces.
- **REPRINT watermark:** "REPRINT — [ISO timestamp]" printed in Fira Sans Bold, `status-pending` (`#F59E0B`), overlaid diagonally across the document body at 20% opacity. Present on every page of a reprinted document.
- No undocumented color tokens. No glassmorphism or backdrop-blur effects.

### 7.5 Currencies

- ISO 4217 code stored on the pricing snapshot and frozen at generation.
- Display uses Asia/Manila locale format: PHP as primary (₱ prefix, 2 decimal places), USD as secondary ($ prefix, 2 decimal places).
- Both currencies may appear on a single document if line items carry different currencies; each line shows its own currency symbol. Document totals are rendered per currency, not converted.
- Currency is frozen at generation and does not change on reprint.

### 7.6 Signatures

- **Pick list:** One "Authorized By" block (pick-list generator's name + designation + date line). No received-by block.
- **Acknowledgement receipt:** Two signature blocks — "Dispatched By" (warehouse staff name + designation + date line) and "Received By" (party/customer representative name + designation + date line) — plus a "Supervisor Sign-off" line.
- Physical paper is signed. Digital capture of signatures is not required in v1. Signature blocks are fixed-position print areas, not form fields.

## 8. Storage and artifact access

### 8.1 Artifact states

```text
pending → generating → ready
                     → failed
                     → voided
```

- **`pending`:** Generation requested; pipeline not yet started.
- **`generating`:** Pipeline active; idempotency lock held. Duplicate events with the same idempotency key return the in-progress or completed result.
- **`ready`:** Artifact stored durably, metadata committed, signed URL issuable.
- **`failed`:** Pipeline exhausted all retry attempts (max 3, 30 s between). Dead-letter notification dispatched to supervisor via `14-notifications`. Source inventory transaction is unaffected.
- **`voided`:** Document superseded or parent pick list cancelled. Artifact remains in storage at original path for audit purposes but access is restricted to authorized auditors.

### 8.2 Retry bounds

Maximum 3 generation attempts per document request. Delay between attempts: 30 seconds. After the third consecutive failure the status transitions to `failed` and a dead-letter supervisor alert is sent via `14`. Retry uses the same idempotency key and approved business snapshot — no new snapshot is fetched on retry.

### 8.3 Storage paths

- **Bucket:** `documents` (private; no public object paths; server-side access only).
- **Pick list:** `pick-lists/{pick_list_id}/{version_uuid}/pick-list.pdf`
- **Acknowledgement receipt:** `acknowledgement-receipts/{pick_list_id}/{version_uuid}/ack-receipt.pdf`
- `{version_uuid}` is a new UUID generated per generation attempt. Multiple versions (reprints, supersessions) for the same document are stored at distinct paths.
- Object paths are server-generated and non-authoritative for access control. Authorization always re-checks the source document, current party/flow scope, and document status before issuing a signed URL.

### 8.4 Signed URL lifetime

60 minutes, matching `04` §10.2. The browser never receives service credentials. URLs are not logged in client-visible monitoring payloads.

### 8.5 Generation failure UX

- **Supervisor:** Receives an alert via `14` (dead-letter notification) after the third failed attempt. Alert includes document type, source reference, and correlation ID. No document content or pricing detail is included in the alert payload.
- **Floor/office user:** Sees "Document unavailable — retry or contact supervisor" with a retry button. The retry button re-queues the same generation request; it does not re-render or re-fetch the pricing snapshot.
- **Workflow impact:** Dispatch, handoff, and inventory state are NOT blocked by document generation failure. The underlying inventory transaction and commitment execution are committed regardless of document status. `08` must not poll or await document readiness before marking a dispatch complete.

## 9. UI integration

Provisional routes:

```text
app/(authenticated)/
  documents/
    pick-lists/[pickListId]/page.tsx
    acknowledgement-receipts/[receiptId]/page.tsx
```

`08` links to document status from the pick/dispatch workflow. `10` provides preview, download, print, reprint, generation-attention, and history controls. The office surface remains usable on mobile; print actions have accessible labels and status feedback. Floor workflows receive compact document references/print actions but do not render dense document-management UI during active scanning.

## 10. Audit, failure, and re-generation rules

- Generation, artifact upload, preview/download authorization, print, reprint, supersession, and failure are recorded as append-only events in `document_events`.
- A technical failure may retry the same snapshot/idempotency key.
- A business correction requires a new superseding document with reason/linkage; historical artifacts remain auditable.
- Email/notification delivery is separate from artifact generation and cannot determine inventory success.
- Realtime may signal document readiness/attention; UI refetches authoritative status and falls back to polling/manual refresh.

## 11. Design verification before approval

- [ ] Reconcile final pick-list fields/statuses and source snapshot event with `01`/`08`.
- [ ] Define receipt metadata/artifact schema and ownership with `04`.
- [x] Confirm Trading price snapshot and VMI reference-value contracts with `13`/`12`. *(Resolved: §4.3)*
- [x] Confirm template fields, totals, currencies, signature area, page format, and reprint marker with product owner. *(Resolved: §6, §7)*
- [ ] Confirm source-record/document RLS and signed-access behavior with `02`/`04`.
- [ ] Confirm online-only generation and cached-preview semantics with `03`.
- [ ] Confirm route/status/error integration with `05`.
- [ ] Run `design-system-auditor`, `rbac-rls-reviewer`, and `db-migration-verifier` before approval.
