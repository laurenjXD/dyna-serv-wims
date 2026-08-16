# Reporting & Analytics — Design

Status: Approved
Updated: 2026-08-06

Cites foundational specs:

- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/00-steering/structure.md`
- `specs/00-steering/ui-ux-design-plan.md`
- `specs/01-core-data-model/design.md`
- `specs/02-rbac-roles/design.md`
- `specs/05-ui-shell-and-navigation/`

---

## 1. Design Intent

Spec 16 is a read-only analytics surface. It reads from canonical derived views and the immutable `inventory_transactions` ledger. It never recalculates values that source features own — pricing belongs to `13`, VMI billing belongs to `12`, commitment balances are owned and updated exclusively by `08`'s atomic transactions.

The secondary goal is a reusable component library. Analytics components defined here — `<KpiCard>`, `<ActivityHeatmap>`, `<TrendLineChart>`, etc. — are available for import by any other feature area. A feature does not need to build its own metric display; it embeds the component and passes the value.

This is an office-first surface. All chart and table components are designed at the `lg` breakpoint as primary and must remain usable at `md`. Floor staff (`warehouse_staff` role) do not hold `reporting.read` and never reach this surface.

---

## 2. Foundational Dependencies and Tables

All tables below are owned by `01-core-data-model`. This feature only reads from them.

| Table / View | Ownership | Usage in this feature |
| --- | --- | --- |
| `inventory_transactions` | `01` | Immutable movement ledger. Source for heatmap, transfer volume, and all movement history queries. |
| `lot_inventory_totals` | `01` (SQL view) | Aggregated qty_received, qty_remaining, qty_committed, qty_available per lot. **Primary source for all inventory aggregate queries. Never query `lot_location_balances` directly for rollups.** |
| `lot_location_balances` | `01` | Per-location detail. Used only in the stock level table drill-down for an individual lot, never for aggregate computations. |
| `lots` | `01` | Lot metadata: lot_number, flow_type, owner_party_id, status, expiry_date, manufacture_date, unit_cost, created_at. |
| `items` | `01` | Item master: code, name, min_reorder_level, volume_cbm, is_perishable, buying_price, selling_price. |
| `item_categories` | `01` | Category/subcategory labels for display in inventory tables. |
| `parties` | `01` | Party names and codes for display in all analytics. |
| `wrr_documents` | `01` | Inbound receiving documents. Source for WRR volume trends, cycle time, and receiving analytics. |
| `wrr_items` | `01` | WRR line items. Source for discrepancy rate calculations. |
| `wrr_inspection_logs` | `01` | Inspection outcome records. Source for conformance analytics and pending inspection counts. |
| `pick_lists` | `01` | Outbound pick list documents. Source for dispatch volume trends and commitment duration. |
| `pick_list_items` | `01` | Pick list line items. Source for top-dispatched-items ranking. |
| `inventory_commitments` | `01` | Commitment lifecycle records. Source for commitment status breakdowns and dispatch rate. |
| `approval_requests` | `09` (read-only reference) | FIFO override approval records. Read count only; table schema is owned by spec `09`. |

### 2.1 Derived Views

**`lot_inventory_totals`** (SQL view defined in `01-core-data-model/design.md`):

```sql
SELECT
  lot_id,
  SUM(qty_received)  AS qty_received,
  SUM(qty_remaining) AS qty_remaining,
  SUM(qty_committed) AS qty_committed,
  SUM(qty_remaining) - SUM(qty_committed) AS qty_available
FROM lot_location_balances
GROUP BY lot_id;
```

All inventory aggregate queries (KPI cards, stock level summary, low stock report, flow partition view) use this view. No feature code aggregates `lot_location_balances` directly.

**`daily_transaction_counts`** (materialized view — required when `inventory_transactions` exceeds 500 000 rows):

```sql
CREATE MATERIALIZED VIEW daily_transaction_counts AS
SELECT
  DATE(created_at)    AS activity_date,
  flow_type,
  movement_type,
  COUNT(*)            AS transaction_count
