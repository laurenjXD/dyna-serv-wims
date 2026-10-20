import type { UbotRateDraft } from "./types";

export function isRateEffectiveOnOpeningDate(rate: UbotRateDraft, openingDate: string): boolean {
  return (
    rate.active &&
    (!rate.effectiveFrom || rate.effectiveFrom <= openingDate) &&
    (!rate.effectiveTo || rate.effectiveTo >= openingDate)
  );
}

/**
 * Select one current rate per party/charge type for the opening snapshot.
 * Historical and future rates remain in migration_source_rows as evidence but
 * must not override the opening-date billing configuration.
 */
export function selectEffectiveUbotRates(rates: UbotRateDraft[], openingDate: string): UbotRateDraft[] {
  const selected = new Map<string, UbotRateDraft>();
  for (const rate of rates) {
    if (!isRateEffectiveOnOpeningDate(rate, openingDate)) continue;
    const key = `${rate.partyName.toLowerCase()}/${rate.chargeType.toLowerCase()}`;
    const existing = selected.get(key);
    if (!existing || (rate.effectiveFrom ?? "") > (existing.effectiveFrom ?? "")) selected.set(key, rate);
  }
  return [...selected.values()];
}
