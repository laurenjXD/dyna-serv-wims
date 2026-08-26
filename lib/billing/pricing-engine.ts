// `pricing-engine.ts` — Centralized Pricing Rule Evaluation & Rate Resolution Engine
//
// Resolves applicable pricing rules from active contract versions, evaluates
// precedence/priority rules (e.g. Co-load Delivery rate overriding normal rate),
// and executes pricing calculation formulas.

export type ChargeCategory =
  | "warehousing"
  | "handling_in"
  | "handling_out"
  | "delivery"
  | "documentation"
  | "loa"
  | "manpower"
  | "other"
  | "trading";

export type BillingBasis =
  | "cbm_day"
  | "pallet"
  | "carton"
  | "unit"
  | "transaction"
  | "flat"
  | "trip"
  | "distance"
  | "weight"
  | "volume"
  | "hour"
  | "percentage";

export interface PricingEvaluationContext {
  partyId: string;
  contractId?: string;
  contractVersionId?: string;
  chargeCategory: ChargeCategory;
  transactionType?: string;
  deliveryType?: "NORMAL" | "CO_LOAD" | "CUSTOMER_PICKUP" | "WAREHOUSE_PICKUP" | string;
  deliveryZone?: string;
  documentType?: string;
  quantity?: number;
  cbm?: number;
  weight?: number;
  hours?: number;
  baseAmountUsd?: number;
  transactionDate?: Date;
}

export interface PricingRuleDefinition {
  id: string;
  contractVersionId: string;
  chargeName: string;
  chargeCode: string;
  chargeCategory: ChargeCategory;
  billingBasis: BillingBasis;
  rate: number;
  currency: string;
  minCharge?: number | null;
  maxCharge?: number | null;
  priority: number;
  isActive: boolean;
  isTaxable: boolean;
  conditionsJson?: string | null;
  calculationFormula?: string | null;
}

export interface PricingResolutionResult {
  ruleId: string;
  chargeName: string;
  chargeCode: string;
  chargeCategory: ChargeCategory;
  billingBasis: BillingBasis;
  rate: number;
  currency: string;
  calculatedAmountUsd: number;
  minChargeApplied: boolean;
  maxChargeApplied: boolean;
  isTaxable: boolean;
  priority: number;
}

/**
 * Resolves the applicable pricing rule for a given operational context
 * from a list of available contract rules, respecting priority precedence
 * and condition matching.
 */
export function evaluatePricingRule(
  context: PricingEvaluationContext,
  availableRules: PricingRuleDefinition[]
): PricingResolutionResult | null {
  // 1. Filter rules by category and active status
  const categoryRules = availableRules.filter(
    (rule) => rule.isActive && rule.chargeCategory === context.chargeCategory
  );

  if (categoryRules.length === 0) {
    return null;
  }

  // 2. Filter by condition matching (e.g. deliveryType = 'CO_LOAD', deliveryZone = 'Cavite')
  const matchedRules = categoryRules.filter((rule) => {
    if (!rule.conditionsJson) return true;
    try {
      const conditions = JSON.parse(rule.conditionsJson);

      if (
        conditions.deliveryType &&
        context.deliveryType &&
        conditions.deliveryType.toUpperCase() !== context.deliveryType.toUpperCase()
      ) {
        return false;
      }

      if (
        conditions.deliveryZone &&
        context.deliveryZone &&
        conditions.deliveryZone.toLowerCase() !== context.deliveryZone.toLowerCase()
      ) {
        return false;
      }

      if (
        conditions.documentType &&
        context.documentType &&
        conditions.documentType.toLowerCase() !== context.documentType.toLowerCase()
      ) {
        return false;
      }

      return true;
    } catch {
      return true;
    }
  });

  if (matchedRules.length === 0) {
    return null;
  }

  // 3. Sort by priority descending (highest priority wins)
  matchedRules.sort((a, b) => b.priority - a.priority);
  const winningRule = matchedRules[0];

  // 4. Calculate amount based on billing basis
  let rawAmount = 0;
  const qty = context.quantity ?? 1;
  const cbmVal = context.cbm ?? 0;
  const hoursVal = context.hours ?? 0;
  const baseUsd = context.baseAmountUsd ?? 0;

  switch (winningRule.billingBasis) {
    case "cbm_day":
      // CBM * Rate * 1 day (or per day basis)
      rawAmount = cbmVal * winningRule.rate;
      break;

    case "pallet":
    case "carton":
    case "unit":
    case "transaction":
    case "trip":
    case "flat":
      rawAmount = qty * winningRule.rate;
      break;

    case "hour":
      rawAmount = hoursVal * winningRule.rate;
      break;

    case "percentage":
      rawAmount = baseUsd * (winningRule.rate / 100);
      break;

    default:
      rawAmount = qty * winningRule.rate;
      break;
  }

  // 5. Apply Min and Max charge bounds
  let finalAmount = rawAmount;
  let minApplied = false;
  let maxApplied = false;

  if (winningRule.minCharge != null && finalAmount < winningRule.minCharge) {
    finalAmount = winningRule.minCharge;
    minApplied = true;
  }

  if (winningRule.maxCharge != null && finalAmount > winningRule.maxCharge) {
    finalAmount = winningRule.maxCharge;
    maxApplied = true;
  }

  return {
    ruleId: winningRule.id,
    chargeName: winningRule.chargeName,
    chargeCode: winningRule.chargeCode,
    chargeCategory: winningRule.chargeCategory,
    billingBasis: winningRule.billingBasis,
    rate: winningRule.rate,
    currency: winningRule.currency,
    calculatedAmountUsd: Number(finalAmount.toFixed(4)),
    minChargeApplied: minApplied,
    maxChargeApplied: maxApplied,
    isTaxable: winningRule.isTaxable,
    priority: winningRule.priority,
  };
}