FROM inventory_transactions
GROUP BY DATE(created_at), flow_type, movement_type;
```

Refresh cadence: hourly, via spec `04`'s scheduled job infrastructure. The heatmap query falls back to a direct `GROUP BY DATE(created_at)` on `inventory_transactions` when this view is not yet available (development/staging environments with small datasets).

---

## 3. Dashboard Architecture and Layout

### 3.1 Page Structure

The dashboard and reports pages live inside the authenticated shell defined in `05-ui-shell-and-navigation`.

```text
[ Top Header Bar (spec 05) ]
──────────────────────────────────────────────────────────
[ Left Sidebar (brand-navy) ] │ [ Main Content Area                  ]
[ (spec 05 nav shell)       ] │
[  • Dashboard              ] │  page-padding: 32px (office default)
[  • Inventory              ] │  container max-width: 1280px
[  • Receiving              ] │  grid: 12-col at lg, 4-col at md,
[  • Outbound               ] │        1-col at base
[  • VMI                    ] │
[  • Trading                ] │  1. <KpiCardGroup> (6 KPI cards)
[  • Operational            ] │  2. <ActivityHeatmap> (52 × 7 grid)
[  • Reports & Export       ] │  3. Quick Access panel
[                            ] │  4. <RecentActivityFeed>
```

### 3.2 Grid and Spacing Tokens

All values from `ui-ux-design-plan.md` §4:

| Property | Value | Token / source |
| --- | --- | --- |
| Page padding (office) | 32px | `ui-ux-design-plan.md` §4 |
| Container max-width | 1280px | `ui-ux-design-plan.md` §4 |
| Base grid unit | 8px | `ui-ux-design-plan.md` §4 |
| Gutter | 24px | `ui-ux-design-plan.md` §4 |
| KPI card row — `lg` | 3 cards per row (2 rows of 3) | 12-col ÷ 4 = 3 cards |
| KPI card row — `md` | 2 cards per row | 4-col ÷ 2 = 2 cards |
| KPI card row — base | 1 card stacked | single column |

### 3.3 Typography Tokens (from `ui-ux-design-plan.md` §2)

| Usage | Token | Family / Weight / Size |
| --- | --- | --- |
| Section headers | `headline-md` | Fira Sans SemiBold 24px / 32px |
| KPI metric value | `data-display` | Fira Sans SemiBold 20px / 24px |
| KPI label | `label` | Epilogue SemiBold 14px / 16px |
| Table headers | `label` uppercase | Epilogue SemiBold 14px + letter-spacing 0.05em |
| Table body | `body-md` | Outfit Regular 16px / 24px |
| Codes, lot numbers, quantities | `mono` | Roboto Mono Regular 14px |
| Chart axis labels | `label` | Epilogue SemiBold 14px |
| Tooltip text | `body-sm` + `mono` | Outfit 14px + Roboto Mono for values |

### 3.4 Elevation

Office cards use Level 1: `bg-white/75 + backdrop-blur-md`, shadow `0 1px 2px rgba(0,32,96,0.08)` — per `ui-ux-design-plan.md` §6. This surface is exclusively office/desktop. Floor-screen elevation rules do not apply here.

---

## 4. Component Specifications

### 4.1 `<KpiCard>`

A single metric display card.

**Props:**

| Prop | Type | Description |
| --- | --- | --- |
| `label` | string | Metric name (e.g., "Total Receipts MTD") |
| `value` | number \| string | Current period value |
| `trend` | `{ direction: 'up' \| 'down' \| 'flat'; pct: number }` | Trend vs prior period |
| `icon` | ReactNode | Brand-navy icon representing the metric category |
| `statusColor` | `'available' \| 'pending' \| 'held' \| 'neutral'` | Optional status color override for the value |
| `linkTo` | string (optional) | Route to navigate on card click |

**Visual specification:**

- Card: Level 1 elevation, `radius-default` (8px), padding 24px.
- Icon: 24px, `brand-navy` color, top-left.
- Metric value: `data-display` — Fira Sans SemiBold 20px. Color is `on-surface` by default; overridden by `statusColor` when provided (maps to `status-available` / `status-pending` / `status-held` / `status-neutral` tokens from `ui-ux-design-plan.md` §1.3).
- Label: `label` — Epilogue SemiBold 14px, `text-grey`, uppercase, letter-spacing 0.05em.
- Trend indicator: arrow icon (↑ / ↓ / →) + percentage string. `status-available` (#10B981) for up, `status-held` (#EF4444) for down, `status-neutral` (#64748B) for flat. Arrow icon is always rendered alongside the color — color is never the sole signal.
- Hover: scale to 1.02, 150ms transition (office — `ui-ux-design-plan.md` §10).

**Accessibility:**

- `aria-label` on the card element: `"{label}: {value}, {direction} {pct}% from prior period"`.
- Trend arrow has `aria-hidden="true"`; the text percentage is the accessible label.
- Focus ring: 2px solid `brand-navy`, per `ui-ux-design-plan.md` §11.

**Responsive:** Full width at base, half-width at `md`, one-third at `lg`.

---

### 4.2 `<KpiCardGroup>`

A responsive grid wrapper for `<KpiCard>` instances.

**Props:** `children: ReactNode` (expects `<KpiCard>` elements).

**Layout:** CSS grid, `grid-cols-1` at base, `md:grid-cols-2`, `lg:grid-cols-3`. Gap: 24px (gutter token). No maximum card count is enforced — the grid wraps naturally for 4, 5, or 6 cards.

**Section heading:** Rendered outside this component by the parent page using `headline-md`.

---

### 4.3 `<ActivityHeatmap>`

A 52-column × 7-row calendar grid showing daily transaction volume over the trailing 52 weeks.

**Props:**

| Prop | Type | Description |
| --- | --- | --- |
| `data` | `{ date: string; count: number }[]` | Daily aggregated transaction counts |
| `flowFilter` | `'vmi' \| 'trading' \| 'supplies' \| 'all'` | Active flow type filter |
| `onFilterChange` | `(filter) => void` | Callback for filter tab changes |
| `title` | string | Accessible chart title (rendered visually and as `aria-label`) |

**Grid layout:** CSS Grid, 52 columns × 7 rows. Each cell is a square `div`, min 12px × 12px, `radius-sm` (4px). Gap: 2px between cells.

**Color scale:** Uses `brand-navy` at varying opacity levels — NOT arbitrary Tailwind blue shades. Opacity tiers map to transaction volume density:

| Level | Condition | Class |
| --- | --- | --- |
| 0 (zero) | count = 0 | `bg-slate-100` (neutral empty) |
| 1 (low) | count 1–10 | `brand-navy` at 15% opacity |
| 2 (moderate) | count 11–50 | `brand-navy` at 35% opacity |
| 3 (busy) | count 51–100 | `brand-navy` at 60% opacity |
| 4 (peak) | count > 100 | `brand-navy` at 85% opacity |

All five levels SHALL be accompanied by a visible legend strip below the heatmap mapping each color swatch to its range label. The legend uses `label` typography (Epilogue SemiBold 14px) alongside each swatch — color is not the sole differentiator.

**Tooltip:** On hover or keyboard focus, shows: `"{count} transactions on {date}"`. Typography: `body-sm` (Outfit 14px) for the date label, `mono` (Roboto Mono) for the count. Background: solid `on-surface`, white text — Level 2 elevation pattern.

**Filter tabs:** Rendered above the grid. Active tab uses `brand-red` background, Inter SemiBold 14px white label, `rounded` corners (diagonal-cut motif retired — see `ui-ux-design-plan.md` §7). Inactive tabs use `surface-light-grey` background, `on-surface` label.

**Accessibility:**

- Grid container: `role="grid"`, `aria-label="{title}"`.
- Each cell: `role="gridcell"`, `aria-label="{date}: {count} transactions"`.
- Keyboard navigable: arrow keys move focus between cells; Enter/Space opens the tooltip.
- Does not rely on color alone: the legend provides the range context for each opacity level.

**Responsive:** At `md`, the heatmap renders the trailing 26 weeks (half-year) to remain legible without horizontal scroll. At `lg`, all 52 weeks are shown.

---

### 4.4 `<TrendLineChart>`

A time-series line chart for any metric that varies over time.

**Props:**

| Prop | Type | Description |
| --- | --- | --- |
| `data` | `{ date: string; value: number }[]` | Time-series data points |
| `period` | `'day' \| 'week' \| 'month'` | Active aggregation period |
| `onPeriodChange` | `(period) => void` | Period selector callback |
| `label` | string | Y-axis metric label |
| `title` | string | Chart title (visible + aria-label) |
| `color` | string (optional) | Defaults to `brand-royal-blue` |

**Visual specification:**

- Chart background: `surface-white`.
- Line stroke: `brand-royal-blue` (#2E4094), 2px weight.
- Data points: filled circles, 4px radius, `brand-royal-blue`.
- X-axis labels: Roboto Mono Regular 11px, `text-grey`.
- Y-axis labels: Epilogue SemiBold 12px, `text-grey`.
- Chart title: rendered above in `headline-md` by the parent section — not inside the SVG.
- Period selector tabs: above the chart, same tab style as `<ActivityHeatmap>`.
- Grid lines: horizontal dashed lines, `outline-variant` at 30% opacity.

**Accessibility:**

- `role="img"` on the SVG, `aria-label="{title} — {period} view"`.
- Accompanying data table (`role="table"`, visually hidden via `sr-only`) exposes the underlying values to screen readers.

**Responsive:** Full width at all breakpoints. Y-axis label count reduces at `md` to prevent crowding.

---

### 4.5 `<BarChart>`

A categorical comparison chart.

**Props:**

| Prop | Type | Description |
| --- | --- | --- |
| `data` | `{ label: string; value: number; color?: string }[]` | Category bars |
| `title` | string | Chart title |
| `xAxisLabel` | string | X-axis description |
| `yAxisLabel` | string | Y-axis description |
| `horizontal` | boolean (optional) | Renders horizontal bars for long category labels |

**Visual specification:**

- Bars: `brand-royal-blue` by default. When the chart represents a status-partitioned breakdown (e.g., inspection outcomes), bars use the relevant status tokens: `status-available`, `status-pending`, `status-held`, `status-neutral`.
- Every bar is labeled with its value above/beside it in `mono` (Roboto Mono 12px) — color is not the sole encoding.
- Category labels: `label` typography, Epilogue SemiBold 14px.
- Hover: bar brightens to `brand-navy` tint, tooltip shows exact value.

**Accessibility:** Same SVG + hidden data table pattern as `<TrendLineChart>`.

---

### 4.6 `<DonutChart>`

A distribution/composition chart.

**Props:**

| Prop | Type | Description |
| --- | --- | --- |
| `segments` | `{ label: string; value: number; statusToken: StatusToken }[]` | Donut segments |
| `title` | string | Chart title |
| `centerLabel` | string (optional) | Text shown in the donut center (e.g., "Total Lots") |
| `centerValue` | number (optional) | Value shown in the donut center |

**StatusToken** maps to the `ui-ux-design-plan.md` §1.3 tokens:

| Lot status | StatusToken | Color |
| --- | --- | --- |
| `available` | `status-available` | #10B981 |
| `staged` | `status-pending` | #F59E0B |
| `quarantined` | `status-held` | #EF4444 |
| `depleted` | `status-neutral` | #64748B |
| `expired` | `brand-royal-blue` (muted) | #2E4094 at 50% opacity |

**Visual specification:**

- Donut ring: 60% outer radius, 35% inner radius (clear donut hole).
- Legend: rendered beside or below the donut, showing a color swatch + status label + count + percentage. `label` typography for the label, `mono` for the count. Swatch is 12px × 12px `radius-sm`.
- Center label/value (if provided): `data-display` (Fira Sans SemiBold 20px) for value, `label` for the center text.
- Every segment has a visible text label in the legend — color is never the sole encoding.

**Accessibility:** `role="img"`, `aria-label` with full breakdown, hidden data table for screen readers.

---

### 4.7 `<StockLevelTable>`

A sortable data table for lot/item/qty data.

**Props:**

| Prop | Type | Description |
| --- | --- | --- |
| `rows` | `StockLevelRow[]` | Table data rows |
| `sortKey` | string | Currently sorted column key |
| `sortDirection` | `'asc' \| 'desc'` | Sort direction |
| `onSort` | `(key: string) => void` | Column header click callback |
| `onRowClick` | `(lotId: string) => void` (optional) | Drill-down callback |

**StockLevelRow fields:** `lotNumber`, `itemCode`, `itemName`, `flowType`, `ownerParty` (VMI only), `locationLabel`, `qtyAvailable`, `qtyCommitted`, `qtyRemaining`, `status`, `expiryDate`.

**Visual specification:**

- Table headers: `label` uppercase, Epilogue SemiBold 14px, letter-spacing 0.05em, `brand-navy` header background strip, white text. Sortable headers show a sort-direction chevron icon.
- Table body: `body-md` (Outfit Regular 16px). Alternating row background: `surface-white` / `surface-light-grey`.
- Quantity columns (`qtyAvailable`, `qtyCommitted`, `qtyRemaining`): `mono` (Roboto Mono Regular 14px), right-aligned.
- Item code, lot number, location label columns: `mono` (Roboto Mono Regular 14px).
- Status badge: `radius-full` pill, Epilogue SemiBold uppercase, colored per §1.3 status tokens. Badge is always text + color — never color alone.
- Expiry date within 30 days: `status-held` (`#EF4444`) row highlight with a warning icon in the expiry cell.
- Row hover: `surface-light-grey` background, cursor pointer if `onRowClick` is provided.

