import { createHash } from "node:crypto";

/** The four immutable artifacts required for each VMI billing period. */
export const VMI_DOCUMENT_TYPES = [
  "vmi_billing_statement",
  "vmi_warehousing_charges",
  "vmi_statement_of_account",
  "vmi_letter_of_authority",
] as const;

export type VmiDocumentType = (typeof VMI_DOCUMENT_TYPES)[number];

const TYPE_CODES: Record<VmiDocumentType, string> = {
  vmi_billing_statement: "BS",
  vmi_warehousing_charges: "WC",
  vmi_statement_of_account: "SOA",
  vmi_letter_of_authority: "LOA",
};

export function isVmiDocumentType(value: string): value is VmiDocumentType {
  return (VMI_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/**
 * The period number remains the shared business reference. A short suffix
 * makes each generated_documents.document_number unique and readable.
 */
export function buildVmiDocumentNumber(
  periodNumber: string,
  type: VmiDocumentType,
): string {
  return `${periodNumber}-${TYPE_CODES[type]}`;
}

/** Private Storage path; access is always authorized through the period. */
export function buildVmiArtifactPath(
  periodId: string,
  documentId: string,
  type: VmiDocumentType,
): string {
  return `vmi-billing/${periodId}/${documentId}/${type}.pdf`;
}

/** Stable hash of an immutable JSON snapshot before rendering. */
export function hashVmiDocumentSnapshot(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
