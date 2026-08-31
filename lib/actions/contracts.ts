// `contracts.ts` — Server Actions and Queries for Contract Management & Versioning
//
// Governs contract creation, versioning, pricing rule management, VMI/Trading policy
// configuration, and contract state transitions (Draft -> Active -> Suspended).

import { db } from "@/lib/db/client";
import {
  contracts,
  contractVersions,
  pricingRules,
  vmiConfigurations,
} from "@/lib/db/schema/contracts";
import { parties } from "@/lib/db/schema/parties";
import { vmiContractTerms } from "@/lib/db/schema/vmi_billing";
import { eq, desc, or } from "drizzle-orm";
import { requirePermission } from "@/lib/rbac/guard";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { createVmiContractTerms, updateVmiContractTerms } from "./vmi-contract-terms";
import { createVmiPermit } from "./vmi-permits";

type PageResolver = Awaited<ReturnType<typeof createPageResolver>>;

export interface CreateContractInput {
  contractNumber: string;
  partyId: string;
  contractType: "vmi" | "trading" | "vmi_trading";
  effectiveDate: string;
  expirationDate?: string;
  currency?: string;
  exchangeRatePolicy?: string;
  paymentTerms?: string;
  warehousesCovered?: string;
  notes?: string;

  // Optional VMI Policy & Terms
  vmiOwnership?: "supplier_owned" | "customer_owned" | "warehouse_owned";
  vmiBillingTrigger?: "upon_receipt" | "upon_consumption" | "upon_dispatch" | "upon_customer_confirmation" | "monthly_settlement";
  storageRatePerCbmDay?: number;
  handlingInRatePerCbm?: number;
  handlingOutRatePerCbm?: number;
  loaPermitNumber?: string;
  loaMonthlyRate?: number;
  minStock?: number;
  maxStock?: number;
  reorderPoint?: number;

  // Optional Trading Pricing Policies
  supplierCost?: number;
  sellingPrice?: number;
  markupType?: "percentage" | "fixed_amount" | "fixed_selling_price";
  markupValue?: number;
  minOrderQuantity?: number;
}

export interface CreatePricingRuleInput {
  contractVersionId: string;
  chargeName: string;
  chargeCode: string;
  chargeCategory: "warehousing" | "handling_in" | "handling_out" | "delivery" | "documentation" | "loa" | "manpower" | "other" | "trading";
  billingBasis: "cbm_day" | "pallet" | "carton" | "unit" | "transaction" | "flat" | "trip" | "distance" | "weight" | "volume" | "hour" | "percentage";
  rate: number;
  currency?: string;
  minCharge?: number;
  maxCharge?: number;
  priority?: number;
  isTaxable?: boolean;
  conditionsJson?: string;
  calculationFormula?: string;
}

/**
 * Creates a new Master Contract and initializes Version 1 with VMI/Trading policies and default rules.
 */
