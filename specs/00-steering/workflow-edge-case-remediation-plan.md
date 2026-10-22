# Workflow Edge-Case Remediation Plan

Status: Draft implementation plan  
Updated: 2026-10-22  
Scope: End-to-end WIMS workflow from enrollment through receiving, inspection,
transfers, inventory, pick-list commitment, dispatch, documents, portal,
billing, offline recovery, and reporting.

## 1. Purpose and release rule

This plan converts the workflow audit into implementable work. Every end-user
edge case must have:

1. a deterministic server-side resolution;
2. a user-facing message containing what happened, why, and the next action;
3. an audit event when the operation changes or rejects operational state;
4. unit, real-Postgres/RLS, concurrency, or Playwright coverage appropriate to
   the risk;
5. idempotency or a safe retry result where a network timeout can occur.

No application implementation or migration may begin until the owning
feature's `requirements.md`, `design.md`, and `tasks.md` are Approved with the
required sign-offs. This document is a planning artifact and does not authorize
implementation by itself.

## 2. Priority and execution order

| Priority | Workstream | Outcome |
|---|---|---|
| P0 | Transaction integrity | No operation creates a false success, partial reservation, duplicate movement, or invalid state transition. |
| P0 | Receiving and dispatch concurrency | Simultaneous scans and retries produce one authoritative result. |
| P0 | Pricing/document contract | Pick lists and acknowledgement receipts contain the correct immutable price snapshot. |
| P0 | Authorization and scope | Direct actions, deep links, stale pages, and RLS all enforce the same scope. |
| P1 | Offline and recovery | Offline observations are durable and visibly distinct from committed server state. |
| P1 | Portal and operational UI | Every visible action is functional or clearly marked unavailable. |
| P1 | Billing and Trading completion | Close, payment, PDF, email, and price-freeze failures are recoverable. |
| P2 | Reporting, performance, accessibility, and UAT | No synthetic or stale data is presented as authoritative and the full workflow is proven on floor devices. |

Execution order:

1. Lock the shared state machines, quantity invariants, ownership semantics,
   idempotency contracts, and error vocabulary in specs `01`, `02`, `03`, `04`,
   `07`, `08`, `10`, `11`, `12`, `13`, and `22`.
2. Add failing unit and integration tests for each P0 defect.
3. Implement database constraints/functions and server actions.
4. Run real-Postgres/RLS and concurrency verification.
5. Implement UI recovery states and floor/portal flows.
6. Run Playwright, mobile scanner simulation, offline tests, and UAT.

## 3. Cross-cutting contracts to establish first

### 3.1 State-machine contract

Define allowed transitions and reject all others with `invalid_transition`.
The database must enforce the enum/domain; the server command must enforce the
transition graph; the update must include the expected current state/version.

Required state machines:

- WRR: `staged → receiving_in_progress → confirmed`; `staged → cancelled`.
- Inspection case: `open → passed | failed | returned | held`.
- Transfer: `staged → pending_approval → approved → in_progress → completed`,
  with explicit cancellation rules and no backward transitions.
- Pick list: `allocated → picked → dispatched`; expiry/release before dispatch.
- Commitment: `active → released | expired | consumed`.
- Generated document: `pending → generated | failed`, with controlled retry.
- Billing period: `draft → issued`; close is one-time and atomic.

### 3.2 Quantity and identity contract

All commands must reject non-finite, negative, zero, fractional, or
SPQ-incompatible quantities where the workflow requires whole units. Every
line must verify item, lot, location, flow, party ownership, and parent-record
membership inside the same transaction. Client-provided IDs are requests, not
authoritative allocation decisions.

### 3.3 Idempotency and concurrency contract

Every mutating floor command receives an idempotency key or stable operation
identity. Commands must either return the original authoritative result or make
no change. Use row locks or compare-and-swap version predicates, check affected
row counts, and reject stale writes with a recoverable refresh message.

### 3.4 Error contract

Standardize errors into stable codes and UI messages:

