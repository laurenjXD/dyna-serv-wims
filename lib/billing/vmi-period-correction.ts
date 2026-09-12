import { eq } from "drizzle-orm";
import { parties } from "@/lib/db/schema/parties";
import { vmiBillingPeriods } from "@/lib/db/schema/vmi_billing";
import { closeVmiPeriod } from "@/lib/billing/vmi-period-close";

/** Creates a revision draft first, then voids the immutable issued source.
 * The caller must subsequently issue the new draft through the normal four-
 * document Storage pipeline. */
export async function correctVmiPeriod(db: any, input: { periodId: string; actorId: string; generationDate: string }) {
  const [source] = await db.select({
    id: vmiBillingPeriods.id, status: vmiBillingPeriods.status, partyId: vmiBillingPeriods.partyId,
    periodStartDate: vmiBillingPeriods.periodStartDate, periodEndDate: vmiBillingPeriods.periodEndDate,
    billingCurrency: vmiBillingPeriods.billingCurrency, partyCode: parties.code,
  }).from(vmiBillingPeriods).innerJoin(parties, eq(parties.id, vmiBillingPeriods.partyId))
    .where(eq(vmiBillingPeriods.id, input.periodId)).limit(1);
  if (!source) throw new Error("Billing period not found.");
  if (source.status !== "issued") throw new Error("Only an issued billing period can be corrected.");

  const [year, month] = source.periodStartDate.split("-").map(Number);
  const replacement = await closeVmiPeriod(db, {
    partyId: source.partyId, partyCode: source.partyCode, billingCurrency: source.billingCurrency,
    year, month, periodStartDate: source.periodStartDate, periodEndDate: source.periodEndDate,
    generationDate: input.generationDate, isCorrection: true, correctionOfPeriodId: source.id,
  });
  await db.update(vmiBillingPeriods).set({ status: "voided", voidedAt: new Date(), voidedByUserId: input.actorId, supersededByPeriodId: replacement.id }).where(eq(vmiBillingPeriods.id, source.id));
  return replacement;
}