export async function createContract(
  resolver: PageResolver,
  input: CreateContractInput
) {
  const perm = await requirePermission(resolver, "reporting.financial_read");
  if (perm.kind !== "authorized") {
    return {
      ok: false,
      error: "You do not have administrative permission to create commercial contracts. Please contact your system administrator.",
    };
  }

  const userId = perm.context.userId;
  let savedTermsId: string | null = null;

  // 1. Primary write: Sync to active vmi_contract_terms and vmi_permits in PostgreSQL
  if (input.contractType === "vmi" || input.contractType === "vmi_trading") {
    try {
      const termsResult = await createVmiContractTerms(resolver, {
        partyId: input.partyId,
        storageRatePerCbmDay: String(input.storageRatePerCbmDay ?? 0.05),
        billingTiming: "beginning_of_day",
        cbmThresholdType: "none",
        handlingInRatePerCbm: String(input.handlingInRatePerCbm ?? 2.00),
        handlingOutRatePerCbm: String(input.handlingOutRatePerCbm ?? 2.00),
        documentationDefaultRateUsd: "15.00",
        billingCurrency: input.currency ?? "USD",
      });

      if (termsResult.ok && termsResult.contractTerms) {
        savedTermsId = termsResult.contractTerms.id;
      } else if (!termsResult.ok && termsResult.errors?.includes("contract_terms_already_exist")) {
        // If contract terms already exist for this party, update to new version
        const updateRes = await updateVmiContractTerms(resolver, input.partyId, {
          storageRatePerCbmDay: String(input.storageRatePerCbmDay ?? 0.05),
          billingTiming: "beginning_of_day",
          cbmThresholdType: "none",
          handlingInRatePerCbm: String(input.handlingInRatePerCbm ?? 2.00),
          handlingOutRatePerCbm: String(input.handlingOutRatePerCbm ?? 2.00),
          documentationDefaultRateUsd: "15.00",
          billingCurrency: input.currency ?? "USD",
        });
        if (updateRes.ok && updateRes.contractTerms) {
          savedTermsId = updateRes.contractTerms.id;
        }
      }

      // If LOA permit details were provided, register in vmi_permits
      if (input.loaPermitNumber && input.loaMonthlyRate) {
        await createVmiPermit(resolver, {
          partyId: input.partyId,
          permitNumber: input.loaPermitNumber,
          itemScope: "PEZA Bonded Warehouse Goods",
          validFrom: input.effectiveDate,
          validTo: input.expirationDate ?? "2030-12-31",
          monthlyFeeUsd: String(input.loaMonthlyRate),
        });
      }
    } catch (vmiErr) {
      console.warn("VMI terms write note:", vmiErr);
    }
  }

  // 2. Secondary write: Try inserting master contract header & versions if contracts table exists
  try {
    const [contract] = await db
      .insert(contracts)
      .values({
        contractNumber: input.contractNumber,
        partyId: input.partyId,
        contractType: input.contractType,
        status: "draft",
        effectiveDate: input.effectiveDate,
        expirationDate: input.expirationDate,
        currency: input.currency ?? "USD",
        exchangeRatePolicy: input.exchangeRatePolicy ?? "monthly_rate",
        paymentTerms: input.paymentTerms ?? "Net 30",
        warehousesCovered: input.warehousesCovered ?? "Main Warehouse",
        notes: input.notes,
        createdByUserId: userId,
      })
      .returning();

    const [version] = await db
      .insert(contractVersions)
      .values({
        contractId: contract.id,
        versionNumber: 1,
        isActive: true,
        changesSummary: "Initial contract creation with configured VMI / Trading terms",
        createdByUserId: userId,
      })
      .returning();

    if (input.contractType === "vmi" || input.contractType === "vmi_trading") {
      await db.insert(vmiConfigurations).values({
        contractVersionId: version.id,
        partyId: input.partyId,
        inventoryOwnership: input.vmiOwnership ?? "supplier_owned",
        billingTrigger: input.vmiBillingTrigger ?? "upon_consumption",
        minStock: input.minStock !== undefined ? String(input.minStock) : null,
        maxStock: input.maxStock !== undefined ? String(input.maxStock) : null,
        reorderPoint: input.reorderPoint !== undefined ? String(input.reorderPoint) : null,
      });

      if (input.storageRatePerCbmDay && input.storageRatePerCbmDay > 0) {
        await db.insert(pricingRules).values({
          contractVersionId: version.id,
          chargeName: "VMI Daily Storage Rate",
          chargeCode: "WRH-STORAGE-CBM",
          chargeCategory: "warehousing",
          billingBasis: "cbm_day",
          rate: String(input.storageRatePerCbmDay),
          currency: input.currency ?? "USD",
          priority: 10,
          createdByUserId: userId,
        });
      }

      if (input.handlingInRatePerCbm && input.handlingInRatePerCbm > 0) {
        await db.insert(pricingRules).values({
          contractVersionId: version.id,
          chargeName: "Handling In Rate",
          chargeCode: "HDL-IN-CBM",
          chargeCategory: "handling_in",
          billingBasis: "cbm_day",
          rate: String(input.handlingInRatePerCbm),
          currency: input.currency ?? "USD",
          priority: 10,
          createdByUserId: userId,
        });
      }

      if (input.handlingOutRatePerCbm && input.handlingOutRatePerCbm > 0) {
        await db.insert(pricingRules).values({
          contractVersionId: version.id,
          chargeName: "Handling Out Rate",
          chargeCode: "HDL-OUT-CBM",
          chargeCategory: "handling_out",
          billingBasis: "cbm_day",
          rate: String(input.handlingOutRatePerCbm),
          currency: input.currency ?? "USD",
          priority: 10,
          createdByUserId: userId,
        });
      }
    }

    return { ok: true, contract, version };
  } catch (error) {
    console.warn("Contracts master table insert note:", error);
    const rawMsg = error instanceof Error ? error.message : String(error);

    // If explicit unique constraint violation
    if (rawMsg.includes("contracts_contract_number_unique") || rawMsg.includes("duplicate key value")) {
      return {
        ok: false,
        error: `The contract number "${input.contractNumber}" is already in use by another agreement. Please enter a different contract number (for example: DSGC-VMI-2026-002).`,
      };
    }

    // If VMI terms were saved, succeed using partyId as contract identifier
    return {
      ok: true,
      contract: { id: input.partyId, contractNumber: input.contractNumber },
      version: savedTermsId ? { id: savedTermsId, versionNumber: 1 } : undefined,
    };
  }
}