| Code | User message pattern |
|---|---|
| `stale_record` | “This record changed in another session. Refresh to see the current state.” |
| `invalid_transition` | “This action is no longer available because the record is already {state}.” |
| `insufficient_stock` | “Only {available} units remain. Review the allocation or choose another source.” |
| `scope_denied` | “You do not have access to this organization/location.” |
| `duplicate_operation` | “This operation was already completed. The original result is shown.” |
| `offline_not_supported` | “This action requires a connection. Your scan observation was saved locally.” |
| `document_pending` | “The operation succeeded; the document is still being generated.” |
| `document_failed` | “The operation succeeded, but the document failed. Retry generation or contact an administrator.” |

Log correlation ID, actor, command, parent record, result code, and database
error server-side; never expose raw SQL/provider errors.

## 4. Detailed remediation matrix

### 4.1 Enrollment and master data

| Edge case | Resolution | Verification |
|---|---|---|
| Missing/inactive organization selected for an item | Validate existence, active status, and permitted relationship in the server command. | Real-Postgres rejection and field-level UI test. |
| Item duplicate code/barcode | Keep database uniqueness; translate constraint errors to the exact field and retain form input. | Concurrent create test plus UI retry test. |
| Item/location deactivated while operationally referenced | Warn before deactivation; block new WRR, transfer, allocation, or putaway use; preserve historical references. | Deactivation with open and historical references. |
| Concurrent duplicate role assignment | Add scoped uniqueness or transactional duplicate prevention for party roles. | Two simultaneous role-add commands. |
| Bulk location naming collision or huge range | Validate bounded range, normalize names, preflight conflicts, and return per-row results. | Duplicate, overflow, partial-failure, and retry tests. |
| Stale item edit | Use an explicit version/updated-at CAS and return `stale_record`; never overwrite silently. | Two-tab edit test. |
| Organization-role ambiguity | Keep the UI label **Organization** for the record; model Trading Supplier, Trading Customer, VMI Customer, and VMI End Customer relationships explicitly. Treat stock owner/source and destination as workflow context. Do not overload `default_supplier_party_id`. | Spec decision, migration review, and pick-list scope tests. |
| Inactive item/location appears in a stale form | Revalidate server-side and refresh the selector after rejection. | Stale browser page test. |

### 4.2 Receiving and WRR

| Edge case | Resolution | Verification |
|---|---|---|
| Barcode belongs to another flow | Pass WRR flow type into matcher and enforce it server-side. | VMI/Trading/Supplies cross-flow barcode tests. |
| Unknown, malformed, whitespace, or case-variant barcode | Normalize only approved formats; return a specific barcode error and preserve scan-loop readiness. | Unit matrix of malformed and normalized values. |
| WRR document QR scanned as a unit | Reject as `wrr_document_qr` with “open this WRR; scan a unit label next.” | Playwright scan-loop test. |
| Same unit scanned twice | Unique `(wrr_item_id, unit_id)` constraint plus idempotent duplicate result; quantity must not change. | Concurrent duplicate scan test. |
| Two users scan the same line | Lock/CAS the WRR line and return the second user the updated remaining quantity. | Real-Postgres concurrent scan test. |
| Scan after WRR status changes | Conditional update requires `receiving_in_progress`; return `invalid_status`. | Confirm/cancel/scan race test. |
| Scan response is lost | Require operation key and return original scan result on retry. | Network timeout/retry Playwright test. |
| User changes disposition after scanning | Allow changes only before the first accepted scan; otherwise provide an explicit reset/reconciliation command. | UI and server transition tests. |
| Missing/damaged/inspection quantity | Represent missing as variance, never inventory; require valid disposition and balanced location allocations. | Partial line, missing box, damaged box, and mixed disposition tests. |
| Duplicate/inactive putaway location | Validate unique active locations and exact allocation total before commit. | Allocation validation tests. |
| WRR closed as shortage from staged/cancelled state | Require receiving-in-progress and unresolved shortage evidence; persist reason and affected lines. | Invalid-state and missing-reason tests. |
| WRR shortage close retried | Conditional state transition and idempotency return the original confirmed result. | Duplicate command test. |
| CIPL upload missing/corrupt/too large | Validate MIME, size, storage path, and checksum; keep WRR staged if upload fails. | Storage/provider failure tests. |

