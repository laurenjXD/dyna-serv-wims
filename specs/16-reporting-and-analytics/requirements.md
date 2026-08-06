# Reporting & Analytics — Requirements

Status: Approved
Updated: 2026-08-06

Depends on:
- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/00-steering/structure.md`
- `specs/00-steering/brand-design-system.md`
- `specs/01-core-data-model/design.md`
- `specs/02-rbac-roles/design.md`
- `specs/05-ui-shell-and-navigation/`
- `specs/09-approval-queue/` (read-only reference for FIFO override counts)
- `specs/12-vmi-billing/` (informational reference only — no recalculation)
- `specs/13-trading-orders-and-pricing/` (informational reference only — no recalculation)

The approved `lot_history_export` operating contract is a daily refresh with three-year retention. `01-core-data-model` owns the canonical read model and connected source identity; `16-reporting-and-analytics` owns generation, serving, and Excel delivery.

---

## 1. Overview

Spec 16 defines the analytics and reporting surface for the Dyna-Serv WIMS. It provides high-level warehouse visibility, operational analytics across all three flows (VMI, Trading, Supplies), and a reusable component library that can be embedded across any feature that needs to surface a metric.

This feature reads exclusively from approved canonical tables and derived views defined in `01-core-data-model`. It never recalculates what a source feature owns: pricing and margin belong to `13`, VMI billing belongs to `12`, and inventory commitment balances belong to the atomic transactions in `08`. All data sourced here is read-only, scoped by RBAC capability, and enforced by PostgreSQL RLS.

---

## 2. Users and Surfaces

### 2.1 Office Admin / Manager

Full warehouse-wide analytics. Views aggregate KPIs across all parties, all flows, and all time ranges. Can export any scoped dataset to CSV. Primary surface: desktop (`lg` breakpoint, 1280px container). Must remain functionally usable at mobile width for ad-hoc checks.

### 2.2 Supervisor

Operational analytics within their scope: receiving, picking, inspection, transfers. Can view trend charts and drill into tabular data. No pricing or margin access. Same capability as Admin for `reporting.read`; no `reporting.export` unless explicitly granted.

### 2.3 Party User (VMI or Trading)

Scoped to their own party's data only. Sees: stock on hand (their lots only), WRR history (their own inbound documents), and pick list activity (their own outbound documents). Never sees other parties' data, internal Supplies flow data, or any pricing or billing calculation. Data access is enforced at the RLS layer through `user_party_scopes` — the same query returns a different, automatically filtered result set.

### 2.4 Surface Priority

Office-first (desktop-priority). The analytics surface is an office/supervisor pattern; floor staff (`warehouse_staff` role) do not have the `reporting.read` capability and are never shown the reporting surface. Supervisor checking the dashboard from a mobile device is a real secondary case and must remain usable — no horizontal-only charts, no overlapping elements at `md` width.

---

## 3. Functional Requirements

### FR-1: Main Dashboard

**FR-1.1** The dashboard SHALL be the default landing route (`/dashboard`) for users with the `reporting.read` capability.

**FR-1.2** The dashboard SHALL display a KPI card row with the following metrics:

- **Total Receipts (MTD):** count of `wrr_documents` with `status = 'confirmed'` in the current calendar month.
- **Total Dispatches (MTD):** count of `pick_lists` with `status = 'dispatched'` in the current calendar month.
- **Total Lots In Stock:** count of `lots` where `status = 'available'`.
- **Total Committed Qty:** sum of `qty_committed` from `lot_inventory_totals` across all active lots.
- **Low Stock Items Count:** count of items where the sum of `qty_available` from `lot_inventory_totals` falls below `items.min_reorder_level`.
- **Pending Inspections Count:** count of `wrr_inspection_logs` rows where `conformance_status = 'pending'`.

**FR-1.3** Each KPI card SHALL display the current period value and a trend indicator compared to the same metric in the equivalent prior period (prior calendar month for MTD metrics, prior week for weekly metrics). The trend SHALL show a directional arrow icon and a percentage change value. Color alone SHALL NOT be the sole trend signal — the arrow icon is always present.

**FR-1.4** The dashboard SHALL display an Activity Heatmap covering the trailing 52 weeks of warehouse transaction volume sourced from `inventory_transactions`, showing daily counts on a 52-column × 7-row calendar grid. The heatmap SHALL be filterable by flow type (VMI / Trading / Supplies / All).

**FR-1.5** The dashboard SHALL display a Quick Access panel with links to: the 3 most recently created `wrr_documents`, open `pick_lists` with `status = 'allocated'` or `'picked'`, and `wrr_inspection_logs` rows with `conformance_status = 'pending'` (pending inspection attention).

---

### FR-2: Inventory Analytics

**FR-2.1 Stock Level Summary:** Display a tabular summary of qty_available, qty_committed, and qty_remaining per item and lot, sourced from `lot_inventory_totals` (for aggregated quantities) joined to `lots` and `items`. Per-location detail SHALL be sourced from `lot_location_balances` only when drilling into a specific lot.

**FR-2.2 Stock Aging Report:** Display active inventory grouped by canonical `lot_number`. Aging SHALL use the earliest confirmed receiving event connected to that `lot_number`; `lots.created_at` alone is not an aging basis. Each row SHALL show lot number, flow-appropriate item code, item name, flow type, party where authorized, age, expiry date, and current `qty_available`.

**FR-2.3 Lot Status Distribution:** Display a donut chart showing the count of `lots` grouped by `lots.status`. The canonical status values from `01-core-data-model` are: `staged`, `available`, `quarantined`, `depleted`, `expired`. Each segment SHALL be labeled with the status name and count — color alone is not sufficient.

**FR-2.4 Low Stock Report:** Display a filterable table of items where the total `qty_available` (from `lot_inventory_totals` aggregated by item) is below `items.min_reorder_level`. Rows SHALL include: item code, item name, flow type, current qty_available, and min_reorder_level threshold.

**FR-2.5 FIFO/FEFO Queue Health:** For each item with at least one `available` lot, show the oldest available lot (by `lots.created_at` for non-perishables, by `lots.expiry_date` for perishables where `items.is_perishable = true`) and the number of days since receipt. Items where the oldest lot has been in stock for more than 90 days SHALL be highlighted.

**FR-2.6 Flow Partition View:** Display a side-by-side comparison of current inventory across VMI, Trading, and Supplies flows, showing: lot count, total qty_available, total occupied CBM (from `lot_location_balances.qty_remaining × items.volume_cbm`), and item count. Sourced by joining `lots.flow_type` to `lot_inventory_totals` and `items`.

---

### FR-3: Receiving Analytics

**FR-3.1 WRR Volume Trend:** Display a time-series line chart of WRR documents created per day, week, or month (user-selectable period), sourced from `wrr_documents.created_at`. The chart SHALL support filtering by flow type.

**FR-3.2 Discrepancy Rate:** Display the percentage of WRR lines where `wrr_items.scanned_qty ≠ wrr_items.expected_qty` over the selected date range. This measures receiving accuracy.

**FR-3.3 Inspection Outcome Breakdown:** Display a bar chart of inspection outcomes from `wrr_inspection_logs`, grouped by `conformance_status` (pending / conformance / non_conformance). A secondary breakdown by `non_conformance_reason` SHALL be available on drill-down.

**FR-3.4 Average Receiving Cycle Time:** Display the mean time (in hours) between `wrr_documents.created_at` and `wrr_documents.confirmed_at` for WRRs with `status = 'confirmed'` over the selected date range.

**FR-3.5 Top Received Items:** Display two ranked lists — top items by total `scanned_qty` received and top items by frequency of appearance in confirmed WRR lines — over the selected date range.

---

### FR-4: Outbound / Picking Analytics

**FR-4.1 Pick List Volume Trend:** Display a time-series line chart of pick lists generated (by `pick_lists.created_at`) versus dispatched (where `status = 'dispatched'`) per period. Sourced from `pick_lists`.

**FR-4.2 Commitment Duration:** Display the distribution (histogram or quartile summary) of time between `pick_lists.created_at` (allocated) and the transition to `dispatched` status, across all pick lists that reached `dispatched` in the selected period. Sourced from `pick_lists.created_at` and `pick_lists.updated_at`.

**FR-4.3 FIFO Override Frequency:** Display the count and percentage of pick lists that triggered an approval request for FIFO override, sourced as a read-only reference from the approval records owned by spec `09`. The `approval_requests` table name and schema are defined by `09`; this feature reads counts only.

**FR-4.4 Dispatch Rate:** Display the count and percentage of pick lists reaching `status = 'dispatched'` versus those whose associated `inventory_commitments` reached `status = 'cancelled'` or `'expired'`, in the selected period.

**FR-4.5 Top Dispatched Items:** Display two ranked lists — top items by total qty dispatched and top items by dispatch frequency — over the selected date range, sourced from `pick_list_items` joined to `pick_lists` where `status = 'dispatched'`.

---

### FR-5: VMI Analytics

*Scope: VMI flow only. Admin/Supervisor see all VMI parties; a party user sees only their own party.*

**FR-5.1 Occupied CBM Over Time:** Display a time-series line chart of VMI occupied CBM, derived from the product of `lot_location_balances.qty_remaining × items.volume_cbm` for lots where `lots.flow_type = 'vmi'`, grouped by day or month.

**FR-5.2 Stock on Hand by Party:** Display a bar chart of current VMI qty_available grouped by `lots.owner_party_id` (resolved to `parties.name`). Sourced from `lot_inventory_totals` joined to `lots` and `parties`.

**FR-5.3 Lot Activity Summary per Party:** Display a tabular summary per VMI party showing: active lot count, total qty_available, total qty_committed, occupied CBM, and oldest lot age. Sortable by any column.

**FR-5.4 Billing Period Reference:** Display an informational banner linking to the VMI billing view defined in spec `12`. This feature displays no billing calculations; it only surfaces the navigational reference.

---

### FR-6: Trading Analytics

*Scope: Trading flow only. Admin/Supervisor see all Trading activity.*

**FR-6.1 Order Activity Trend:** Display a time-series line chart of Trading pick lists generated and dispatched per period, sourced from `pick_lists` where `flow_type = 'trading'`.

**FR-6.2 Item Movement Velocity:** Display a ranked table of Trading items by total units inbound (received via `inventory_transactions.movement_type = 'receiving'`) and outbound (via `movement_type = 'pick'`) in the selected period.

**FR-6.3 Margin Reference Display:** Users with the approved financial-report capability may see approved Trading revenue, cost, profit, margin, and price references from source pricing/document snapshots. These are display-only; no recalculation is performed. Floor staff and party users receive no financial columns.

**FR-6.4 Financial boundary:** Financial metrics require data-layer RLS/RBAC and a separate projection; hiding a UI field is insufficient.

---

### FR-7: Operational / Transfer Analytics

**FR-7.1 Transfer Volume by Period:** Display a time-series chart of internal transfers sourced from `inventory_transactions` where `movement_type = 'transfer'`, grouped by period.

**FR-7.2 Inspection Case Outcomes:** Display a summary of inspection outcomes combining inbound (from `wrr_inspection_logs`) and post-pick (from spec `11`'s inspection records, once that contract is finalized) inspection results. Until spec `11` is approved, this view covers inbound inspection only.

**FR-7.3 Document Generation Success Rate:** Display the success rate of WRR document generation and pick list generation, using `wrr_documents` and `pick_lists` count data.

---

### FR-8: Reports and Export

**FR-8.1** A dedicated Reports view at `/reports` SHALL provide configurable date range, party, flow type, and item filters that apply to all report types.

**FR-8.1a** Master Inventory and Reports SHALL support bulk filters/grouping by category, item code, `flow_type`, party, `lot_number`, `locations`, status, and date range. Grouped summaries SHALL preserve a detail result keyed by `lot_number`.

**FR-8.2** Each analytics domain (Inventory, Receiving, Outbound, VMI, Trading, Operational) SHALL have a tabular drill-down view showing the full underlying dataset for the selected filters.

**FR-8.3** The following Excel-compatible exports SHALL be supported (each scoped to the invoking user's authorization):

- **Inventory Snapshot:** current qty_available, qty_committed, qty_remaining per lot, item, and location.
- **Transaction Ledger:** full `inventory_transactions` export with lot, item, movement type, flow, qty, and timestamps.
- **Receiving History:** `wrr_documents` with `wrr_items` line detail and inspection outcomes.
- **Dispatch History:** `pick_lists` with `pick_list_items` line detail.
- **Connected Lot History:** a workbook with grouped summary and one detail row per connected receiving, putaway, transfer, inspection/disposition, pick, and balance event, retaining `lot_number` and source identity.

**FR-8.4** Export files SHALL be generated server-side, paginated in 1000-row chunks, sanitized, and scoped to the caller's authorization. No data outside the caller's RLS-visible rows SHALL appear in any export.

**FR-8.4a** Exports SHALL reuse the canonical server-side read model from `01-core-data-model`; browser-side joins or supplemental filtering are prohibited. Financial columns require the financial capability.

**FR-8.5** Scheduled report generation (PDF export to Storage, with artifact retention) is deferred to a future iteration and SHALL reference spec `04`'s artifact pipeline when ready.

---

### FR-9: Reusable Dashboard Components

The following components SHALL be defined as named, reusable UI components. They are available for embedding by other feature areas (e.g., the Master Inventory view in spec `08` may embed a `<KpiCard>` for commitment summary). Each component is described in detail in `design.md` §4.

| Component | Purpose |
| --- | --- |
| `<KpiCard>` | Single metric value, label, trend indicator, status color, and icon |
| `<KpiCardGroup>` | Responsive grid of `<KpiCard>` instances |
| `<ActivityHeatmap>` | 52 × 7 calendar grid, configurable metric and flow filter |
| `<TrendLineChart>` | Time-series line chart with period selector tabs |
| `<BarChart>` | Categorical comparison chart |
| `<DonutChart>` | Distribution and composition chart |
| `<StockLevelTable>` | Sortable table for lot/item/qty data with status badges |
| `<AlertBanner>` | Inline low-stock or attention notice with action link |
| `<RecentActivityFeed>` | Scrollable list of recent `inventory_transactions` rows |
| `<FlowPartitionSummary>` | VMI / Trading / Supplies side-by-side comparison strip |

---

## 4. Non-Functional Requirements

**NFR-1 Performance:** Dashboard initial load SHALL complete in under 2 seconds at the `lg` breakpoint for an Office Admin. All inventory aggregate queries SHALL use the `lot_inventory_totals` materialized view; direct aggregate queries against `lot_location_balances` for rollups are prohibited.

**NFR-2 Heatmap Performance:** Heatmap data (daily transaction counts from `inventory_transactions`) SHALL be served from a `daily_transaction_counts` materialized view refreshed hourly via spec `04`'s scheduled job infrastructure for any dataset exceeding 500 000 rows.

**NFR-3 Data Scope Enforcement:** All queries are automatically scoped by PostgreSQL RLS. Party users receive their own data through the same queries as admin users — RLS enforces the boundary. No application-layer `WHERE party_id = ?` clause replaces RLS.

**NFR-4 No Recalculation:** This feature never recalculates pricing, billing, VMI period averages, or inventory commitments. It reads from approved derived views and canonical tables only. Any metric that would require recalculating a value owned by `12` or `13` is display-only and sourced directly from those features' approved data structures.

**NFR-5 Accessibility:** All charts SHALL meet WCAG AA contrast requirements. Color SHALL never be the sole data-encoding signal — every chart segment, status badge, and trend indicator pairs color with a label, icon, or pattern. Heatmap cells SHALL be keyboard navigable with tooltip exposure on focus.

**NFR-6 Sensitive Field Protection:** Pricing, revenue, cost, profit, and margin fields SHALL never appear in floor-staff or party-user projections/exports. Exclusion is enforced at the RLS/view layer, not by application column filtering.

**NFR-7 Export Safety:** Export route handlers SHALL re-verify the caller's `reporting.export` capability and party scope on every request. The scoped result set is the canonical output — no supplemental filtering replaces the RLS-enforced boundary.

**NFR-8 Offline Behavior:** The reporting surface is online-only. No analytics data is queued, cached for offline use, or computed from the offline store. A disconnected user sees a connectivity-unavailable state, not stale or partial data.

---

## 5. Out of Scope

- Predictive analytics, AI forecasting, or machine learning inventory suggestions (spec `15` owns the AI chatbot surface).
- Financial accounting integration (General Ledger, QuickBooks sync).
- VMI billing calculation or period-average billing (spec `12`).
- Trading margin calculation or order pricing (spec `13`).
- Floor/mobile scanner views — the dashboard is office-priority; floor staff do not hold `reporting.read`.
- Writeable reporting state — this feature is read-only across all its surfaces.

---

## 6. Acceptance Criteria

**AC-1** The dashboard loads in under 2 seconds for an Office Admin on a seeded dataset of at least 10 000 `inventory_transactions` rows, measured at the `lg` breakpoint.

**AC-2** All six KPI card values (Total Receipts, Total Dispatches, Total Lots In Stock, Total Committed Qty, Low Stock Items Count, Pending Inspections Count) compute correctly against a known seed dataset, with no reference to the non-existent `stock_entries` table.

**AC-3** The Activity Heatmap correctly renders 52 × 7 cells and accurately reflects daily transaction counts from `inventory_transactions.created_at`; flow-type filter correctly isolates VMI, Trading, or Supplies transaction subsets.

**AC-4** The lot status distribution donut chart uses the canonical `lot_status` enum values (`staged`, `available`, `quarantined`, `depleted`, `expired`) and not any invented status names.

**AC-5** A party user logged in with a `party_user` role and an active `user_party_scopes` assignment sees only their own party's lots, WRRs, and pick lists in every analytics view. Querying with a different party's ID directly in the URL or filter returns empty results, not an error that reveals data existence.

**AC-6** The low stock report uses `items.min_reorder_level` as the threshold value; the field name `reorder_level` does not appear in any query or component.

**AC-7** Excel-compatible exports are RLS-scoped and Connected Lot History preserves every connected event for each filtered `lot_number`; floor and party users receive no financial columns.

**AC-8** No chart uses color as the sole encoding mechanism. Every trend arrow, status badge, and donut segment is accompanied by a text label or icon readable without color perception.

**AC-9** The `<KpiCard>`, `<ActivityHeatmap>`, and `<TrendLineChart>` components are importable and render correctly when embedded from a feature outside spec `16` (e.g., within the Master Inventory view).

**AC-10** All aggregation queries for inventory metrics target `lot_inventory_totals`; no query performs a raw `SUM` or `COUNT` against `lot_location_balances` at the report/dashboard level. This is verified by query plan inspection in the performance test suite.
