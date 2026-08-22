// RED-step schema tests for lib/db/schema/vmi_billing.ts (does not exist yet).
// Traceability: specs/12-vmi-billing/tasks.md Task Group B (B.1-B.8) and
// specs/12-vmi-billing/requirements.md:
//   FR-1  (vmi_contract_terms — effective-dated rate-card version history)
//   FR-1.2 (vmi_recurring_fee_lines — open list, not a fixed pair of booleans)
//   FR-2/FR-3 (vmi_daily_balance_ledger — movement-sourced daily replay,
//              storage charge + threshold)
//   FR-4  (vmi_charge_lines — Documentation/Delivery/ad-hoc only; Warehousing
//         and Handling are never charge lines)
//   FR-5  (vmi_recurring_fee_lines contribution / vmi_permits linkage)
//   FR-6  (vmi_billing_periods — statement assembly + forex lock)
//   FR-7  (vmi_payments / SOA running balance)
//   FR-8  (vmi_permits — LOA)
// and design.md §1 (exact Drizzle table definitions to test against) and §0
// (acknowledgement_receipt_id FKs to generated_documents.id, not a dedicated
// AR table — 10 has none).
//
// Explicitly OUT OF SCOPE for this Task Group B pass (per tasks.md):
// - The application-layer "at most one open vmi_contract_terms row per
//   party" invariant, and the "referenced generated_documents row must have
//   document_type = 'acknowledgement_receipt'" validator (B.1, B.4) are
//   runtime command-layer behavior (Task Group C/D), not schema shape. Here
//   we only assert the schema *permits* the version-history/shared-table
//   pattern those invariants are built on top of (no single-column unique
//   constraint on party_id; FK target is generated_documents, not a
//   dedicated AR table).
// - Real-Postgres verification of CHECK constraints, RLS, and the migration
//   itself is db-migration-verifier's job (B.10), per testing.md's two-stage
//   strategy — this file only introspects the table definition objects.
import { describe, expect, it } from "vitest";
import {
  checkConstraints,
  column,
  hasColumn,
  referencesTable,
  tableName,
  uniqueConstraints,
} from "./helpers";

// ---------------------------------------------------------------------------
// vmi_contract_terms (design.md §1.1, tasks.md B.1)
// ---------------------------------------------------------------------------

