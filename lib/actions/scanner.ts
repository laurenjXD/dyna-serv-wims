"use server";

// lib/actions/scanner.ts
//
// Server Action for handheld barcode/QR scanning verification against live database items, locations, and lots.

import { createPageResolver } from "@/lib/auth/page-resolver";
import { lookupBarcodeOrQr } from "@/lib/db/queries/dashboard";

export interface ScanVerificationResult {
  success: boolean;
  message: string;
  data?: {
    type: "item" | "location" | "lot";
    title: string;
    code: string;
    details: string;
  };
}

export async function verifyBarcodeAction(code: string): Promise<ScanVerificationResult> {
  try {
    await createPageResolver();

    if (!code || !code.trim()) {
      return {
        success: false,
        message: "No barcode or QR code provided.",
      };
    }

    const result = await lookupBarcodeOrQr(code.trim());

    if (!result) {
      return {
        success: false,
        message: `Barcode/QR "${code}" not found in master catalog, locations, or lots.`,
      };
    }

    return {
      success: true,
      message: `Verified ${result.type.toUpperCase()}: ${result.title} (${result.code})`,
      data: result,
    };
  } catch (error) {
    console.error("Barcode scan verification error:", error);
    return {
      success: false,
      message: "An error occurred during barcode verification.",
    };
  }
}