**Accessibility:**

- `role="table"`, `<thead>` / `<tbody>`, proper `<th scope="col">` for all column headers.
- Sortable headers: `aria-sort="ascending"` / `"descending"` / `"none"`.
- Status badge: text content is the accessible label; `aria-label` on the cell restates status in full.

**Responsive:** Horizontal scroll container at `md` and below. Minimum column widths prevent text truncation on core columns.

---

### 4.8 `<AlertBanner>`

An inline attention notice that links to the relevant workflow action.

**Props:**

| Prop | Type | Description |
| --- | --- | --- |
| `severity` | `'warning' \| 'critical'` | `warning` = `status-pending` yellow; `critical` = `status-held` red |
| `message` | string | Human-readable alert description |
| `linkTo` | string | Route to the relevant action (e.g., `/inventory/low-stock`) |
| `linkLabel` | string | CTA text for the link |

**Visual specification:** Horizontal banner, `radius-default` (8px), 16px padding. Left border 4px in severity color. Icon (warning triangle for `warning`, X-circle for `critical`) + `body-md` message text + right-aligned Epilogue SemiBold 14px link. Background: `surface-light-grey`. Color is paired with icon — never color alone.

---

### 4.9 `<RecentActivityFeed>`

A scrollable list of recent `inventory_transactions` entries.

