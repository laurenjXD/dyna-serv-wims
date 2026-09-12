import { describe, expect, it, vi } from "vitest";
import { recordVmiPayment, validateRecordVmiPaymentInput } from "../vmi-payments";

function chain<T>(rows: T[]) {
  const value = {
    from: vi.fn(() => value),
    where: vi.fn(() => value),
    limit: vi.fn(async () => rows),
  };
  return value;
}

describe("VMI payment recording", () => {
  it("requires a positive amount, valid date, and supported type", () => {
    expect(validateRecordVmiPaymentInput({
      partyId: "party",
      periodId: "period",
      recordedByUserId: "user",
      amountUsd: "0",
      paymentDate: "2026-02-30",
      type: "payment",
    })).toEqual(["amount_must_be_positive", "payment_date_invalid"]);
  });

  it("records a payment and refreshes a draft period's SOA balance", async () => {
    const selectPeriod = chain([{
      id: "period-1",
      partyId: "party-1",
      status: "draft",
      soaOpeningBalanceUsd: "100.0000",
      billingStatementTotalUsd: "500.0000",
    }]);
    const selectPaymentsRows = [
      { amountUsd: "75.0000", type: "payment" },
      { amountUsd: "25.0000", type: "credit_memo" },
    ];
    const selectPayments = {
      from: vi.fn(() => selectPayments),
      where: vi.fn(async () => selectPaymentsRows),
    };
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(selectPeriod)
        .mockReturnValueOnce(selectPayments),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: "payment-1" }]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(async () => []) })),
      })),
    };

    const result = await recordVmiPayment(db, {
      partyId: "party-1",
      periodId: "period-1",
      amountUsd: "75.0000",
      type: "payment",
      paymentDate: "2026-09-12",
      recordedByUserId: "user-1",
    });

    expect(result).toMatchObject({
      ok: true,
      paymentId: "payment-1",
      soaPaymentsAppliedUsd: 75,
      soaClosingBalanceUsd: 525,
    });
    expect(db.update).toHaveBeenCalled();
  });

  it("does not update an issued period's immutable SOA snapshot", async () => {
    const selectPeriod = chain([{
      id: "period-2",
      partyId: "party-1",
      status: "issued",
      soaOpeningBalanceUsd: "100.0000",
      billingStatementTotalUsd: "500.0000",
      soaPaymentsAppliedUsd: "0.0000",
      soaClosingBalanceUsd: "600.0000",
    }]);
    const db = {
      select: vi.fn(() => selectPeriod),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: "payment-2" }]),
        })),
      })),
      update: vi.fn(),
    };

    const result = await recordVmiPayment(db, {
      partyId: "party-1",
      periodId: "period-2",
      amountUsd: "50",
      type: "payment",
      paymentDate: "2026-09-12",
      recordedByUserId: "user-1",
    });

    expect(result).toMatchObject({ ok: true, periodStatus: "issued" });
    expect(db.update).not.toHaveBeenCalled();
  });
});
