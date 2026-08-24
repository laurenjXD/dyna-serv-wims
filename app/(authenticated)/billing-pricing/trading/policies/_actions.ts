"use server";

import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { createTradingPolicy, updateTradingPolicy } from "@/lib/actions/trading-policies";

export type PolicyFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createTradingPolicyAction(
  _prevState: PolicyFormState,
  formData: FormData,
): Promise<PolicyFormState> {
  const resolver = await createPageResolver();
  
  const partyId = String(formData.get("partyId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const buyCost = String(formData.get("buyCost") ?? "");
  const buyCurrency = String(formData.get("buyCurrency") ?? "USD");
  const marginType = String(formData.get("marginType") ?? "percentage");
  const marginValue = String(formData.get("marginValue") ?? "");
  const sellPrice = String(formData.get("sellPrice") ?? "");
  const sellCurrency = String(formData.get("sellCurrency") ?? "PHP");
  const fxSource = String(formData.get("fxSource") ?? "");
  const sellPriceIsOverride = formData.get("sellPriceIsOverride") === "true";

  if (!partyId) return { ok: false, error: "Please select an Organization." };
  if (!itemId) return { ok: false, error: "Please select an Item." };
  if (!buyCost) return { ok: false, error: "Buy cost is required." };
  if (!marginValue) return { ok: false, error: "Margin value is required." };
  if (!sellPrice) return { ok: false, error: "Sell price is required." };

  const result = await createTradingPolicy(resolver, {
    partyId,
    itemId,
    buyCost,
    buyCurrency,
    marginType,
    marginValue,
    sellPrice,
    sellCurrency,
    fxSource: fxSource || undefined,
    sellPriceIsOverride,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: `Could not save rate card: ${result.errors.join(", ")}`,
    };
  }

  revalidatePath("/billing-pricing");
  revalidatePath("/billing-pricing/trading/policies");
  return { ok: true };
}

export async function updateTradingPolicyAction(
  partyId: string,
  itemId: string,
  _prevState: PolicyFormState,
  formData: FormData,
): Promise<PolicyFormState> {
  const resolver = await createPageResolver();

  const buyCost = String(formData.get("buyCost") ?? "");
  const buyCurrency = String(formData.get("buyCurrency") ?? "USD");
  const marginType = String(formData.get("marginType") ?? "percentage");
  const marginValue = String(formData.get("marginValue") ?? "");
  const sellPrice = String(formData.get("sellPrice") ?? "");
  const sellCurrency = String(formData.get("sellCurrency") ?? "PHP");
  const fxSource = String(formData.get("fxSource") ?? "");
  const sellPriceIsOverride = formData.get("sellPriceIsOverride") === "true";

  const result = await updateTradingPolicy(resolver, { partyId, itemId }, {
    buyCost,
    buyCurrency,
    marginType,
    marginValue,
    sellPrice,
    sellCurrency,
    fxSource: fxSource || undefined,
    sellPriceIsOverride,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: `Could not update rate card: ${result.errors.join(", ")}`,
    };
  }

  revalidatePath("/billing-pricing");
  revalidatePath("/billing-pricing/trading/policies");
  return { ok: true };
}
