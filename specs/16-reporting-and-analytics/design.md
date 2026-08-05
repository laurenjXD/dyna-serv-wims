# Reporting & Analytics — Design

Status: Draft

## 1. Design intent

`16` is a governed read layer over canonical warehouse records. It combines curated SQL queries and, where scale requires it, versioned read models/materialized projections. It never becomes a parallel inventory ledger or workflow state machine.

The design favors understandable, reproducible metrics over an unrestricted analytics warehouse in v1. Every result identifies its definition version, scope, source watermark, freshness, and as-of time.

## 2. Dependencies and ownership

Depends on `00-steering` for product, technology, structure, testing, and brand rules; `01` for `parties`, `items`, `locations`, `lots`, `forex_rates`, `wrr_documents`, `wrr_items`, `wrr_inspection_logs`, `inventory_transactions`, and canonical documents; `02` for capability/party/flow scope, RLS, and audit; `03` for stale/offline behavior; `04` for jobs, private Storage, telemetry, retention, and runtime; and `05` for authenticated responsive routes.

Source owners remain `06` party/item data, `07` receiving, `08` outbound commitment/pick/dispatch, `09` approvals, `10` priced documents, `11` transfers/inspection, `12` VMI billing, `13` Trading pricing/orders, `17` categorization, `18` packing, and `19` dispatch/delivery. `14` owns alert delivery. `15` consumes narrow approved projections and does not receive raw SQL access.

## 3. Reporting architecture

```text
canonical source tables + immutable ledger + approved domain events
  -> scoped metric/query layer
  -> optional versioned read models with source watermark
  -> report definition + authorization intersection
  -> dashboard query / export snapshot / scheduled job
  -> UI or private artifact
```

The query layer is the only place where report formulas live. A report definition has a stable key, version, owner, allowed dimensions/measures, source contract, freshness target, and visibility policy. The server resolves the caller's capability and scope before applying filters and selecting fields.

## 4. Canonical source and read-model boundaries

The initial source map is:

| Reporting subject | Authoritative source | Notes |
|---|---|---|
| Item/lot/location inventory | `lots`, canonical location assignment/quantity model from `01`, `items` | Must include `flow_type`; available status remains source truth. |
| Movement history | `inventory_transactions` | Immutable; preserve `movement_type`, actor, locations, and source reference. |
| Receiving/quality | `wrr_documents`, `wrr_items`, `wrr_inspection_logs` | Standby expected stock is not available stock. |
| Valuation | lot/item unit-cost fields + `forex_rates` | Show currency, rate date, and rounding policy. |
| Fulfillment/documents | `08`, `10`, `18`, `19` contracts | Do not invent document states or recalculate prices. |
| VMI commercial measures | approved `12` period/CBM projection | Document price is only a per-release reference. |
| Trading commercial measures | approved `13` frozen price snapshot | Final Trading document price; margin visibility is scoped. |
| Alerts | metric output owned by `16`, routing owned by `14` | No duplicate alert state machine in `16`. |

The exact tables for reserved quantities, location balances, outbound states, price snapshots, and billing periods are unresolved upstream. `16` must consume their approved interfaces rather than hard-code provisional schema names.

## 5. Metric contracts

Each metric contract records:

```text
metric_key, definition_version, owner_feature, source_contract,
dimensions, filters, formula, unit/currency, timezone,
freshness_target, null/missing-data behavior, visibility policy
```

Initial contract families:

- inventory: pieces, boxes, CBM, available/reserved, ageing, expiry, reorder indicator;
- movement: received, putaway, picked, transferred, reconciled quantities and counts;
- receiving quality: expected/scanned variance, conformance rate, non-conformance reasons and trends;
- capacity: occupied CBM, capacity, utilization, missing packaging data;
- fulfillment: request-to-commit, pick, pack, dispatch, delivery milestones and exceptions;
- valuation: USD/PHP inventory value using the approved daily forex rate;
- VMI: period occupancy/CBM and approved billing inputs from `12`;
- Trading: approved sales/cost/margin measures from frozen `13` snapshots.

