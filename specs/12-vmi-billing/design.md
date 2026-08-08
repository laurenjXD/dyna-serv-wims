# VMI Billing — Design

Status: Approved
Updated: 2026-08-05

Cites foundational specs:

- `specs/00-steering/tech.md`
- `specs/01-core-data-model/` — depends on `parties`, `lots`, `items.volume_cbm`, `lot_location_balances`, `lot_inventory_totals` (view), `inventory_transactions`, `forex_rates`, `wrr_documents`, `pick_lists`
- `specs/04-services-and-infrastructure/` — PDF artifact pipeline, Resend email delivery
- `specs/10-pick-list-and-acknowledgement-receipt/` — per-release reference price context only; no billing dependency

---

## 1. Data Model & Schema Definitions

All tables are defined in `lib/db/schema/vmi_billing.ts` and exported via `lib/db/schema/index.ts`.

This schema does NOT redefine any table from `01-core-data-model`. All cross-schema references use imported table identifiers from their canonical schema files.

### 1.1 `vmi_contracts`

One record per VMI party. Stores the contracted billing rate, currency denomination, optional charge-type flags, and their associated rates.

```typescript
import {
  pgTable, uuid, varchar, decimal, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { parties } from "./parties";

export const vmiContracts = pgTable("vmi_contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull()
    .unique(), // One active contract per VMI party
  cbmRateUsd: decimal("cbm_rate_usd", { precision: 10, scale: 6 }).notNull(), // Daily rate per occupied CBM in USD
  billingCurrency: varchar("billing_currency", { length: 3 }).notNull().default("USD"), // 'USD' | 'PHP'
  cbmThresholdContracted: decimal("cbm_threshold_contracted", { precision: 12, scale: 4 }), // NULL = no surcharge threshold
  // Inbound handling fee: per confirmed WRR
  handlingFeeEnabled: boolean("handling_fee_enabled").default(false).notNull(),
  handlingFeeRateUsd: decimal("handling_fee_rate_usd", { precision: 10, scale: 4 }), // NULL when not enabled
  // Outbound handling fee: per dispatched pick list
  outboundHandlingFeeEnabled: boolean("outbound_handling_fee_enabled").default(false).notNull(),
  outboundHandlingFeeRateUsd: decimal("outbound_handling_fee_rate_usd", { precision: 10, scale: 4 }), // NULL when not enabled
  // Storage surcharge: per CBM above contracted threshold per day
  storageSurchargeEnabled: boolean("storage_surcharge_enabled").default(false).notNull(),
  storageSurchargeRateUsd: decimal("storage_surcharge_rate_usd", { precision: 10, scale: 6 }), // NULL when not enabled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

**Constraint notes (enforced at application layer):**

- `handling_fee_rate_usd` MUST be non-null when `handling_fee_enabled = true`.
- `outbound_handling_fee_rate_usd` MUST be non-null when `outbound_handling_fee_enabled = true`.
- `storage_surcharge_rate_usd` and `cbm_threshold_contracted` MUST both be non-null when `storage_surcharge_enabled = true`.
- `billing_currency` MUST be one of `'USD'`, `'PHP'`.

### 1.2 `vmi_cbm_ledger`

One row per VMI party per calendar day. The `ending_cbm` column is the authoritative occupied-CBM snapshot; `inbound_cbm` and `outbound_cbm` are informational delta values derived from `inventory_transactions`. **(2026-08-08)** `applied_cbm_rate_usd` and `daily_amount_usd` are captured the same night as `ending_cbm`, using whichever `vmi_contracts.cbm_rate_usd` is in effect at that moment — this is what lets a mid-period rate change bill correctly (each day is priced at the rate that was actually active that day, not retroactively repriced by whatever the rate happens to be at statement-generation time). It also matches the client's own CBM ledger reference format (`DATE | BEGINNING CBM | IN | OUT | ENDING CBM | DAILY AMOUNT`) as a queryable/displayable row, not just an internal aggregate.

```typescript
import {
  pgTable, uuid, date, decimal, timestamp, unique,
} from "drizzle-orm/pg-core";
import { parties } from "./parties";

