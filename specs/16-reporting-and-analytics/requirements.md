# Reporting & Analytics — Requirements

Status: Approved
Updated: 2026-08-14 (Aligned with Unified UI/UX & Visual Design System)

## 1. Purpose and scope

Spec 16 defines the analytics and reporting surface (`/reports`) for the Dyna-Serv WIMS. It provides high-level warehouse visibility, operational analytics across all three Inventory Models (VMI, Trading, Supplies), and a reusable component library (`<KpiCard>`, `<ActivityHeatmap>`, `<TrendLineChart>`, etc.).

### Terminology Alignment
Across all user-facing reporting dashboards, charts, tables, and headers:
- **Organization** replaces Party.
- **Inventory Model** replaces Flow Type.
- **Organization Portal** replaces Party Portal.

*(Note: `parties` and `flow_type` remain canonical database identifiers.)*

## 2. Retention & Operating Contract

- **`lot_history_export`**: Operating contract is a daily refresh with **permanent tiered retention** (3 years hot in Supabase, then archived off-platform with SHA-256 hash verification before deleting from Supabase). `01-core-data-model` owns canonical read models; `16` owns generation, serving, and Excel delivery.

## 3. Financial Access & Roles

- **Supervisor & Administrator**: Access financial reports and revenue/margin metrics via `reporting.financial_read`.
- **Organization User**: Sees only their own Organization's stock position in **Organization Portal**; NEVER sees cost, margin, or financial columns.

## 4. Sub-Tab & Dashboard Architecture

The Reporting dashboard (`/reports`) features:
1. **Overview KPI Cards**: Receipts MTD, Dispatches MTD, Total Lots in Stock, Total Committed Qty, Low Stock Items Count, Pending Inspections Count.
2. **`<ActivityHeatmap>` Widget**: Trailing 52-week grid of transaction volume filterable by Inventory Model.
3. **Movement & Conformance Trend Graphs**:
   - **Movement Trend**: 30-day transactional velocity curve.
   - **`<DeliveryConformanceChart>`**: Outbound delivery conformance & OTIF trend tracking percentage of dispatches with uploaded/approved signed POD/DR against a 98.0% benchmark target, with cross-navigation to Outgoing Ledger (`/outgoing?tab=ledger`).
4. **Domain Tabs**: Operational & Heatmap, Trading & Capital BI, VMI & Consignment BI, Warehouse & Spatial Analytics, Exports.
5. **Excel Exports**: Inventory Snapshot, Transaction Ledger, Receiving History, Dispatch History, Connected Lot History.

## 5. Visual Design System & Error Feedback

1. Surfaces use Level 0 Cream White (`#FFF7ED`) background, Level 1 Solid White (`#FFFFFF`) cards with `#2563EB` Vibrant Blue accents, and Etna Sans Serif + Glacial Indifference typography.
2. All report loading/export errors display 3-component error feedback (**What happened**, **Why it failed**, **Next Action / Solution**).

## 6. Acceptance criteria

- [ ] Reporting dashboard renders at `/reports` with KPI cards, `<ActivityHeatmap>`, and domain tabs.
- [ ] Operational tab displays `<DeliveryConformanceChart>` with live conformance percentage and link to Outgoing Ledger.
- [ ] User-facing UI labels use Organization, Inventory Model, and Organization Portal exclusively.
- [ ] Permanent tiered retention policy is enforced for `lot_history_export`.
- [ ] Financial columns are gated by `reporting.financial_read` for Supervisor and Administrator.
- [ ] 3-component error feedback is present on all report loading/export errors.