### 4.3 Inspection and disposition

| Edge case | Resolution | Verification |
|---|---|---|
| Case references nonexistent or mismatched source | Resolve source polymorphism through typed validators; verify lot/item/party/flow/context relationship. | Invalid reference matrix. |
| Duplicate open case | Add unique open-case constraint or transactional existence check for the same source/lot/context. | Concurrent open-case test. |
| Two supervisors resolve one case | Update with `WHERE id = ? AND status = 'open'`; require affected row count = 1 before inserting disposition. | Concurrent resolution test. |
| Disposition quantity invalid | Enforce positive integer, no greater than affected quantity, and exact allocation balance. | Unit and database check tests. |
| Invalid storage/inspection location | Validate location type, active status, flow compatibility, and party scope. | RLS and location-type tests. |
| Stale inspection page | Return `stale_record`; reload current case and show the completed disposition. | Two-tab test. |

### 4.4 Transfers

| Edge case | Resolution | Verification |
|---|---|---|
| Transfer created without lines | Insert header and all validated `transfer_lines` in one transaction; rollback header if any line fails. | Real-Postgres create/read test. |
| Empty, duplicate, fractional, or non-finite lines | Validate line count, unique item/lot/location identity, positive integer quantities, and SPQ rules. | Validator matrix. |
| Lot/item/flow/source mismatch | Resolve each lot and balance inside transaction; reject mismatches before header insert. | Cross-flow and wrong-lot tests. |
| Insufficient source quantity | Lock balance rows, calculate available quantity, and reject atomically without a partial transfer. | Concurrent transfer allocation test. |
| Invalid status transition | Enforce state graph in action and database function; use expected version. | Every transition and race test. |
| Source/destination inactive or same | Reject with actionable location error. | Location validation tests. |
| Transfer approval stale/revoked | Revalidate approval, actor scope, and quantity/version at execution time. | Revoked/stale approval test. |
| Transfer request timeout/retry | Stable request key returns the original transfer ID. | Lost-response test. |

### 4.5 Pick-list generation and reservation

| Edge case | Resolution | Verification |
|---|---|---|
| Stale client allocation | Recompute FIFO/FEFO from current balances inside the transaction. | Changed-balance integration test. |
| Insufficient stock or concurrent reservation | Lock/version-check all balance rows; aggregate requested quantities before updates; rollback every insert on failure. | Multi-user collision test. |
| Invalid quantity/SPQ | Reject non-finite, fractional, zero, negative, and invalid box quantities. | Validator tests. |
| Wrong customer/end-customer relationship | Validate active relationship, selected flow, stock-owner scope, and assignment. | VMI/Trading/Supplies party matrix. |
| Stale customer after flow/organization change | Clear dependent selections in UI and revalidate all relationships server-side. | Form transition and direct-action tests. |
| FIFO override invalid/stale | Require current approval, exact requested source, scope, reason, and balance version. | Approval expiry/revocation tests. |
| Duplicate pick-list creation | Use idempotency key and unique generated number with collision-safe sequence/UUID strategy. | Double-submit and same-millisecond tests. |
| Pricing unavailable | Block Trading finalization if price cannot be resolved; freeze VMI per-release reference only; Supplies has no price. | Pricing failure and document snapshot tests. |
| Pick list created but missing from Active Picks | Commit list, lines, commitment, and reservation atomically; revalidate destination queue after success. | End-to-end queue visibility test. |
| Commitment expires during picking | Recheck expiry before each irreversible command; release exactly once and show reallocation path. | Boundary-time and repeated-expiry tests. |

### 4.6 Picking and dispatch

