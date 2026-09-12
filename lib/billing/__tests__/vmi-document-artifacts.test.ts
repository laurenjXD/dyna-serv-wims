import { describe, expect, it, vi } from "vitest";
import { ensureVmiDocumentArtifacts } from "../vmi-document-artifacts";

function chain(rows: unknown[]) {
  const result: Record<string, unknown> = {};
  for (const method of ["from", "where"]) result[method] = vi.fn(() => result);
  Object.assign(result, Promise.resolve(rows));
  (result as any).then = Promise.resolve(rows).then.bind(Promise.resolve(rows));
  return result;
}

const period = { id: "period-1", periodNumber: "VMI-2026-06-DYNA", partyId: "party-1", periodStartDate: "2026-06-01", periodEndDate: "2026-06-30", billingStatementTotalUsd: 100, soaOpeningBalanceUsd: 20, soaClosingBalanceUsd: 120, billingCurrency: "USD" };

describe("ensureVmiDocumentArtifacts", () => {
  it("creates the four pending artifacts and links them to the period", async () => {
    const insert = vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([
      { id: "bs", documentType: "vmi_billing_statement" }, { id: "wc", documentType: "vmi_warehousing_charges" }, { id: "soa", documentType: "vmi_statement_of_account" }, { id: "loa", documentType: "vmi_letter_of_authority" },
    ]) })) }));
    const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })) }));
    const db: any = { select: vi.fn(() => chain([])), insert, update };
    const result = await ensureVmiDocumentArtifacts(db, period);
    expect(Object.values(result)).toHaveLength(4);
    expect(insert).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });
});