**Props:**

| Prop | Type | Description |
| --- | --- | --- |
| `transactions` | `ActivityFeedItem[]` | Recent transaction rows |
| `maxRows` | number | Display limit (default 10) |

**ActivityFeedItem fields:** `transactionNumber`, `createdAt`, `movementType`, `flowType`, `itemCode`, `itemName`, `lotNumber`, `qty`, `partyName`, `performedByName`.

**Visual specification:**

- Each row: card-style row, `body-md` (Outfit 16px) for names, `mono` (Roboto Mono 14px) for codes, lot numbers, and quantities. Movement type shown as a text badge — `status-available` for receiving/putaway, `status-neutral` for transfer, `status-pending` for pick, `status-held` for inventory_reconciliation.
- Timestamp: `body-sm` (Outfit 14px), `text-grey`, right-aligned.
- Divider between rows: `outline-variant` at 30% opacity.

---

### 4.10 `<FlowPartitionSummary>`

A side-by-side comparison strip for VMI / Trading / Supplies inventory metrics.

**Props:** `vmi`, `trading`, `supplies` — each is `{ lotCount: number; qtyAvailable: number; occupiedCbm: number; itemCount: number }`.

**Visual specification:**

- Three equal-width panels at `lg`, stacked vertically at `md`/base.
- Each panel: Level 1 elevation card. Panel header: flow type label in `headline-md`, colored with a flow-type accent: VMI → `brand-royal-blue`; Trading → `brand-navy`; Supplies → `status-neutral`.
- Metrics inside each panel: `data-display` for the primary number, `label` for the metric name.
- Divider between panels (at `lg`): `outline-variant` at 30% opacity.
- Supplies panel is hidden for `party_user` role viewers, since Supplies data is never exposed to party-scoped users (per `02` §3.2).

