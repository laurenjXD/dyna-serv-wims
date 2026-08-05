# Reporting & Analytics — Requirements

Status: Draft

Depends on:
- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/00-steering/structure.md`
- `specs/00-steering/brand-design-system.md`
- `specs/01-core-data-model/`
- `specs/02-rbac-roles/`
- `specs/05-ui-shell-and-navigation/`

---

## 1. Overview

This feature defines the Office Administration Desktop Dashboard, serving as the central landing page for warehouse managers and office staff. It provides high-level visibility into warehouse throughput, transaction trends, and inventory movement history.

The primary users for this dashboard are:
- **Office Administrators & Managers:** Monitoring daily warehouse activity, investigating specific transactions, and generating reports.

---

## 2. Goals

- Provide a top-down view of warehouse performance using aggregate KPIs (Total Receipts, Total Withdrawals, VMI vs Trading).
- Implement a visual, GitHub-style Activity Heatmap to track daily transaction volume over time.
- Provide a real-time, filterable ledger of Recent Transactions.
- Ensure all queries remain performant against the central `stock_entries` table.
- Allow CSV export of filtered transaction history.

---

## 3. Functional Requirements

### FR-1: Desktop Dashboard Landing Page
1. The dashboard SHALL be the default authenticated landing route (`/dashboard`) for users with Office Manager/Admin roles.
2. The UI layout SHALL adhere to the sidebar navigation and header structures defined in `specs/05-ui-shell-and-navigation/`.
3. The dashboard SHALL feature a "Comprehensive Sales/Inventory Metrics" section containing aggregate KPIs.

### FR-2: GitHub-Style Activity Heatmap ("Total Trends")
1. The dashboard SHALL feature a 12-month calendar heatmap (similar to GitHub contributions).
2. The heatmap metric SHALL track **Total Daily Transaction Volume** (the aggregate count of all `stock_entries` created on a specific calendar day).
3. The heatmap coloring SHALL scale from light to dark based on volume density (e.g., darker blue for higher volume days).
4. Hovering or interacting with a specific day block SHALL reveal a tooltip with the exact date and the exact number of transactions (e.g., "250 Transactions on 20 March 2024").
5. The view SHALL allow filtering or toggling between "Receipts Only", "Withdrawals Only", or "All Transactions".

### FR-3: Recent Transactions Ledger
1. The dashboard SHALL feature a "Recent Transactions" data table displaying the most recent inventory movements.
2. The table SHALL query the `stock_entries` ledger and join necessary reference data.
3. The table columns SHALL include:
   - **Transaction Date** (`created_at`)
   - **Customer / Party Name** (Joined from `parties` table via `party_id`)
   - **Product / Item Name** (Joined from `items` table via `item_id`)
   - **Transaction Type** (Incoming Receipt vs Outgoing Withdrawal)
   - **Quantity** (`quantity`)
   - **User / Cashier** (The staff member who processed the transaction)
4. The table SHALL support sorting by Date, Party, or Item Name.
5. The table SHALL support basic filtering (e.g., Filter by Current Month, Filter by Party).

### FR-4: Inventory Movement History & Export
1. The system SHALL provide a dedicated "Reports & Analytics" view for deep-dive investigations beyond the recent dashboard transactions.
2. The reporting view SHALL allow users to specify a date range (`start_date` to `end_date`).
3. The reporting view SHALL allow filtering by Party (VMI Client or Trading Supplier).
4. The system SHALL support exporting the filtered transaction ledger to a standard `.csv` file format.

---

## 4. Non-Functional Requirements & Performance
1. **Query Performance:** Heatmap aggregations across large datasets (e.g., thousands of `stock_entries`) SHALL be optimized. If necessary, a materialized view or aggregate table MAY be utilized for daily volume counts to prevent slow dashboard load times.
2. **Access Control:** The dashboard metrics and recent transactions SHALL strictly adhere to RBAC (`02-rbac-roles`). If a Party/Client logs in, they SHALL only see trends and transactions associated with their specific `party_id`. Office Admins SHALL see aggregate warehouse totals.

---

## 5. Out of Scope
- Predictive analytics, AI forecasting, or machine learning inventory suggestions.
- Financial accounting integration (General Ledger, QuickBooks sync).
- Floor/mobile-scanner views (the dashboard is explicitly desktop-priority).

---

## 6. Acceptance Criteria
1. The dashboard loads in under 2 seconds for an Office Admin, displaying the GitHub-style heatmap and KPI totals.
2. The heatmap correctly calculates daily volume based on the underlying `stock_entries` data.
3. The Recent Transactions table correctly joins and displays `parties` and `items` data for the 10 most recent transactions.
4. Users can successfully export a filtered date range of transactions to CSV.
