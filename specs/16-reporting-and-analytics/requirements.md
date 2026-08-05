# Reporting & Analytics — Requirements

Status: Draft

## 1. Purpose and scope

This feature provides read-only operational dashboards, historical reports, and exportable analytics for the one-warehouse Hyperion 3PL / Dyna-Serv system. It gives warehouse staff, supervisors, administrators, and appropriately scoped parties a consistent view of inventory, movements, fulfillment, receiving quality, capacity, and approved commercial metrics.

`16` is a reporting projection. It does not own inventory, pricing, billing, approval, receiving, transfer, dispatch, or notification state. The source feature and immutable ledger remain authoritative.

The initial scope includes:

- master inventory and availability monitoring;
- item, lot, location, and flow-partition drill-down;
- inventory movement history;
- receiving and inspection/conformance trends;
- stock ageing, expiry, capacity, and reorder indicators;
- fulfillment and document operational measures;
- approved VMI CBM/billing-period measures and Trading sales/margin measures, subject to `12` and `13` approval;
- scoped dashboards, scheduled report jobs, and controlled exports.

Out of scope are data mutation, ad hoc SQL, a second inventory ledger, autonomous recommendations that change workflow state, final VMI billing, Trading price resolution, and notification delivery. `14` may consume approved report thresholds, but `16` does not become an alerting engine.

## 2. Alignment principles and dependencies

- One physical warehouse is assumed; no `warehouse_id` is introduced.
- Canonical names are `parties`, `items`, `locations`, `lots`, `flow_type`, `inventory_transactions`, `pick_list`, and `acknowledgement_receipt`.
- The three partitions (`vmi`, `trading`, `supplies`) are explicit in every applicable query, aggregate, export, cache key, and authorization check. Combined views require an approved internal capability and visibly label the partitions.
- `01-core-data-model` owns canonical entities, lot status, FIFO/FEFO eligibility, forex rates, and the immutable inventory ledger.
- `02-rbac-roles` owns current capability resolution, party scope, optional flow scope, RLS, and audit access. A dashboard filter never grants authority.
- `03-offline-mode-and-client-storage` owns connectivity and stale-data contracts. Analytics reads may be cached only when clearly marked; report generation, export, and scheduled delivery are online-only.
- `04-services-and-infrastructure` owns jobs, storage, telemetry, rate limits, and runtime concerns.
- `05-ui-shell-and-navigation` owns authenticated routes and shared layout; analytics is an office/supervisor surface that remains responsive on mobile.
- `07`, `08`, `09`, `10`, `11`, `12`, `13`, `14`, `17`, `18`, and `19` own the business events and metrics they produce. `15` may use approved read-only projections, never raw tables or unrestricted SQL.

## 3. Actors and use cases

- **Warehouse staff:** quick availability, location, lot, expiry, and movement views needed for operational work; no access to unrelated party data or internal commercial metrics.
- **Supervisors:** inventory monitoring, receiving quality, fulfillment, exception, capacity, and approved flow-scoped trend dashboards.
- **Administrators/auditors:** cross-flow operational reporting, report definitions, run history, retention, and audit visibility subject to capability and RLS.
- **Party users:** only their authorized party and optional flow scope, with party-safe fields and no unrelated parties, internal supplies, Trading buy cost/margin, or restricted VMI details.

## 4. Functional requirements

### R1. Authoritative read model

1. All operational inventory quantities and movements SHALL be derived from approved canonical tables and/or read models whose refresh and source watermark are recorded.
2. `inventory_transactions` SHALL be the source for movement history; `16` SHALL not create, update, delete, or reinterpret ledger rows.
3. A report SHALL identify its as-of time, source watermark, freshness state, and timezone policy. Stored timestamps are UTC; presentation uses the approved Asia/Manila policy unless a user-facing policy says otherwise.
4. Reconciliation between a projection and its source SHALL be observable. A stale, partial, failed, or rebuilding projection SHALL not be presented as current.
5. Metric definitions SHALL be versioned. Historical report results SHALL retain the definition/version used to calculate them.

### R2. Inventory monitoring and drill-down

1. The master inventory view SHALL prioritize `item_code`, item name, flow type, available quantity, reserved/committed quantity where approved, boxes, CBM, and value fields allowed by scope.
2. Users SHALL be able to drill from item to active lots, FEFO/FIFO order, lot number, status, expiry/manufacture dates, owner party where authorized, and location quantities.
3. Lot eligibility SHALL respect `lots.status = 'available'` as the canonical FIFO/FEFO gate; reporting SHALL not invent a separate eligibility rule.
4. Location views SHALL show capacity and occupied CBM using approved location/quantity projections, with capacity exceptions clearly distinguished from inventory status.
5. Supplies inventory SHALL remain visibly separate from VMI and Trading in default views and exports.

### R3. Movement history and operational reporting

1. Users SHALL be able to filter movement history by date/time, item, lot, location, `flow_type`, movement type, party where authorized, actor, source reference, and correlation ID where permitted.
2. Movement reporting SHALL support at least receiving, putaway, pick, transfer, and `inventory_reconciliation` without renaming or collapsing the canonical `movement_type` values.
3. History SHALL be append-oriented and SHALL distinguish committed movement from request, approval, scan observation, document generation, or notification events.
4. A report SHALL preserve the source transaction timestamp, actor/system executor, quantity/UOM, source and destination locations where applicable, and source document/reference.
5. Corrections and reversals SHALL appear as their own approved compensating transactions; the original movement SHALL remain visible.

### R4. Receiving, inspection, and stock health analytics