---

## 5. Data Access Architecture

### 5.1 Query Execution Model

All queries execute server-side. The analytics surface uses Next.js 15 React Server Components (RSC) for the initial data fetch — dashboard sections are parallel Server Components, each fetching their own data without client-side waterfalls. Chart components receive pre-aggregated data as props and render client-side using a lightweight charting library.

No raw SQL is written in component files. All data access goes through typed Drizzle query functions in `lib/analytics/queries/`.

### 5.2 Inventory Aggregate Queries

All inventory metrics use `lot_inventory_totals`. Example pattern for the stock level summary:

```sql
-- KPI: Total Lots In Stock
SELECT COUNT(*) FROM lots WHERE status = 'available';

-- KPI: Total Committed Qty
SELECT SUM(lit.qty_committed)
FROM lot_inventory_totals lit
JOIN lots l ON l.id = lit.lot_id
WHERE l.status = 'available';

-- Low Stock Items (item-level rollup via lot_inventory_totals)
SELECT
  i.id,
  i.code,
  i.name,
  i.min_reorder_level,
  SUM(lit.qty_available) AS total_available
FROM items i
JOIN lots l ON l.item_id = i.id AND l.status = 'available'
JOIN lot_inventory_totals lit ON lit.lot_id = l.id
GROUP BY i.id, i.code, i.name, i.min_reorder_level
HAVING SUM(lit.qty_available) < i.min_reorder_level;
```

Direct aggregate queries against `lot_location_balances` (e.g., `SELECT SUM(qty_remaining) FROM lot_location_balances`) are prohibited at the analytics layer. Use `lot_inventory_totals`.

### 5.2a Master Inventory aging and display

The canonical query consumes `01-core-data-model`'s `master_inventory_tracking` read model. Age is `as_of - earliest confirmed receiving timestamp` for the same `lot_number`; `lots.created_at` is metadata only. Displayed item code is `supplier_item_code` for VMI and `dsgc_item_number` for Trading/Supplies.

### 5.3 Heatmap Query

Primary path (uses materialized view when available):

