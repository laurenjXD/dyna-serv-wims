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
import { eq, desc } from "drizzle-orm";
import { requirePermission } from "@/lib/rbac/guard";
import { createPageResolver } from "@/lib/auth/page-resolver";

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
    return { ok: false, error: "Unauthorized to create contracts." };
  }

  const userId = perm.context.userId;

  try {
    // Insert master contract header
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

    // Initialize Version 1
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

    // If VMI terms configured, insert VMI Policy
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

      // Default Storage Rate Rule
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

      // Handling IN Rule
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

      // Handling OUT Rule
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

      // LOA Permit Fee Rule
      if (input.loaMonthlyRate && input.loaMonthlyRate > 0) {
        await db.insert(pricingRules).values({
          contractVersionId: version.id,
          chargeName: input.loaPermitNumber ? `LOA Permit (${input.loaPermitNumber})` : "LOA Permit Fee",
          chargeCode: "LOA-PERMIT-FEE",
          chargeCategory: "loa",
          billingBasis: "flat",
          rate: String(input.loaMonthlyRate),
          currency: input.currency ?? "USD",
          priority: 10,
          createdByUserId: userId,
        });
      }
    }

    // If Trading terms configured, insert Trading Rule
    if (input.contractType === "trading" || input.contractType === "vmi_trading") {
      if (input.sellingPrice && input.sellingPrice > 0) {
        await db.insert(pricingRules).values({
          contractVersionId: version.id,
          chargeName: "Trading Selling Price Policy",
          chargeCode: "TRD-SELL-PRICE",
          chargeCategory: "trading",
          billingBasis: "unit",
          rate: String(input.sellingPrice),
          currency: input.currency ?? "USD",
          priority: 10,
          createdByUserId: userId,
        });
      }
    }

    return { ok: true, contract, version };
  } catch (error) {
    console.error("Error in createContract:", error);
    const msg = error instanceof Error ? error.message : "Failed to create contract.";
    let userMsg = msg;
    if (msg.includes("contracts_contract_number_unique") || msg.includes("duplicate key")) {
      userMsg = `Contract number "${input.contractNumber}" already exists. Please use a unique contract number.`;
    } else if (msg.includes("invalid input syntax for type date")) {
      userMsg = "Invalid date format. Please check the Effective and Expiration dates.";
    }
    return { ok: false, error: userMsg };
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

    return result;
  } catch (error) {
    console.error("Error in listContracts:", error);
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

    if (!contract) return null;

    // Fetch active version
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
  } catch (error) {
    console.error("Error in getContractDetail:", error);
    return null;
  }
}

