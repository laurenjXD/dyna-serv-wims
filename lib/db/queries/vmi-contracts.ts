// Query helpers for VMI Contract Terms & VMI Permits.
//
// Traceability:
//   specs/12-vmi-billing/design.md §1.1, §1.5

import { and, eq, isNull, desc } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db/client";
import { vmiContractTerms, vmiPermits } from "@/lib/db/schema/vmi_billing";
import { parties } from "@/lib/db/schema/parties";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DbLike = { select: (...args: any[]) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

export type VmiContractTermsRow = {
  id: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  storageRatePerCbmDay: string;
  billingTiming: string;
  cbmThresholdType: string;
  cbmThreshold: string | null;
  overThresholdRate: string | null;
  handlingInRatePerCbm: string;
  handlingOutRatePerCbm: string;
  documentationDefaultRateUsd: string;
  billingCurrency: string;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type VmiPermitRow = {
  id: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  permitNumber: string;
  itemScope: string;
  validFrom: string;
  validTo: string;
  monthlyFeeUsd: string;
  isActive: boolean;
};

export async function listVmiContractTerms(
  db: DbLike = defaultDb,
): Promise<VmiContractTermsRow[]> {
  const rows = await db
    .select({
      id: vmiContractTerms.id,
      partyId: vmiContractTerms.partyId,
      partyName: parties.name,
      partyCode: parties.code,
      storageRatePerCbmDay: vmiContractTerms.storageRatePerCbmDay,
      billingTiming: vmiContractTerms.billingTiming,
      cbmThresholdType: vmiContractTerms.cbmThresholdType,
      cbmThreshold: vmiContractTerms.cbmThreshold,
      overThresholdRate: vmiContractTerms.overThresholdRate,
      handlingInRatePerCbm: vmiContractTerms.handlingInRatePerCbm,
      handlingOutRatePerCbm: vmiContractTerms.handlingOutRatePerCbm,
      documentationDefaultRateUsd: vmiContractTerms.documentationDefaultRateUsd,
      billingCurrency: vmiContractTerms.billingCurrency,
      isActive: vmiContractTerms.isActive,
      effectiveFrom: vmiContractTerms.effectiveFrom,
      effectiveTo: vmiContractTerms.effectiveTo,
    })
    .from(vmiContractTerms)
    .innerJoin(parties, eq(vmiContractTerms.partyId, parties.id))
    .orderBy(desc(vmiContractTerms.effectiveFrom));

  return rows as VmiContractTermsRow[];
}

export async function listVmiPermitsAll(
  db: DbLike = defaultDb,
): Promise<VmiPermitRow[]> {
  const rows = await db
    .select({
      id: vmiPermits.id,
      partyId: vmiPermits.partyId,
      partyName: parties.name,
      partyCode: parties.code,
      permitNumber: vmiPermits.permitNumber,
      itemScope: vmiPermits.itemScope,
      validFrom: vmiPermits.validFrom,
      validTo: vmiPermits.validTo,
      monthlyFeeUsd: vmiPermits.monthlyFeeUsd,
      isActive: vmiPermits.isActive,
    })
    .from(vmiPermits)
    .innerJoin(parties, eq(vmiPermits.partyId, parties.id));

  return rows as VmiPermitRow[];
}