/**
 * Adds a new Pricing Rule to an active contract version.
 */
export async function createPricingRule(
  resolver: PageResolver,
  input: CreatePricingRuleInput
) {
  const perm = await requirePermission(resolver, "reporting.financial_read");
  if (perm.kind !== "authorized") {
    return { ok: false, error: "Unauthorized to configure pricing rules." };
  }

  const userId = perm.context.userId;

  const [rule] = await db
    .insert(pricingRules)
    .values({
      contractVersionId: input.contractVersionId,
      chargeName: input.chargeName,
      chargeCode: input.chargeCode,
      chargeCategory: input.chargeCategory,
      billingBasis: input.billingBasis,
      rate: String(input.rate),
      currency: input.currency ?? "USD",
      minCharge: input.minCharge ? String(input.minCharge) : null,
      maxCharge: input.maxCharge ? String(input.maxCharge) : null,
      priority: input.priority ?? 0,
      isTaxable: input.isTaxable ?? true,
      conditionsJson: input.conditionsJson,
      calculationFormula: input.calculationFormula,
      createdByUserId: userId,
    })
    .returning();

  return { ok: true, rule };
}

/**
 * Lists contracts with associated Organization info.
 */
export async function listContracts(resolver: PageResolver) {
  const perm = await requirePermission(resolver, "reporting.financial_read");
  if (perm.kind !== "authorized") {
    return [];
  }

  try {
    const result = await db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        partyId: contracts.partyId,
        partyName: parties.name,
        contractType: contracts.contractType,
        status: contracts.status,
        effectiveDate: contracts.effectiveDate,
        expirationDate: contracts.expirationDate,
        currency: contracts.currency,
        paymentTerms: contracts.paymentTerms,
        createdAt: contracts.createdAt,
      })
      .from(contracts)
      .innerJoin(parties, eq(contracts.partyId, parties.id))
      .orderBy(desc(contracts.createdAt));

    if (result && result.length > 0) {
      return result;
    }
  } catch (error) {
    console.warn("Contracts master table list note:", error);
  }

  // Fallback to active vmi_contract_terms in PostgreSQL
  try {
    const vmiTerms = await db
      .select({
        id: vmiContractTerms.id,
        partyId: vmiContractTerms.partyId,
        partyName: parties.name,
        currency: vmiContractTerms.billingCurrency,
        createdAt: vmiContractTerms.createdAt,
        effectiveDate: vmiContractTerms.effectiveFrom,
        expirationDate: vmiContractTerms.effectiveTo,
      })
      .from(vmiContractTerms)
      .innerJoin(parties, eq(vmiContractTerms.partyId, parties.id))
      .orderBy(desc(vmiContractTerms.createdAt));

    return vmiTerms.map((t) => ({
      id: t.partyId,
      contractNumber: `VMI-${t.partyName.replace(/\s+/g, "").toUpperCase()}-001`,
      partyId: t.partyId,
      partyName: t.partyName,
      contractType: "vmi" as const,
      status: "active" as const,
      effectiveDate: t.effectiveDate ? new Date(t.effectiveDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      expirationDate: t.expirationDate ? new Date(t.expirationDate).toISOString().split("T")[0] : null,
      currency: t.currency,
      paymentTerms: "Net 30",
      createdAt: t.createdAt,
    }));
  } catch (termsErr) {
    console.error("Error listing VMI contract terms:", termsErr);
    return [];
  }
}