export const vmiCbmLedger = pgTable("vmi_cbm_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id).notNull(),
  ledgerDate: date("ledger_date").notNull(), // Calendar date in Asia/Manila timezone
  beginningCbm: decimal("beginning_cbm", { precision: 12, scale: 4 }).default("0").notNull(),
  inboundCbm: decimal("inbound_cbm", { precision: 12, scale: 4 }).default("0").notNull(),   // Informational only
  outboundCbm: decimal("outbound_cbm", { precision: 12, scale: 4 }).default("0").notNull(), // Informational only
  endingCbm: decimal("ending_cbm", { precision: 12, scale: 4 }).default("0").notNull(),     // Authoritative snapshot
  appliedCbmRateUsd: decimal("applied_cbm_rate_usd", { precision: 10, scale: 6 }).notNull(), // vmi_contracts.cbm_rate_usd in effect this day
  dailyAmountUsd: decimal("daily_amount_usd", { precision: 14, scale: 4 }).notNull(),         // ending_cbm × applied_cbm_rate_usd
  calculatedAt: timestamp("calculated_at").notNull(), // When the CRON snapshot was taken
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniquePartyDate: unique().on(table.partyId, table.ledgerDate), // Idempotency guard
}));
```

### 1.3 `vmi_billing_statements`

Immutable monthly billing output. Once `status = 'issued'` the computed amounts and locked exchange rate are permanently sealed.

```typescript
import {
  pgTable, uuid, varchar, date, decimal, integer, timestamp, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { parties } from "./parties";

export const vmiBillingStatements = pgTable("vmi_billing_statements", {
  id: uuid("id").primaryKey().defaultRandom(),
  statementNumber: varchar("statement_number", { length: 50 }).notNull().unique(), // e.g. 'VMI-2026-06-UBOT'
  partyId: uuid("party_id").references(() => parties.id).notNull(),

  // Period
  periodStartDate: date("period_start_date").notNull(), // First day of billing month
  periodEndDate: date("period_end_date").notNull(),     // Last day of billing month
  storagePeriodDays: integer("storage_period_days").notNull(), // Calendar days in the period

  // Storage charge inputs
  periodAverageCbm: decimal("period_average_cbm", { precision: 14, scale: 4 }).notNull(), // AVG(ending_cbm) for period
  appliedCbmRateUsd: decimal("applied_cbm_rate_usd", { precision: 10, scale: 6 }).notNull(), // Current contract rate at generation time, for display; NOT used to compute storageChargeUsd (see below) — the effective rate may have varied within the period
  storageChargeUsd: decimal("storage_charge_usd", { precision: 14, scale: 4 }).notNull(), // SUM(vmi_cbm_ledger.daily_amount_usd) over the period — each day already priced at that day's rate

  // Additional charge lines (null = not enabled on contract)
  handlingFeeCount: integer("handling_fee_count"),           // WRR count in period; null if not enabled
  handlingFeeRateUsd: decimal("handling_fee_rate_usd", { precision: 10, scale: 4 }), // Snapshotted from contract
  handlingFeeAmountUsd: decimal("handling_fee_amount_usd", { precision: 14, scale: 4 }), // count × rate; null if not enabled

  outboundHandlingFeeCount: integer("outbound_handling_fee_count"), // Pick list count in period; null if not enabled
  outboundHandlingFeeRateUsd: decimal("outbound_handling_fee_rate_usd", { precision: 10, scale: 4 }),
  outboundHandlingFeeAmountUsd: decimal("outbound_handling_fee_amount_usd", { precision: 14, scale: 4 }),

  storageSurchargeAmountUsd: decimal("storage_surcharge_amount_usd", { precision: 14, scale: 4 }), // null if not enabled

  // Credits applied
  creditNotesAppliedUsd: decimal("credit_notes_applied_usd", { precision: 14, scale: 4 }).default("0").notNull(),

  // Totals
  totalAmountUsd: decimal("total_amount_usd", { precision: 14, scale: 4 }).notNull(), // Sum of all charge lines minus credits
  lockedExchangeRatePhp: decimal("locked_exchange_rate_php", { precision: 10, scale: 4 }).notNull(), // From forex_rates at generation time
  lockedExchangeRateDate: date("locked_exchange_rate_date").notNull(), // forex_rates.effective_date used
  totalAmountPhp: decimal("total_amount_php", { precision: 14, scale: 4 }).notNull(), // totalAmountUsd × lockedExchangeRatePhp
  billingCurrency: varchar("billing_currency", { length: 3 }).notNull(), // Snapshotted from contract

  // Lifecycle
  status: varchar("status", { length: 20 }).notNull().default("draft"), // 'draft' | 'issued' | 'voided'
  supersededByStatementId: uuid("superseded_by_statement_id"), // Populated on the voided original when a correction replaces it
  pdfArtifactId: uuid("pdf_artifact_id"), // Reference to 04's artifact record

  // Audit
  generatedByUserId: uuid("generated_by_user_id").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  issuedAt: timestamp("issued_at"),
  voidedAt: timestamp("voided_at"),
  voidedByUserId: uuid("voided_by_user_id"),
}, (table) => ({
  totalAmountNonNegative: check(
    "total_amount_non_negative",
    sql`${table.totalAmountUsd} >= 0`
  ),
}));
```

### 1.4 `vmi_credit_notes`

Credit notes reduce the payable amount on a future period's statement. They are never subtracted from the current-period statement total before issuance.

```typescript
import {
  pgTable, uuid, varchar, decimal, boolean, text, timestamp,
} from "drizzle-orm/pg-core";
import { parties } from "./parties";
import { vmiBillingStatements } from "./vmi_billing";

export const vmiCreditNotes = pgTable("vmi_credit_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  creditNoteNumber: varchar("credit_note_number", { length: 50 }).notNull().unique(), // e.g. 'VMI-CN-2026-001'
  partyId: uuid("party_id").references(() => parties.id).notNull(),
  relatedStatementId: uuid("related_statement_id")
    .references(() => vmiBillingStatements.id), // Statement that prompted the credit; optional
  appliedToStatementId: uuid("applied_to_statement_id")
    .references(() => vmiBillingStatements.id), // Statement on which this credit was consumed
  amountUsd: decimal("amount_usd", { precision: 14, scale: 4 }).notNull(),
  amountPhp: decimal("amount_php", { precision: 14, scale: 4 }).notNull(),
  billingCurrency: varchar("billing_currency", { length: 3 }).notNull(), // Matches contract at time of creation
  reason: text("reason").notNull(),
  isApplied: boolean("is_applied").default(false).notNull(),
  appliedAt: timestamp("applied_at"),
  isCancelled: boolean("is_cancelled").default(false).notNull(),
  cancelledAt: timestamp("cancelled_at"),
  generatedByUserId: uuid("generated_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

---

## 2. System Architecture & Algorithms

### 2.1 Daily CBM Snapshot — CRON Job

**Schedule:** `59 23 * * *` in `Asia/Manila` time (UTC+8 = `51 15 * * *` UTC).

**Data source:** `lot_inventory_totals` view (defined in `01-core-data-model`) aggregated from `lot_location_balances`. This is the authoritative current-state quantity model. The CRON job does NOT read `inventory_transactions` as the billing source.

**Algorithm:**

```text
For each party_id where vmi_contracts exists AND parties.is_active = true:

1. SKIP if vmi_cbm_ledger row already exists for (party_id, today).

2. Compute ending_cbm (authoritative snapshot):
     SELECT SUM(lit.qty_remaining * i.volume_cbm)
     FROM   lot_inventory_totals lit
     JOIN   lots l   ON l.id = lit.lot_id
     JOIN   items i  ON i.id = l.item_id
     WHERE  l.flow_type    = 'vmi'
       AND  l.owner_party_id = :party_id
       AND  l.status       NOT IN ('depleted')

3. Retrieve beginning_cbm:
     Previous row's ending_cbm from vmi_cbm_ledger
     WHERE party_id = :party_id ORDER BY ledger_date DESC LIMIT 1.
     If no prior row exists, beginning_cbm = 0.

4. Compute inbound_cbm (informational):
     SELECT SUM(t.qty * i.volume_cbm)
     FROM   inventory_transactions t
     JOIN   lots  l ON l.id = t.lot_id
     JOIN   items i ON i.id = t.item_id
     WHERE  t.flow_type        = 'vmi'
       AND  l.owner_party_id   = :party_id
       AND  t.movement_type   IN ('receiving', 'putaway')
       AND  t.created_at      >= today_start_manila
       AND  t.created_at       < today_end_manila

5. Compute outbound_cbm (informational):
     Same join as step 4 but movement_type = 'pick'.

6. applied_cbm_rate_usd = vmi_contracts.cbm_rate_usd for :party_id, read fresh at this
   moment — this is what makes a rate change take effect only from the day it's
   changed forward, never retroactively.
   daily_amount_usd = ending_cbm × applied_cbm_rate_usd

7. INSERT INTO vmi_cbm_ledger
     (party_id, ledger_date, beginning_cbm, inbound_cbm,
      outbound_cbm, ending_cbm, applied_cbm_rate_usd, daily_amount_usd, calculated_at)
   VALUES
     (:party_id, :today, :beginning_cbm, :inbound_cbm,
      :outbound_cbm, :ending_cbm, :applied_cbm_rate_usd, :daily_amount_usd, NOW())
   ON CONFLICT (party_id, ledger_date) DO NOTHING.
```

**Timezone note:** `today_start_manila` and `today_end_manila` are computed by converting the current UTC timestamp to `Asia/Manila` and taking the midnight boundaries of that calendar day. The `ledger_date` stored is the Manila calendar date, not UTC.

### 2.2 Statement Generation

Triggered by an Office Administrator selecting a party and a billing month.

**Pre-conditions:**

- A `vmi_contracts` record exists for the party.
- A `forex_rates` row exists where `effective_date = generation_date` (today). If absent, block with a clear error: "No forex rate found for [date]. Please enter today's USD/PHP rate before generating."
- No existing non-voided statement for the same `(party_id, period_start_date, period_end_date)`.

**Algorithm:**

```text
1. period_start = first day of selected month (Asia/Manila)
   period_end   = last day of selected month (Asia/Manila)
   storage_period_days = number of calendar days in the month

2. Fetch ledger rows:
     SELECT ending_cbm, daily_amount_usd FROM vmi_cbm_ledger
     WHERE party_id = :party_id
       AND ledger_date BETWEEN :period_start AND :period_end
     ORDER BY ledger_date

   If no rows found: the period has no ledger data.
   The system SHALL warn the administrator and require explicit confirmation
   before continuing. An empty period is valid (ending_cbm = 0 throughout)
   but unusual.

3. period_average_cbm = AVG(ending_cbm) across all fetched rows.
   (Arithmetic mean. Days with no ledger row are an exception state,
    not silently treated as zero — see step 2 above. Stored on the
    statement as a display/reference figure only — it is not used to
    compute storage_charge_usd, see step 4.)

4. storage_charge_usd = SUM(daily_amount_usd) across all fetched rows.
   (2026-08-08: changed from `period_average_cbm × contract.cbm_rate_usd ×
   storage_period_days` to summing each day's already-priced
   `daily_amount_usd`. The two formulas are mathematically identical when
   the rate is constant for the whole period — but summing the per-day
   amount is what correctly handles a rate change mid-period, since each
   `vmi_cbm_ledger` row was already priced at whatever rate was in effect
   that day, per §2.1 step 6. `applied_cbm_rate_usd` is no longer read
   fresh from the contract at statement time for this calculation; it is
   still read fresh for display, so the statement can show the effective
   blended rate for the period if it varied.)

5. If contract.handling_fee_enabled = true:
     handling_fee_count = COUNT of wrr_documents WHERE
       vendor_party_id = :party_id
       AND flow_type = 'vmi'
       AND status = 'confirmed'
       AND confirmed_at BETWEEN :period_start AND :period_end
     handling_fee_amount_usd = handling_fee_count × contract.handling_fee_rate_usd

6. If contract.outbound_handling_fee_enabled = true:
     outbound_handling_fee_count = COUNT of pick_lists WHERE
       customer_party_id = :party_id
       AND flow_type = 'vmi'
       AND status = 'dispatched'
       AND updated_at BETWEEN :period_start AND :period_end
     outbound_handling_fee_amount_usd =
       outbound_handling_fee_count × contract.outbound_handling_fee_rate_usd

7. If contract.storage_surcharge_enabled = true
      AND contract.cbm_threshold_contracted IS NOT NULL:
     surcharge_usd = SUM(
       (ending_cbm - contract.cbm_threshold_contracted) × contract.storage_surcharge_rate_usd
     ) for all ledger rows where ending_cbm > contract.cbm_threshold_contracted

8. Sum unapplied credit notes for this party:
     SELECT SUM(amount_usd) FROM vmi_credit_notes
     WHERE party_id = :party_id AND is_applied = false AND is_cancelled = false
   This becomes credit_notes_applied_usd.

9. total_amount_usd =
       storage_charge_usd
     + COALESCE(handling_fee_amount_usd, 0)
     + COALESCE(outbound_handling_fee_amount_usd, 0)
     + COALESCE(surcharge_usd, 0)
     - credit_notes_applied_usd

   Clamp to 0 if negative (credit_notes_applied_usd must not exceed
   the gross amount — enforced by application logic before commit).

10. Fetch forex rate:
      locked_exchange_rate_php = forex_rates.usd_to_php_rate
      WHERE effective_date = :generation_date   ← today

11. total_amount_php = total_amount_usd × locked_exchange_rate_php

12. INSERT INTO vmi_billing_statements (all computed fields, status = 'draft').

13. Mark consumed credit notes:
      UPDATE vmi_credit_notes SET is_applied = true, applied_at = NOW(),
        applied_to_statement_id = :new_statement_id
      WHERE id IN (:applied_credit_note_ids)

14. Trigger PDF generation via 04's artifact pipeline.
    Store returned pdf_artifact_id on the statement.

15. Update statement status to 'issued', set issued_at = NOW().

16. Send PDF to parties.email via Resend.
```

### 2.3 Statement Corrections

A correction voids the original statement and issues a replacement. The original is never deleted.

```text
1. Validate: original statement must have status = 'issued'.
   A 'voided' statement cannot be corrected again — correct the replacement instead.
   A 'draft' statement should be deleted, not corrected.

2. Update original statement:
     status = 'voided'
     voided_at = NOW()
     voided_by_user_id = :requesting_user_id

3. Run the full statement generation algorithm (§2.2) for the same
   party and period, producing a new statement record with a new
   statement number (e.g., 'VMI-2026-06-UBOT-R1').

4. Update original statement:
     superseded_by_statement_id = :new_statement_id

5. Generate PDF and re-deliver.
```

### 2.4 Credit Note Application

Credit notes are created independently and are consumed atomically during statement generation (step 8–13 of §2.2). They are never negative-applied to the current statement after issuance. The statement generation transaction applies all unapplied, uncancelled credit notes for the party in a single atomic operation, marking each as applied.

---

## 3. Statement Number Format

```text
VMI-{YYYY}-{MM}-{PARTY_CODE}
VMI-{YYYY}-{MM}-{PARTY_CODE}-R{N}   ← correction revision, N starting at 1
```

Statement numbers are generated by the application and verified unique against `vmi_billing_statements.statement_number` before insert.

---

## 4. RLS Boundaries (to be defined in `02-rbac-roles`)

The following RLS requirements are noted here for the `02` spec to implement:

- `vmi_contracts`: readable by Office Admin and the owning party; writeable by Office Admin only.
- `vmi_cbm_ledger`: readable by Office Admin and the owning party (read-only for party); writeable only by the CRON service role.
- `vmi_billing_statements`: readable by Office Admin and the owning party; writeable by Office Admin (for generation and correction) and the CRON service role (for PDF artifact update).
- `vmi_credit_notes`: readable by Office Admin and the owning party; writeable by Office Admin only.

No party may read another party's billing data. Row-level filtering is `party_id = auth.uid()` (or the resolved party of the authenticated user) for all four tables.

---

## 5. Relationship to Other Specs

| Upstream spec | What `12` consumes |
| --- | --- |
| `01-core-data-model` | `lot_inventory_totals` view, `lot_location_balances`, `lots`, `items.volume_cbm`, `inventory_transactions` (informational delta), `forex_rates`, `wrr_documents`, `pick_lists`, `parties` |
| `04-services-and-infrastructure` | PDF generation artifact pipeline; Resend email delivery |
| `05-ui-shell-and-navigation` | `/billing-pricing` route entry, office shell (added 2026-08-08, see §6) |
| `10-pick-list-and-acknowledgement-receipt` | Per-release disclaimer language only; no billing input |
| `22-parties-portal` | Owns VMI party-facing statement access (`vmi_statements.read`) independently of `/billing-pricing`, which is office-only |

`12` does NOT consume `pick_list_items.unit_price`. That field is owned by `10` for document display only and is explicitly excluded from all billing calculations here.

---

## 6. UI and shell integration (added 2026-08-08)

`12` and `13` share one office-surface route, `/billing-pricing`, rather than each owning a separate top-level nav entry — both are financial-ledger views over the same class of data (party-scoped commercial history), and a single Office Admin/Supervisor workflow (`reporting.financial_read`) reviews both. The page is **not** part of `06-party-and-item-enrollment` — enrollment is master-data CRUD gated by `items.manage`/`parties.manage`; this page is read-heavy financial reporting gated by `reporting.financial_read`, a different capability and a different audience. `06`'s party/item detail pages link out to it (a "View billing history" / "View pricing history" action), the same pattern `06` already uses for the transaction-ledger links (§5b/§6a) — enrollment does not embed the ledger itself.

```text
app/(authenticated)/
  billing-pricing/
    page.tsx                # tab shell: VMI | Trading, redirects to ?tab=vmi by default
    vmi/page.tsx             # this spec (12): party picker, vmi_cbm_ledger table, statement history/generation
    trading/page.tsx         # 13-trading-orders-and-pricing: Trading Pricing & Margin Ledger (see 13 §7a)
```

**VMI tab** (owned by `12`), **office-only**:

- Party picker (Office Admin/Supervisor: any active VMI party).
- `vmi_cbm_ledger` rendered as a table matching the client's reference format exactly: `DATE | BEGINNING CBM | IN (CBM) | OUT (CBM) | ENDING CBM | DAILY AMOUNT`, one row per `ledger_date`, most recent first, date-range filterable (defaults to the current billing month).
- Below the ledger: statement history for the selected party (`vmi_billing_statements`, most recent first) and the "Generate Statement" action for a completed month, per §2.2. No new calculation logic is introduced here — this is a read/action surface over what §1-§2 already define.
- `vmi_contracts` (the rate itself) is shown read-only on this tab for context; editing the contract's `cbm_rate_usd` and charge-type flags is a separate Office Admin form (`billing-pricing/vmi/contracts/[partyId]/edit`, `vmi_contracts.manage`-equivalent capability — reuses the existing `vmi_contracts` write RLS from §4, no new capability invented). A rate change here takes effect from the next CRON snapshot forward only, per §2.1 step 6 — it never rewrites already-written `vmi_cbm_ledger` rows.

Capability gate: `reporting.financial_read`, held by `supervisor`/`administrator` only per `02-rbac-roles` — this is an internal-staff surface. **A VMI party user does not reach `/billing-pricing` at all** — `reporting.financial_read` is not granted to `party_user` (per `02` §3.2), so gating the route by it is safe here, unlike the earlier `/parties`/`/items`/`/locations` bug where the gating capability was *narrower* than the set of legitimate readers. A VMI party's own statement/credit-note visibility already exists as a separate, already-approved surface: `vmi_statements.read` (`assigned_party` scope, `party_user` role — added 2026-08-06 for `22-parties-portal` R4.4). This page does not replace or duplicate that; the portal keeps owning party-facing VMI statement access, and this office page is purely internal.
