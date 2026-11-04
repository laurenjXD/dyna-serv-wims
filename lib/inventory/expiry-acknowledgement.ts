import { createHash } from "node:crypto";
import { expiryAcknowledgements } from "@/lib/db/schema/expiry_acknowledgements";
import { evaluateExpiry, expiryReviewKey, manilaBusinessDate, validateExpiryAcknowledgement, type ExpiryReviewLine } from "./expiry-policy";

export function expiryReleaseReview(lines: Array<ExpiryReviewLine & { lotStatus?: string; isPerishable?: boolean }>, now = new Date()) {
  const affected: ExpiryReviewLine[] = [];
  for (const line of lines) {
    const expiry = evaluateExpiry({ ...line, now });
    if (!expiry.eligible) throw new Error(expiry.error ?? "material_expiry_blocked");
    if (expiry.requiresAcknowledgement) affected.push(line);
  }
  return affected;
}

export async function recordExpiryAcknowledgement(
  // The caller supplies its transaction-bound client; evidence cannot outlive a failed stock mutation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { insert: (...args: any[]) => any },
  stage: "receiving" | "generation" | "dispatch", sourceId: string, actorUserId: string,
  input: unknown, lines: ExpiryReviewLine[], now = new Date(),
) {
  if (lines.length === 0) return;
  if (!validateExpiryAcknowledgement(input, lines, now)) throw new Error("expiry_acknowledgement_required");
  await db.insert(expiryAcknowledgements).values({ stage, sourceId, actorUserId,
    reason: input.reason.trim(), businessDate: manilaBusinessDate(now),
    fingerprint: createHash("sha256").update(expiryReviewKey(lines, now)).digest("hex"), lines,
  });
}
