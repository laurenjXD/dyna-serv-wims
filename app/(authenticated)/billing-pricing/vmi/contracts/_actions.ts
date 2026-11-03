"use server";

import { toUserMessage } from "@/lib/ui/user-messages";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { createVmiContractTerms, updateVmiContractTerms } from "@/lib/actions/vmi-contract-terms";
import { createVmiPermit, updateVmiPermit } from "@/lib/actions/vmi-permits";

export type VmiFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createVmiContractTermsAction(
  _prevState: VmiFormState,
  formData: FormData,
): Promise<VmiFormState> {
  const resolver = await createPageResolver();

  const partyId = String(formData.get("partyId") ?? "");
  const storageRatePerCbmDay = String(formData.get("storageRatePerCbmDay") ?? "");
  const billingTiming = String(formData.get("billingTiming") ?? "beginning_of_day");
  const cbmThresholdType = String(formData.get("cbmThresholdType") ?? "none");
  const cbmThreshold = String(formData.get("cbmThreshold") ?? "");
  const overThresholdRate = String(formData.get("overThresholdRate") ?? "");
  const handlingInRatePerCbm = String(formData.get("handlingInRatePerCbm") ?? "1.40");
  const handlingOutRatePerCbm = String(formData.get("handlingOutRatePerCbm") ?? "1.40");
  const documentationDefaultRateUsd = String(formData.get("documentationDefaultRateUsd") ?? "15.00");
  const billingCurrency = String(formData.get("billingCurrency") ?? "USD");

  if (!partyId) return { ok: false, error: "Please select an Organization." };
  if (!storageRatePerCbmDay) return { ok: false, error: "Enter a Storage Rate, then save the contract terms again." };

  const result = await createVmiContractTerms(resolver, {
    partyId,
    storageRatePerCbmDay,
    billingTiming,
    cbmThresholdType,
    cbmThreshold: cbmThreshold || undefined,
    overThresholdRate: overThresholdRate || undefined,
    handlingInRatePerCbm,
    handlingOutRatePerCbm,
    documentationDefaultRateUsd,
    billingCurrency,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: toUserMessage(result.errors, "VMI contract terms were not saved. Review the form and try again."),
    };
  }

  revalidatePath("/billing-pricing");
  revalidatePath("/reports");
  return { ok: true };
}

export async function updateVmiContractTermsAction(
  partyId: string,
  _prevState: VmiFormState,
  formData: FormData,
): Promise<VmiFormState> {
  const resolver = await createPageResolver();

  const storageRatePerCbmDay = String(formData.get("storageRatePerCbmDay") ?? "");
  const billingTiming = String(formData.get("billingTiming") ?? "beginning_of_day");
  const cbmThresholdType = String(formData.get("cbmThresholdType") ?? "none");
  const cbmThreshold = String(formData.get("cbmThreshold") ?? "");
  const overThresholdRate = String(formData.get("overThresholdRate") ?? "");
  const handlingInRatePerCbm = String(formData.get("handlingInRatePerCbm") ?? "");
  const handlingOutRatePerCbm = String(formData.get("handlingOutRatePerCbm") ?? "");
  const documentationDefaultRateUsd = String(formData.get("documentationDefaultRateUsd") ?? "");
  const billingCurrency = String(formData.get("billingCurrency") ?? "USD");

  const result = await updateVmiContractTerms(resolver, partyId, {
    storageRatePerCbmDay: storageRatePerCbmDay || undefined,
    billingTiming: billingTiming || undefined,
    cbmThresholdType: cbmThresholdType || undefined,
    cbmThreshold: cbmThreshold || undefined,
    overThresholdRate: overThresholdRate || undefined,
    handlingInRatePerCbm: handlingInRatePerCbm || undefined,
    handlingOutRatePerCbm: handlingOutRatePerCbm || undefined,
    documentationDefaultRateUsd: documentationDefaultRateUsd || undefined,
    billingCurrency: billingCurrency || undefined,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: toUserMessage(result.errors, "VMI contract terms were not saved. Review the form and try again."),
    };
  }

  revalidatePath("/billing-pricing");
  revalidatePath("/reports");
  return { ok: true };
}

export async function createVmiPermitAction(
  _prevState: VmiFormState,
  formData: FormData,
): Promise<VmiFormState> {
  const resolver = await createPageResolver();

  const partyId = String(formData.get("partyId") ?? "");
  const permitNumber = String(formData.get("permitNumber") ?? "");
  const itemScope = String(formData.get("itemScope") ?? "All Items");
  const validFrom = String(formData.get("validFrom") ?? "");
  const validTo = String(formData.get("validTo") ?? "");
  const monthlyFeeUsd = String(formData.get("monthlyFeeUsd") ?? "0.00");

  if (!partyId) return { ok: false, error: "Please select an Organization." };
  if (!permitNumber) return { ok: false, error: "Enter a Permit Number, then save the permit again." };
  if (!validFrom || !validTo) return { ok: false, error: "Enter Valid From and Valid To dates, then save the permit again." };

  const result = await createVmiPermit(resolver, {
    partyId,
    permitNumber,
    itemScope,
    validFrom,
    validTo,
    monthlyFeeUsd,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: toUserMessage(result.errors, "Permit was not saved. Review the form and try again."),
    };
  }

  revalidatePath("/billing-pricing");
  revalidatePath("/reports");
  revalidatePath(`/billing-pricing/vmi/permits/${partyId}`);
  return { ok: true };
}