| Edge case | Resolution | Verification |
|---|---|---|
| Shared QR used as an exact box identity | Decide and document whether shared QR is permitted. If exact-box control is required, require unit identity; otherwise label the UI as line-level confirmation and do not claim exact scanning. | Product-owner decision plus Playwright test. |
| Same unit selected concurrently | Lock available units and require affected-row count; return original result for repeated operation key. | Real-Postgres concurrency test. |
| Fewer unit rows than balance | Do not silently manufacture units unless an approved reconciliation command records the variance and audit event. | Aggregate-receipt reconciliation test. |
| Shortage quantity invalid or wrong parent list | Verify parent relationship, state, range, integer/SPQ, and update pick-list item, commitment line, balance reservation, and audit record atomically. | Shortage reconciliation test. |
| Shortage after selection | Block or require explicit release/reallocation before changing quantities. | Selected-unit shortage test. |
| Dispatch before all scans | Server command verifies every line and exact required quantity. | Incomplete scan test. |
| Dispatch timeout/retry | Use dispatch idempotency key and return the original result; never decrement twice. | Lost-response and duplicate dispatch test. |
| Dispatch transaction succeeds but receipt generation fails | Keep dispatch successful, mark document failed, expose retry, and show the operational movement separately from document status. | Document failure/retry test. |
| Cross-party/deep-link dispatch | Enforce action authorization plus RLS; never rely on page gating. | Direct server-action and RLS matrix. |

### 4.7 Documents, portal, and labels

| Edge case | Resolution | Verification |
|---|---|---|
| Missing signed download URL | Implement short-lived signed URL action with party scope and document ownership checks; hide/disable download until available. | Portal download and expired-link test. |
| Document pending | Show pending status, polling/manual refresh, and no false “ready” state. | Generation delay test. |
| Document failed | Store failure code/attempt count, allow authorized retry only from failed state, and preserve artifact history. | Retry/idempotency test. |
| Portal inventory filters/export inert | Wire filters to scoped authoritative query and export server action; remove controls until functional. | Filter/export Playwright test. |
| Portal labels mock/disabled | Either implement scoped label generation or remove the route from navigation until implementation is approved. | No-mock-data acceptance test. |
| VMI statement unavailable | Clearly show that the statement is pending/not available; never substitute a pick-list or acknowledgement receipt. | Portal document-type test. |
| Multiple party assignments | Resolve scope from session and require an explicit assignment selector when more than one valid scope exists. | Multi-assignment test. |

### 4.8 Billing and Trading

| Edge case | Resolution | Verification |
|---|---|---|
| Missing exact-date forex rate | Block period close; display required date and supported retry/manual-admin path. Never use a silent fallback. | Missing/weekend/provider failure tests. |
| Missing daily ledger row | Treat as a blocking exception, distinguish from a valid zero row, and provide backfill/replay. | Missing-row versus zero-row test. |
| Duplicate period close | Unique party/period constraint plus transaction-level state check. | Repeated close test. |
| Partial/duplicate/overpayment | Validate payment identity, currency, and allocation; preserve negative balance when overpayment is valid; prevent duplicate application. | Payment matrix. |
| Rate changes during period | Use effective-dated rate selected per billing day; never overwrite historical rows. | Boundary-date rate test. |
| One billing PDF fails | Keep period draft, record artifact failure, allow retry, and do not issue or email incomplete documents. | Four-document failure matrix. |
| Email fails after issue | Keep documents issued, record email failure, provide resend without regenerating financial artifacts. | Resend test. |
| Trading price policy not connected | Complete CRUD and pick-list price-freeze integration before enabling Trading production flow. | Full pricing-to-document E2E test. |
| Taxes/discounts/returns/corrections undefined | Record explicit Product Owner decisions in spec `13`; block unsupported adjustments rather than inventing calculations. | Acceptance checklist. |

### 4.9 Offline, authorization, and recovery

