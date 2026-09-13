import { and, eq, inArray } from "drizzle-orm";
import { generatedDocuments } from "@/lib/db/schema/documents";
import { vmiBillingPeriods } from "@/lib/db/schema/vmi_billing";
import {
  buildVmiDocumentNumber,
  hashVmiDocumentSnapshot,
  type VmiDocumentType,
  VMI_DOCUMENT_TYPES,
} from "@/lib/documents/vmi-artifacts";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type VmiDocumentArtifactsDbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export type VmiDocumentArtifactPeriod = {
  id: string;
  periodNumber: string;
  partyId: string;
  periodStartDate: string;
  periodEndDate: string;
  billingStatementTotalUsd: number;
  soaOpeningBalanceUsd: number;
  soaClosingBalanceUsd: number;
  billingCurrency: string;
};

export type VmiDocumentArtifactsResult = Record<VmiDocumentType, string>;

const artifactColumnForType: Record<VmiDocumentType, keyof VmiDocumentArtifactsResult> = {
  vmi_billing_statement: "vmi_billing_statement",
  vmi_warehousing_charges: "vmi_warehousing_charges",
  vmi_statement_of_account: "vmi_statement_of_account",
  vmi_letter_of_authority: "vmi_letter_of_authority",
};

/**
 * Creates only missing pending document projections for a draft VMI period.
 * Repeating the call is safe: existing documents retain their original
 * snapshot hash and identifiers, and the period is re-linked to them.
 */
export async function ensureVmiDocumentArtifacts(
  db: VmiDocumentArtifactsDbLike,
  period: VmiDocumentArtifactPeriod,
): Promise<VmiDocumentArtifactsResult> {
  const existing = await db
    .select({ id: generatedDocuments.id, documentType: generatedDocuments.documentType })
    .from(generatedDocuments)
    .where(and(
      eq(generatedDocuments.sourceType, "vmi_billing_period"),
      eq(generatedDocuments.sourceId, period.id),
      inArray(generatedDocuments.documentType, [...VMI_DOCUMENT_TYPES]),
    ));

  const ids = new Map<string, string>(existing.map((row: { id: string; documentType: string }) => [row.documentType, row.id]));
  const missing = VMI_DOCUMENT_TYPES.filter((type) => !ids.has(type));

  if (missing.length > 0) {
    const created = await db
      .insert(generatedDocuments)
      .values(missing.map((type) => ({
        documentType: type,
        documentNumber: buildVmiDocumentNumber(period.periodNumber, type),
        templateVersion: "vmi-billing-v1",
        sourceType: "vmi_billing_period",
        sourceId: period.id,
        snapshotHash: hashVmiDocumentSnapshot({ period, type }),
        status: "pending",
        currency: period.billingCurrency,
        systemExecutor: "vmi-billing",
      })))
      .returning({ id: generatedDocuments.id, documentType: generatedDocuments.documentType });
    for (const row of created as { id: string; documentType: string }[]) ids.set(row.documentType, row.id);
  }

  const result = Object.fromEntries(VMI_DOCUMENT_TYPES.map((type) => [type, ids.get(type)])) as Record<VmiDocumentType, string | undefined>;
  if (VMI_DOCUMENT_TYPES.some((type) => !result[type])) {
    throw new Error("Unable to register every required VMI document artifact.");
  }

  const resolved = result as VmiDocumentArtifactsResult;
  await db
    .update(vmiBillingPeriods)
    .set({
      billingStatementArtifactId: resolved.vmi_billing_statement,
      warehousingChargesArtifactId: resolved.vmi_warehousing_charges,
      soaArtifactId: resolved.vmi_statement_of_account,
      loaArtifactId: resolved.vmi_letter_of_authority,
    })
    .where(eq(vmiBillingPeriods.id, period.id));

  return resolved;
}