```sql
SELECT activity_date, SUM(transaction_count) AS count
FROM daily_transaction_counts
WHERE activity_date >= CURRENT_DATE - INTERVAL '364 days'
  AND (flow_type = $1 OR $1 = 'all')
GROUP BY activity_date
ORDER BY activity_date ASC;
```

Fallback path (direct query, development/small dataset):

```sql
SELECT
  DATE(created_at) AS activity_date,
  COUNT(*)          AS count
FROM inventory_transactions
WHERE created_at >= CURRENT_DATE - INTERVAL '364 days'
  AND (flow_type = $1::flow_type OR $1 = 'all')
GROUP BY DATE(created_at)
ORDER BY activity_date ASC;
```

### 5.4 WRR and Receiving Queries

```sql
-- WRR Volume Trend (monthly)
SELECT
  DATE_TRUNC('month', created_at) AS period,
  COUNT(*)                         AS wrr_count
FROM wrr_documents
WHERE created_at >= $start_date AND created_at <= $end_date
GROUP BY period ORDER BY period ASC;

-- Discrepancy Rate
SELECT
  COUNT(*) FILTER (WHERE scanned_qty <> expected_qty) AS discrepancy_count,
  COUNT(*) AS total_lines,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE scanned_qty <> expected_qty) / NULLIF(COUNT(*), 0),
    2
  ) AS discrepancy_pct
FROM wrr_items wi
JOIN wrr_documents wd ON wd.id = wi.wrr_id
WHERE wd.confirmed_at >= $start_date AND wd.confirmed_at <= $end_date;

-- Inspection Outcome Breakdown
SELECT conformance_status, COUNT(*) AS count
FROM wrr_inspection_logs
WHERE created_at >= $start_date AND created_at <= $end_date
GROUP BY conformance_status;
```

### 5.5 Outbound Queries

```sql
-- Pick List Volume Trend
SELECT
  DATE_TRUNC('week', created_at) AS period,
  COUNT(*) FILTER (WHERE status = 'dispatched') AS dispatched_count,
  COUNT(*)                                       AS total_count
FROM pick_lists
WHERE created_at >= $start_date AND created_at <= $end_date
GROUP BY period ORDER BY period;

-- Dispatch Rate
SELECT
  COUNT(*) FILTER (WHERE pl.status = 'dispatched')          AS dispatched,
  COUNT(*) FILTER (WHERE ic.status IN ('cancelled', 'expired')) AS not_dispatched
FROM pick_lists pl
LEFT JOIN inventory_commitments ic ON ic.pick_list_id = pl.id
WHERE pl.created_at >= $start_date AND pl.created_at <= $end_date;
```

### 5.6 Export Query Pagination

Excel-compatible exports paginate in 1000-row chunks using keyset pagination (not OFFSET). The Connected Lot History workbook uses the canonical `lot_history_export` read model: summary grouping is separate from a detail sheet with one row per connected event. The read model refreshes daily and retains three years; `16` owns generation, serving, and Excel delivery while `01` owns the canonical model and source identity.

```sql
-- Transaction Ledger export, page N
SELECT it.*, l.lot_number,
       CASE WHEN it.flow_type = 'vmi' THEN i.supplier_item_code ELSE i.dsgc_item_number END AS displayed_item_code,
       p.name AS party_name
FROM inventory_transactions it
JOIN items i ON i.id = it.item_id
JOIN lots l ON l.id = it.lot_id
LEFT JOIN parties p ON p.id = l.owner_party_id
WHERE it.created_at >= $start_date
  AND (it.flow_type = $flow_type OR $flow_type IS NULL)
  AND it.id > $last_seen_id  -- keyset cursor
ORDER BY it.id ASC
LIMIT 1000;
```

---

## 6. Authorization and Scope

### 6.1 Capabilities

| Capability | Scope kind | Roles | Description |
| --- | --- | --- | --- |
| `reporting.read` | `global` | `supervisor`, `administrator` | Full access to all analytics views and tabular drill-downs across all parties. |
| `reporting.export` | `global` | `administrator` (supervisor by explicit grant) | Access to CSV export endpoints. |
| `reporting.party_read` | `assigned_party` | `party_user` | Scoped analytics access — own party's data only. VMI/Trading flows only; Supplies never exposed to party users per `02` §3.2. |
| `reporting.financial_read` | `global` | `supervisor`, `administrator` | Trading revenue, cost, profit, margin, and price references; never floor staff or party users. |

`reporting.party_read` and `reporting.financial_read` are defined in the canonical `02-rbac-roles` capability catalog. Financial absence must remove the columns at the projection/RLS boundary, not return nulls.

