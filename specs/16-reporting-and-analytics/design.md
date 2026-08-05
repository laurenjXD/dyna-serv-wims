# Reporting & Analytics — Design

Status: Draft

Cites foundational specs:
- `specs/00-steering/product.md`
- `specs/00-steering/tech.md`
- `specs/00-steering/structure.md`
- `specs/00-steering/brand-design-system.md`
- `specs/01-core-data-model/`
- `specs/02-rbac-roles/`
- `specs/05-ui-shell-and-navigation/`

---

## 1. Overview & Architecture

Spec 16 defines the UI layout, component structure, and database query architecture for the Office Administration Dashboard and Reporting views. 

The design relies heavily on the **`stock_entries`** ledger (from `01-core-data-model`) as the single source of truth for all aggregations and recent activity views.

---

## 2. Dashboard UI Layout Architecture

The dashboard acts as the primary layout inside the desktop UI shell.

### 2.1 Visual Hierarchy & Component Map
```
[ Top Header Bar (User Profile, Notifications, Export CSV) ]
------------------------------------------------------------
[ Left Sidebar    ] | [ Main Content Area                  ]
[ (Nav Shell)     ] | 
[ - Dashboard     ] |  1. Metrics Cards (`<KpiCardGroup>`)
[ - Inventory     ] |     - Total Received (MTD)
[ - Reports       ] |     - Total Picked (MTD)
[                 ] | 
[                 ] |  2. Heatmap Component (`<ActivityHeatmap>`)
[                 ] |     - 12-Month GitHub-style activity grid
[                 ] |     - Day blocks mapped to activity volume
[                 ] | 
[                 ] |  3. Recent Transactions (`<RecentTransactionsTable>`)
[                 ] |     - Date | Party | Item | Qty | Type
```

### 2.2 The GitHub-Style Activity Heatmap
To match the requested visual design:
- **Grid Layout:** Standard 52-week columns $\times$ 7-day rows CSS Grid.
- **Color Scale (Thresholds):**
  - `Level 0` (0 transactions): Neutral / Gray (e.g., `bg-slate-100`)
  - `Level 1` (1-10 transactions): Light Primary (e.g., `bg-blue-200`)
  - `Level 2` (11-50 transactions): Medium Primary (e.g., `bg-blue-400`)
  - `Level 3` (51-100 transactions): Dark Primary (e.g., `bg-blue-600`)
  - `Level 4` (100+ transactions): Heaviest Primary (e.g., `bg-blue-800`)
- **Interactivity:** Tooltip appears on hover: `[Count] Transactions on [Date]`.

---

## 3. Data & Query Architecture

### 3.1 Heatmap Aggregation Query
To power the heatmap efficiently without pulling thousands of raw rows into the browser, Drizzle/Postgres will execute an aggregate group-by query.

**Example SQL logic:**
```sql
SELECT 
  DATE(created_at) as activity_date,
  COUNT(*) as transaction_count
FROM stock_entries
WHERE created_at >= (CURRENT_DATE - INTERVAL '1 year')
GROUP BY DATE(created_at)
ORDER BY activity_date ASC;
```
*Note: If the `stock_entries` table grows beyond 1M+ rows, this view should be cached via a materialized view (`daily_transaction_volume`) refreshed asynchronously.*

### 3.2 Recent Transactions Query
To power the data table, the query must join `stock_entries` to the `parties` and `items` tables.

**Drizzle ORM Logic Concept:**
```typescript
const recentTransactions = await db.select({
  date: stockEntries.createdAt,
  partyName: parties.name,
  itemName: items.name,
  quantity: stockEntries.quantity,
  type: stockEntries.entryType, // 'receipt' | 'withdrawal'
  operator: users.displayName
})
.from(stockEntries)
.innerJoin(parties, eq(stockEntries.partyId, parties.id))
.innerJoin(items, eq(stockEntries.itemId, items.id))
.innerJoin(users, eq(stockEntries.createdBy, users.id))
.orderBy(desc(stockEntries.createdAt))
.limit(10);
```

---

## 4. Reporting & Export Design

### 4.1 CSV Export Format
When an admin clicks **Export CSV** on the transactions list, a Route Handler (`/api/export/transactions`) generates a flattened CSV.

**CSV Columns:**
`Transaction_ID, Date, Time, Party_Name, Item_Name, Item_Barcode, Type, Quantity, UOM, Location_Zone, Processed_By, Reference_No (CIPL/AR)`

### 4.2 Party Scope (RLS Enforcement)
- **SysAdmin / OfficeAdmin:** Views aggregations across all parties. Query executes without `party_id` filters.
- **PartyClient:** If a vendor logs in to the portal, the Supabase RLS policy automatically filters `stock_entries` to their specific `party_id`. The dashboard logic remains identical; the database natively enforces the scope constraint.
