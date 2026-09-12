"use server";

import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { closeVmiPeriod, type VmiPeriodCloseResult } from "@/lib/billing/vmi-period-close";
import { recordVmiPayment, type VmiPaymentType } from "@/lib/billing/vmi-payments";
import { listParties } from "@/lib/db/queries/parties";
import { createVmiChargeLine } from "@/lib/actions/vmi-charge-lines";

export type PeriodCloseState = {
  ok?: boolean;
  result?: VmiPeriodCloseResult;
  error?: string;
};

export async function closeVmiPeriodAction(
  _prevState: PeriodCloseState,
  formData: FormData,
): Promise<PeriodCloseState> {
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return { ok: false, error: "You do not have permission to close VMI billing periods." };
  }

  if (!permResult.context.activeRoleKeys.includes("administrator")) {
    return { ok: false, error: "Only an Administrator can create VMI billing drafts." };
  }

  const partyId = String(formData.get("partyId") ?? "");
  const monthStr = String(formData.get("month") ?? "");
  const yearStr = String(formData.get("year") ?? "");

  if (!partyId) return { ok: false, error: "Organization is required." };
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);

  if (isNaN(month) || isNaN(year)) {
    return { ok: false, error: "Valid month and year are required." };
  }

  // Look up party code
  const partiesResult = await listParties(db, { limit: 100 });
  const party = partiesResult.rows.find((p) => p.id === partyId);
  if (!party) return { ok: false, error: "Selected Organization not found." };

  const pad = (n: number) => String(n).padStart(2, "0");
  const monthNum = month + 1; // 1-12
  const periodStartDate = `${year}-${pad(monthNum)}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const periodEndDate = `${year}-${pad(monthNum)}-${pad(lastDay)}`;
  const generationDate = new Date().toISOString().split("T")[0];

  try {
    const result = await closeVmiPeriod(db, {
      partyId,
      partyCode: party.code,
      billingCurrency: "USD",
      year,
      month: monthNum,
      periodStartDate,
      periodEndDate,
      generationDate,
    });

    revalidatePath("/billing-pricing");
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Period close failed.";
    return { ok: false, error: message };
  }
}

export type VmiPaymentState = {
  ok?: boolean;
  paymentId?: string;
  error?: string;
};

export async function recordVmiPaymentAction(
  _prevState: VmiPaymentState,
  formData: FormData,
): Promise<VmiPaymentState> {
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return { ok: false, error: "You do not have permission to record billing payments." };
  }

  if (!permResult.context.activeRoleKeys.includes("administrator")) {
    return { ok: false, error: "Only an Administrator can record billing payments." };
  }

  const partyId = String(formData.get("partyId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  const amountUsd = String(formData.get("amountUsd") ?? "");
  const paymentDate = String(formData.get("paymentDate") ?? "");
  const type = String(formData.get("type") ?? "payment") as VmiPaymentType;
  const notes = String(formData.get("notes") ?? "");

  try {
    const result = await recordVmiPayment(db, {
      partyId,
      periodId,
      amountUsd,
      paymentDate,
      type,
      notes,
      recordedByUserId: permResult.context.userId,
    });

    if (!result.ok) {
      return { ok: false, error: result.errors.join(", ") };
    }

    revalidatePath("/billing-pricing");
    revalidatePath("/billing-pricing/soa");
    return { ok: true, paymentId: result.paymentId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment recording failed.";
    return { ok: false, error: message };
  }
}

export type VmiChargeLineState = {
  ok?: boolean;
  chargeLineId?: string;
  error?: string;
};

export async function createVmiChargeLineAction(
  _prevState: VmiChargeLineState,
  formData: FormData,
): Promise<VmiChargeLineState> {
  const resolver = await createPageResolver();
  const partyId = String(formData.get("partyId") ?? "");
  const result = await createVmiChargeLine(resolver, {
    partyId,
    acknowledgementReceiptId: String(formData.get("acknowledgementReceiptId") ?? ""),
    chargeType: String(formData.get("chargeType") ?? ""),
    chargeDate: String(formData.get("chargeDate") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });

  if (!result.ok) {
    return { ok: false, error: result.errors.join(", ") };
  }

  revalidatePath(`/billing-pricing/vmi/periods/${formData.get("periodId") ?? ""}`);
  revalidatePath("/billing-pricing");
  return { ok: true, chargeLineId: result.chargeLine.id };
}
