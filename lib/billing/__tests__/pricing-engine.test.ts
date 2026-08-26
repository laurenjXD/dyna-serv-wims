import { describe, it, expect } from "vitest";
import {
  evaluatePricingRule,
  type PricingRuleDefinition,
  type PricingEvaluationContext,
} from "../pricing-engine";

describe("Pricing Rule Engine", () => {
  const sampleRules: PricingRuleDefinition[] = [
    {
      id: "rule-normal-delivery",
      contractVersionId: "ver-1",
      chargeName: "Normal Delivery Charge",
      chargeCode: "DEL-NORM",
      chargeCategory: "delivery",
      billingBasis: "flat",
      rate: 100.0,
      currency: "USD",
      priority: 1,
      isActive: true,
      isTaxable: true,
    },
    {
      id: "rule-coload-delivery",
      contractVersionId: "ver-1",
      chargeName: "Co-load Delivery Rate",
      chargeCode: "DEL-COLOAD",
      chargeCategory: "delivery",
      billingBasis: "flat",
      rate: 150.0,
      currency: "USD",
      priority: 10, // Higher priority overrides normal delivery
      isActive: true,
      isTaxable: true,
      conditionsJson: JSON.stringify({ deliveryType: "CO_LOAD" }),
    },
    {
      id: "rule-cbm-storage",
      contractVersionId: "ver-1",
      chargeName: "Daily CBM Warehousing",
      chargeCode: "WH-CBM",
      chargeCategory: "warehousing",
      billingBasis: "cbm_day",
      rate: 0.05,
      currency: "USD",
      minCharge: 10.0,
      priority: 1,
      isActive: true,
      isTaxable: true,
    },
    {
      id: "rule-manpower",
      contractVersionId: "ver-1",
      chargeName: "Manpower Hourly Rate",
      chargeCode: "MANPOWER",
      chargeCategory: "manpower",
      billingBasis: "hour",
      rate: 12.0,
      currency: "USD",
      priority: 1,
      isActive: true,
      isTaxable: false,
    },
  ];

  it("evaluates default normal delivery rule when condition is normal", () => {
    const ctx: PricingEvaluationContext = {
      partyId: "party-1",
      chargeCategory: "delivery",
      deliveryType: "NORMAL",
    };

    const result = evaluatePricingRule(ctx, sampleRules);
    expect(result).not.toBeNull();
    expect(result?.ruleId).toBe("rule-normal-delivery");
    expect(result?.calculatedAmountUsd).toBe(100.0);
  });

  it("evaluates high-priority co-load rule when deliveryType is CO_LOAD", () => {
    const ctx: PricingEvaluationContext = {
      partyId: "party-1",
      chargeCategory: "delivery",
      deliveryType: "CO_LOAD",
    };

    const result = evaluatePricingRule(ctx, sampleRules);
    expect(result).not.toBeNull();
    expect(result?.ruleId).toBe("rule-coload-delivery");
    expect(result?.calculatedAmountUsd).toBe(150.0);
    expect(result?.priority).toBe(10);
  });

  it("calculates CBM storage rate accurately and applies minimum charge bound", () => {
    // 50 CBM * $0.05 = $2.50, but minCharge is $10.00
    const ctxSmall: PricingEvaluationContext = {
      partyId: "party-1",
      chargeCategory: "warehousing",
      cbm: 50.0,
    };

    const resultSmall = evaluatePricingRule(ctxSmall, sampleRules);
    expect(resultSmall?.calculatedAmountUsd).toBe(10.0);
    expect(resultSmall?.minChargeApplied).toBe(true);

    // 792.02 CBM * $0.05 = $39.601, exceeds min charge
    const ctxLarge: PricingEvaluationContext = {
      partyId: "party-1",
      chargeCategory: "warehousing",
      cbm: 792.02,
    };

    const resultLarge = evaluatePricingRule(ctxLarge, sampleRules);
    expect(resultLarge?.calculatedAmountUsd).toBe(39.601);
    expect(resultLarge?.minChargeApplied).toBe(false);
  });

  it("calculates hourly manpower charges accurately", () => {
    const ctx: PricingEvaluationContext = {
      partyId: "party-1",
      chargeCategory: "manpower",
      hours: 10,
    };

    const result = evaluatePricingRule(ctx, sampleRules);
    expect(result?.calculatedAmountUsd).toBe(120.0);
    expect(result?.isTaxable).toBe(false);
  });
});
