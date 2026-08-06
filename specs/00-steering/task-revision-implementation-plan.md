# Task Revision & Implementation Plan

Status: Working plan
Updated: 2026-08-06

This is the retained revision history and implementation handoff plan. It is
not itself an approval record and does not authorize application code,
migrations, or infrastructure changes. A feature may enter implementation only
after its `requirements.md`, `design.md`, and `tasks.md` are all `Approved` and
the tasks sign-off block is complete. At the current checkpoint, the active
Draft gates are `07`, `18`, and `22`; `19` is deferred.

## 1. Cross-cutting decisions to lock first

### 1.1 Canonical inventory contract — `01`

Resolve and verify the shared contract before downstream implementation:

- one canonical WRR-sourced `lot_number`, linked through `wrr_item_id`;
- `lot_location_balances` as the authoritative distributed quantity model;
- derived `lot_inventory_totals` and `qty_available`;
- `inventory_commitments` and `inventory_commitment_lines` as the only durable
  outbound reservation model;
- no `warehouse_id`, `stock_levels`, `vendor_lot_number`, or feature-specific
  reservation ledger;
- final WRR, pick-list, acknowledgement-receipt, transfer, inspection, and
  immutable transaction relationships;
- real-Postgres constraints, indexes, RLS hooks, and idempotency boundaries.

Deliverable: reconcile `01` requirements/design/tasks, run the migration
verifier, complete applicable tests, and obtain the missing second sign-off.

### 1.2 Shared inspection/disposition contract — `07`, `08`, `11`

Use one operational inspection capability with context-specific ownership:

- receiving: scanned quantity may be stored or sent to inspection before it
  becomes available inventory;
- outbound: a committed pick-list scan may dispatch or enter further inspection;
- outbound inspection keeps the commitment active until pass/fail resolution;
- receiving and outbound inspection must not share incompatible inventory
  transitions or silently reuse statuses;
- define inspection case, evidence, disposition, return, hold, and
  reconciliation records before implementation.

Deliverable: update the three designs and requirements, then add cross-feature
state diagrams and transaction examples to the revision log.

### 1.3 Document template contract — `07`, `10`, `04`

Finalize the required printed fields and ownership:

- `07` owns WRR content and receiving print behavior;
- `10` owns pick-list and acknowledgement-receipt content, pricing snapshots,
  artifact versioning, preview, print, and reprint;
- `04` owns PDF rendering, private Storage, retries, integrity metadata, and
  failure recovery;
- implementation target after approval: `/lib/documents/templates/`.

## 2. Revision and implementation plan by task

### `01-core-data-model` — critical path

Revision work:

1. Reconcile the canonical lot number and balance/commitment model.
2. Define exact enums and transitions for WRR, lot, balance, pick-list,
   commitment, inspection, and transaction state.
3. Add all foreign keys, scoped uniqueness, quantity checks, optimistic
   versioning, and immutable-ledger constraints.
4. Define how partial receiving, partial inspection, partial dispatch, failed
   inspection, release, expiry, and reconciliation affect balances.
5. Reconcile RLS ownership with `02` and document/artifact links with `04`/`10`.

Implementation after approval:

- Drizzle schema and migration;
- real-Postgres constraint/RLS tests;
- schema exports and type generation;
- no feature code until the second sign-off is complete.

### `02-rbac-roles` — unstable policy foundation

Revision work:

1. Confirm the final internal roles and additive multi-role behavior.
2. Finalize capability naming for receiving, inventory, pick-list generation,
   FIFO override approval, inspection, dispatch, documents, and reporting.
3. Define party scope, optional `flow_type` scope, operational global scope,
   revocation timing, invitation activation, and self-approval rules.
4. Map every core and feature table to default-deny RLS policies.
5. Define append-only security events and test current-session resolution.

Implementation after approval:

- identity/profile/role/capability tables;
- assignment and revocation commands;
- RLS policies and real-Postgres tests;
- reviewer and audit surfaces.

### `03-offline-mode-and-client-storage` — unstable sync boundary

Revision work:

1. Replace stale withdrawal-line terminology with committed pick-list and
   `inventory_commitment_line` terminology.
2. Define the exact Tier 1 observation payload for receiving scans, pick-list
   scans, and approved inspection observations.
3. Explicitly keep pick-list generation, FIFO override, approval, commitment,
   dispatch finalization, pricing, receipt generation, and confirmation
   commands online-only.
4. Define replay authorization, balance/commitment conflict handling,
   idempotency, ordering, and supervisor resolution.
5. Reconcile connectivity indicators with `05` and policies with `02`.

Implementation after approval:

- IndexedDB/Dexie stores;
- connectivity and outbox manager;
- `/api/sync` validation;
- conflict, stale-cache, and offline E2E tests.

### `04-services-and-infrastructure`

Revision work:

1. Finalize trusted versus user-scoped Supabase/Drizzle access boundaries.
2. Define transaction, idempotency, correlation, retry, and job-enqueue rules.
3. Finalize private Storage buckets and document paths for WRR, pick lists,
   acknowledgement receipts, evidence, and reports.
