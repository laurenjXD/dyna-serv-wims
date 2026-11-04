/** Shared date and release policy for materials; quality holds remain independent. */
export type ExpiryPolicy = "block_release" | "allow_with_acknowledgement";
export type ExpiryReviewLine = {
  lotNumber?: string;
  itemId: string; lotId: string; locationId: string; qty: number;
  expiryDate: string | null; expiryPolicy: ExpiryPolicy; expiryPolicyVersion: number;
};
export type ExpiryAcknowledgementInput = { acknowledged: boolean; reason: string; reviewKey: string };

export function manilaBusinessDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / 86_400_000 : null;
}

export function evaluateExpiry(input: {
  expiryDate: string | null; expiryPolicy: unknown; lotStatus?: string;
  isPerishable?: boolean; now?: Date;
}) {
  const businessDate = manilaBusinessDate(input.now);
  const day = input.expiryDate === null ? null : calendarDay(input.expiryDate);
  const daysPastExpiry = day === null ? 0 : Math.max(0, calendarDay(businessDate)! - day);
  const pastExpiry = daysPastExpiry > 0;
  const error = input.expiryPolicy !== "block_release" && input.expiryPolicy !== "allow_with_acknowledgement"
    ? "expiry_policy_unavailable"
    : input.expiryDate !== null && day === null ? "expiry_date_invalid"
    : input.isPerishable && input.expiryDate === null ? "expiry_date_required" : undefined;
  const eligible = !error && (input.lotStatus ?? "available") === "available" &&
    (!pastExpiry || input.expiryPolicy === "allow_with_acknowledgement");
  return { businessDate, pastExpiry, daysPastExpiry, eligible,
    requiresAcknowledgement: eligible && pastExpiry, ...(error ? { error } : {}) };
}

export function expiryReviewKey(lines: ExpiryReviewLine[], now = new Date()): string {
  const canonical = lines.map((line) => ({ itemId: line.itemId, lotId: line.lotId,
    locationId: line.locationId, qty: line.qty, expiryDate: line.expiryDate,
    expiryPolicy: line.expiryPolicy, expiryPolicyVersion: line.expiryPolicyVersion }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify({ businessDate: manilaBusinessDate(now), lines: canonical });
}

export function validateExpiryAcknowledgement(input: unknown, lines: ExpiryReviewLine[], now = new Date()): input is ExpiryAcknowledgementInput {
  if (!input || typeof input !== "object") return false;
  const value = input as Record<string, unknown>;
  return value.acknowledged === true && typeof value.reason === "string" &&
    value.reason.trim().length > 0 && value.reason.trim().length <= 1000 &&
    value.reviewKey === expiryReviewKey(lines, now);
}