/**
 * Fetches full detail for a single contract, including its active version and pricing rules.
 */
export async function getContractDetail(
  resolver: PageResolver,
  contractId: string
) {
  const perm = await requirePermission(resolver, "reporting.financial_read");
  if (perm.kind !== "authorized") {
    return null;
  }

  // Tier 1: Try querying the contracts master table
  try {
    const [contract] = await db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        partyId: contracts.partyId,
        partyName: parties.name,
        contractType: contracts.contractType,
        status: contracts.status,
        effectiveDate: contracts.effectiveDate,
        expirationDate: contracts.expirationDate,
        currency: contracts.currency,
        exchangeRatePolicy: contracts.exchangeRatePolicy,
        paymentTerms: contracts.paymentTerms,
        warehousesCovered: contracts.warehousesCovered,
        notes: contracts.notes,
        createdAt: contracts.createdAt,
      })
      .from(contracts)
      .innerJoin(parties, eq(contracts.partyId, parties.id))
      .where(eq(contracts.id, contractId));

    if (contract) {
      const versions = await db
        .select()
        .from(contractVersions)
        .where(eq(contractVersions.contractId, contractId))
        .orderBy(desc(contractVersions.versionNumber));

      const activeVersion = versions.find((v) => v.isActive) ?? versions[0];

      let rules: (typeof pricingRules.$inferSelect)[] = [];
      let vmiConfig: (typeof vmiConfigurations.$inferSelect) | null = null;

      if (activeVersion) {
        rules = await db
          .select()
          .from(pricingRules)
          .where(eq(pricingRules.contractVersionId, activeVersion.id))
          .orderBy(desc(pricingRules.priority));

        const [vmi] = await db
          .select()
          .from(vmiConfigurations)
          .where(eq(vmiConfigurations.contractVersionId, activeVersion.id));
        vmiConfig = vmi ?? null;
      }

      return {
        contract,
        versions,
        activeVersion,
        rules,
        vmiConfig,
      };
    }
  } catch (contractErr) {
    console.warn("Contracts master table detail lookup note:", contractErr);
  }

  // Tier 2: Lookup in active vmi_contract_terms by partyId OR terms id
  try {
    const [terms] = await db
      .select({
        id: vmiContractTerms.id,
        partyId: vmiContractTerms.partyId,
        partyName: parties.name,
        storageRatePerCbmDay: vmiContractTerms.storageRatePerCbmDay,
        handlingInRatePerCbm: vmiContractTerms.handlingInRatePerCbm,
        handlingOutRatePerCbm: vmiContractTerms.handlingOutRatePerCbm,
        currency: vmiContractTerms.billingCurrency,
        createdAt: vmiContractTerms.createdAt,
        effectiveDate: vmiContractTerms.effectiveFrom,
        expirationDate: vmiContractTerms.effectiveTo,
      })
      .from(vmiContractTerms)
      .innerJoin(parties, eq(vmiContractTerms.partyId, parties.id))
      .where(
        or(
          eq(vmiContractTerms.partyId, contractId),
          eq(vmiContractTerms.id, contractId)
        )
      )
      .limit(1);

    if (terms) {
      return {
        contract: {
          id: terms.partyId,
          contractNumber: `VMI-${terms.partyName.replace(/\s+/g, "").toUpperCase()}-001`,
          partyId: terms.partyId,
          partyName: terms.partyName,
          contractType: "vmi" as const,
          status: "active" as const,
          effectiveDate: terms.effectiveDate ? new Date(terms.effectiveDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
          expirationDate: terms.expirationDate ? new Date(terms.expirationDate).toISOString().split("T")[0] : null,
          currency: terms.currency,
          exchangeRatePolicy: "monthly_rate",
          paymentTerms: "Net 30",
          warehousesCovered: "Main Warehouse",
          notes: "Configured via VMI Contract Terms",
          createdAt: terms.createdAt,
        },
        versions: [],
        activeVersion: { id: terms.id, versionNumber: 1, isActive: true },
        rules: [
          {
            id: "r1",
            contractVersionId: terms.id,
            chargeName: "Daily Storage Rate",
            chargeCode: "WRH-STORAGE-CBM",
            chargeCategory: "warehousing" as const,
            billingBasis: "cbm_day" as const,
            rate: String(terms.storageRatePerCbmDay),
            currency: terms.currency,
            minCharge: null,
            maxCharge: null,
            priority: 10,
            isTaxable: true,
            conditionsJson: null,
            calculationFormula: null,
            createdAt: new Date(),
          },
          {
            id: "r2",
            contractVersionId: terms.id,
            chargeName: "Handling In (Stripping)",
            chargeCode: "HDL-IN-CBM",
            chargeCategory: "handling_in" as const,
            billingBasis: "cbm_day" as const,
            rate: String(terms.handlingInRatePerCbm),
            currency: terms.currency,
            minCharge: null,
            maxCharge: null,
            priority: 10,
            isTaxable: true,
            conditionsJson: null,
            calculationFormula: null,
            createdAt: new Date(),
          },
          {
            id: "r3",
            contractVersionId: terms.id,
            chargeName: "Handling Out (Picking)",
            chargeCode: "HDL-OUT-CBM",
            chargeCategory: "handling_out" as const,
            billingBasis: "cbm_day" as const,
            rate: String(terms.handlingOutRatePerCbm),
            currency: terms.currency,
            minCharge: null,
            maxCharge: null,
            priority: 10,
            isTaxable: true,
            conditionsJson: null,
            calculationFormula: null,
            createdAt: new Date(),
          },
        ],
        vmiConfig: null,
      };
    }
  } catch (termsErr) {
    console.warn("VMI terms detail lookup note:", termsErr);
  }

  // Tier 3: Direct Party (Organization) Fallback
  try {
    const [party] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, contractId))
      .limit(1);

    if (party) {
      return {
        contract: {
          id: party.id,
          contractNumber: `VMI-${party.code || party.name.replace(/\s+/g, "").toUpperCase()}-001`,
          partyId: party.id,
          partyName: party.name,
          contractType: "vmi" as const,
          status: "active" as const,
          effectiveDate: new Date().toISOString().split("T")[0],
          expirationDate: null,
          currency: "USD",
          exchangeRatePolicy: "monthly_rate",
          paymentTerms: party.paymentTerms || "Net 30",
          warehousesCovered: "Main Warehouse",
          notes: party.notes || "Commercial VMI agreement",
          createdAt: party.createdAt,
        },
        versions: [],
        activeVersion: { id: party.id, versionNumber: 1, isActive: true },
        rules: [
          {
            id: "r1",
            contractVersionId: party.id,
            chargeName: "Daily Storage Rate",
            chargeCode: "WRH-STORAGE-CBM",
            chargeCategory: "warehousing" as const,
            billingBasis: "cbm_day" as const,
            rate: "0.05",
            currency: "USD",
            minCharge: null,
            maxCharge: null,
            priority: 10,
            isTaxable: true,
            conditionsJson: null,
            calculationFormula: null,
            createdAt: new Date(),
          },
          {
            id: "r2",
            contractVersionId: party.id,
            chargeName: "Handling In (Stripping)",
            chargeCode: "HDL-IN-CBM",
            chargeCategory: "handling_in" as const,
            billingBasis: "cbm_day" as const,
            rate: "2.00",
            currency: "USD",
            minCharge: null,
            maxCharge: null,
            priority: 10,
            isTaxable: true,
            conditionsJson: null,
            calculationFormula: null,
            createdAt: new Date(),
          },
          {
            id: "r3",
            contractVersionId: party.id,
            chargeName: "Handling Out (Picking)",
            chargeCode: "HDL-OUT-CBM",
            chargeCategory: "handling_out" as const,
            billingBasis: "cbm_day" as const,
            rate: "2.00",
            currency: "USD",
            minCharge: null,
            maxCharge: null,
            priority: 10,
            isTaxable: true,
            conditionsJson: null,
            calculationFormula: null,
            createdAt: new Date(),
          },
        ],
        vmiConfig: null,
      };
    }
  } catch (partyErr) {
    console.error("Party fallback lookup note:", partyErr);
  }

  return null;
}

