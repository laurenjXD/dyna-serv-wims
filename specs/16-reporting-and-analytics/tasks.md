# Reporting & Analytics — Implementation Plan

Status: Draft

## Implementation gate

No report routes, analytics tables/read models, export jobs, dashboard code, or scheduled report delivery may be implemented until `requirements.md` and `design.md` are approved, upstream source contracts are reconciled, and both sign-offs below are complete. Writing planning documents is permitted while this feature remains Draft; application code and migrations are not.

## Dependencies and aligned boundaries

- `01` owns canonical data, `inventory_transactions`, lot status, forex rates, and unresolved location/document schema decisions.
- `02` owns capabilities, party/flow scope, RLS, revocation, and audit access; reporting filters never establish authority.
- `03` owns stale/offline status; analytics mutations, refreshes, exports, and scheduled jobs are online-only.
- `04` owns jobs, private Storage, telemetry, retention, rate limits, and failure handling.
- `05` owns authenticated routes and responsive shell integration.
- `07`, `08`, `09`, `10`, `11`, `17`, `18`, and `19` own operational source states/events.
- `12` owns VMI billing-period/CBM truth; `13` owns Trading price snapshots and margin semantics.
- `14` owns alert routing and delivery; `15` receives only approved read-only projections.

## 1. Resolve scope and metric policy

Testing: product, operations, finance, privacy, and design review; revision-log update.

- [ ] Approve the v1 report catalog: inventory, movement, receiving/quality, ageing/expiry, capacity, reorder, fulfillment, valuation, VMI, Trading, and audit/operations views.
- [ ] Create the metric dictionary with formula, owner, source contract, dimensions, units, currency, timezone, freshness, null behavior, and definition version.
- [ ] Decide default partition presentation and which internal roles may see combined VMI/Trading/Supplies totals.
- [ ] Define party-user report catalog and field-level redaction rules.
- [ ] Resolve valuation rounding, daily forex selection, missing-rate behavior, and historical-rate policy.
- [ ] Confirm `12` VMI period-average/CBM inputs and explicitly prevent document reference prices from becoming bills.
- [ ] Confirm `13` Trading final document price, cost, and margin inputs and visibility.
- [ ] Identify thresholds published to `14` and the owning feature for each alert condition.
- [ ] Define freshness SLAs, as-of/timezone display, retention, export limits, and scheduled-report policy.
- [ ] Record decisions in `specs/00-steering/revision-log.md` and update `specs/00-steering/gantt-mapping.md`.

## 2. Reconcile source contracts and read model

Testing: cross-feature schema review; `db-migration-verifier`; real-Postgres query plan.

- [ ] Reconcile the final `01` tables/relations for location quantities, lot placement, reservations, `inventory_transactions`, WRR/inspection, documents, and forex rates.
- [ ] Define typed source adapters for inventory, movement, receiving quality, fulfillment, capacity, valuation, VMI, and Trading.
- [ ] Define report-definition and metric-definition versioning without duplicating source business state.
- [ ] Decide direct-query versus materialized/read-model strategy per report based on freshness and volume.
- [ ] Add source watermark, refresh status, definition version, and data-quality exception contracts.
- [ ] Define indexes/aggregations for item, lot, location, party, `flow_type`, movement type, and time-range filtering.
- [ ] Prove no query introduces `warehouse_id`, `stock_entries`, `withdrawal_slip`, or an alternate movement ledger terminology.

## 3. Implement authorization-safe query layer

Testing: unit scope matrix; real-Postgres RLS integration; `rbac-rls-reviewer` review.

- [ ] Map each report, dimension, measure, and export field to approved `02` capabilities and party/flow scope.
- [ ] Implement server-owned report definitions and allowlisted filters; reject arbitrary SQL, joins, columns, and client-supplied authority.
- [ ] Apply identical scope predicates to detail rows, counts, aggregates, search, pagination, and exports.
- [ ] Implement party-safe, internal, and finance-restricted projections with explicit redaction tests.
- [ ] Add safe denial behavior that does not reveal hidden record existence through totals, errors, IDs, or filenames.
- [ ] Add report execution, denial, export, download, schedule, retention, and failure audit events.