Metrics with unresolved business definitions remain marked `provisional` and cannot be used for billing, approval, automated workflow decisions, or external party reporting.

## 6. Scope and authorization

The effective query scope is the intersection of:

```text
current session capability
  + allowed resource/action
  + party scope
  + optional flow_type scope
  + report/field visibility policy
  + RLS enforcement
```

The browser may request a report key, permitted dimensions, date range, and filters, but the server owns the report definition, joins, selected columns, scope, and aggregate behavior. Counts and aggregates use the same scope predicate as detail rows so totals cannot disclose hidden records. Export and scheduled-job execution re-resolve this scope at execution time.

Party-safe projections must omit internal Trading cost/margin, restricted VMI billing details, internal Supplies data, inspection evidence, security data, and unnecessary personal data. A combined internal dashboard must label VMI, Trading, and Supplies separately even when showing a total.

## 7. Freshness, snapshots, and failure behavior

For a direct query, the response includes query time, source as-of time, and definition version. For a read model, it also includes the last source event/transaction watermark, refresh completion time, and freshness state (`current`, `stale`, `partial`, `rebuilding`, or `failed`).

Exports use an immutable report snapshot containing the definition version, resolved scope, filter parameters, source watermark, generated time, and artifact hash. The file is stored privately and accessed through current authorization plus a short-lived/session-authorized link.

If a source or projection is unavailable, the system returns an explicit error or stale/partial result according to the metric contract. It does not silently substitute zeros, cached authorization, or an unrelated source. Realtime is only an invalidation hint; reconnect/manual refresh performs a full authorized refetch.

## 8. Client surfaces

Analytics is an office/supervisor surface: desktop-first for dense tables and comparisons, but responsive down to mobile. It follows the approved design system and uses readable data displays, clear scope/filter summaries, accessible charts/tables, and explicit status text. It does not use floor workflow patterns as its primary layout, but any mobile view must remain usable and must not hide the as-of/freshness state.

The master inventory view keeps `item_code` prominent and supports item → lot → location → movement history drill-down. Charts are supplementary; every important visualization has an equivalent table or text summary. Filters show the effective party/flow scope and do not imply permission changes.

## 9. Jobs, exports, and retention

Small dashboard queries are synchronous with bounded limits. Large exports, scheduled reports, projection refreshes, and retention work use `04`'s job contract with correlation IDs, idempotency, retries, and dead-letter handling. A job failure does not change source business state.

Report definitions, execution metadata, export artifacts, and schedules follow the approved retention policy. Telemetry stores counts, latency, outcome, definition, scope category, and correlation data—not full sensitive rows or file contents by default.

## 10. AI and alert integration

`15` receives only typed, approved, read-only projections with source labels and as-of metadata. It cannot submit SQL, broaden scope, or treat a cached result as current.

`14` may subscribe to approved metric/event contracts for low-stock or operational alerts. `16` supplies the metric and owner-defined threshold input; `14` owns recipient routing, preferences, delivery, deduplication, and acknowledgement. An alert does not mutate the metric source or workflow.

## 11. Testing strategy

- **Vitest:** metric formulas, partition separation, definition versioning, scope predicates, field redaction, null/forex behavior, freshness states, export limits, and snapshot reproducibility.
- **Real Postgres:** migrations/read-model queries, RLS, party/flow isolation, aggregate-versus-detail consistency, immutable ledger reads, concurrent refresh/export claims, retention, and revoked-access behavior.
- **Integration/jobs:** source watermarking, projection refresh, private Storage artifacts, retries/dead letters, schedule-time reauthorization, and sanitized telemetry.
- **Playwright:** dashboard filters/drill-down, mobile responsiveness, accessible tables/charts, stale/offline/partial/error states, export/download authorization, and no cross-party discovery through totals or URLs.
- **Manual QA:** metric reconciliation against source records, warehouse operator review, printed/exported report readability, Asia/Manila presentation, and commercial visibility review with owners of `12` and `13`.