| Edge case | Resolution | Verification |
|---|---|---|
| Device goes offline during scan | Persist only approved Tier 1 observation locally with operation ID, timestamp, actor/session context, and source reference. | Fake IndexedDB and Playwright offline test. |
| Replay after authorization changes | Revalidate current permission, scope, status, and balance; classify rejected observations without applying them. | Revoked-session replay test. |
| Replay ordering conflict | Use per-resource ordering keys and deterministic conflict classes; require supervisor resolution for ambiguous cases. | Out-of-order replay test. |
| Offline user sees “Synced” | Indicator must distinguish online, queued, syncing, failed, and authoritative server state. | Connectivity-state UI test. |
| Offline action attempts pricing/approval/commit/dispatch | Reject locally as online-only and explain why; do not queue Tier 2 financial/state-finalizing actions. | Offline restriction test. |
| Session expires during floor action | Return `forbidden`/`session_expired`, preserve recoverable local observation where allowed, and never claim commit success. | Expired-session test. |
| Browser refresh/back or duplicate submit | Disable repeated primary action while pending and rely on idempotent server command. | Browser navigation test. |
| Provider/database timeout | Return a retry-safe result, correlation ID, and current-state reload path. | Fault-injection test. |

### 4.10 Reporting and analytics

| Edge case | Resolution | Verification |
|---|---|---|
| Query failure shows sample/fallback data | Mark fallback explicitly as unavailable/demo, or fail closed with a retry state. Never display synthetic data as operational truth. | Provider/query failure test. |
| Report scope bypass | Apply session party/location scope in query and RLS, not only filters. | Cross-party report test. |
| Export is stale or incomplete | Serve a versioned generated export with refresh timestamp and generation status. | Export consistency test. |
| Long-running report times out | Queue generation, show progress/failure, and retain generated artifact under permanent retention policy. | Timeout/retry test. |

## 5. Required database and server changes

These are implementation tasks after the relevant specs are approved:

1. Add/verify foreign keys, scoped uniqueness, quantity checks, active-status
   checks, state enums, and version columns for transfer lines, inspection
   cases, commitments, documents, and payment records.
2. Add atomic SQL functions or transaction wrappers for receiving scan,
   inspection resolution, transfer creation/status, shortage reconciliation,
   reservation, pick selection, and dispatch.
3. Add affected-row checks to every conditional update.
4. Add idempotency records or stable operation keys for all floor mutations.
5. Add audit events for rejected transitions, shortages, releases, retries,
   inspection resolutions, price freezes, document failures, and offline replay
   conflicts.
6. Keep `inventory_transactions`, `audit_log`, `lot_history_export`, and
   `generated_documents` append-only/permanently retained according to the
   steering retention decision.

## 6. Terminology and refactoring workstream

Terminology is part of the data contract, not merely a copy change. Refactoring
must update database comments, TypeScript types, action parameters, query
aliases, validation errors, route names, UI labels, print templates, audit
events, tests, and documentation together. Historical database columns may be
retained for compatibility only when their migration/deprecation mapping is
documented.

### 6.1 Canonical vocabulary

The following terms are mandatory throughout new code and user-facing text:

| Canonical term | Meaning | Do not use |
|---|---|---|
| `organization` / `organizations` | The canonical product term for an organization or company that participates in the warehouse business. An organization may hold one or more business roles. | party, supplier, vendor, customer entity, company when referring to the domain record |
| `item` / `items` | A catalogued material or product definition. | SKU, stock item when referring to the catalog record |
| `location` / `locations` | A warehouse storage or operational location. | bin, warehouse section when referring to the record |
| `inventory model` | The user-facing name for the `vmi`, `trading`, or `supplies` inventory partition. | flow type, business type |
| `supplier` | A Trading-only organization relationship representing the source/supplying business. | vendor when referring to the role |
| `customer` | A customer organization relationship, which must be explicitly classified as either Trading customer or VMI customer. | destination organization when referring to the relationship |
| `end customer` | A VMI-only organization relationship representing the final recipient. | customer recipient, consignee unless a separate legal concept is intended |
| `stock owner` / `stock source` | Workflow context describing ownership or origin of a lot/transfer; neither is an additional organization role. | silently treating stock owner/source as supplier or customer |
| `WRR` / `wrr` | Warehouse Receiving Report and its receiving workflow. | receiving slip, goods receipt, withdrawal receipt |
| `pick list` / `pick_list` | The outbound execution document and record. | withdrawal slip, withdrawal request |
| `acknowledgement receipt` / `acknowledgement_receipt` | The outbound acknowledgement document and artifact. | delivery receipt, withdrawal receipt |
| `transfer` / `transfer request` | An internal movement request and its execution lifecycle. Use “transfer request” only for the staged/approval record. | stock movement request when referring to the domain record |
| `inspection case` | The case tracking an inspection decision. | QA ticket, damage ticket |
| `commitment` / `inventory commitment` | The Stage 1 reservation of stock. | reservation when referring to the canonical record, allocation when referring to the reservation record |
| `dispatch` | Stage 2 inventory deduction and outbound completion. | shipment, release, withdrawal |
| `lot` | A received traceability batch. | vendor lot unless the source system concept is explicitly external |
| `unit` / `inventory unit` | A physical tracked receiving/stock unit. | carton when referring to the database identity |
| `quantity remaining` / `quantity committed` | Authoritative lot-location quantities. | available stock unless the exact derived quantity is intended |