### 6.2 RLS Behavior

Party users receive the same queries as admin users. RLS enforces the data boundary automatically through `user_party_scopes`. The analytics route handlers:

1. Call `requirePermission('reporting', 'read', scope)` (or `reporting.party_read` for party users).
2. Execute the query inside the RLS-enforcing transaction wrapper (per `02` §6.3).
3. Return only RLS-visible rows — no application-layer `WHERE party_id = ?` clause replaces the RLS boundary.

For admin/supervisor users, `reporting.read` is `global` scope — they see all parties. For `party_user`, `reporting.party_read` is `assigned_party` scope — RLS filters to their own party's lots, WRRs, and pick lists.

### 6.3 Sensitive Field Exclusion

`items.buying_price`, `items.selling_price`, and `items.default_supplier_party_id` are never included in party-user projections. The `party_visible_items` view defined in `02` §7.4 already excludes these columns. Analytics queries that join to items for party users use `party_visible_items`, not the base `items` table.

For admin/supervisor users, `buying_price` and `selling_price` are accessible in the Trading analytics margin reference display (FR-6.3) only — not surfaced in any other context.

---

## 7. Performance Strategy

### 7.1 Query Targets and Index Requirements

The following indexes are required to support analytics query performance:

| Table | Index | Supports |
| --- | --- | --- |
| `inventory_transactions` | `(flow_type, created_at)` | Heatmap filter, transfer volume trend |
| `inventory_transactions` | `(movement_type, created_at)` | Movement type breakdowns |
| `lots` | `(status, flow_type)` | Lot status distribution, flow partition view |
| `lots` | `(item_id, status)` | Low stock item rollup |
| `lots` | `(expiry_date)` WHERE status = 'available' | Stock aging, FIFO/FEFO queue health |
| `wrr_documents` | `(created_at, status)` | WRR volume trend, cycle time |
| `wrr_inspection_logs` | `(conformance_status, created_at)` | Inspection outcome breakdown |
| `pick_lists` | `(status, created_at, flow_type)` | Pick list volume trend, dispatch rate |

These indexes are proposed by this spec. They must be reconciled with `01-core-data-model`'s approved migration plan before implementation.

### 7.2 Dashboard Parallel Data Fetching

The main dashboard page uses Next.js 15 parallel Server Components:

```text
Page (RSC)
├── KpiDataLoader (RSC) — 6 KPI queries in parallel via Promise.all
├── HeatmapDataLoader (RSC) — daily_transaction_counts query
├── QuickAccessLoader (RSC) — 3 most recent WRRs, open pick lists, pending inspections
└── RecentActivityLoader (RSC) — last 10 inventory_transactions
```

Each loader is independently streamed. The dashboard renders with Suspense boundaries so slow loaders do not block faster ones.

### 7.3 Materialized View Refresh

`daily_transaction_counts` is refreshed hourly. The refresh job is owned by spec `04`'s scheduled infrastructure. The materialized view must support `REFRESH MATERIALIZED VIEW CONCURRENTLY` so stale data is never blocked during refresh. This requires a unique index on `(activity_date, flow_type, movement_type)`.

### 7.4 Latency Budget

| Component | Target | Mechanism |
| --- | --- | --- |
| KPI card row (6 cards) | < 400ms | `lot_inventory_totals` view, indexed queries |
| Activity heatmap | < 300ms | `daily_transaction_counts` materialized view |
| Quick access panel | < 200ms | Indexed status/date queries |
| Recent activity feed | < 200ms | `LIMIT 10 ORDER BY created_at DESC` |
| Full dashboard first paint | < 2 000ms | Parallel RSC + Suspense streaming |

---

## 8. Testing Strategy

Testing follows the patterns defined in `specs/00-steering/testing.md`.

### 8.1 Unit Tests (Vitest)

- KPI value computation logic: verify each KPI formula against a fixture dataset.
- Trend indicator calculation: verify direction and percentage arithmetic.
- Heatmap color tier mapping: verify all five thresholds produce the correct opacity class.
- Flow-type filter logic: verify that filtering by `'vmi'` excludes `'trading'` and `'supplies'` rows.
- Low stock threshold: verify that `qty_available < min_reorder_level` condition is correct; verify that `qty_available === min_reorder_level` is NOT flagged.
- FIFO/FEFO queue health: verify sort order (expiry date ascending for perishables, created_at ascending for non-perishables).
- CSV column exclusion: verify that `buying_price`, `selling_price`, and `default_supplier_party_id` are absent from party-user export output.

### 8.2 Real-Postgres Integration Tests

