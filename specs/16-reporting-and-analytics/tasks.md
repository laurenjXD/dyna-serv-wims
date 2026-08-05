# Reporting & Analytics — Tasks

Status: Draft

Sign-off:
- [ ] Technical Lead Sign-off
- [ ] Product/Operations Lead Sign-off

---

## Task Checklist

### 1. Dashboard UI & Metrics Integration
- [ ] **Task 16.1: Author Heatmap Calendar Component (`<ActivityHeatmap>`)**
  - Implement a 52x7 CSS Grid layout for the GitHub-style daily activity tracker.
  - Implement 5-tier color scale based on volume thresholds (0, 1-10, 11-50, 51-100, 100+).
  - Add interactive tooltips displaying the exact date and transaction count.
- [ ] **Task 16.2: Aggregate Data Fetching Architecture**
  - Write Server Action / Query to fetch grouped daily transaction counts from `stock_entries`.
  - Wire data to the Heatmap component and KPI cards.
- [ ] **Task 16.3: Author Recent Transactions Component (`<RecentTransactionsTable>`)**
  - Implement the table UI with columns: Date, Party, Item, Quantity, Transaction Type, Cashier/User.
  - Write Drizzle query to join `stock_entries`, `parties`, and `items`, limiting to the latest 10 records.

### 2. Reporting & Export Functions
- [ ] **Task 16.4: Filterable Inventory History View**
  - Build a dedicated `/reports` route.
  - Add Date Range (Start Date / End Date) and Party dropdown filters.
  - Hook filters up to the Drizzle query `where` clauses.
- [ ] **Task 16.5: CSV Export Endpoint**
  - Create a Next.js Route Handler (`/api/export/transactions`).
  - Accept filter parameters, query the database, and format the response as a downloadable `.csv` file.
  - Ensure correct HTTP headers (`Content-Disposition: attachment; filename="transactions.csv"`).

### 3. Review & Optimization
- [ ] **Task 16.6: RLS Enforcement Verification**
  - Ensure the dashboard gracefully handles limited scope when viewed by a `PartyClient` role.
- [ ] **Task 16.7: Query Performance Profiling**
  - Verify that the group-by aggregation query for the heatmap performs within the <2 second SLA against a seeded database with 10k+ rows.
