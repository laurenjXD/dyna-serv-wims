"use server";

import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { closeVmiPeriod, type VmiPeriodCloseResult } from "@/lib/billing/vmi-period-close";
import { listParties } from "@/lib/db/queries/parties";

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
