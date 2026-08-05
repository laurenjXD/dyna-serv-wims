# VMI Billing — Design

Status: Draft

Cites foundational specs:
- `specs/00-steering/tech.md`
- `specs/01-core-data-model/` (Depends on `parties`, `items.volume_cbm`, `forex_rates`)

---

## 1. Data Model & Schema Definitions

The billing schema is strictly isolated to storage occupancy logic. It relies on the core data model to provide the physical dimensions (`volume_cbm`) and the daily exchange rate (`forex_rates`).

### 1.1 `vmi_contracts` (`lib/db/schema/vmi_billing.ts`)
```typescript
import { pgTable, uuid, decimal, timestamp } from "drizzle-orm/pg-core";
import { parties } from "./parties";

export const vmiContracts = pgTable("vmi_contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id, { onDelete: "cascade" }).notNull().unique(),
  cbmRateUsd: decimal("cbm_rate_usd", { precision: 10, scale: 4 }).notNull(), // Daily rate per CBM in USD
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 1.2 `vmi_cbm_ledger` (`lib/db/schema/vmi_billing.ts`)
Tracks the running daily CBM balance for each vendor.
```typescript
import { pgTable, uuid, date, decimal, timestamp } from "drizzle-orm/pg-core";
import { parties } from "./parties";

export const vmiCbmLedger = pgTable("vmi_cbm_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id).notNull(),
  ledgerDate: date("ledger_date").notNull(),
  beginningCbm: decimal("beginning_cbm", { precision: 12, scale: 4 }).default("0").notNull(),
  inboundCbm: decimal("inbound_cbm", { precision: 12, scale: 4 }).default("0").notNull(),
  outboundCbm: decimal("outbound_cbm", { precision: 12, scale: 4 }).default("0").notNull(),
  endingCbm: decimal("ending_cbm", { precision: 12, scale: 4 }).default("0").notNull(), // (Beginning + Inbound - Outbound)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 1.3 `vmi_billing_statements` (`lib/db/schema/vmi_billing.ts`)
The immutable monthly billing output.
```typescript
import { pgTable, uuid, varchar, date, decimal, timestamp } from "drizzle-orm/pg-core";
import { parties } from "./parties";

export const vmiBillingStatements = pgTable("vmi_billing_statements", {
  id: uuid("id").primaryKey().defaultRandom(),
  statementNumber: varchar("statement_number", { length: 50 }).notNull().unique(), // e.g., 'VMI-2026-06-UBOT'
  partyId: uuid("party_id").references(() => parties.id).notNull(),
  periodStartDate: date("period_start_date").notNull(),
  periodEndDate: date("period_end_date").notNull(),
  totalBillableCbm: decimal("total_billable_cbm", { precision: 14, scale: 4 }).notNull(), // Sum of daily endingCbm
  appliedCbmRateUsd: decimal("applied_cbm_rate_usd", { precision: 10, scale: 4 }).notNull(), // Snapshotted from contract
  totalAmountUsd: decimal("total_amount_usd", { precision: 14, scale: 4 }).notNull(), // totalBillableCbm * appliedCbmRateUsd
  lockedExchangeRatePhp: decimal("locked_exchange_rate_php", { precision: 10, scale: 4 }).notNull(), // Snapshotted from forex_rates
  totalAmountPhp: decimal("total_amount_php", { precision: 14, scale: 4 }).notNull(), // totalAmountUsd * lockedExchangeRatePhp
  generatedByUserId: uuid("generated_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

---

## 2. System Architecture & Algorithms

### 2.1 The CRON Job (Daily Ledger Engine)
To maintain the `vmi_cbm_ledger` automatically, the backend will utilize a scheduled CRON job (e.g., via Vercel Cron or a PG_CRON trigger) that executes at `00:00:01` daily.

**Algorithm:**
1. Fetch all active VMI `party_id`s.
2. For each party, determine the previous day's `ending_cbm`. This becomes today's `beginning_cbm`.
3. Query `inventory_transactions` for the specific date where `flowType = 'vmi'`.
4. Group by movement type (Incoming Receipts vs Outgoing Withdrawals).
5. For each transaction, join the `items` table to retrieve `volume_cbm`. Multiply `transaction.qty * items.volume_cbm` to get the movement volume.
6. Sum the inbound volume, sum the outbound volume, calculate the new `ending_cbm`, and insert the row into `vmi_cbm_ledger`.

### 2.2 Statement Generation & Exchange Rate Locking
When an Office Admin triggers statement generation for a given month:
1. The system aggregates all rows in `vmi_cbm_ledger` where `ledger_date` falls between `period_start_date` and `period_end_date`.
2. It fetches the latest `usd_to_php_rate` from the `forex_rates` table for the current `generation_date`.
3. It inserts the final computed totals into `vmi_billing_statements`, locking the rate permanently. Retroactive edits to previous ledgers or forex rates will not propagate to this locked document.