### 6.2 Organization and business-role contract

The canonical product term is **Organization**. An organization or company is
represented by one organization record. The organization-role model has exactly
three role families:

1. **Supplier** — Trading only.
2. **Customer** — either Trading customer or VMI customer; these are distinct
   inventory-model-specific relationships, not one interchangeable customer
   role.
3. **End customer** — VMI only.

The same organization may hold more than one valid role when the relationships
are explicitly recorded and do not violate inventory-model rules. Stock owner,
stock source, and destination are workflow context, not additional roles.

The current `party`/`parties` table and related identifiers are legacy
implementation vocabulary. They may remain temporarily as a compatibility
boundary, but they must not leak into the user-facing product or newly designed
domain APIs. A schema rename or compatibility view requires an approved
amendment to the owning data-model and RBAC specifications before migration.

Therefore:

- use `organization`/`organizations` in new TypeScript domain types, actions,
  queries, RLS-facing APIs, audit events, and specifications;
- use **Organization** in all user-facing screens and documents for the
  organization/company record;
- use only the approved role labels **Supplier**, **Customer**, and **End
  customer**; qualify Customer as **Trading customer** or **VMI customer**
  whenever the inventory model matters;
- use **stock owner**, **stock source**, and **destination** only as contextual
  workflow fields, never as organization roles;
- never rename the general organization relationship to **Stock Source**,
  **Supplier**, or **Customer**;
- never infer one business role from another merely because the organization is the
  same record;
- model the selected role/relationship explicitly when a workflow needs it;
- allow one organization to hold multiple roles without duplicating the
  organization record.

The item-to-organization relationship must identify the approved role and
inventory model. A Trading supplier relationship must not be used as a VMI
customer or end-customer relationship, and a VMI end customer must not be
accepted as a Trading customer. If one item has multiple valid organization
relationships, store them separately instead of overloading an
`organization` or `default_supplier` field.

This resolves the terminology clarification: **Organization is the canonical
product and domain term; `party` is a temporary legacy/schema compatibility
term; the only organization roles are Trading Supplier, Trading/VMI Customer,
and VMI End Customer.**

### 6.3 Refactoring sequence

1. **Inventory terminology:** search routes, components, actions, queries,
   schema, migrations, tests, specs, print templates, error strings, and
   analytics for noncanonical terms and classify each occurrence as domain,
   external-source text, or historical compatibility.
2. **Publish a glossary:** add the approved vocabulary and role definitions to
   `specs/00-steering/structure.md` and the owning feature designs. Record the
   organization terminology decision in `revision-log.md`.
3. **Refactor domain types and APIs:** rename TypeScript variables, action
   parameters, query aliases, validation fields, and error codes first. Keep
   temporary compatibility adapters only at external boundaries.
4. **Refactor schema-facing names:** use canonical names for new tables,
   columns, indexes, SQL functions, RLS policy names, and audit event payloads.
   Any legacy column must have an explicit deprecation comment and migration
   mapping.
5. **Refactor user-facing surfaces:** update labels, headings, helper text,
   empty states, errors, confirmation dialogs, scanner messages, print/PDF
   fields, portal copy, and navigation. Use one term per concept.
