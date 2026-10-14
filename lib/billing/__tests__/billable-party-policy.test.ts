import { describe, expect, it } from "vitest";
import { getBillablePartyDecision } from "@/lib/billing/billable-party-policy";

describe("billable party policy", () => {
  it("fails closed for end-customers", () => {
    expect(getBillablePartyDecision(["end_customer"]).canReceiveBilling).toBe(false);
    expect(getBillablePartyDecision(["end_customer"]).canReceiveSoa).toBe(false);
  });
  it("routes supplier invoices to Dyna Serv", () => {
    expect(getBillablePartyDecision(["supplier"]).invoicePayee).toBe("dyna_serv");
  });
  it("allows SOA only for customers", () => {
    expect(getBillablePartyDecision(["customer"]).canReceiveSoa).toBe(true);
    expect(getBillablePartyDecision([]).canReceiveSoa).toBe(false);
  });
});
