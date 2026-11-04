import { describe, expect, it } from "vitest";
import { parseItemInput } from "../item-schema";

const item = { code: "MATERIAL-EXP", name: "Material", barcode: "MATERIAL-EXP", defaultSupplierPartyId: "organization-1", volumeCbm: "0.0120" };

describe("Material expiry R1: explicit enrollment policy", () => {
  it("defaults existing payloads to block release independently of perishability", () => {
    const result = parseItemInput({ ...item, isPerishable: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ expiryPolicy: "block_release" });
  });
  it("retains an explicit permissive policy and policy-change reason", () => {
    const result = parseItemInput({ ...item, expiryPolicy: "allow_with_acknowledgement", expiryPolicyReason: "Material remains approved for sale" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ expiryPolicy: "allow_with_acknowledgement", expiryPolicyReason: "Material remains approved for sale" });
  });
  it("rejects unknown policies rather than silently dropping them", () => {
    const result = parseItemInput({ ...item, expiryPolicy: "allow_everything" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.some((error) => error.field === "expiryPolicy")).toBe(true);
  });
});