## 4. Build curated dashboards and drill-downs

Testing: Vitest metric tests; Playwright dashboard/accessibility tests; manual reconciliation.

- [ ] Build master inventory dashboard with prominent `item_code`, flow partition, available/reserved semantics, quantity, boxes, CBM, approved value, and freshness/as-of state.
- [ ] Build item → lot → location drill-down with FEFO/FIFO ordering from canonical status/ordering fields and a history view sourced from `inventory_transactions`.
- [ ] Build movement history with canonical movement types, source references, actor, locations, party/flow filters, and compensating movements.
- [ ] Build receiving/inspection, expiry/ageing, capacity, and reorder indicator views with visible data-quality exceptions.
- [ ] Build fulfillment, packing, dispatch, and document operational metrics only from approved `08`/`10`/`18`/`19` contracts.
- [ ] Add approved valuation, VMI, and Trading views only after `12`/`13` sign-off and field-visibility review.
- [ ] Preserve responsive behavior, accessible table equivalents, clear filter scope, and distinct empty/stale/partial/error states.

## 5. Implement freshness, read models, and jobs

Testing: integration and real-Postgres concurrency tests; job retry/dead-letter tests.

- [ ] Implement source watermark and projection refresh behavior with current/stale/partial/rebuilding/failed states.
- [ ] Implement bounded synchronous queries and `04`-backed jobs for large exports, scheduled reports, refreshes, and retention.
- [ ] Make refresh/export/schedule jobs idempotent and safe under retry, duplicate delivery, timeout, and lost response.
- [ ] Re-resolve authorization at export and scheduled-delivery execution time.
- [ ] Store private export artifacts with approved metadata, expiry, retention, hash, and access audit.
- [ ] Integrate Realtime invalidation/polling/manual refresh without claiming that a signal equals synchronization.

## 6. Integrate alerts and AI projections

Testing: contract tests with `14` and `15`; privacy/redaction review.

- [ ] Publish only approved metric/threshold inputs to `14`; keep routing, preferences, deduplication, and delivery in `14`.
- [ ] Expose typed, minimal, scope-bound report projections to `15` with source labels, definition versions, and as-of timestamps.
- [ ] Verify neither integration can execute a report mutation, broaden scope, access raw SQL, or treat stale data as current.
- [ ] Add safe operational telemetry without full report rows, protected commercial data, or export contents by default.

## 7. End-to-end verification and approval readiness

- [ ] Reconcile every v1 metric against hand-calculated source examples for all three `flow_type` partitions.
- [ ] Verify no cross-party or cross-flow discovery through dashboard totals, filters, pagination, exports, caches, URLs, errors, or scheduled delivery.
- [ ] Verify immutable movement history, FEFO/FIFO display, WRR standby handling, valuation/forex behavior, and commercial boundaries.
- [ ] Verify revoked access blocks current detail, cached/export download, scheduled delivery, and AI projection access.
- [ ] Verify offline/stale/partial/failed states and confirm no analytics operation enters the `03` queue.
- [ ] Verify accessibility, responsive layout, data table equivalents, reduced motion, contrast, and report readability.
- [ ] Run Vitest, real-Postgres, integration/job, Playwright, reconciliation, and manual QA checks.

## Sign-off

- [ ] V1 report catalog and metric dictionary approved by product/operations.
- [ ] `01` source/read-model and `02` authorization contracts reconciled.
- [ ] `03` freshness/offline and `04` jobs/Storage/retention contracts verified.
- [ ] `12` VMI and `13` Trading metric/pricing contracts approved for any commercial reports.
- [ ] `14` alert inputs and `15` AI projection contract approved.
- [ ] Tests, reconciliation, accessibility, privacy, and failure-mode QA pass.
- [ ] Product/operations approval — Name: ____________________ Date: ______________
- [ ] Second approver approval — Name/Role: ____________________ Date: ______________
