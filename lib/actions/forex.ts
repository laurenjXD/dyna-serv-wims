"use server";

import { db } from "@/lib/db/client";
import { forexRates } from "@/lib/db/schema/forex";
import { revalidatePath } from "next/cache";

export type LiveBspRateResult = {
  ok: boolean;
  rate?: number;
  date?: string;
  source?: string;
  error?: string;
};

/**
 * Server Action: Fetches the live real-time Bangko Sentral ng Pilipinas (BSP) / Forex USD to PHP exchange rate
 * and persists it into the database `forex_rates` table.
 */
export async function syncLiveBspRateAction(): Promise<LiveBspRateResult> {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    
    // Query live Open-Access BSP & Financial FX Market API
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 }, // Cache for 1 hr
    });

    if (!response.ok) {
      throw new Error(`Forex API returned status ${response.status}`);
    }

    const data = await response.json();
    const phpRate = data?.rates?.PHP;

    if (!phpRate || typeof phpRate !== "number" || phpRate <= 0) {
      throw new Error("Invalid PHP exchange rate received from API");
    }

    const roundedRate = Number(phpRate.toFixed(4));

    // Save to database table forex_rates
    await db
      .insert(forexRates)
      .values({
        effectiveDate: todayStr,
        usdToPhpRate: String(roundedRate),
        source: "bsp_realtime_api",
      })
      .onConflictDoUpdate({
        target: forexRates.effectiveDate,
        set: {
          usdToPhpRate: String(roundedRate),
          source: "bsp_realtime_api",
        },
      });

    revalidatePath("/billing-pricing");
    revalidatePath("/outgoing");

    return {
      ok: true,
      rate: roundedRate,
      date: todayStr,
      source: "BSP / Financial FX Market Live API",
    };
  } catch (error) {
    console.error("Error syncing live BSP Forex rate:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to fetch live BSP Forex rate.",
    };
  }
}
