// `vmi_billing.ts` — specs/12-vmi-billing/design.md §1 (full rewrite, 2026-08-19)
//
// Eight tables backing VMI billing: vmi_contract_terms (effective-dated
// rate-card version history — NOT one row per party, see §1.1),
// vmi_recurring_fee_lines, vmi_manpower_hours_log (per-period hours entries
// backing the manpower recurring fee — added 2026-08-20, design.md §1.2a),
// vmi_daily_balance_ledger (movement-replay-sourced,
// never a lot_inventory_totals read — see design.md §2.1),
// vmi_charge_lines (Documentation/Delivery/ad-hoc only — Warehousing and
// Handling are always movement-replay aggregates, never charge lines),
// vmi_permits, vmi_billing_periods (period-close snapshot + SOA running
// balance), and vmi_payments.
//
// Correction (2026-08-19, design.md §0): vmi_charge_lines.acknowledgement_receipt_id
// FKs to generated_documents.id (10's actual schema) — there is no dedicated
// acknowledgement_receipts table. Application layer validates the referenced
// row has document_type = 'acknowledgement_receipt'; a plain FK can't express
// that constraint against a shared polymorphic table (Task Group C/D, out of
// scope for this schema-only pass).
//
// createdByUserId/recordedByUserId/closedByUserId/voidedByUserId reference
// auth.users; per this codebase's established convention (see documents.ts's
// createdBy column), the FK to auth.users is declared in the migration, not
// modeled here via Drizzle's cross-schema reference.
import {
  pgTable,
  uuid,
  varchar,
  text,
  decimal,
  boolean,
  timestamp,
  date,
  pgEnum,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { parties } from "./parties";
import { generatedDocuments } from "./documents";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const vmiBillingTimingEnum = pgEnum("vmi_billing_timing", [
  "beginning_of_day",
  "end_of_day",
]);

export const vmiCbmThresholdTypeEnum = pgEnum("vmi_cbm_threshold_type", [
  "none",
  "minimum_billable",
  "included_allowance",
]);

export const vmiRecurringFeeTypeEnum = pgEnum("vmi_recurring_fee_type", [
  "loa",
  "surety_bond",
  "trucking_admin_fee",
  "manpower",
  "other",
]);

export const vmiChargeTypeEnum = pgEnum("vmi_charge_type", [
  "documentation",
  "delivery",
  "handling_and_stripping",
  "cargo_transfer_fee",
  "rtv",
  "admin_fee",
  "insurance",
  "other",
]);

export const vmiChargeSourceEnum = pgEnum("vmi_charge_source", [
  "auto",
  "manual",
]);

export const vmiPaymentTypeEnum = pgEnum("vmi_payment_type", [
  "payment",
  "credit_memo",
  "adjustment",
]);

// ---------------------------------------------------------------------------
// 1.1 vmi_contract_terms — effective-dated version history, NOT one row per
// party. Every rate a party is billed under (storage, handling in/out,
// threshold config, documentation default) lives on this one versioned row
// together, mirroring 13's trading_policies pattern. A rate edit never
// overwrites history: it closes the current row (effective_to = boundary)
// and inserts a new one.
//
// Application-layer invariant (Task Group C/D, not enforced here): at most
// one row per party_id with effective_to IS NULL. No DB-level unique
// constraint on party_id alone — this table intentionally permits many rows
// per party over time (tasks.md B.1).
// ---------------------------------------------------------------------------

export const vmiContractTerms = pgTable("vmi_contract_terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),

  storageRatePerCbmDay: decimal("storage_rate_per_cbm_day", {
    precision: 10,
    scale: 6,
  }).notNull(),
  // Which day's balance storage is priced against. Real June contract
  // evidence is beginning_of_day; kept per-party configurable, not
  // hardcoded (requirements.md FR-1).
  billingTiming: vmiBillingTimingEnum("billing_timing")
    .notNull()
    .default("beginning_of_day"),

  cbmThresholdType: vmiCbmThresholdTypeEnum("cbm_threshold_type")
    .notNull()
    .default("none"),
  cbmThreshold: decimal("cbm_threshold", { precision: 12, scale: 4 }), // required app-layer when threshold_type != 'none'
  overThresholdRate: decimal("over_threshold_rate", {
    precision: 10,
    scale: 6,
  }), // required app-layer when threshold_type = 'included_allowance'

  // Independently configurable — evidenced equal ($1.40) in June's real
  // contract, but nothing requires that.
  handlingInRatePerCbm: decimal("handling_in_rate_per_cbm", {
    precision: 10,
    scale: 4,
  }).notNull(),
  handlingOutRatePerCbm: decimal("handling_out_rate_per_cbm", {
    precision: 10,
    scale: 4,
  }).notNull(),

  // A DEFAULT, not a locked formula — an authorized user may override the
  // amount per vmi_charge_lines row (requirements.md FR-4.2).
  documentationDefaultRateUsd: decimal("documentation_default_rate_usd", {
    precision: 10,
    scale: 4,
  }).notNull(),

  billingCurrency: varchar("billing_currency", { length: 3 })
    .notNull()
    .default("USD"), // 'USD' | 'PHP'

  // Version history fields — same shape as trading_policies.
  isActive: boolean("is_active").default(true).notNull(),
  effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  effectiveTo: timestamp("effective_to"), // NULL = currently open-ended; set when superseded, never deleted

  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 1.5 vmi_permits — defined ahead of vmi_recurring_fee_lines in file order
// only for readability; Drizzle's `.references()` callback is lazy so
// forward references are safe either way.
// ---------------------------------------------------------------------------

export const vmiPermits = pgTable("vmi_permits", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  permitNumber: varchar("permit_number", { length: 100 }).notNull(), // e.g. 'ELSE-LTP1-IE-007994-26E'
  itemScope: text("item_scope").notNull(), // e.g. "Reel, carrier tape, tray"
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to").notNull(),
  monthlyFeeUsd: decimal("monthly_fee_usd", {
    precision: 10,
    scale: 2,
  }).notNull(), // mirrored by a linked vmi_recurring_fee_lines LOA row (FR-5.2)
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 1.2 vmi_recurring_fee_lines — zero or more flat/recurring charges per
// party. An open, typed list (real June data evidences four distinct
// recurring types), not a fixed pair of booleans.
// ---------------------------------------------------------------------------

export const vmiRecurringFeeLines = pgTable("vmi_recurring_fee_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  feeType: vmiRecurringFeeTypeEnum("fee_type").notNull(),
  label: varchar("label", { length: 200 }).notNull(), // e.g. "Letter of Authority", "Surety Bond"
  isActive: boolean("is_active").default(true).notNull(),

  // Flat monthly amount — used for loa/surety_bond/trucking_admin_fee/other.
  flatAmountUsd: decimal("flat_amount_usd", { precision: 14, scale: 4 }),

  // Manpower only: hours × rate, rate stored in its native currency (PHP
  // evidenced). NULL for non-manpower fee types.
  manpowerRatePerHour: decimal("manpower_rate_per_hour", {
    precision: 10,
    scale: 2,
  }),
  manpowerCurrency: varchar("manpower_currency", { length: 3 }),

  // LOA only: links to the permit whose monthly_fee_usd this fee line
  // mirrors.
  relatedPermitId: uuid("related_permit_id").references(() => vmiPermits.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 1.2a vmi_manpower_hours_log — added 2026-08-20, surfaced during Task D.4.
// vmi_recurring_fee_lines' manpower row holds only the standing hourly rate
// (a stable, reusable config row); "hours logged this period" needs a
// dedicated per-period table, not an extension of vmi_charge_lines (manpower
// isn't tied to one AR/shipment the way Documentation/Delivery are).
//
// Append/re-entry pattern, not editable-in-place: no updatedAt column, unlike
// every other vmi_billing table. Re-entering hours for an already-logged
// period is an application-layer edit, not a second row — enforced by the
// unique constraint below. No hours logged for a period is the normal,
// expected case (design.md §2.5 reads this as "$0 if no row exists"), never
// an error blocking period close.
// ---------------------------------------------------------------------------

export const vmiManpowerHoursLog = pgTable(
  "vmi_manpower_hours_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recurringFeeLineId: uuid("recurring_fee_line_id")
      .references(() => vmiRecurringFeeLines.id)
      .notNull(),
    partyId: uuid("party_id")
      .references(() => parties.id)
      .notNull(), // redundant with recurringFeeLineId's own party, kept for RLS scoping consistency with every other VMI table
    periodStartDate: date("period_start_date").notNull(),
    periodEndDate: date("period_end_date").notNull(),
    hours: decimal("hours", { precision: 10, scale: 2 }).notNull(),
    notes: text("notes"),
    recordedByUserId: uuid("recorded_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniquePeriod: unique("vmi_manpower_hours_log_period_unique").on(
      table.recurringFeeLineId,
      table.periodStartDate,
      table.periodEndDate,
    ),
  }),
);

// ---------------------------------------------------------------------------
// 1.3 vmi_daily_balance_ledger — one row per VMI party per calendar day.
// Source of beginning_cbm/ending_cbm is movement replay over
// inventory_transactions (design.md §2.1), never a lot_inventory_totals
// read.
// ---------------------------------------------------------------------------

export const vmiDailyBalanceLedger = pgTable(
  "vmi_daily_balance_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partyId: uuid("party_id")
      .references(() => parties.id, { onDelete: "cascade" })
      .notNull(),
    ledgerDate: date("ledger_date").notNull(), // Asia/Manila calendar date

    beginningCbm: decimal("beginning_cbm", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),
    inboundCbmFg: decimal("inbound_cbm_fg", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),
    inboundCbmRawMaterial: decimal("inbound_cbm_raw_material", {
      precision: 12,
      scale: 4,
    })
      .default("0")
      .notNull(),
    outboundCbmFg: decimal("outbound_cbm_fg", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),
    outboundCbmRawMaterial: decimal("outbound_cbm_raw_material", {
      precision: 12,
      scale: 4,
    })
      .default("0")
      .notNull(),
    endingCbm: decimal("ending_cbm", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),

    // Whichever of beginning_cbm/ending_cbm contract.billing_timing
    // selects — this is the value storage_amount_usd was actually priced
    // against.
    billedBalanceCbm: decimal("billed_balance_cbm", {
      precision: 12,
      scale: 4,
    }).notNull(),
    appliedStorageRateUsd: decimal("applied_storage_rate_usd", {
      precision: 10,
      scale: 6,
    }).notNull(),
    storageAmountUsd: decimal("storage_amount_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),

    calculatedAt: timestamp("calculated_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniquePartyDate: unique("vmi_daily_balance_ledger_party_date_unique").on(
      table.partyId,
      table.ledgerDate,
    ),
  }),
);

// ---------------------------------------------------------------------------
// 1.4 vmi_charge_lines — Documentation, Delivery, and ad-hoc charges, each
// attached to one existing acknowledgement_receipt. Warehousing and
// Handling never appear here — both are always movement-replay aggregates
// (requirements.md FR-4.1).
// ---------------------------------------------------------------------------

export const vmiChargeLines = pgTable("vmi_charge_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  // References generated_documents.id, not a dedicated AR table — 10 has
  // none (design.md §0 correction, 2026-08-19). Application layer validates
  // the referenced row has document_type = 'acknowledgement_receipt'; a
  // plain FK can't express that constraint against a shared polymorphic
  // table.
  acknowledgementReceiptId: uuid("acknowledgement_receipt_id")
    .references(() => generatedDocuments.id)
    .notNull(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
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

// ---------------------------------------------------------------------------
// 1.6 vmi_billing_periods — the period-close record. One row per party per
// calendar month (plus correction revisions). Ties the four generated
// documents together and carries the immutable, issued snapshot.
// ---------------------------------------------------------------------------

export const vmiBillingPeriods = pgTable(
  "vmi_billing_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodNumber: varchar("period_number", { length: 50 })
      .notNull()
      .unique(), // 'VMI-2026-06-{PARTY_CODE}', design.md §3
    partyId: uuid("party_id")
      .references(() => parties.id, { onDelete: "cascade" })
      .notNull(),

    periodStartDate: date("period_start_date").notNull(),
    periodEndDate: date("period_end_date").notNull(),

    // Billing Statement charge lines (computed at close time, snapshotted)
    storageChargeUsd: decimal("storage_charge_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),
    handlingInUsd: decimal("handling_in_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),
    handlingOutUsd: decimal("handling_out_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),
    documentationUsd: decimal("documentation_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),
    deliveryUsd: decimal("delivery_usd", { precision: 14, scale: 4 }).notNull(),
    recurringFeesUsd: decimal("recurring_fees_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),
    adHocChargesUsd: decimal("ad_hoc_charges_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),
    creditsAppliedUsd: decimal("credits_applied_usd", {
      precision: 14,
      scale: 4,
    })
      .default("0")
      .notNull(),
    billingStatementTotalUsd: decimal("billing_statement_total_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),

    // SOA (requirements.md FR-7) — a real running AR balance across periods.
    soaOpeningBalanceUsd: decimal("soa_opening_balance_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),
    soaPaymentsAppliedUsd: decimal("soa_payments_applied_usd", {
      precision: 14,
      scale: 4,
    })
      .default("0")
      .notNull(),
    soaClosingBalanceUsd: decimal("soa_closing_balance_usd", {
      precision: 14,
      scale: 4,
    }).notNull(),

    lockedExchangeRatePhp: decimal("locked_exchange_rate_php", {
      precision: 10,
      scale: 4,
    }).notNull(),
    lockedExchangeRateDate: date("locked_exchange_rate_date").notNull(),
    billingCurrency: varchar("billing_currency", { length: 3 }).notNull(),

    // Four generated PDF artifacts (04's artifact pipeline) — all four
    // produced by the same close action (requirements.md FR-9). Nullable
    // until generated.
    billingStatementArtifactId: uuid("billing_statement_artifact_id"),
    warehousingChargesArtifactId: uuid("warehousing_charges_artifact_id"),
    soaArtifactId: uuid("soa_artifact_id"),
    loaArtifactId: uuid("loa_artifact_id"),

    status: varchar("status", { length: 20 }).notNull().default("draft"), // 'draft' | 'issued' | 'voided'
    supersededByPeriodId: uuid("superseded_by_period_id"), // set on correction, FR-9.2

    closedByUserId: uuid("closed_by_user_id"),
    closedAt: timestamp("closed_at"),
    voidedAt: timestamp("voided_at"),
    voidedByUserId: uuid("voided_by_user_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    totalNonNegative: check(
      "billing_statement_total_non_negative",
      sql`${table.billingStatementTotalUsd} >= 0`,
    ),
    statusCheck: check(
      "vmi_billing_periods_status_check",
      sql`${table.status} IN ('draft', 'issued', 'voided')`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// 1.7 vmi_payments
// ---------------------------------------------------------------------------

export const vmiPayments = pgTable("vmi_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id")
    .references(() => parties.id, { onDelete: "cascade" })
    .notNull(),
  appliedToPeriodId: uuid("applied_to_period_id")
    .references(() => vmiBillingPeriods.id)
    .notNull(),
  paymentDate: date("payment_date").notNull(),
  amountUsd: decimal("amount_usd", { precision: 14, scale: 4 }).notNull(),
  type: vmiPaymentTypeEnum("type").notNull().default("payment"),
  notes: text("notes"),
  recordedByUserId: uuid("recorded_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