4. Define PDF generation and artifact reconciliation for the template contract.
5. Resolve Resend, Redis/BullMQ, Upstash, Sentry, Realtime, secrets, backups,
   and provider failure policies.

Implementation after approval:

- shared server/runtime wrappers;
- Storage and document generation infrastructure;
- jobs, email, rate limiting, monitoring, and operational runbooks;
- provider/integration tests.

### `05-ui-shell-and-navigation`

Revision work:

1. Reconcile capability-driven navigation with final `02` capability names.
2. Define authenticated routes for Master Inventory pick-list generation,
   committed pick-list execution, receiving, inspection, dispatch, documents,
   approvals, and sync attention.
3. Define floor versus office shell behavior, including the outbound flow's
   no-withdrawal-request model.
4. Finalize revoked-session, deep-link, loading, error, empty, stale, and
   connectivity states.

Implementation after approval:

- root layouts and protected route groups;
- shell/navigation/status components;
- accessibility and responsive behavior tests.

### `06-party-and-item-enrollment`

Revision work:

1. Reconcile final `01` party/item/category fields and constraints.
2. Define unknown-item recovery from receiving without bypassing online master
   data controls.
3. Confirm barcode immutability, item deactivation impact, packaging/SPQ/UOM
   validation, and flow-specific fields.
4. Ensure reference prices never finalize Trading pricing or VMI billing.
5. Reconcile category ownership with `17` and capabilities with `02`.

Implementation after approval:

- party/item/category forms and commands;
- barcode/reprint flow;
- RLS, validation, audit, and enrollment E2E tests.

### `07-incoming-receiving`

Revision work:

1. Finalize WRR/CIPL fields, required WRR `lot_number`, scan-line model, and
   discrepancy states.
2. Add the receiving disposition: `store` or `inspect/on_hold`.
3. Define how inspected inbound quantity is represented before availability,
   how passing quantity creates lot-location balances, and how failed quantity
   is returned/held/reconciled.
4. Reconcile receipt confirmation with `lot_location_balances`, the shared
   inspection contract, and `inventory_transactions`.
5. Define WRR template fields and print/reprint behavior.
6. Reconcile only scan observation capture as offline; confirmation, item
   enrollment, inspection resolution, and putaway remain online.

Implementation after approval:

- WRR staging and print;
- floor scan/reconciliation;
- store/inspection disposition;
- authoritative receipt commit and putaway;
- real-Postgres and Playwright coverage.

### `08-outgoing-withdrawal-and-two-stage-commitment`

Revision work:

1. Remove all separate withdrawal-request concepts and routes.
2. Define direct Master Inventory pick-list generation input and standard
   FIFO/FEFO path.
3. Define FIFO override approval as the only approval branch before pick-list
   generation.
4. Reconcile Stage 1 with `inventory_commitments` and exact
   `lot_location_balances` rows.
5. Add post-pick disposition: `dispatch` or `further_inspection`.
6. Define `inspection_pending`, commitment preservation, pass/fail handling,
   return, hold, and reconciliation behavior.
7. Reconcile document pricing and generation with `10`, `12`, and `13`.

Implementation after approval:

- Master Inventory pick-list generation;
- FIFO/FEFO allocation and override adapter;
- reservation transaction;
- floor scan and dispatch/inspection disposition;
- immutable pick transaction and document-generation event;
- concurrency, failure, and E2E tests.

### `09-approval-queue`

Revision work:

1. Scope the initial approval type to `fifo_override` only.
2. Define the target snapshot as item, lot, location, quantity, flow, actor,
   reason, and allocation/version context—not a withdrawal request.
3. Finalize one-time consumption, expiry, stale-target, self-approval, and
   concurrent-reviewer behavior.
4. Reconcile approval capabilities and RLS with `02`.

Implementation after approval:

- approval request/decision persistence;
- scoped queue and decision commands;
- consumption transaction tests proving approval cannot authorize a changed
  item, lot, quantity, location, flow, or version.

### `10-pick-list-and-acknowledgement-receipt`

Revision work:

1. Finalize WRR-independent pick-list and acknowledgement-receipt field
   contracts with `08`, `12`, and `13`.
2. Define exact pricing snapshot semantics and VMI reference disclaimer.
3. Define template versions, document numbers, snapshot hashes, reprints,
   supersession, signatures, currencies, and page layout.
4. Define artifact status, retry, Storage access, and generation failure UX.

Implementation after approval:

- `/lib/documents/templates/pick-list.tsx`;
- `/lib/documents/templates/acknowledgement-receipt.tsx`;
- renderer, artifact persistence, preview/print/reprint;
- PDF and Storage integration tests.

### `11-transfer-and-inspection`

Revision work:

1. Separate routine internal transfers from receiving and outbound inspection
   disposition while reusing the shared inspection capability.
2. Define transfer request/line/inspection persistence and ownership.
3. Define source/destination balance movement using
   `lot_location_balances`.
4. Define whether transfer is allowed for committed quantities and how
   outbound `inspection_pending` differs from routine transfer inspection.
5. Define failed inspection, return-to-origin, hold, and reconciliation paths.