describe("vmi_billing.ts — vmi_contract_terms table (FR-1, B.1)", () => {
  it("is named 'vmi_contract_terms'", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    expect(tableName(vmiContractTerms)).toBe("vmi_contract_terms");
  });

  it("has partyId notNull referencing parties.id", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    expect(column(vmiContractTerms, "partyId").notNull).toBe(true);
    expect(
      referencesTable(vmiContractTerms, "party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has storageRatePerCbmDay notNull", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    expect(column(vmiContractTerms, "storageRatePerCbmDay").notNull).toBe(
      true,
    );
  });

  it("has billingTiming notNull, default 'beginning_of_day', typed as vmiBillingTimingEnum (FR-1.1)", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    const billingTiming = column(vmiContractTerms, "billingTiming");
    expect(billingTiming.notNull).toBe(true);
    expect(billingTiming.hasDefault).toBe(true);
    expect(billingTiming.enumValues).toEqual([
      "beginning_of_day",
      "end_of_day",
    ]);
  });

  it("has cbmThresholdType notNull, default 'none', typed as vmiCbmThresholdTypeEnum (FR-1.1)", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    const cbmThresholdType = column(vmiContractTerms, "cbmThresholdType");
    expect(cbmThresholdType.notNull).toBe(true);
    expect(cbmThresholdType.hasDefault).toBe(true);
    expect(cbmThresholdType.enumValues).toEqual([
      "none",
      "minimum_billable",
      "included_allowance",
    ]);
  });

  it("has cbmThreshold and overThresholdRate nullable (required only when threshold_type != 'none')", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    for (const key of ["cbmThreshold", "overThresholdRate"]) {
      expect(hasColumn(vmiContractTerms, key)).toBe(true);
      expect(column(vmiContractTerms, key).notNull).toBe(false);
    }
  });

  it("has handlingInRatePerCbm and handlingOutRatePerCbm notNull, independently configurable", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    expect(column(vmiContractTerms, "handlingInRatePerCbm").notNull).toBe(
      true,
    );
    expect(column(vmiContractTerms, "handlingOutRatePerCbm").notNull).toBe(
      true,
    );
  });

  it("has documentationDefaultRateUsd notNull (a default, not a locked formula — FR-1.1)", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    expect(
      column(vmiContractTerms, "documentationDefaultRateUsd").notNull,
    ).toBe(true);
  });

  it("has billingCurrency notNull with default 'USD'", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    const billingCurrency = column(vmiContractTerms, "billingCurrency");
    expect(billingCurrency.notNull).toBe(true);
    expect(billingCurrency.hasDefault).toBe(true);
  });

  it("has version-history fields: isActive (default true), effectiveFrom (notNull, default), effectiveTo (nullable), createdByUserId (notNull) (FR-1.3)", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    const isActive = column(vmiContractTerms, "isActive");
    expect(isActive.notNull).toBe(true);
    expect(isActive.hasDefault).toBe(true);

    const effectiveFrom = column(vmiContractTerms, "effectiveFrom");
    expect(effectiveFrom.notNull).toBe(true);
    expect(effectiveFrom.hasDefault).toBe(true);

    expect(hasColumn(vmiContractTerms, "effectiveTo")).toBe(true);
    expect(column(vmiContractTerms, "effectiveTo").notNull).toBe(false);

    expect(column(vmiContractTerms, "createdByUserId").notNull).toBe(true);
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(vmiContractTerms, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });

  it("does NOT declare a unique constraint on party_id alone — this is a version-history table, not one row per party (B.1)", async () => {
    const { vmiContractTerms } = await import("../vmi_billing");
    const partyIdCol = column(vmiContractTerms, "partyId");
    // Single-column `.unique()` modifier would surface here.
    expect(partyIdCol.isUnique).toBe(false);
    // Table-level unique constraints array must not contain a lone party_id.
    const soleMatch = uniqueConstraints(vmiContractTerms).find(
      (cols) => cols.length === 1 && cols[0] === "party_id",
    );
    expect(soleMatch).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// vmi_recurring_fee_lines (design.md §1.2, tasks.md B.2)
// ---------------------------------------------------------------------------

describe("vmi_billing.ts — vmi_recurring_fee_lines table (FR-1.2, B.2)", () => {
  it("is named 'vmi_recurring_fee_lines'", async () => {
    const { vmiRecurringFeeLines } = await import("../vmi_billing");
    expect(tableName(vmiRecurringFeeLines)).toBe("vmi_recurring_fee_lines");
  });

  it("has partyId notNull referencing parties.id", async () => {
    const { vmiRecurringFeeLines } = await import("../vmi_billing");
    expect(column(vmiRecurringFeeLines, "partyId").notNull).toBe(true);
    expect(
      referencesTable(vmiRecurringFeeLines, "party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has feeType notNull typed as vmiRecurringFeeTypeEnum (loa|surety_bond|trucking_admin_fee|manpower|other)", async () => {
    const { vmiRecurringFeeLines } = await import("../vmi_billing");
    const feeType = column(vmiRecurringFeeLines, "feeType");
    expect(feeType.notNull).toBe(true);
    expect(feeType.enumValues).toEqual([
      "loa",
      "surety_bond",
      "trucking_admin_fee",
      "manpower",
      "other",
    ]);
  });

  it("has label notNull", async () => {
    const { vmiRecurringFeeLines } = await import("../vmi_billing");
    expect(column(vmiRecurringFeeLines, "label").notNull).toBe(true);
  });

  it("has isActive notNull with default true", async () => {
    const { vmiRecurringFeeLines } = await import("../vmi_billing");
    const isActive = column(vmiRecurringFeeLines, "isActive");
    expect(isActive.notNull).toBe(true);
    expect(isActive.hasDefault).toBe(true);
  });

  it("has flatAmountUsd nullable (used for loa/surety_bond/trucking_admin_fee/other; NULL for manpower)", async () => {
    const { vmiRecurringFeeLines } = await import("../vmi_billing");
    expect(hasColumn(vmiRecurringFeeLines, "flatAmountUsd")).toBe(true);
    expect(column(vmiRecurringFeeLines, "flatAmountUsd").notNull).toBe(false);
  });

  it("has manpowerRatePerHour and manpowerCurrency nullable (manpower-only fields)", async () => {
    const { vmiRecurringFeeLines } = await import("../vmi_billing");
    for (const key of ["manpowerRatePerHour", "manpowerCurrency"]) {
      expect(hasColumn(vmiRecurringFeeLines, key)).toBe(true);
      expect(column(vmiRecurringFeeLines, key).notNull).toBe(false);
    }
  });

  it("has relatedPermitId nullable referencing vmi_permits.id (LOA fee only, FR-5.2)", async () => {
    const { vmiRecurringFeeLines } = await import("../vmi_billing");
    expect(hasColumn(vmiRecurringFeeLines, "relatedPermitId")).toBe(true);
    expect(column(vmiRecurringFeeLines, "relatedPermitId").notNull).toBe(
      false,
    );
    expect(
      referencesTable(
        vmiRecurringFeeLines,
        "related_permit_id",
        "vmi_permits",
        "id",
      ),
    ).toBe(true);
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { vmiRecurringFeeLines } = await import("../vmi_billing");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(vmiRecurringFeeLines, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// vmi_daily_balance_ledger (design.md §1.3, tasks.md B.3)
// ---------------------------------------------------------------------------

describe("vmi_billing.ts — vmi_daily_balance_ledger table (FR-2, FR-3, B.3)", () => {
  it("is named 'vmi_daily_balance_ledger'", async () => {
    const { vmiDailyBalanceLedger } = await import("../vmi_billing");
    expect(tableName(vmiDailyBalanceLedger)).toBe("vmi_daily_balance_ledger");
  });

  it("has partyId notNull referencing parties.id", async () => {
    const { vmiDailyBalanceLedger } = await import("../vmi_billing");
    expect(column(vmiDailyBalanceLedger, "partyId").notNull).toBe(true);
    expect(
      referencesTable(vmiDailyBalanceLedger, "party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has ledgerDate notNull (Asia/Manila calendar date)", async () => {
    const { vmiDailyBalanceLedger } = await import("../vmi_billing");
    expect(column(vmiDailyBalanceLedger, "ledgerDate").notNull).toBe(true);
  });

  it("has a unique constraint on (partyId, ledgerDate) (B.3)", async () => {
    const { vmiDailyBalanceLedger } = await import("../vmi_billing");
    const uniques = uniqueConstraints(vmiDailyBalanceLedger);
    const match = uniques.find(
      (cols) => cols.includes("party_id") && cols.includes("ledger_date"),
    );
    expect(match).toBeDefined();
  });

  it("has beginningCbm/inboundCbmFg/inboundCbmRawMaterial/outboundCbmFg/outboundCbmRawMaterial/endingCbm notNull with default '0'", async () => {
    const { vmiDailyBalanceLedger } = await import("../vmi_billing");
    for (const key of [
      "beginningCbm",
      "inboundCbmFg",
      "inboundCbmRawMaterial",
      "outboundCbmFg",
      "outboundCbmRawMaterial",
      "endingCbm",
    ]) {
      const col = column(vmiDailyBalanceLedger, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });

  it("has billedBalanceCbm, appliedStorageRateUsd, storageAmountUsd notNull (the value actually priced/billed — FR-2.3, FR-3)", async () => {
    const { vmiDailyBalanceLedger } = await import("../vmi_billing");
    expect(column(vmiDailyBalanceLedger, "billedBalanceCbm").notNull).toBe(
      true,
    );
    expect(
      column(vmiDailyBalanceLedger, "appliedStorageRateUsd").notNull,
    ).toBe(true);
    expect(column(vmiDailyBalanceLedger, "storageAmountUsd").notNull).toBe(
      true,
    );
  });

  it("has calculatedAt notNull and createdAt notNull with default", async () => {
    const { vmiDailyBalanceLedger } = await import("../vmi_billing");
    expect(column(vmiDailyBalanceLedger, "calculatedAt").notNull).toBe(true);
    const createdAt = column(vmiDailyBalanceLedger, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// vmi_charge_lines (design.md §1.4, §0 correction; tasks.md B.4)
// ---------------------------------------------------------------------------

describe("vmi_billing.ts — vmi_charge_lines table (FR-4, B.4)", () => {
  it("is named 'vmi_charge_lines'", async () => {
    const { vmiChargeLines } = await import("../vmi_billing");
    expect(tableName(vmiChargeLines)).toBe("vmi_charge_lines");
  });

  it("has acknowledgementReceiptId notNull referencing generated_documents.id — NOT a dedicated AR table (design.md §0 correction)", async () => {
    const { vmiChargeLines } = await import("../vmi_billing");
    expect(column(vmiChargeLines, "acknowledgementReceiptId").notNull).toBe(
      true,
    );
    expect(
      referencesTable(
        vmiChargeLines,
        "acknowledgement_receipt_id",
        "generated_documents",
        "id",
      ),
    ).toBe(true);
  });

  it("has partyId notNull referencing parties.id", async () => {
    const { vmiChargeLines } = await import("../vmi_billing");
    expect(column(vmiChargeLines, "partyId").notNull).toBe(true);
    expect(
      referencesTable(vmiChargeLines, "party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has chargeType notNull typed as vmiChargeTypeEnum, excluding bare 'warehousing'/'handling' (B.4 — those are movement-replay aggregates only, never charge lines)", async () => {
    const { vmiChargeLines } = await import("../vmi_billing");
    const chargeType = column(vmiChargeLines, "chargeType");
    expect(chargeType.notNull).toBe(true);
    expect(chargeType.enumValues).toEqual([
      "documentation",
      "delivery",
      "handling_and_stripping",
      "cargo_transfer_fee",
      "rtv",
      "admin_fee",
      "insurance",
      "other",
    ]);
    expect(chargeType.enumValues).not.toContain("warehousing");
    expect(chargeType.enumValues).not.toContain("handling");
  });

  it("has amount notNull and currency notNull (PHP for delivery, USD otherwise)", async () => {
    const { vmiChargeLines } = await import("../vmi_billing");
    expect(column(vmiChargeLines, "amount").notNull).toBe(true);
    expect(column(vmiChargeLines, "currency").notNull).toBe(true);
  });

  it("has source notNull typed as vmiChargeSourceEnum (auto|manual)", async () => {
    const { vmiChargeLines } = await import("../vmi_billing");
    const source = column(vmiChargeLines, "source");
    expect(source.notNull).toBe(true);
    expect(source.enumValues).toEqual(["auto", "manual"]);
  });

  it("has chargeDate notNull; notes nullable", async () => {
    const { vmiChargeLines } = await import("../vmi_billing");
    expect(column(vmiChargeLines, "chargeDate").notNull).toBe(true);
    expect(hasColumn(vmiChargeLines, "notes")).toBe(true);
    expect(column(vmiChargeLines, "notes").notNull).toBe(false);
  });

  it("has recordedByUserId notNull and createdAt notNull with default", async () => {
    const { vmiChargeLines } = await import("../vmi_billing");
    expect(column(vmiChargeLines, "recordedByUserId").notNull).toBe(true);
    const createdAt = column(vmiChargeLines, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// vmi_permits (design.md §1.5, tasks.md B.5)
// ---------------------------------------------------------------------------

describe("vmi_billing.ts — vmi_permits table (FR-8, B.5)", () => {
  it("is named 'vmi_permits'", async () => {
    const { vmiPermits } = await import("../vmi_billing");
    expect(tableName(vmiPermits)).toBe("vmi_permits");
  });

  it("has partyId notNull referencing parties.id", async () => {
    const { vmiPermits } = await import("../vmi_billing");
    expect(column(vmiPermits, "partyId").notNull).toBe(true);
    expect(referencesTable(vmiPermits, "party_id", "parties", "id")).toBe(
      true,
    );
  });

  it("has permitNumber and itemScope notNull", async () => {
    const { vmiPermits } = await import("../vmi_billing");
    expect(column(vmiPermits, "permitNumber").notNull).toBe(true);
    expect(column(vmiPermits, "itemScope").notNull).toBe(true);
  });

  it("has validFrom and validTo notNull", async () => {
    const { vmiPermits } = await import("../vmi_billing");
    expect(column(vmiPermits, "validFrom").notNull).toBe(true);
    expect(column(vmiPermits, "validTo").notNull).toBe(true);
  });

  it("has monthlyFeeUsd notNull (mirrored by a linked vmi_recurring_fee_lines LOA row — FR-5.2)", async () => {
    const { vmiPermits } = await import("../vmi_billing");
    expect(column(vmiPermits, "monthlyFeeUsd").notNull).toBe(true);
  });

  it("has isActive notNull with default true", async () => {
    const { vmiPermits } = await import("../vmi_billing");
    const isActive = column(vmiPermits, "isActive");
    expect(isActive.notNull).toBe(true);
    expect(isActive.hasDefault).toBe(true);
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { vmiPermits } = await import("../vmi_billing");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(vmiPermits, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// vmi_billing_periods (design.md §1.6, tasks.md B.6)
// ---------------------------------------------------------------------------

describe("vmi_billing.ts — vmi_billing_periods table (FR-6, FR-7, FR-9, B.6)", () => {
  it("is named 'vmi_billing_periods'", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    expect(tableName(vmiBillingPeriods)).toBe("vmi_billing_periods");
  });

  it("has periodNumber notNull + unique ('VMI-{YYYY}-{MM}-{PARTY_CODE}', design.md §3)", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    const periodNumber = column(vmiBillingPeriods, "periodNumber");
    expect(periodNumber.notNull).toBe(true);
    expect(periodNumber.isUnique).toBe(true);
  });

  it("has partyId notNull referencing parties.id", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    expect(column(vmiBillingPeriods, "partyId").notNull).toBe(true);
    expect(
      referencesTable(vmiBillingPeriods, "party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has periodStartDate and periodEndDate notNull", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    expect(column(vmiBillingPeriods, "periodStartDate").notNull).toBe(true);
    expect(column(vmiBillingPeriods, "periodEndDate").notNull).toBe(true);
  });

  it("has all Billing Statement charge-line fields notNull (computed + snapshotted at close)", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    for (const key of [
      "storageChargeUsd",
      "handlingInUsd",
      "handlingOutUsd",
      "documentationUsd",
      "deliveryUsd",
      "recurringFeesUsd",
      "adHocChargesUsd",
      "billingStatementTotalUsd",
    ]) {
      expect(column(vmiBillingPeriods, key).notNull).toBe(true);
    }
  });

  it("has creditsAppliedUsd notNull with default '0'", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    const creditsAppliedUsd = column(vmiBillingPeriods, "creditsAppliedUsd");
    expect(creditsAppliedUsd.notNull).toBe(true);
    expect(creditsAppliedUsd.hasDefault).toBe(true);
  });

  it("declares CHECK billing_statement_total_non_negative (design.md §1.6 exact name)", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    expect(checkConstraints(vmiBillingPeriods)).toContain(
      "billing_statement_total_non_negative",
    );
  });

  it("has SOA fields: soaOpeningBalanceUsd notNull, soaPaymentsAppliedUsd notNull default '0', soaClosingBalanceUsd notNull (FR-7)", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    expect(column(vmiBillingPeriods, "soaOpeningBalanceUsd").notNull).toBe(
      true,
    );
    const soaPaymentsAppliedUsd = column(
      vmiBillingPeriods,
      "soaPaymentsAppliedUsd",
    );
    expect(soaPaymentsAppliedUsd.notNull).toBe(true);
    expect(soaPaymentsAppliedUsd.hasDefault).toBe(true);
    expect(column(vmiBillingPeriods, "soaClosingBalanceUsd").notNull).toBe(
      true,
    );
  });

  it("has lockedExchangeRatePhp, lockedExchangeRateDate, billingCurrency notNull (locked immutably at close — FR-6.2)", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    expect(column(vmiBillingPeriods, "lockedExchangeRatePhp").notNull).toBe(
      true,
    );
    expect(column(vmiBillingPeriods, "lockedExchangeRateDate").notNull).toBe(
      true,
    );
    expect(column(vmiBillingPeriods, "billingCurrency").notNull).toBe(true);
  });

  it("has all four generated-document artifact id fields, nullable until generated (FR-9.1)", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    for (const key of [
      "billingStatementArtifactId",
      "warehousingChargesArtifactId",
      "soaArtifactId",
      "loaArtifactId",
    ]) {
      expect(hasColumn(vmiBillingPeriods, key)).toBe(true);
      expect(column(vmiBillingPeriods, key).notNull).toBe(false);
    }
  });

  it("has status notNull with default 'draft' (CHECK draft|issued|voided verified against real Postgres by db-migration-verifier, B.10)", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    const status = column(vmiBillingPeriods, "status");
    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
  });

  it("has supersededByPeriodId nullable (set on correction, FR-9.2)", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    expect(hasColumn(vmiBillingPeriods, "supersededByPeriodId")).toBe(true);
    expect(column(vmiBillingPeriods, "supersededByPeriodId").notNull).toBe(
      false,
    );
  });

  it("has closedByUserId/closedAt/voidedAt/voidedByUserId nullable (unset until the corresponding transition)", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    for (const key of [
      "closedByUserId",
      "closedAt",
      "voidedAt",
      "voidedByUserId",
    ]) {
      expect(hasColumn(vmiBillingPeriods, key)).toBe(true);
      expect(column(vmiBillingPeriods, key).notNull).toBe(false);
    }
  });

  it("has createdAt notNull with default", async () => {
    const { vmiBillingPeriods } = await import("../vmi_billing");
    const createdAt = column(vmiBillingPeriods, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// vmi_payments (design.md §1.7, tasks.md B.7)
// ---------------------------------------------------------------------------

describe("vmi_billing.ts — vmi_payments table (FR-7, B.7)", () => {
  it("is named 'vmi_payments'", async () => {
    const { vmiPayments } = await import("../vmi_billing");
    expect(tableName(vmiPayments)).toBe("vmi_payments");
  });

  it("has partyId notNull referencing parties.id", async () => {
    const { vmiPayments } = await import("../vmi_billing");
    expect(column(vmiPayments, "partyId").notNull).toBe(true);
    expect(referencesTable(vmiPayments, "party_id", "parties", "id")).toBe(
      true,
    );
  });

  it("has appliedToPeriodId notNull referencing vmi_billing_periods.id", async () => {
    const { vmiPayments } = await import("../vmi_billing");
    expect(column(vmiPayments, "appliedToPeriodId").notNull).toBe(true);
    expect(
      referencesTable(
        vmiPayments,
        "applied_to_period_id",
        "vmi_billing_periods",
        "id",
      ),
    ).toBe(true);
  });

  it("has paymentDate and amountUsd notNull", async () => {
    const { vmiPayments } = await import("../vmi_billing");
    expect(column(vmiPayments, "paymentDate").notNull).toBe(true);
    expect(column(vmiPayments, "amountUsd").notNull).toBe(true);
  });

  it("has type notNull default 'payment' typed as vmiPaymentTypeEnum (payment|credit_memo|adjustment)", async () => {
    const { vmiPayments } = await import("../vmi_billing");
    const type = column(vmiPayments, "type");
    expect(type.notNull).toBe(true);
    expect(type.hasDefault).toBe(true);
    expect(type.enumValues).toEqual(["payment", "credit_memo", "adjustment"]);
  });

  it("has notes nullable", async () => {
    const { vmiPayments } = await import("../vmi_billing");
    expect(hasColumn(vmiPayments, "notes")).toBe(true);
    expect(column(vmiPayments, "notes").notNull).toBe(false);
  });

  it("has recordedByUserId notNull and createdAt notNull with default", async () => {
    const { vmiPayments } = await import("../vmi_billing");
    expect(column(vmiPayments, "recordedByUserId").notNull).toBe(true);
    const createdAt = column(vmiPayments, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// vmi_manpower_hours_log (design.md §1.2a, added 2026-08-20; tasks.md B.12)
//
// Surfaced during Task D.4: vmi_recurring_fee_lines' manpower row holds only
// the standing hourly rate (stable, reusable config); "hours logged this
// period" needs a dedicated per-period table, not an extension of
// vmi_charge_lines (manpower isn't tied to one AR/shipment). Backing
// acceptance criterion: requirements.md FR-5.1 — Manpower recurring-fee
// contribution is hours_logged × rate_per_hour, requiring an explicit hours
// entry per period; contributes $0/omits when none exists (never an error).
//
// Append/re-entry pattern, not an editable-in-place row: design.md §1.2a's
// constraint notes describe "re-logging hours for an already-logged period
// is an edit (application layer), not a second row" enforced via the unique
// constraint below — but the table itself has no updatedAt column (unlike
// every other vmi_billing table, all of which pair createdAt+updatedAt).
// ---------------------------------------------------------------------------

describe("vmi_billing.ts — vmi_manpower_hours_log table (FR-5.1, B.12)", () => {
  it("is named 'vmi_manpower_hours_log'", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    expect(tableName(vmiManpowerHoursLog)).toBe("vmi_manpower_hours_log");
  });

  it("has id as a uuid primary key", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    expect(hasColumn(vmiManpowerHoursLog, "id")).toBe(true);
    expect(column(vmiManpowerHoursLog, "id").primary).toBe(true);
  });

  it("has recurringFeeLineId notNull referencing vmi_recurring_fee_lines.id", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    expect(column(vmiManpowerHoursLog, "recurringFeeLineId").notNull).toBe(
      true,
    );
    expect(
      referencesTable(
        vmiManpowerHoursLog,
        "recurring_fee_line_id",
        "vmi_recurring_fee_lines",
        "id",
      ),
    ).toBe(true);
  });

  it("has partyId notNull referencing parties.id", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    expect(column(vmiManpowerHoursLog, "partyId").notNull).toBe(true);
    expect(
      referencesTable(vmiManpowerHoursLog, "party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has periodStartDate and periodEndDate notNull date columns", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    expect(column(vmiManpowerHoursLog, "periodStartDate").notNull).toBe(true);
    expect(column(vmiManpowerHoursLog, "periodEndDate").notNull).toBe(true);
  });

  it("has hours notNull decimal(10,2) (design.md §1.2a exact precision/scale)", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    const hours = column(vmiManpowerHoursLog, "hours");
    expect(hours.notNull).toBe(true);
    expect(hours.precision).toBe(10);
    expect(hours.scale).toBe(2);
  });

  it("has notes nullable", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    expect(hasColumn(vmiManpowerHoursLog, "notes")).toBe(true);
    expect(column(vmiManpowerHoursLog, "notes").notNull).toBe(false);
  });

  it("has recordedByUserId notNull and createdAt notNull with default", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    expect(column(vmiManpowerHoursLog, "recordedByUserId").notNull).toBe(
      true,
    );
    const createdAt = column(vmiManpowerHoursLog, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });

  it("has NO updatedAt column — append/re-entry pattern, not an editable-in-place row (design.md §1.2a, unlike every other vmi_billing table)", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    expect(hasColumn(vmiManpowerHoursLog, "updatedAt")).toBe(false);
  });

  it("has a unique constraint on (recurringFeeLineId, periodStartDate, periodEndDate) — re-logging an already-logged period is an edit, not a duplicate row (B.12)", async () => {
    const { vmiManpowerHoursLog } = await import("../vmi_billing");
    const uniques = uniqueConstraints(vmiManpowerHoursLog);
    const match = uniques.find(
      (cols) =>
        cols.includes("recurring_fee_line_id") &&
        cols.includes("period_start_date") &&
        cols.includes("period_end_date"),
    );
    expect(match).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// index.ts re-export requirement (tasks.md B.8, B.12)
// ---------------------------------------------------------------------------

describe("index.ts — re-exports all eight vmi_billing tables (B.8, B.12)", () => {
  it("exports all eight vmi_billing tables from the barrel file", async () => {
    const schema = await import("../index");
    for (const key of [
      "vmiContractTerms",
      "vmiRecurringFeeLines",
      "vmiDailyBalanceLedger",
      "vmiChargeLines",
      "vmiPermits",
      "vmiBillingPeriods",
      "vmiPayments",
      "vmiManpowerHoursLog",
    ]) {
      expect(schema).toHaveProperty(key);
      expect(schema[key as keyof typeof schema]).toBeDefined();
    }
  });
});