6. **Refactor tests and fixtures:** rename fixtures and assertions, then add a
   terminology lint/check that fails on prohibited domain aliases outside an
   allowlist for external documents or migration history.
7. **Run seam review:** inspect receiving → inventory → pick list → dispatch →
   ledger → document, and transfer → inspection → receiving, confirming that
   the same record has the same name at every boundary.

### 6.4 Required terminology acceptance checks

| Check | Resolution |
|---|---|
| A form says “supplier” while the action parameter says `organizationId` | Replace the copy or rename the parameter after the role decision; do not leave the mismatch. |
| A Trading supplier is selected as a VMI customer or end customer | Reject the selection and require an organization with an active VMI customer/end-customer relationship. |
| A Trading customer is selected for a VMI flow, or a VMI customer is selected for Trading | Reject the selection unless the organization has the matching inventory-model-specific customer relationship. |
| An organization has multiple valid roles | Represent each role relationship explicitly; do not infer one role from another. |
| A historical document contains an old term | Preserve legally/audit-required historical text, but identify the canonical term in the current UI and template version. |
| External CIPL/DRA uses “supplier” or “SKU” | Preserve the imported source label only in raw-source evidence; map it to `organization`/`item` in the operational model. |
| User searches with an old term | Support a bounded compatibility alias in search if useful, but display only the canonical term. |
| API/client sends a deprecated field | Accept only through a versioned compatibility adapter, emit a deprecation event, and remove it after the migration window. |
| Error message uses “withdrawal slip” or “bin” | Replace it with `pick list`/`location` and add a regression assertion. |

### 6.5 Refactoring definition of done

- No new application code uses `party`, `supplier`, `vendor`, `SKU`, `bin`, or
  `withdrawal slip` as an internal domain term.
- `pick_list` and `acknowledgement_receipt` are used consistently in schema,
  actions, routes, documents, and tests.
- Every use of `organization`, `supplier`, `customer`, and `end customer` has
  an explicitly documented inventory-model relationship; stock owner/source
  and destination are documented as workflow context only.
- The organization/business-role decision is recorded in the revision log before
  dependent code is changed.
- Search, typecheck, unit tests, real-Postgres/RLS tests, generated documents,
  and Playwright assertions use the same vocabulary.
- Compatibility aliases, if retained, are isolated, documented, tested, and
  scheduled for removal.

## 7. Required test program

### Unit tests

- Validators: quantities, SPQ, flow, party, lot, location, status, and pricing.
- State transition tables and error-code mapping.
- Barcode normalization and scan classification.
- FIFO/FEFO and price snapshot calculations.
- Offline conflict classification and idempotency payloads.

### Real-Postgres/RLS tests

- Transfer header/line atomicity and transition graph.
- Concurrent receiving scans and inspection resolution.
- Concurrent reservations, pick selection, shortage reconciliation, and dispatch.
- Foreign keys, uniqueness, quantity invariants, immutability, and retention.
- Internal staff, supervisor, administrator, party user, unrelated party, and
  revoked-session access.

### Playwright tests

1. Enrollment → WRR → scan → receive → inventory.
2. Inventory → allocate → Active Picks → scan → dispatch → ledger/document.
3. Transfer → inspection → receiving/putaway.
4. Duplicate scan, double-submit, stale page, timeout/retry, and expiry.
5. 375px/430px scanner flow, camera denial, keyboard scanner, and lost network.
6. Portal scope, filter, export, signed download, and multi-assignment.
7. Billing close, missing forex, PDF failure, payment, and resend.

## 8. Definition of done

The workflow is release-ready only when:

- every P0 item has a passing real-Postgres test;
- every mutating command is idempotent or explicitly non-retryable with a safe
  user message;
- no visible button is inert or backed by mock data;
- no query failure can present synthetic data as authoritative;
- offline state distinguishes captured, queued, rejected, and committed;
- pricing and document snapshots match the approved flow rules;
- RLS and direct-action tests pass for every party and role boundary;
- the complete Playwright happy path and negative-path suite passes;
- Product Owner decisions for unresolved business rules are recorded in the
  owning spec and revision log;
- feature tasks are Approved before implementation begins.
