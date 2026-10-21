import { describe, expect, it } from "vitest";
import { getActiveWrrOrganizations } from "../items";

function makeDb(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "orderBy"]) {
    chain[method] = () => chain;
  }
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  chain.finally = resolved.finally.bind(resolved);
  return { select: () => chain };
}

describe("getActiveWrrOrganizations", () => {
  it("returns supplier and customer organizations, excluding end customers and internal roles", async () => {
    const result = await getActiveWrrOrganizations(makeDb([
      { id: "supplier-1", code: "SUP-1", name: "Supplier One", role: "supplier" },
      { id: "customer-1", code: "CUS-1", name: "Customer One", role: "customer" },
      { id: "end-customer-1", code: "END-1", name: "End Customer One", role: "end_customer" },
      { id: "internal-1", code: "INT-1", name: "Internal Supplies", role: "internal_supplies" },
    ]) as never);

    expect(result).toEqual([
      {
        id: "supplier-1",
        code: "SUP-1",
        name: "Supplier One",
        roles: ["supplier"],
        defaultInventoryModel: "trading",
      },
      {
        id: "customer-1",
        code: "CUS-1",
        name: "Customer One",
        roles: ["customer"],
        defaultInventoryModel: "vmi",
      },
    ]);
  });

  it("normalizes the legacy vendor role to Supplier", async () => {
    const result = await getActiveWrrOrganizations(makeDb([
      { id: "vendor-1", code: "VEN-1", name: "Legacy Vendor", role: "vendor" },
    ]) as never);

    expect(result[0]?.roles).toEqual(["supplier"]);
    expect(result[0]?.defaultInventoryModel).toBe("trading");
  });
});