- Execute all analytics queries against a real Postgres 16+ instance with seeded data.
- Verify that `lot_inventory_totals` returns the correct aggregated values after receiving, commitment, and dispatch operations.
- Verify that the heatmap fallback query and the materialized-view query return identical results for the same dataset.
- Verify that a `party_user` session returns only their own party's rows for every analytics endpoint — using at least two distinct parties in the seed, with cross-party records in every queried table.
- Verify that a `party_user` receives zero rows from direct queries against `items.buying_price` or `items.selling_price`.
- Verify that the `lot_location_balances` table is never directly aggregated by analytics queries — confirmed by checking `EXPLAIN` output shows `lot_inventory_totals` as the scan source, not the base table.
- Verify that `daily_transaction_counts` `REFRESH MATERIALIZED VIEW CONCURRENTLY` succeeds and the unique index is present.
- Run `db-migration-verifier` before sign-off to confirm all proposed indexes apply cleanly.

### 8.3 Component Tests (Vitest + Testing Library)

- `<KpiCard>`: renders value, label, trend arrow, and `aria-label` correctly for up/down/flat states.
- `<ActivityHeatmap>`: each cell renders with the correct opacity class for its transaction count tier; legend renders all five swatches; keyboard navigation moves focus between cells.
- `<DonutChart>`: each segment renders its label text alongside the color; no segment is color-only.
- `<StockLevelTable>`: sort chevron updates `aria-sort`; status badge renders text + color; expiry-imminent rows show the warning icon.
- `<AlertBanner>`: renders icon + text for both severity levels; link is keyboard focusable.

### 8.4 Playwright End-to-End Tests

- Office Admin logs in, navigates to `/reports` (renamed from `/dashboard` 2026-08-07 — see `specs/00-steering/revision-log.md`), sees all 6 KPI cards with non-zero values, and the heatmap renders without error.
- Office Admin applies the "VMI" heatmap filter; heatmap recalculates and re-renders.
- Party user logs in, navigates to `/reports`; sees only their own party's data in KPI cards and the activity feed; cannot navigate to the Operational or Trading analytics sections.
- Office Admin exports the Transaction Ledger CSV; downloaded file has correct headers and row count; no `buying_price` column appears in the file.
- Party user attempts to access the CSV export endpoint directly; receives a 403 response.
- Office Admin accesses the VMI analytics page; `<FlowPartitionSummary>` shows three panels at `lg` width.

### 8.5 Accessibility Testing

- Run axe-core against the main dashboard page; zero WCAG AA violations.
- Verify all charts expose a hidden data table to screen readers.
- Verify `<ActivityHeatmap>` is fully navigable by keyboard in the correct grid cell order.
- Verify trend arrows on `<KpiCard>` are `aria-hidden="true"` and the accessible label contains the percentage.

---

## 9. Requirement Traceability

| Requirement | Design sections |
| --- | --- |
| FR-1 Main Dashboard | §3, §4.1–4.3, §5.3, §7.2 |
| FR-2 Inventory Analytics | §4.7, §5.2, §7.1 |
| FR-3 Receiving Analytics | §5.4, §7.1 |
| FR-4 Outbound Analytics | §5.5, §7.1 |
| FR-5 VMI Analytics | §4.10, §6.2 |
| FR-6 Trading Analytics | §6.3 |
| FR-7 Operational Analytics | §5.3, §5.4 |
| FR-8 Reports and Export | §5.6, §6.1 |
| FR-9 Reusable Components | §4.1–4.10 |
| NFR-1 Performance | §7 |
| NFR-2 Heatmap Performance | §2.1, §5.3, §7.3 |
| NFR-3 Scope Enforcement | §6.2 |
| NFR-4 No Recalculation | §1, §2 |
| NFR-5 Accessibility | §4.3–4.9, §8.5 |
| NFR-6 Sensitive Fields | §6.3, §8.2 |
| NFR-7 Export Safety | §5.6, §6.1 |

---

## 10. Known Design Dependencies Before Approval

- `reporting.party_read` capability must be added to the `02-rbac-roles` canonical capability catalog (§3.2) and the `role_permissions` seed migration.
- Proposed indexes (§7.1) must be reconciled with `01-core-data-model`'s final migration plan.
- The `daily_transaction_counts` materialized view refresh job requires spec `04` (scheduled infrastructure) to be at least partially approved before the production heatmap path is available.
- The FIFO override count (FR-4.3) depends on the `approval_requests` table schema from spec `09`. Until `09` is approved, this metric is shown as "pending spec `09` approval" in the UI.
- Outbound inspection analytics (FR-7.2) covers inbound inspection only until spec `11` defines its inspection record schema.
