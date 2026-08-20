# VMI Billing — Design

Status: Approved
Updated: 2026-08-19 (Full rewrite — see `requirements.md` header for what this supersedes and why)

Cites foundational specs:

- `specs/00-steering/tech.md`
- `specs/01-core-data-model/` — depends on `parties`, `lots`, `items.volume_cbm`, `items.vmi_movement_category` (added 2026-08-19 as a `12`-driven amendment to `01`'s schema — see §2.1 and revision-log.md), `lot_location_balances`, `inventory_transactions` (the movement source — see §2.1), `forex_rates`
- `specs/02-rbac-roles/` — capabilities, RLS
- `specs/04-services-and-infrastructure/` — PDF artifact pipeline (all four documents), Resend email delivery; and (added 2026-08-20, see revision-log.md) the Supabase Cron/`pg_cron` + Edge Function scheduling pattern §14.5 locks background work to — the nightly balance job (§2.2) is the first thing in this codebase to actually build that pattern, not a bespoke Vercel Cron route
- `specs/10-pick-list-and-acknowledgement-receipt/` — `generated_documents` (WHERE `document_type = 'acknowledgement_receipt'`) is the DR/AR reference every `vmi_charge_lines` row keys off; no new reference chain is introduced. **Correction (2026-08-19, pre-implementation):** an earlier draft of this design assumed a dedicated `acknowledgement_receipts` table; `10`'s actual, already-implemented schema (`lib/db/schema/documents.ts`) has no such table — an AR is a `generated_documents` row with `document_type = 'acknowledgement_receipt'`, `source_type` = `'inventory_commitment'` | `'inventory_transaction'`, `source_id` pointing at the actual record. §1.4 below reflects the corrected FK target.

---

## 1. Data Model & Schema Definitions

All tables are defined in `lib/db/schema/vmi_billing.ts` and exported via `lib/db/schema/index.ts`. This schema does NOT redefine any table from `01-core-data-model`, and it does NOT introduce a second movement-event log — `inventory_transactions` remains the sole immutable IN/OUT ledger; see §2.1.

### 1.1 `vmi_contract_terms`

**Effective-dated version history, not a single mutable row per party.** Replaces `vmi_contracts`. Every rate (storage, handling in/out, threshold config, documentation default) lives on this one versioned row together — mirrors the pattern `13-trading-orders-and-pricing`'s `trading_policies` already uses (`effective_from`/`effective_to`/`is_active`), rather than inventing a second pattern for VMI.

This shape exists because a single mutable row can't answer "what rate was in effect on date X" for any date but today — and both the nightly snapshot job (§2.2) and the backfill utility (`vmi-daily-balance-backfill.ts`, Task C.6) need exactly that answer for historical dates, not just "whatever the contract currently says." A rate edit never overwrites history; it closes the current row and inserts a new one.

```typescript
import {
  pgTable, uuid, varchar, decimal, timestamp, boolean, pgEnum,
} from "drizzle-orm/pg-core";
import { parties } from "./parties";

export const vmiBillingTimingEnum = pgEnum("vmi_billing_timing", ["beginning_of_day", "end_of_day"]);
export const vmiCbmThresholdTypeEnum = pgEnum("vmi_cbm_threshold_type", ["none", "minimum_billable", "included_allowance"]);

export const vmiContractTerms = pgTable("vmi_contract_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id, { onDelete: "cascade" }).notNull(),

  storageRatePerCbmDay: decimal("storage_rate_per_cbm_day", { precision: 10, scale: 6 }).notNull(),
  // Which day's balance storage is priced against. Real June contract evidence
  // is beginning_of_day; kept per-party configurable, not hardcoded — see
  // requirements.md FR-1.
  billingTiming: vmiBillingTimingEnum("billing_timing").notNull().default("beginning_of_day"),

  cbmThresholdType: vmiCbmThresholdTypeEnum("cbm_threshold_type").notNull().default("none"),
  cbmThreshold: decimal("cbm_threshold", { precision: 12, scale: 4 }), // required when threshold_type != 'none'
  overThresholdRate: decimal("over_threshold_rate", { precision: 10, scale: 6 }), // required when threshold_type = 'included_allowance'

  // Independently configurable — evidenced equal ($1.40) in June's real
  // contract, but nothing requires that.
  handlingInRatePerCbm: decimal("handling_in_rate_per_cbm", { precision: 10, scale: 4 }).notNull(),
  handlingOutRatePerCbm: decimal("handling_out_rate_per_cbm", { precision: 10, scale: 4 }).notNull(),

  // A DEFAULT, not a locked formula — an authorized user may override the
  // amount per vmi_charge_lines row (requirements.md FR-4.2).
  documentationDefaultRateUsd: decimal("documentation_default_rate_usd", { precision: 10, scale: 4 }).notNull(),

  billingCurrency: varchar("billing_currency", { length: 3 }).notNull().default("USD"), // 'USD' | 'PHP'

  // Version history fields — same shape as trading_policies.
  isActive: boolean("is_active").default(true).notNull(),
  effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  effectiveTo: timestamp("effective_to"), // NULL = currently open-ended; set when superseded, never deleted

  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

**Constraint notes (application layer):**
- `cbm_threshold` required when `cbm_threshold_type != 'none'`.
- `over_threshold_rate` required when `cbm_threshold_type = 'included_allowance'`.
- No delivery rate field exists on this table by design — delivery is always a `vmi_charge_lines` manual entry (FR-4.3), never contract-derived.
- **At most one row per `party_id` with `effective_to IS NULL`** (the currently-active version), enforced at the application layer exactly like `trading_policies`' "one active policy per (party, item)" invariant. A rate edit is never an `UPDATE` of rate columns on an existing row — it is: set the current row's `effective_to = NOW()` (or an admin-chosen future effective date), then `INSERT` a new row with `effective_from` = that same boundary. `id` and `created_at` are never reused across versions.
- Any lookup that needs "the rate in effect on date X" (nightly snapshot, backfill, period-close handling aggregation) queries `WHERE party_id = :p AND effective_from <= X AND (effective_to IS NULL OR effective_to > X)` — never "the current row," even when X happens to be today.

### 1.2 `vmi_recurring_fee_lines`

Zero or more flat/recurring charges per party. Replaces the two-flag ad-hoc fields the prior `vmi_contracts` design hardcoded (`handling_fee_enabled`/`outbound_handling_fee_enabled`) — real June data evidences **four** distinct recurring types (LOA, surety bond, trucking admin fee, manpower), so this is an open, typed list, not a fixed pair of booleans.

```typescript
import { pgTable, uuid, varchar, decimal, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { parties } from "./parties";
import { vmiPermits } from "./vmi_billing";

export const vmiRecurringFeeTypeEnum = pgEnum("vmi_recurring_fee_type", [
  "loa", "surety_bond", "trucking_admin_fee", "manpower", "other",
]);

export const vmiRecurringFeeLines = pgTable("vmi_recurring_fee_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id).notNull(),
  feeType: vmiRecurringFeeTypeEnum("fee_type").notNull(),
  label: varchar("label", { length: 200 }).notNull(), // e.g. "Letter of Authority", "Surety Bond"
  isActive: boolean("is_active").default(true).notNull(),

  // Flat monthly amount — used for loa/surety_bond/trucking_admin_fee/other.
  flatAmountUsd: decimal("flat_amount_usd", { precision: 14, scale: 4 }),

  // Manpower only: hours × rate, rate stored in its native currency (PHP
  // evidenced). NULL for non-manpower fee types.
  manpowerRatePerHour: decimal("manpower_rate_per_hour", { precision: 10, scale: 2 }),
  manpowerCurrency: varchar("manpower_currency", { length: 3 }),

  // LOA only: links to the permit whose monthly_fee_usd this fee line mirrors.
  relatedPermitId: uuid("related_permit_id").references(() => vmiPermits.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 1.3 `vmi_daily_balance_ledger`

One row per VMI party per calendar day. Replaces `vmi_cbm_ledger`. Source of `beginning_cbm`/`ending_cbm` is **movement replay over `inventory_transactions`**, not a `lot_inventory_totals` read — see §2.1 for why.

```typescript
import { pgTable, uuid, date, decimal, timestamp, unique } from "drizzle-orm/pg-core";
import { parties } from "./parties";

export const vmiDailyBalanceLedger = pgTable("vmi_daily_balance_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id).notNull(),
  ledgerDate: date("ledger_date").notNull(), // Asia/Manila calendar date

  beginningCbm: decimal("beginning_cbm", { precision: 12, scale: 4 }).default("0").notNull(),
  inboundCbmFg: decimal("inbound_cbm_fg", { precision: 12, scale: 4 }).default("0").notNull(),
  inboundCbmRawMaterial: decimal("inbound_cbm_raw_material", { precision: 12, scale: 4 }).default("0").notNull(),
  outboundCbmFg: decimal("outbound_cbm_fg", { precision: 12, scale: 4 }).default("0").notNull(),
  outboundCbmRawMaterial: decimal("outbound_cbm_raw_material", { precision: 12, scale: 4 }).default("0").notNull(),
  endingCbm: decimal("ending_cbm", { precision: 12, scale: 4 }).default("0").notNull(),

  // Whichever of beginning_cbm/ending_cbm contract.billing_timing selects —
  // this is the value storage_amount_usd was actually priced against.
  billedBalanceCbm: decimal("billed_balance_cbm", { precision: 12, scale: 4 }).notNull(),
  appliedStorageRateUsd: decimal("applied_storage_rate_usd", { precision: 10, scale: 6 }).notNull(),
  storageAmountUsd: decimal("storage_amount_usd", { precision: 14, scale: 4 }).notNull(),

  calculatedAt: timestamp("calculated_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniquePartyDate: unique().on(table.partyId, table.ledgerDate),
}));
```

### 1.4 `vmi_charge_lines`

Documentation, Delivery, and ad-hoc charges, each attached to one existing `acknowledgement_receipt`. **Warehousing and Handling never appear here** — both are always movement-replay aggregates (requirements.md FR-4.1), not per-shipment entries. This is the resolved reading of an ambiguity in the source pipeline sketch: the real Warehousing Charges schedule and the real Handling totals are both period/day aggregates with no per-DR dollar breakdown anywhere in the evidence.

```typescript
import { pgTable, uuid, varchar, decimal, date, text, pgEnum } from "drizzle-orm/pg-core";
import { parties } from "./parties";
import { generatedDocuments } from "./documents"; // existing 10-owned table; AR = document_type 'acknowledgement_receipt'

export const vmiChargeTypeEnum = pgEnum("vmi_charge_type", [
  "documentation", "delivery", "handling_and_stripping", "cargo_transfer_fee",
  "rtv", "admin_fee", "insurance", "other",
]);
export const vmiChargeSourceEnum = pgEnum("vmi_charge_source", ["auto", "manual"]);

export const vmiChargeLines = pgTable("vmi_charge_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  // References generated_documents.id, not a dedicated AR table — 10 has none
  // (design.md §0 correction, 2026-08-19). Application layer validates the
  // referenced row has document_type = 'acknowledgement_receipt'; a plain FK
  // can't express that constraint against a shared polymorphic table.
  acknowledgementReceiptId: uuid("acknowledgement_receipt_id").references(() => generatedDocuments.id).notNull(),
  partyId: uuid("party_id").references(() => parties.id).notNull(),
  chargeType: vmiChargeTypeEnum("charge_type").notNull(),
  amount: decimal("amount", { precision: 14, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(), // PHP (delivery) or USD (everything else)
  // 'auto' = pre-filled from contract.documentation_default_rate_usd, still
  // editable; 'manual' = no contract-derived default exists (delivery, and
  // every ad-hoc type) — see requirements.md FR-4.
  source: vmiChargeSourceEnum("source").notNull(),
  chargeDate: date("charge_date").notNull(),
  notes: text("notes"),
  recordedByUserId: uuid("recorded_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 1.5 `vmi_permits`

```typescript
import { pgTable, uuid, varchar, text, date, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { parties } from "./parties";

export const vmiPermits = pgTable("vmi_permits", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id).notNull(),
  permitNumber: varchar("permit_number", { length: 100 }).notNull(), // e.g. 'ELSE-LTP1-IE-007994-26E'
  itemScope: text("item_scope").notNull(), // e.g. "Reel, carrier tape, tray"
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to").notNull(),
  monthlyFeeUsd: decimal("monthly_fee_usd", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 1.6 `vmi_billing_periods`

The period-close record. One row per party per calendar month (plus correction revisions). This is what ties the four generated documents together and carries the immutable, issued snapshot.

```typescript
import { pgTable, uuid, varchar, date, decimal, integer, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { parties } from "./parties";

export const vmiBillingPeriods = pgTable("vmi_billing_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  periodNumber: varchar("period_number", { length: 50 }).notNull().unique(), // 'VMI-2026-06-{PARTY_CODE}', see §3
  partyId: uuid("party_id").references(() => parties.id).notNull(),

  periodStartDate: date("period_start_date").notNull(),
  periodEndDate: date("period_end_date").notNull(),

  // Billing Statement charge lines (computed at close time, snapshotted)
  storageChargeUsd: decimal("storage_charge_usd", { precision: 14, scale: 4 }).notNull(),
  handlingInUsd: decimal("handling_in_usd", { precision: 14, scale: 4 }).notNull(),
  handlingOutUsd: decimal("handling_out_usd", { precision: 14, scale: 4 }).notNull(),
  documentationUsd: decimal("documentation_usd", { precision: 14, scale: 4 }).notNull(),
  deliveryUsd: decimal("delivery_usd", { precision: 14, scale: 4 }).notNull(),
  recurringFeesUsd: decimal("recurring_fees_usd", { precision: 14, scale: 4 }).notNull(),
  adHocChargesUsd: decimal("ad_hoc_charges_usd", { precision: 14, scale: 4 }).notNull(),
  creditsAppliedUsd: decimal("credits_applied_usd", { precision: 14, scale: 4 }).default("0").notNull(),
  billingStatementTotalUsd: decimal("billing_statement_total_usd", { precision: 14, scale: 4 }).notNull(),

  // SOA (requirements.md FR-7) — a real running AR balance across periods.
  soaOpeningBalanceUsd: decimal("soa_opening_balance_usd", { precision: 14, scale: 4 }).notNull(),
  soaPaymentsAppliedUsd: decimal("soa_payments_applied_usd", { precision: 14, scale: 4 }).default("0").notNull(),
  soaClosingBalanceUsd: decimal("soa_closing_balance_usd", { precision: 14, scale: 4 }).notNull(),

  lockedExchangeRatePhp: decimal("locked_exchange_rate_php", { precision: 10, scale: 4 }).notNull(),
  lockedExchangeRateDate: date("locked_exchange_rate_date").notNull(),
  billingCurrency: varchar("billing_currency", { length: 3 }).notNull(),

  // Four generated PDF artifacts (04's artifact pipeline) — all four produced
  // by the same close action (requirements.md FR-9).
  billingStatementArtifactId: uuid("billing_statement_artifact_id"),
  warehousingChargesArtifactId: uuid("warehousing_charges_artifact_id"),
  soaArtifactId: uuid("soa_artifact_id"),
  loaArtifactId: uuid("loa_artifact_id"),

  status: varchar("status", { length: 20 }).notNull().default("draft"), // 'draft' | 'issued' | 'voided'
  supersededByPeriodId: uuid("superseded_by_period_id"),

  closedByUserId: uuid("closed_by_user_id"),
  closedAt: timestamp("closed_at"),
  voidedAt: timestamp("voided_at"),
  voidedByUserId: uuid("voided_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  totalNonNegative: check("billing_statement_total_non_negative", sql`${table.billingStatementTotalUsd} >= 0`),
}));
```

### 1.7 `vmi_payments`

```typescript
import { pgTable, uuid, varchar, date, decimal, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { parties } from "./parties";
import { vmiBillingPeriods } from "./vmi_billing";

export const vmiPaymentTypeEnum = pgEnum("vmi_payment_type", ["payment", "credit_memo", "adjustment"]);

export const vmiPayments = pgTable("vmi_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id").references(() => parties.id).notNull(),
  appliedToPeriodId: uuid("applied_to_period_id").references(() => vmiBillingPeriods.id).notNull(),
  paymentDate: date("payment_date").notNull(),
  amountUsd: decimal("amount_usd", { precision: 14, scale: 4 }).notNull(),
  type: vmiPaymentTypeEnum("type").notNull().default("payment"),
  notes: text("notes"),
  recordedByUserId: uuid("recorded_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

---

## 2. System Architecture & Algorithms

### 2.1 Why `inventory_transactions`, not a new movement-event table

The initial pipeline sketch proposed a standalone "Movement Event" log. `inventory_transactions` already is that log: immutable, one row per IN/OUT, carrying `flowType`, `qty`, `lotId`→`itemId`→`volume_cbm`, and `wrrId`/`pickListId` as the WR/DR reference. A second, parallel event table would duplicate a source of truth this project has an explicit standing rule against. The billing engine reads `inventory_transactions` through a thin, billing-scoped query — it does not touch or extend the table itself.

```text
movementDirection(movementType):
  'receiving' | 'putaway'  → IN
  'pick'                   → OUT
  'transfer', 'inventory_reconciliation' → excluded from party CBM balance
                                             (internal, doesn't change what
                                             a VMI party owns)

movementCategory: items.vmi_movement_category (FG / RAW_MATERIAL /
  FOR_PROCESS / REJECT / RE_INSPECT) — a fixed property of the item, not
  something resolved per lot/transaction (01-core-data-model amendment,
  2026-08-19; see revision-log.md and design.md §1.1/§1.2 there). Nullable —
  display/reporting only, never changes the applicable rate; a null category
  (non-VMI item, or not yet classified) is shown as an "Uncategorized"
  bucket in the ledger UI rather than silently dropped from the totals.

movementCbm = qty × items.volume_cbm
movementParty = lots.owner_party_id
```

### 2.2 Daily balance replay — nightly job

**Schedule:** `59 23 * * *` Asia/Manila (matches the prior design's cadence).

**Invocation architecture (added 2026-08-20 — see revision-log.md):** `04-services-and-infrastructure` §14.5 locks all scheduled background work in this project to Supabase Cron (`pg_cron`) triggering Supabase Edge Functions over HTTPS via `pg_net`, never a Next.js `app/api/cron/*` route polled by Vercel Cron. This is the first job in the codebase to actually implement that pattern (no Edge Function infrastructure existed before this task). Kept minimal and specific to this one job, not a general job-queue buildout:
- `supabase/functions/vmi-daily-balance-trigger/` — a thin Deno Edge Function. Its only job is to be `pg_cron`'s HTTPS invocation target and make one authenticated internal call into the Next.js app; it contains no billing logic itself.
- `app/api/internal/vmi-daily-balance/route.ts` — a Next.js route holding the real logic: for every active VMI party, calls `getVmiPartyMovements` (§2.1, C.1) then `computeVmiDailyBalance` (C.2/C.3), and `INSERT ... ON CONFLICT (party_id, ledger_date) DO NOTHING` into `vmi_daily_balance_ledger`. This keeps the billing math in exactly one place (already built and unit-tested in `lib/billing/`) rather than re-implementing it a second time in Deno.
- Auth: a shared secret, generated once and stored in Supabase Vault (read by the Edge Function) and as a Vercel environment variable (read by the Next.js route) — the Edge Function sends it as a header, the route rejects any request missing or mismatching it. Not the full `service_jobs` outbox/lease/retry/dead-letter apparatus from `04` §14.1-14.4, which is designed for async work triggered by a domain mutation (a receiving confirmation, a document request); this job's trigger is calendar time, not a mutation, and its idempotency is already handled by the `ON CONFLICT DO NOTHING` insert — so that heavier machinery doesn't apply here and isn't built for it.
- `pg_cron` schedule itself is a migration (`cron.schedule(...)` calling `pg_net.http_post` against the Edge Function URL), not application code — per `04` §14.5's "schedule definitions are migrations/configuration, not dashboard-only knowledge."

```text
For each party_id where vmi_contract_terms exists AND parties.is_active = true:

1. SKIP if vmi_daily_balance_ledger row already exists for (party_id, today).

2. beginning_cbm = yesterday's ending_cbm (0 if no prior row exists).

3. in_fg, in_raw, out_fg, out_raw = SUM(movementCbm) grouped by
   direction × category, from inventory_transactions joined to lots/items,
   WHERE lots.flow_type = 'vmi' AND lots.owner_party_id = :party_id
     AND created_at within today's Asia/Manila calendar day.

4. ending_cbm = beginning_cbm + (in_fg + in_raw) - (out_fg + out_raw)

5. billed_balance_cbm = beginning_cbm if contract.billing_timing = 'beginning_of_day'
                         else ending_cbm

6. applied_storage_rate_usd = vmi_contract_terms.storage_rate_per_cbm_day for
   :party_id WHERE effective_from <= today AND (effective_to IS NULL OR
   effective_to > today) — i.e. whichever version was open on this specific
   calendar day, not simply "the current row." For the normal forward-running
   nightly job this is always the latest version (today falls after every
   effective_from), so behavior is unchanged from a flat "read current rate."
   It only diverges from that for backfill (§ C.6): a day backfilled after a
   later rate change resolves to the rate that was actually in effect on the
   backfilled date, not today's rate.

   billed_cbm = apply cbm_threshold_type to billed_balance_cbm per
     requirements.md FR-3 (no-op when threshold_type = 'none').

   storage_amount_usd = billed_cbm × applied_storage_rate_usd

7. INSERT INTO vmi_daily_balance_ledger (...) ON CONFLICT (party_id, ledger_date) DO NOTHING.
```

**Verified**: with `billing_timing = 'beginning_of_day'`, `cbm_threshold_type = 'none'`, day 1 (`beginning_cbm = 792.02`, no prior row) produces `792.02 × 0.05 = 39.60`, matching the real June 1 figure exactly.

### 2.3 Handling — period aggregate, priced per day against the rate effective that day

Handling is a period aggregate (never a `vmi_charge_lines` row, per requirements.md FR-4.1), but it must still be point-in-time-safe the same way storage is — a mid-period handling-rate change must price only the days after the change at the new rate, never retroactively reprice the whole period. Because `vmi_contract_terms` is now an effective-dated version history (§1.1), this doesn't need its own snapshot column on `vmi_daily_balance_ledger`: each day's IN/OUT CBM is already stored there, so period-close joins each `vmi_daily_balance_ledger.ledger_date` to whichever `vmi_contract_terms` version was effective on that date and prices day-by-day, then sums.

```text
For each vmi_daily_balance_ledger row in the period (grouped by ledger_date):
  day_contract = vmi_contract_terms WHERE party_id = :party_id
    AND effective_from <= ledger_date AND (effective_to IS NULL OR effective_to > ledger_date)

  daily_handling_in_usd  = (in_fg + in_raw)   × day_contract.handling_in_rate_per_cbm
  daily_handling_out_usd = (out_fg + out_raw) × day_contract.handling_out_rate_per_cbm

handling_in_usd  = SUM(daily_handling_in_usd)  across the period
handling_out_usd = SUM(daily_handling_out_usd) across the period
```

When no rate change occurs within a period, `day_contract` resolves to the same single version for every day and this reduces exactly to `total_cbm × rate` — which is what the June fixture exercises, since no rate change occurred that month.

Verified: `157.18 × 1.40 = 220.05`, `262.96 × 1.40 = 368.14`, both exact (single contract version active the whole period).

### 2.4 Documentation and Delivery — charge lines

```text
documentation_usd = SUM(vmi_charge_lines.amount WHERE charge_type = 'documentation'
                         AND charge_date within period)
  -- Each row defaults to contract.documentation_default_rate_usd at entry
  -- time (source = 'auto') but is independently editable per line
  -- (still source = 'auto' — 'manual' is reserved for charge types with no
  -- contract-derived default at all, i.e. delivery and every ad-hoc type).

delivery_php = SUM(vmi_charge_lines.amount WHERE charge_type = 'delivery'
                    AND currency = 'PHP' AND charge_date within period)
delivery_usd = delivery_php / period.locked_exchange_rate_php
```

Verified: `₱40,896.00 / 61.71 = 662.71`, exact.

### 2.5 Recurring fees and ad-hoc charges

```text
recurring_fees_usd = SUM(vmi_recurring_fee_lines.flat_amount_usd WHERE is_active
                          AND fee_type != 'manpower')
                    + (manpower_hours_logged_this_period × manpower_rate_per_hour
                       converted to USD, or 0 if no hours logged this period)

ad_hoc_charges_usd = SUM(vmi_charge_lines.amount WHERE charge_type IN
                          ('handling_and_stripping','cargo_transfer_fee','rtv',
                           'admin_fee','insurance','other')
                          AND charge_date within period, converted to USD)
```

### 2.6 Period close — one action, four documents

```text
1. Validate: no existing non-voided vmi_billing_periods row for (party_id, month).
   Validate: forex_rates row exists for today (generation date); block with a
   clear error if absent.

2. Compute storage_charge_usd, handling_in_usd, handling_out_usd,
   documentation_usd, delivery_usd, recurring_fees_usd, ad_hoc_charges_usd
   per §2.2-2.5.

3. credits_applied_usd = SUM(vmi_payments WHERE type IN ('credit_memo','adjustment')
                              AND not yet applied, for this party)

4. billing_statement_total_usd = storage + handling_in + handling_out +
     documentation + delivery + recurring_fees + ad_hoc_charges - credits_applied
   Clamp at 0.

5. soa_opening_balance_usd = prior vmi_billing_periods row's soa_closing_balance_usd
     for this party (0 if this is the party's first period).
   soa_payments_applied_usd = SUM(vmi_payments WHERE type = 'payment'
     AND applied_to_period_id = this new period's id)
   soa_closing_balance_usd = soa_opening_balance_usd + billing_statement_total_usd
     - soa_payments_applied_usd

6. Lock forex: locked_exchange_rate_php = forex_rates.usd_to_php_rate WHERE
     effective_date = today.

7. INSERT vmi_billing_periods (status = 'draft', all computed fields).

8. Generate all four PDF artifacts via 04's pipeline:
     - Billing Statement (charge lines + grand total)
     - Warehousing Charges (vmi_daily_balance_ledger rows for the period, unrolled)
     - SOA (opening balance + statement total + payments + closing balance)
     - Letter of Authority (active vmi_permits row(s) for this party, mail-merged)
   On any artifact failure: leave status = 'draft'; do not issue. Surface a
   retry action in the UI — matches the prior design's D.7 failure handling.

9. On all four succeeding: status = 'issued', closed_at = NOW().

10. Send all four PDFs to parties.email via Resend (04's pipeline).
```

### 2.7 Corrections

```text
1. Validate: original vmi_billing_periods.status = 'issued'.
2. original.status = 'voided'; voided_at = NOW(); voided_by_user_id = :user.
3. Re-run §2.6 for the same party/month, producing a new period record with
   period_number suffixed '-R{n}'.
4. original.superseded_by_period_id = new period's id.
5. Regenerate and re-deliver all four documents.
```

---

## 3. Document Number Format

```text
VMI-{YYYY}-{MM}-{PARTY_CODE}
VMI-{YYYY}-{MM}-{PARTY_CODE}-R{N}   ← correction revision, N starting at 1
```

All four documents generated for one period share this same number as their common reference, distinguished by document type in the artifact's own filename/label.

---

## 4. RLS Boundaries (to be defined in `02-rbac-roles`)

- `vmi_contract_terms`, `vmi_recurring_fee_lines`, `vmi_permits`: readable by Office Admin/Supervisor and the owning party (read-only for party); writeable by Office Admin only. For `vmi_contract_terms`, "writeable" means INSERT of a new version row plus one `UPDATE` limited to closing the prior version's `effective_to` — application layer and RLS both reject any `UPDATE` that touches a rate column on a row that already has `effective_to IS NOT NULL` or predates the current version, since that would rewrite billing history.
- `vmi_daily_balance_ledger`: readable by Office Admin/Supervisor and the owning party; INSERT by CRON service role only; no UPDATE/DELETE.
- `vmi_charge_lines`: readable by Office Admin/Supervisor and the owning party; writeable by Office Admin/Supervisor only, and only for `vmi_billing_periods` rows not yet closed.
- `vmi_billing_periods`: readable by Office Admin/Supervisor and the owning party; INSERT/status-transition by Office Admin only.
- `vmi_payments`: readable by Office Admin/Supervisor and the owning party; writeable by Office Admin only.

No party may read another party's billing data. Row-level filtering is `party_id = ` the resolved party of the authenticated user, for all seven tables.

---

## 5. Relationship to Other Specs

| Upstream spec | What `12` consumes |
| --- | --- |
| `01-core-data-model` | `inventory_transactions` (the movement source — see §2.1), `lots`, `items.volume_cbm`, `forex_rates`, `parties` |
| `04-services-and-infrastructure` | PDF generation artifact pipeline (all four documents); Resend email delivery |
| `05-ui-shell-and-navigation` | `/billing-pricing` route entry, office shell |
| `10-pick-list-and-acknowledgement-receipt` | `generated_documents` (`document_type = 'acknowledgement_receipt'`) — the DR/AR reference every `vmi_charge_lines` row keys off |
| `22-parties-portal` | Owns VMI party-facing document access (`vmi_statements.read`) independently of `/billing-pricing`, which is office-only |

`12` does NOT consume `pick_list_items.unit_price`. That field is owned by `10` for document display only and is explicitly excluded from all billing calculations here.

---

## 6. UI and shell integration

`12` and `13` share one office-surface route, `/billing-pricing`, per the already-approved rationale (financial-ledger views over party-scoped commercial history, gated `reporting.financial_read`, distinct from `06`'s master-data CRUD).

```text
app/(authenticated)/
  billing-pricing/
    page.tsx                # tab shell: VMI | Trading
    vmi/
      page.tsx              # party picker, daily balance ledger, charge-line entry, period history
      contracts/[partyId]/edit/page.tsx   # vmi_contract_terms + recurring fee lines
      permits/[partyId]/page.tsx          # vmi_permits CRUD
      periods/[periodId]/page.tsx         # one period's four-document view + correction action
    trading/page.tsx        # 13-trading-orders-and-pricing
```

**VMI tab**, office-only:

- Party picker (any active VMI party).
- Daily balance ledger table matching the real reference format: `DATE | BEGINNING CBM | IN (FG) | IN (RAW MTL'S) | OUT (FG) | OUT (RAW MTL'S) | ENDING CBM | RATE | AMOUNT`, most recent first, date-range filterable (default: current billing month). Read-only.
- Charge-line entry table for the current open period: Documentation (pre-filled from contract default, editable) and Delivery (blank, required manual entry) per `acknowledgement_receipt`, plus ad-hoc types (RTV, Insurance, Cargo Transfer Fee, Admin Fee, Handling & Stripping) as free-entry rows. Locked once the period closes.
- Period history: all `vmi_billing_periods` for the selected party, most recent first, each linking to its four generated documents. "Close Period" action for the current open month, showing a computed preview before commit, blocked if a non-voided period already exists for that month or no forex rate exists for today.
- `vmi_contract_terms`/`vmi_recurring_fee_lines`/`vmi_permits` shown read-only for context on the main tab; editing happens on their own sub-routes. Editing `vmi_contract_terms` shows the current version's rates plus an effective-date picker (default: immediately); saving closes the current version and opens a new one — it never overwrites the current row's rate values in place, and a rate history list (all past versions with their effective ranges) is visible alongside the edit form for audit purposes.

Capability gate: `reporting.financial_read` for read access; period close and payment recording require an Administrator-only capability (final identifier owned by `02`). A VMI party user never reaches `/billing-pricing` — their document access is `22-parties-portal`'s separate `vmi_statements.read` surface.