1. Approved receiving reports SHALL compare staged/expected WRR quantities with scanned/confirmed quantities without treating standby stock as available inventory.
2. Receiving quality reports SHALL use approved `wrr_inspection_logs` fields and distinguish conformance, non-conformance, reason, party, item, and time period.
3. Expiry and ageing reports SHALL use lot dates and approved business definitions; they SHALL not change lot status or trigger FEFO allocation.
4. Reorder indicators SHALL use `items.min_reorder_level` and approved available/reserved quantity semantics, and SHALL be clearly labeled as indicators rather than purchase orders.
5. Capacity analytics SHALL use `volume_cbm`, location capacity, and approved occupancy snapshots; missing or invalid packaging data SHALL be visible as a data-quality exception rather than silently treated as zero.

### R5. Fulfillment, document, and service analytics

1. Fulfillment metrics SHALL use authoritative `08`, `10`, `18`, and `19` states/events and SHALL distinguish request, commitment, pick, dispatch, packing, and delivery milestones.
2. Pick-list and acknowledgement-receipt counts SHALL refer to the canonical priced documents and SHALL not introduce `withdrawal_slip` or `awaiting_pricing` concepts.
3. Document and dispatch metrics SHALL not recalculate or alter the final Trading document price or the VMI document reference price.
4. Failed jobs, missing documents, stale dispatch states, and operational exceptions MAY be reported as attention metrics, but remediation remains in the owning feature or `04`.

### R6. Commercial and valuation boundaries

1. USD/PHP inventory valuation SHALL use approved lot/item unit-cost semantics and the applicable daily `forex_rates` record, with rate date and currency shown.
2. VMI analytics SHALL use only the approved `12` billing-period/CBM metric contract. A per-release price on a pick list or acknowledgement receipt is a reference and SHALL never be presented as the authoritative VMI bill.
3. Trading revenue, cost, and margin SHALL use the approved `13` price snapshot and visibility rules. The final Trading price on a document SHALL remain final for that document.
4. Supplies financial meaning SHALL not be invented; reports may show approved quantity/usage measures only until the supplies valuation contract is approved.
5. Commercial fields SHALL be hidden, aggregated, or party-safe according to current capability and scope. A report filter or export column SHALL not bypass authorization.

### R7. Dashboards, exports, and scheduled reports

1. Dashboards SHALL provide loading, stale, partial, empty, error, and no-authorized-data states distinct from metric values.
2. Exports SHALL be generated server-side from an authorized, versioned report definition and snapshot. Client-supplied columns, scope, or query fragments SHALL not establish authority.
3. Export files SHALL be private, access-controlled, auditable, and protected by approved retention and expiry rules.
4. Scheduled reports, if approved, SHALL re-resolve recipients and scopes at run time and SHALL not deliver data to a recipient whose access has changed.
5. Large or slow reports SHALL use the shared job boundary, expose progress/failure safely, and be idempotent without changing source data.
6. Initial v1 reports SHALL be curated; arbitrary user-authored SQL, unrestricted joins, and unbounded exports are out of scope.

### R8. Authorization, privacy, and audit

1. Every report query, dashboard count, drill-down, export, schedule, download, and report-definition change SHALL use current capability, party scope, optional `flow_type` scope, and RLS.
2. Party users SHALL not discover unrelated records through totals, filters, search, pagination, errors, filenames, report IDs, cached results, or exports.
3. Report results SHALL exclude internal cost/margin, restricted VMI billing details, inspection evidence, security events, and unnecessary personal data unless explicitly approved for the caller.
4. Report execution, denied access, export, download, schedule change, retention action, and failure SHALL be auditable with actor/system executor, timestamp, report/version, scope, outcome, and correlation ID.
5. Logs and telemetry SHALL contain sanitized metadata rather than full report rows or sensitive export contents by default.

### R9. Freshness, caching, and offline behavior

1. Analytics reads MAY use a bounded cache or materialized read model only when its source watermark and freshness limit are known.
2. Offline or stale results SHALL be labeled with the last successful as-of time and SHALL not display a successful sync or current-state claim.
3. Report generation, export, schedule mutation, and any refresh/rebuild command SHALL be online-only in v1.
4. No analytics mutation SHALL be added to the `03` offline queue.
5. Realtime MAY signal that data changed, but the client SHALL refetch the authoritative report/read model and handle missed signals through polling/manual refresh.

## 5. Acceptance criteria

- [ ] Inventory dashboards and movement history use canonical names and authoritative source records.
- [ ] VMI, Trading, and Supplies remain partitioned by default and cannot leak across party scope.
- [ ] Item/lot/location drill-down shows FEFO/FIFO order without changing eligibility or allocation state.
- [ ] Receiving, conformance, expiry, capacity, fulfillment, and approved commercial metrics have named definitions and source owners.
- [ ] Trading final document pricing and VMI reference-only document pricing are represented correctly.
- [ ] Stale, offline, partial, failed, and empty states are distinguishable from valid current data.
- [ ] Exports and scheduled reports are server-authorized, private, versioned, retained, and audited.
- [ ] No report, export, cache, or dashboard action mutates inventory, pricing, approval, billing, or document state.

## 6. Decisions required before approval

- Approve the v1 report catalog, metric dictionary, formulas, owners, and freshness targets.
- Resolve the final `01` schema/read-model shape for location quantities, reservations, documents, and audit references.
- Approve `02` capability names and party/flow visibility matrix for each report and field.
- Approve `12` VMI billing-period/CBM inputs and `13` Trading price/margin snapshot inputs.
- Define valuation rounding, missing-forex behavior, timezone/as-of presentation, and historical-rate policy.
- Define export formats, maximum ranges/rows, schedule recipients, retention, and private Storage policy with `04`.
- Decide which thresholds are published to `14` and which feature owns each alert condition.
- Define the read-only projection contract consumed by `15` AI Chatbot.
