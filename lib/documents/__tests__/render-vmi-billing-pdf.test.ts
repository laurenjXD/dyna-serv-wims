import { describe, expect, it } from "vitest";
import { renderVmiBillingPdf } from "../render-vmi-billing-pdf";

const data = { period: { periodNumber: "VMI-2026-06-DYNA", partyName: "Dyna-Serv", partyCode: "DYNA", periodStartDate: "2026-06-01", periodEndDate: "2026-06-30", storageChargeUsd: 100, handlingInUsd: 10, handlingOutUsd: 10, documentationUsd: 5, deliveryUsd: 5, recurringFeesUsd: 5, adHocChargesUsd: 0, creditsAppliedUsd: 0, billingStatementTotalUsd: 135, soaOpeningBalanceUsd: 0, soaPaymentsAppliedUsd: 0, soaClosingBalanceUsd: 135, lockedExchangeRatePhp: 58 }, dailyRows: [], payments: [], permits: [] };

describe("renderVmiBillingPdf", () => {
  it("renders a valid PDF for each required VMI document", async () => {
    for (const type of ["vmi_billing_statement", "vmi_warehousing_charges", "vmi_statement_of_account", "vmi_letter_of_authority"] as const) {
      const bytes = await renderVmiBillingPdf(type, data);
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    }
  });
});