Implementation after approval:

- transfer commands and floor source/destination scans;
- inspection/evidence workflow;
- immutable transfer transactions;
- concurrency, capacity, RLS, and physical-flow tests.

### `12-vmi-billing` — unstable commercial model

Revision work:

1. Reconcile the real billing statement, daily CBM ledger, classification,
   multi-currency, delivery, and charge inputs.
2. Define how `lot_location_balances` supplies occupied CBM over time.
3. Finalize period-average billing, forex locking, corrections, credits, and
   document reference values.
4. Ensure no per-release document price becomes the authoritative VMI bill.

Implementation after approval:

- billing ledger and scheduled calculation;
- statement generation and exports;
- forex and period-boundary tests.

### `13-trading-orders-and-pricing` — unstable commercial model

Revision work:

1. Define the Trading order/price lifecycle independently from pick-list
   generation.
2. Define final price authority, price snapshots, margins, overrides,
   currencies, tax/discount behavior, and effective dates.
3. Define the interface consumed by `08`/`10`; master item prices remain
   reference data only.

Implementation after approval:

- price/order commands and authorization;
- immutable document pricing snapshots;
- concurrency, audit, and real-Postgres tests.

### `14-notifications-and-alerts`

Revision work:

1. Finalize event taxonomy for WRR disposition, inspection attention, FIFO
   override, pick-list readiness, dispatch, document failure, and thresholds.
2. Define recipient capability/party/flow scope and safe projections.
3. Define deduplication, retry, read/acknowledge semantics, retention, and
   offline stale-read behavior.
4. Ensure notification delivery never mutates source workflow state.

Implementation after approval:

- notification persistence and routing;
- Realtime/polling feed;
- email mirrors and scoped notification UI;
- retry, privacy, RLS, and outage tests.

### `15-ai-chatbot`

Revision work:

1. Reconcile tools with canonical parties/items/locations/lots and derived
   balance views.
2. Ensure chatbot answers distinguish remaining, committed, and available
   quantities without authorizing pick-list generation or dispatch.
3. Finalize role/persona scope, tool allowlists, prompt-injection handling,
   audit, rate limits, and offline-disabled behavior.

Implementation after approval:

- server-side tool registry and scoped query adapters;
- read-only chat surface;
- authorization, leakage, abuse, and resilience tests.

### `16-reporting-and-analytics`

Revision work:

1. Reconcile all metrics with `lot_inventory_totals` and immutable
   `inventory_transactions`.
2. Define reporting treatment for committed, inspection, held, depleted, and
   available quantities.
3. Finalize valuation, CBM, aging, movement, FIFO/FEFO, and flow-partition
   calculations with `12`/`13` boundaries.
4. Define export scope, generated reports, retention, and stale/offline rules.

Implementation after approval:

- authorized read models/queries;
- dashboards and exports;
- performance, RLS, valuation, and reconciliation tests.

### `17-product-categorization-and-classification`

Revision work:

1. Finalize taxonomy ownership, hierarchy, ordering, active status, versioning,
   and effective dates with `01` and `06`.
2. Define item classification history and whether changes affect existing lots
   or only future enrollment.
3. Ensure category changes cannot alter pricing, billing, or inventory history.

Implementation after approval:

- taxonomy administration and seeds;
- enrollment selectors and validators;
- history, RLS, and reporting integration tests.

### `20-documentation-training-and-uat`

Revision work:

1. Update the user journey around WRR disposition, direct pick-list
   generation, FIFO override approval, and outbound inspection.
2. Define UAT scenarios for standard FIFO, override, dispatch, further
   inspection, receiving store, receiving inspection, failure, offline scan,
   and document reprint.
3. Define severity, evidence, sign-off, training roles, and operational
   readiness criteria.

Implementation after upstream approval:

- runbooks and user guides;
- scripted UAT and floor simulations;
- defect triage and final acceptance evidence.

### `21-user-profile-and-settings`

Revision work:

1. Reconcile profile, invitation, activation, suspension, MFA, and session
   behavior with the final `02` RBAC model and `04` identity boundary.
2. Define which settings are global, party-scoped, or unavailable to users.
3. Define security-event and notification behavior for privilege changes.

Implementation after approval:

- profile/settings surfaces;
- invitation, suspension, session-revocation, and MFA flows;
- authorization, audit, and accessibility tests.

## 3. Recommended execution sequence

```text
01 core model
  → 02 RBAC + 04 infrastructure
  → 05 shell + 03 offline boundary
  → 06 master data
  → 07 receiving + shared inspection contract
  → 09 FIFO override approval
  → 08 pick-list generation/commit/dispatch
  → 10 documents
  → 11 transfer/inspection
  → 12/13 commercial boundaries
  → 14 notifications + 15 chatbot + 16 reporting
  → 17 categorization + 21 settings
  → 20 UAT/documentation
```

`12` and `13` may be drafted in parallel, but `08` and `10` must consume their
approved contracts before implementation. No task is implementation-ready
until its own requirements/design/tasks chain is approved and its required
upstream contracts are signed off.
