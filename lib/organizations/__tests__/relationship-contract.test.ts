import { describe, expect, it } from "vitest";
import {
  validateOutboundOrganization,
  validateReceivingOrganization,
  validateVmiEndCustomer,
} from "../relationship-contract";

const row = (role: string, relationship: string | null = null) => ({
  id: "org-1",
  isActive: true,
  role,
  relationship,
  relationshipIsActive: true,
});

describe("organization relationship contract", () => {
  it("accepts a supplier only for Trading receiving", () => {
    expect(validateReceivingOrganization([row("supplier")], "org-1", "trading")).toEqual({ ok: true });
    expect(validateReceivingOrganization([row("supplier")], "org-1", "vmi").ok).toBe(false);
  });

  it("accepts Internal Supplies as a role-only Supplies relationship", () => {
    expect(validateReceivingOrganization([row("internal_supplies")], "org-1", "supplies")).toEqual({ ok: true });
    expect(validateOutboundOrganization([row("internal_supplies")], "org-1", "supplies")).toEqual({ ok: true });
  });

  it("does not treat a generic Customer role as every Inventory Model", () => {
    expect(validateReceivingOrganization([row("customer")], "org-1", "vmi").ok).toBe(false);
    expect(validateOutboundOrganization([row("customer")], "org-1", "trading").ok).toBe(false);
  });

  it("requires an active End Customer role for VMI recipients", () => {
    expect(validateVmiEndCustomer([row("end_customer")], "org-1")).toEqual({ ok: true });
    expect(validateVmiEndCustomer([row("customer")], "org-1").ok).toBe(false);
  });
});
