// Dynamic Daily Forex Rate Service & Conversion Engine.
//
// Traceability:
//   specs/01-core-data-model/design.md §1.2 (forex_rates schema)
//   specs/12-vmi-billing/requirements.md (dynamic daily FX conversion)

import { desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { forexRates } from "@/lib/db/schema/forex";

export type DailyForexRateRow = {
  effectiveDate: string;
  usdToPhpRate: number;
  source: string;
};

// Pure conversion helpers
export function convertPhpToUsd(amountPhp: number, fxRate: number): number {
  if (!fxRate || fxRate <= 0) return 0;
  return Number((amountPhp / fxRate).toFixed(2));
}

export function convertUsdToPhp(amountUsd: number, fxRate: number): number {
  if (!fxRate || fxRate <= 0) return 0;
  return Number((amountUsd * fxRate).toFixed(2));
}

/**
 * Fetch the daily Forex exchange rate (USD to PHP) for a given date.
 * If no explicit rate is recorded for the exact date, returns the latest prior rate,
 * falling back to 61.71 if unrecorded.
 */
export async function getDailyForexRate(dateInput?: Date | string): Promise<number> {
  try {
    const targetDate = dateInput
      ? typeof dateInput === "string"
        ? dateInput
        : dateInput.toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const [exactMatch] = await db
      .select({
        effectiveDate: forexRates.effectiveDate,
        usdToPhpRate: forexRates.usdToPhpRate,
      })
      .from(forexRates)
      .where(eq(forexRates.effectiveDate, targetDate))
      .limit(1);

    if (exactMatch) {
      return Number(exactMatch.usdToPhpRate);
    }

    const [latestMatch] = await db
      .select({
        effectiveDate: forexRates.effectiveDate,
        usdToPhpRate: forexRates.usdToPhpRate,
      })
      .from(forexRates)
      .where(lte(forexRates.effectiveDate, targetDate))
      .orderBy(desc(forexRates.effectiveDate))
      .limit(1);

    if (latestMatch) {
      return Number(latestMatch.usdToPhpRate);
    }

    return 61.71; // Fallback canonical June baseline rate
  } catch (error) {
    console.error("Error fetching daily Forex rate:", error);
    return 61.71;
  }
}
